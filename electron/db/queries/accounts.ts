import type Database from 'better-sqlite3-multiple-ciphers'
import type { AccountRow } from '../types'
import { buildSetClause } from './util'

export function listAccounts(db: Database.Database, userId: number): AccountRow[] {
  return db.prepare('SELECT * FROM account WHERE user_id = ? ORDER BY created_at').all(userId) as AccountRow[]
}

export function getAccount(db: Database.Database, userId: number, id: number): AccountRow | undefined {
  return db.prepare('SELECT * FROM account WHERE user_id = ? AND id = ?').get(userId, id) as AccountRow | undefined
}

export interface CreateAccountInput {
  bank: string
  nickname: string
  last4?: string
  type: AccountRow['type']
  opening_balance?: number
}

/** Finds the user's single Cash "account" (type='cash'), creating it on first use. */
export function getOrCreateCashAccount(db: Database.Database, userId: number): AccountRow {
  const existing = db.prepare("SELECT * FROM account WHERE user_id = ? AND type = 'cash'").get(userId) as
    | AccountRow
    | undefined
  if (existing) return existing
  return createAccount(db, userId, { bank: 'Cash', nickname: 'Cash', type: 'cash' })
}

export function createAccount(db: Database.Database, userId: number, input: CreateAccountInput): AccountRow {
  const result = db
    .prepare(
      'INSERT INTO account (user_id, bank, nickname, last4, type, opening_balance) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(userId, input.bank, input.nickname, input.last4 ?? null, input.type, input.opening_balance ?? 0)
  return getAccount(db, userId, result.lastInsertRowid as number)!
}

export type UpdateAccountInput = Partial<CreateAccountInput>

export function updateAccount(
  db: Database.Database,
  userId: number,
  id: number,
  input: UpdateAccountInput
): AccountRow | undefined {
  const { clause, values } = buildSetClause(input)
  if (clause) {
    db.prepare(`UPDATE account SET ${clause} WHERE user_id = ? AND id = ?`).run(...values, userId, id)
  }
  return getAccount(db, userId, id)
}

export function deleteAccount(db: Database.Database, userId: number, id: number): void {
  db.prepare('DELETE FROM account WHERE user_id = ? AND id = ?').run(userId, id)
}
