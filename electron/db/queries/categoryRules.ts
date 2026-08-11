import type Database from 'better-sqlite3-multiple-ciphers'
import type { CategoryRuleRow, CategoryRuleType } from '../types'
import { buildSetClause } from './util'

/** Ordered for the categorization engine: highest priority first, user-created rules win ties (Layer 5). */
export function listCategoryRules(db: Database.Database, userId: number): CategoryRuleRow[] {
  return db
    .prepare('SELECT * FROM category_rule WHERE user_id = ? ORDER BY is_user_created DESC, priority DESC')
    .all(userId) as CategoryRuleRow[]
}

export function listCategoryRulesByType(
  db: Database.Database,
  userId: number,
  ruleType: CategoryRuleType
): CategoryRuleRow[] {
  return db
    .prepare(
      'SELECT * FROM category_rule WHERE user_id = ? AND rule_type = ? ORDER BY is_user_created DESC, priority DESC'
    )
    .all(userId, ruleType) as CategoryRuleRow[]
}

export function getCategoryRule(db: Database.Database, userId: number, id: number): CategoryRuleRow | undefined {
  return db.prepare('SELECT * FROM category_rule WHERE user_id = ? AND id = ?').get(userId, id) as
    | CategoryRuleRow
    | undefined
}

export interface CreateCategoryRuleInput {
  rule_type: CategoryRuleType
  pattern: string
  category_id: number
  priority?: number
  is_user_created?: 0 | 1
}

export function createCategoryRule(
  db: Database.Database,
  userId: number,
  input: CreateCategoryRuleInput
): CategoryRuleRow {
  const result = db
    .prepare(
      `INSERT INTO category_rule (user_id, rule_type, pattern, category_id, priority, is_user_created)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      input.rule_type,
      input.pattern,
      input.category_id,
      input.priority ?? 0,
      input.is_user_created ?? 1
    )
  return getCategoryRule(db, userId, result.lastInsertRowid as number)!
}

export interface UpdateCategoryRuleInput {
  pattern?: string
  category_id?: number
  priority?: number
}

export function updateCategoryRule(
  db: Database.Database,
  userId: number,
  id: number,
  input: UpdateCategoryRuleInput
): CategoryRuleRow | undefined {
  const { clause, values } = buildSetClause(input)
  if (clause) {
    db.prepare(`UPDATE category_rule SET ${clause} WHERE user_id = ? AND id = ?`).run(...values, userId, id)
  }
  return getCategoryRule(db, userId, id)
}

export function deleteCategoryRule(db: Database.Database, userId: number, id: number): void {
  db.prepare('DELETE FROM category_rule WHERE user_id = ? AND id = ?').run(userId, id)
}
