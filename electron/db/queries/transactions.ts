import type Database from 'better-sqlite3-multiple-ciphers'
import type { TransactionRow, TransactionType } from '../types'
import { buildSetClause } from './util'

export interface ListTransactionsFilters {
  accountId?: number
  cardId?: number
  categoryId?: number
  dateFrom?: string
  dateTo?: string
  limit?: number
  offset?: number
}

export function listTransactions(
  db: Database.Database,
  userId: number,
  filters: ListTransactionsFilters = {}
): TransactionRow[] {
  const conditions = ['user_id = ?']
  const params: unknown[] = [userId]

  if (filters.accountId !== undefined) {
    conditions.push('account_id = ?')
    params.push(filters.accountId)
  }
  if (filters.cardId !== undefined) {
    conditions.push('card_id = ?')
    params.push(filters.cardId)
  }
  if (filters.categoryId !== undefined) {
    conditions.push('category_id = ?')
    params.push(filters.categoryId)
  }
  if (filters.dateFrom !== undefined) {
    conditions.push('date >= ?')
    params.push(filters.dateFrom)
  }
  if (filters.dateTo !== undefined) {
    conditions.push('date <= ?')
    params.push(filters.dateTo)
  }

  let sql = `SELECT * FROM transactions WHERE ${conditions.join(' AND ')} ORDER BY date DESC, id DESC`
  if (filters.limit !== undefined) {
    sql += ' LIMIT ?'
    params.push(filters.limit)
    if (filters.offset !== undefined) {
      sql += ' OFFSET ?'
      params.push(filters.offset)
    }
  }

  return db.prepare(sql).all(...params) as TransactionRow[]
}

export function getTransaction(db: Database.Database, userId: number, id: number): TransactionRow | undefined {
  return db.prepare('SELECT * FROM transactions WHERE user_id = ? AND id = ?').get(userId, id) as
    | TransactionRow
    | undefined
}

export interface CreateTransactionInput {
  account_id?: number
  card_id?: number
  date: string
  amount: number
  type: TransactionType
  narration: string
  raw_text?: string
  category_id?: number
  sub_category_id?: number
  is_transfer?: 0 | 1
  is_cc_payment?: 0 | 1
  is_excluded?: 0 | 1
  remarks?: string
  source_file?: string
  matched_transfer_id?: number
  mcc?: string
}

const INSERT_TRANSACTION_SQL = `
  INSERT INTO transactions (
    user_id, account_id, card_id, date, amount, type, narration, raw_text,
    category_id, sub_category_id, is_transfer, is_cc_payment, is_excluded,
    remarks, source_file, matched_transfer_id, mcc
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

function transactionParams(userId: number, input: CreateTransactionInput): unknown[] {
  return [
    userId,
    input.account_id ?? null,
    input.card_id ?? null,
    input.date,
    input.amount,
    input.type,
    input.narration,
    input.raw_text ?? null,
    input.category_id ?? null,
    input.sub_category_id ?? null,
    input.is_transfer ?? 0,
    input.is_cc_payment ?? 0,
    input.is_excluded ?? 0,
    input.remarks ?? null,
    input.source_file ?? null,
    input.matched_transfer_id ?? null,
    input.mcc ?? null
  ]
}

export function createTransaction(
  db: Database.Database,
  userId: number,
  input: CreateTransactionInput
): TransactionRow {
  const result = db.prepare(INSERT_TRANSACTION_SQL).run(...transactionParams(userId, input))
  return getTransaction(db, userId, result.lastInsertRowid as number)!
}

/** Bulk insert for statement imports — one transaction, so a mid-batch failure rolls back cleanly. */
export function createTransactions(
  db: Database.Database,
  userId: number,
  inputs: CreateTransactionInput[]
): number[] {
  const stmt = db.prepare(INSERT_TRANSACTION_SQL)
  const insertAll = db.transaction((rows: CreateTransactionInput[]) => {
    const ids: number[] = []
    for (const row of rows) {
      const result = stmt.run(...transactionParams(userId, row))
      ids.push(result.lastInsertRowid as number)
    }
    return ids
  })
  return insertAll(inputs)
}

export interface UpdateTransactionInput {
  category_id?: number
  sub_category_id?: number
  is_transfer?: 0 | 1
  is_cc_payment?: 0 | 1
  is_excluded?: 0 | 1
  remarks?: string
  matched_transfer_id?: number
}

export function updateTransaction(
  db: Database.Database,
  userId: number,
  id: number,
  input: UpdateTransactionInput
): TransactionRow | undefined {
  const { clause, values } = buildSetClause(input)
  if (clause) {
    db.prepare(`UPDATE transactions SET ${clause} WHERE user_id = ? AND id = ?`).run(...values, userId, id)
  }
  return getTransaction(db, userId, id)
}

export function deleteTransaction(db: Database.Database, userId: number, id: number): void {
  db.prepare('DELETE FROM transactions WHERE user_id = ? AND id = ?').run(userId, id)
}
