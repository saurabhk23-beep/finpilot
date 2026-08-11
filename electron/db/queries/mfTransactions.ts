import type Database from 'better-sqlite3-multiple-ciphers'
import type { MFTransactionRow, MFTransactionType } from '../types'

export function listMFTransactions(
  db: Database.Database,
  userId: number,
  schemeId?: number
): MFTransactionRow[] {
  if (schemeId !== undefined) {
    return db
      .prepare('SELECT * FROM mf_transaction WHERE user_id = ? AND scheme_id = ? ORDER BY date')
      .all(userId, schemeId) as MFTransactionRow[]
  }
  return db.prepare('SELECT * FROM mf_transaction WHERE user_id = ? ORDER BY date').all(userId) as MFTransactionRow[]
}

export interface CreateMFTransactionInput {
  scheme_id: number
  date: string
  type: MFTransactionType
  amount: number
  units: number
  nav: number
}

export function createMFTransaction(
  db: Database.Database,
  userId: number,
  input: CreateMFTransactionInput
): MFTransactionRow {
  const result = db
    .prepare(
      'INSERT INTO mf_transaction (user_id, scheme_id, date, type, amount, units, nav) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(userId, input.scheme_id, input.date, input.type, input.amount, input.units, input.nav)
  return db.prepare('SELECT * FROM mf_transaction WHERE id = ?').get(result.lastInsertRowid) as MFTransactionRow
}

/** Bulk insert for CAS PDF import — one transaction, so a mid-batch failure rolls back cleanly. */
export function createMFTransactions(
  db: Database.Database,
  userId: number,
  inputs: CreateMFTransactionInput[]
): void {
  const stmt = db.prepare(
    'INSERT INTO mf_transaction (user_id, scheme_id, date, type, amount, units, nav) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const insertAll = db.transaction((rows: CreateMFTransactionInput[]) => {
    for (const row of rows) {
      stmt.run(userId, row.scheme_id, row.date, row.type, row.amount, row.units, row.nav)
    }
  })
  insertAll(inputs)
}
