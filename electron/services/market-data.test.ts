import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3-multiple-ciphers'
import { openDatabase } from '../db/connection'
import { createMFScheme } from '../db/queries/mfSchemes'
import { getLatestNav, getRecentNavs } from '../db/queries/mfNav'
import { createStock } from '../db/queries/stocks'
import { getLatestPrice } from '../db/queries/stockPrices'
import {
  fetchMFNavHistory,
  fetchStockPriceHistory,
  getRefreshMeta,
  isMarketDataStale,
  refreshAll,
  type FetchFn
} from './market-data'

function jsonResponse(body: unknown): Awaited<ReturnType<FetchFn>> {
  return { ok: true, status: 200, json: async () => body }
}

const mfApiBody = {
  data: [
    { date: '10-08-2026', nav: '130.5' },
    { date: '09-08-2026', nav: '128.0' },
    { date: '08-08-2026', nav: '127.2' }
  ]
}

// Yahoo chart shape: timestamps (unix s) + close series.
const yahooBody = {
  chart: {
    result: [
      {
        timestamp: [Math.floor(Date.parse('2026-08-08') / 1000), Math.floor(Date.parse('2026-08-10') / 1000)],
        indicators: { quote: [{ close: [3800, 4000] }] }
      }
    ]
  }
}

describe('market-data fetch parsing', () => {
  it('parses mfapi.in NAV history to ISO points', async () => {
    const fetchFn: FetchFn = async () => jsonResponse(mfApiBody)
    const points = await fetchMFNavHistory('119551', fetchFn)
    expect(points[0]).toEqual({ date: '2026-08-10', nav: 130.5 })
    expect(points).toHaveLength(3)
  })

  it('parses Yahoo chart closes, skipping nulls', async () => {
    const withNull = {
      chart: { result: [{ timestamp: [Date.parse('2026-08-09') / 1000, Date.parse('2026-08-10') / 1000], indicators: { quote: [{ close: [null, 4000] }] } }] }
    }
    const fetchFn: FetchFn = async () => jsonResponse(withNull)
    const points = await fetchStockPriceHistory('TCS', 'NSE', fetchFn)
    expect(points).toEqual([{ date: '2026-08-10', close: 4000 }])
  })

  it('throws on a non-ok response', async () => {
    const fetchFn: FetchFn = async () => ({ ok: false, status: 503, json: async () => ({}) })
    await expect(fetchMFNavHistory('119551', fetchFn)).rejects.toThrow(/503/)
  })
})

describe('refreshAll (real DB)', () => {
  let dir: string
  let db: Database.Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-md-'))
    db = openDatabase({ dbPath: join(dir, 'db.db'), saltPath: join(dir, 'salt'), password: 'pw' })
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('upserts NAVs and prices for held schemes/stocks', async () => {
    createMFScheme(db, 1, { scheme_code: '119551', scheme_name: 'Flexi Cap', folio: '1/2' })
    createStock(db, 1, { symbol: 'TCS', exchange: 'NSE' })

    const fetchFn: FetchFn = async (url) => jsonResponse(url.includes('mfapi') ? mfApiBody : yahooBody)
    const result = await refreshAll(db, 1, fetchFn)

    expect(result).toMatchObject({ mfUpdated: 1, stocksUpdated: 1, errors: [] })
    expect(getLatestNav(db, '119551')).toMatchObject({ date: '2026-08-10', nav: 130.5 })
    expect(getRecentNavs(db, '119551', 2)).toHaveLength(2)
    expect(getLatestPrice(db, 'TCS')).toMatchObject({ date: '2026-08-10', close_price: 4000 })
  })

  it('collects per-item errors without failing the whole refresh', async () => {
    createMFScheme(db, 1, { scheme_code: '119551', scheme_name: 'Flexi Cap', folio: '1/2' })
    createStock(db, 1, { symbol: 'TCS', exchange: 'NSE' })

    const fetchFn: FetchFn = async (url) =>
      url.includes('mfapi') ? jsonResponse(mfApiBody) : { ok: false, status: 429, json: async () => ({}) }
    const result = await refreshAll(db, 1, fetchFn)
    expect(result.mfUpdated).toBe(1)
    expect(result.stocksUpdated).toBe(0)
    expect(result.errors[0]).toMatch(/TCS/)
  })

  it('isMarketDataStale is true before refresh, false after (for today)', async () => {
    createMFScheme(db, 1, { scheme_code: '119551', scheme_name: 'Flexi Cap', folio: '1/2' })
    expect(isMarketDataStale(db, 1, '2026-08-10')).toBe(true)

    const fetchFn: FetchFn = async () => jsonResponse(mfApiBody)
    await refreshAll(db, 1, fetchFn)
    expect(isMarketDataStale(db, 1, '2026-08-10')).toBe(false)
    expect(getRefreshMeta(db, 1).lastUpdated).toBe('2026-08-10')
  })
})
