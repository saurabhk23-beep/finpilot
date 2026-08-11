import type Database from 'better-sqlite3-multiple-ciphers'
import type { StockTransactionRow, StockTransactionType } from '../types'

export function listStockTransactions(
  db: Database.Database,
  userId: number,
  stockId?: number
): StockTransactionRow[] {
  if (stockId !== undefined) {
    return db
      .prepare('SELECT * FROM stock_transaction WHERE user_id = ? AND stock_id = ? ORDER BY date')
      .all(userId, stockId) as StockTransactionRow[]
  }
  return db.prepare('SELECT * FROM stock_transaction WHERE user_id = ? ORDER BY date').all(
    userId
  ) as StockTransactionRow[]
}

export interface CreateStockTransactionInput {
  stock_id: number
  date: string
  type: StockTransactionType
  qty: number
  price: number
  charges?: number
}

export function createStockTransaction(
  db: Database.Database,
  userId: number,
  input: CreateStockTransactionInput
): StockTransactionRow {
  const result = db
    .prepare(
      'INSERT INTO stock_transaction (user_id, stock_id, date, type, qty, price, charges) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(userId, input.stock_id, input.date, input.type, input.qty, input.price, input.charges ?? 0)
  return db.prepare('SELECT * FROM stock_transaction WHERE id = ?').get(
    result.lastInsertRowid
  ) as StockTransactionRow
}

/** Bulk insert for Groww export import — one transaction, so a mid-batch failure rolls back cleanly. */
export function createStockTransactions(
  db: Database.Database,
  userId: number,
  inputs: CreateStockTransactionInput[]
): void {
  const stmt = db.prepare(
    'INSERT INTO stock_transaction (user_id, stock_id, date, type, qty, price, charges) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const insertAll = db.transaction((rows: CreateStockTransactionInput[]) => {
    for (const row of rows) {
      stmt.run(userId, row.stock_id, row.date, row.type, row.qty, row.price, row.charges ?? 0)
    }
  })
  insertAll(inputs)
}
