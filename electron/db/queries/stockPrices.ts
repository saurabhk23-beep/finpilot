import type Database from 'better-sqlite3-multiple-ciphers'
import type { StockPriceRow } from '../types'

// No user_id: daily close prices are shared public market data cached across all users of the app.

export function getLatestPrice(db: Database.Database, symbol: string): StockPriceRow | undefined {
  return db.prepare('SELECT * FROM stock_price WHERE symbol = ? ORDER BY date DESC LIMIT 1').get(
    symbol
  ) as StockPriceRow | undefined
}

/** The most recent `n` price rows, newest first — used for latest + previous (day change). */
export function getRecentPrices(db: Database.Database, symbol: string, n = 2): StockPriceRow[] {
  return db
    .prepare('SELECT * FROM stock_price WHERE symbol = ? ORDER BY date DESC LIMIT ?')
    .all(symbol, n) as StockPriceRow[]
}

export function listPriceHistory(
  db: Database.Database,
  symbol: string,
  dateFrom?: string,
  dateTo?: string
): StockPriceRow[] {
  const conditions = ['symbol = ?']
  const params: unknown[] = [symbol]
  if (dateFrom !== undefined) {
    conditions.push('date >= ?')
    params.push(dateFrom)
  }
  if (dateTo !== undefined) {
    conditions.push('date <= ?')
    params.push(dateTo)
  }
  return db.prepare(`SELECT * FROM stock_price WHERE ${conditions.join(' AND ')} ORDER BY date`).all(
    ...params
  ) as StockPriceRow[]
}

export function upsertPrice(db: Database.Database, symbol: string, date: string, closePrice: number): void {
  db.prepare(
    `INSERT INTO stock_price (symbol, date, close_price) VALUES (?, ?, ?)
     ON CONFLICT (symbol, date) DO UPDATE SET close_price = excluded.close_price`
  ).run(symbol, date, closePrice)
}
