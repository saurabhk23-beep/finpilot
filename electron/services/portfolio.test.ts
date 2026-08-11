import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3-multiple-ciphers'
import { openDatabase } from '../db/connection'
import { createMFScheme } from '../db/queries/mfSchemes'
import { createMFTransaction } from '../db/queries/mfTransactions'
import { upsertNav } from '../db/queries/mfNav'
import { createStock } from '../db/queries/stocks'
import { createStockTransaction } from '../db/queries/stockTransactions'
import { upsertPrice } from '../db/queries/stockPrices'
import { getMFHoldings, getPortfolioOverview, getStockHoldings } from './portfolio'

const ASOF = '2026-08-10'

describe('portfolio (real DB)', () => {
  let dir: string
  let db: Database.Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-pf-'))
    db = openDatabase({ dbPath: join(dir, 'db.db'), saltPath: join(dir, 'salt'), password: 'pw' })
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('computes a stock holding: avg price, current value, gain/loss, day change', () => {
    const stock = createStock(db, 1, { symbol: 'TCS', exchange: 'NSE' })
    createStockTransaction(db, 1, { stock_id: stock.id, date: '2026-01-15', type: 'buy', qty: 10, price: 3000 })
    createStockTransaction(db, 1, { stock_id: stock.id, date: '2026-03-15', type: 'buy', qty: 10, price: 3400 })
    upsertPrice(db, 'TCS', '2026-08-09', 3800)
    upsertPrice(db, 'TCS', '2026-08-10', 4000)

    const [h] = getStockHoldings(db, 1, ASOF)
    expect(h.qty).toBe(20)
    expect(h.avgBuyPrice).toBe(3200) // (30000 + 34000) / 20
    expect(h.currentPrice).toBe(4000)
    expect(h.invested).toBe(64000)
    expect(h.currentValue).toBe(80000)
    expect(h.gainLoss).toBe(16000)
    expect(h.gainLossPct).toBe(25)
    expect(h.dayChange).toBe(20 * (4000 - 3800)) // 4000
    expect(h.xirrPct).toBeGreaterThan(0)
  })

  it('reduces quantity on a sell and reflects it in the holding', () => {
    const stock = createStock(db, 1, { symbol: 'INFY', exchange: 'NSE' })
    createStockTransaction(db, 1, { stock_id: stock.id, date: '2026-01-15', type: 'buy', qty: 10, price: 1500 })
    createStockTransaction(db, 1, { stock_id: stock.id, date: '2026-05-15', type: 'sell', qty: 4, price: 1800 })
    upsertPrice(db, 'INFY', '2026-08-10', 1600)

    const [h] = getStockHoldings(db, 1, ASOF)
    expect(h.qty).toBe(6)
    expect(h.currentValue).toBe(6 * 1600)
  })

  it('computes an MF holding from SIP transactions', () => {
    const scheme = createMFScheme(db, 1, { scheme_code: '119551', scheme_name: 'Flexi Cap', folio: '123/45' })
    // 2 SIPs, 100 units each at different NAVs.
    createMFTransaction(db, 1, { scheme_id: scheme.id, date: '2026-02-01', type: 'sip', amount: 10000, units: 100, nav: 100 })
    createMFTransaction(db, 1, { scheme_id: scheme.id, date: '2026-03-01', type: 'sip', amount: 12000, units: 100, nav: 120 })
    upsertNav(db, '119551', '2026-08-09', 128)
    upsertNav(db, '119551', '2026-08-10', 130)

    const [h] = getMFHoldings(db, 1, ASOF)
    expect(h.units).toBe(200)
    expect(h.avgNav).toBe(110) // 22000 / 200
    expect(h.currentNav).toBe(130)
    expect(h.invested).toBe(22000)
    expect(h.currentValue).toBe(26000)
    expect(h.gainLoss).toBe(4000)
    expect(h.dayChange).toBe(200 * (130 - 128)) // 400
  })

  it('falls back to avg cost (no gain) when there is no price yet', () => {
    const stock = createStock(db, 1, { symbol: 'WIPRO', exchange: 'NSE' })
    createStockTransaction(db, 1, { stock_id: stock.id, date: '2026-01-15', type: 'buy', qty: 5, price: 400 })
    const [h] = getStockHoldings(db, 1, ASOF)
    expect(h.hasPrice).toBe(false)
    expect(h.currentValue).toBe(h.invested)
    expect(h.gainLoss).toBe(0)
    expect(h.xirrPct).toBe(0) // value == invested → 0% return
  })

  it('portfolio overview aggregates MF + stocks with an overall XIRR', () => {
    const stock = createStock(db, 1, { symbol: 'TCS', exchange: 'NSE' })
    createStockTransaction(db, 1, { stock_id: stock.id, date: '2025-08-10', type: 'buy', qty: 10, price: 3000 })
    upsertPrice(db, 'TCS', '2026-08-10', 3600)

    const scheme = createMFScheme(db, 1, { scheme_code: '119551', scheme_name: 'Flexi Cap', folio: '123/45' })
    createMFTransaction(db, 1, { scheme_id: scheme.id, date: '2025-08-10', type: 'lumpsum', amount: 20000, units: 200, nav: 100 })
    upsertNav(db, '119551', '2026-08-10', 110)

    const o = getPortfolioOverview(db, 1, ASOF)
    expect(o.totalInvested).toBe(30000 + 20000)
    expect(o.totalValue).toBe(36000 + 22000)
    expect(o.totalGainLoss).toBe(8000)
    expect(o.totalGainLossPct).toBe(16)
    expect(o.overallXirrPct).toBeGreaterThan(0) // ~1yr, +16%
  })
})
