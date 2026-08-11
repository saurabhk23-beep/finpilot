import type Database from 'better-sqlite3-multiple-ciphers'
import type { UserRow } from '../types'
import { buildSetClause } from './util'

export function getUser(db: Database.Database, userId: number): UserRow | undefined {
  return db.prepare('SELECT * FROM user WHERE id = ?').get(userId) as UserRow | undefined
}

export interface UpdateUserInput {
  name?: string
  monthly_salary?: number
  employer_name?: string
  fy_start_month?: number
  onboarding_completed?: 0 | 1
}

export function updateUser(db: Database.Database, userId: number, input: UpdateUserInput): UserRow {
  const { clause, values } = buildSetClause(input)
  if (clause) {
    db.prepare(`UPDATE user SET ${clause} WHERE id = ?`).run(...values, userId)
  }
  return getUser(db, userId)!
}
