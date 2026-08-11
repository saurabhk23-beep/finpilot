import type Database from 'better-sqlite3-multiple-ciphers'
import type { CreditCardRow } from '../types'
import { buildSetClause } from './util'

export function listCreditCards(db: Database.Database, userId: number): CreditCardRow[] {
  return db.prepare('SELECT * FROM credit_card WHERE user_id = ? ORDER BY created_at').all(userId) as CreditCardRow[]
}

export function getCreditCard(db: Database.Database, userId: number, id: number): CreditCardRow | undefined {
  return db.prepare('SELECT * FROM credit_card WHERE user_id = ? AND id = ?').get(userId, id) as
    | CreditCardRow
    | undefined
}

export interface CreateCreditCardInput {
  issuer: string
  nickname: string
  last4?: string
  credit_limit: number
  bill_date?: number
  linked_account_id?: number
}

export function createCreditCard(
  db: Database.Database,
  userId: number,
  input: CreateCreditCardInput
): CreditCardRow {
  const result = db
    .prepare(
      `INSERT INTO credit_card (user_id, issuer, nickname, last4, credit_limit, bill_date, linked_account_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      input.issuer,
      input.nickname,
      input.last4 ?? null,
      input.credit_limit,
      input.bill_date ?? null,
      input.linked_account_id ?? null
    )
  return getCreditCard(db, userId, result.lastInsertRowid as number)!
}

export type UpdateCreditCardInput = Partial<CreateCreditCardInput>

export function updateCreditCard(
  db: Database.Database,
  userId: number,
  id: number,
  input: UpdateCreditCardInput
): CreditCardRow | undefined {
  const { clause, values } = buildSetClause(input)
  if (clause) {
    db.prepare(`UPDATE credit_card SET ${clause} WHERE user_id = ? AND id = ?`).run(...values, userId, id)
  }
  return getCreditCard(db, userId, id)
}

export function deleteCreditCard(db: Database.Database, userId: number, id: number): void {
  db.prepare('DELETE FROM credit_card WHERE user_id = ? AND id = ?').run(userId, id)
}
