import type Database from 'better-sqlite3-multiple-ciphers'
import type { StockRow } from '../types'

export function listStocks(db: Database.Database, userId: number): StockRow[] {
  return db.prepare('SELECT * FROM stock WHERE user_id = ? ORDER BY symbol').all(userId) as StockRow[]
}

export function getStock(db: Database.Database, userId: number, id: number): StockRow | undefined {
  return db.prepare('SELECT * FROM stock WHERE user_id = ? AND id = ?').get(userId, id) as StockRow | undefined
}

export function findStockBySymbol(db: Database.Database, userId: number, symbol: string): StockRow | undefined {
  return db.prepare('SELECT * FROM stock WHERE user_id = ? AND symbol = ?').get(userId, symbol) as
    | StockRow
    | undefined
}

export interface CreateStockInput {
  symbol: string
  name?: string
  exchange?: 'NSE' | 'BSE'
  sector?: string
}

export function createStock(db: Database.Database, userId: number, input: CreateStockInput): StockRow {
  const result = db
    .prepare('INSERT INTO stock (user_id, symbol, name, exchange, sector) VALUES (?, ?, ?, ?, ?)')
    .run(userId, input.symbol, input.name ?? null, input.exchange ?? null, input.sector ?? null)
  return getStock(db, userId, result.lastInsertRowid as number)!
}
