import type Database from 'better-sqlite3-multiple-ciphers'
import type { CategoryRow } from '../types'
import { buildSetClause } from './util'

export function listCategories(db: Database.Database, userId: number): CategoryRow[] {
  return db.prepare('SELECT * FROM category WHERE user_id = ? ORDER BY parent_id IS NOT NULL, name').all(
    userId
  ) as CategoryRow[]
}

export function getCategory(db: Database.Database, userId: number, id: number): CategoryRow | undefined {
  return db.prepare('SELECT * FROM category WHERE user_id = ? AND id = ?').get(userId, id) as
    | CategoryRow
    | undefined
}

export interface CreateCategoryInput {
  name: string
  parent_id?: number
  icon?: string
}

export function createCategory(db: Database.Database, userId: number, input: CreateCategoryInput): CategoryRow {
  const result = db
    .prepare('INSERT INTO category (user_id, name, parent_id, icon, is_system) VALUES (?, ?, ?, ?, 0)')
    .run(userId, input.name, input.parent_id ?? null, input.icon ?? null)
  return getCategory(db, userId, result.lastInsertRowid as number)!
}

export interface UpdateCategoryInput {
  name?: string
  icon?: string
  is_hidden?: 0 | 1
}

export function updateCategory(
  db: Database.Database,
  userId: number,
  id: number,
  input: UpdateCategoryInput
): CategoryRow | undefined {
  const { clause, values } = buildSetClause(input)
  if (clause) {
    db.prepare(`UPDATE category SET ${clause} WHERE user_id = ? AND id = ?`).run(...values, userId, id)
  }
  return getCategory(db, userId, id)
}

/** System (default) categories can only be hidden via updateCategory, never deleted — matches PRD 4.3.1. */
export function deleteCategory(db: Database.Database, userId: number, id: number): void {
  const category = getCategory(db, userId, id)
  if (category?.is_system) {
    throw new Error('System categories cannot be deleted — hide them instead via updateCategory.')
  }
  db.prepare('DELETE FROM category WHERE user_id = ? AND id = ?').run(userId, id)
}
