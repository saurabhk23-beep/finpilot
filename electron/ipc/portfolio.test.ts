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
import { createPortfolioHandlers } from './portfolio'

describe('portfolio IPC handlers (real DB)', () => {
  let dir: string
  let db: Database.Database
  const getDb = () => db

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-pfipc-'))
    db = openDatabase({ dbPath: join(dir, 'db.db'), saltPath: join(dir, 'salt'), password: 'pw' })

    const scheme = createMFScheme(db, 1, { scheme_code: '119551', scheme_name: 'Flexi Cap', folio: '1/2' })
    createMFTransaction(db, 1, { scheme_id: scheme.id, date: '2025-08-10', type: 'lumpsum', amount: 20000, units: 200, nav: 100 })
    upsertNav(db, '119551', '2026-08-10', 110)

    const stock = createStock(db, 1, { symbol: 'TCS', exchange: 'NSE' })
    createStockTransaction(db, 1, { stock_id: stock.id, date: '2025-08-10', type: 'buy', qty: 10, price: 3000 })
    upsertPrice(db, 'TCS', '2026-08-10', 3600)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('overview aggregates MF + stocks and includes refresh meta', async () => {
    const h = createPortfolioHandlers(getDb)
    const o = (await h['portfolio:overview']({ userId: 1 })) as {
      totalValue: number
      totalInvested: number
      lastUpdated: string | null
      stale: boolean
    }
    expect(o.totalInvested).toBe(50000)
    expect(o.totalValue).toBe(22000 + 36000)
    expect(o.lastUpdated).toBe('2026-08-10')
  })

  it('mfHoldings / stockHoldings return the holdings', async () => {
    const h = createPortfolioHandlers(getDb)
    expect((await h['portfolio:mfHoldings']({ userId: 1 })) as unknown[]).toHaveLength(1)
    expect((await h['portfolio:stockHoldings']({ userId: 1 })) as unknown[]).toHaveLength(1)
  })

  it('mfDetail returns scheme + transactions + nav history', async () => {
    const h = createPortfolioHandlers(getDb)
    const holdings = (await h['portfolio:mfHoldings']({ userId: 1 })) as { schemeId: number }[]
    const detail = (await h['portfolio:mfDetail']({ userId: 1, schemeId: holdings[0].schemeId })) as {
      transactions: unknown[]
      navHistory: unknown[]
    }
    expect(detail.transactions).toHaveLength(1)
    expect(detail.navHistory).toHaveLength(1)
  })

  it('is scoped to userId (no cross-user leakage)', async () => {
    const h = createPortfolioHandlers(getDb)
    db.prepare('INSERT INTO user (id) VALUES (2)').run()
    expect((await h['portfolio:mfHoldings']({ userId: 2 })) as unknown[]).toHaveLength(0)
  })
})
