import type Database from 'better-sqlite3-multiple-ciphers'
import { getCategory } from '../db/queries/categories'

export interface MergeResult {
  transactionsReassigned: number
  rulesReassigned: number
}

/**
 * Merges the `from` category into `to`: every transaction and rule pointing at
 * `from` (as a top-level category_id or a sub_category_id) is repointed to `to`,
 * then `from` is deleted. Only custom (non-system) categories may be merged away,
 * so the default set stays intact. All-or-nothing in one transaction.
 */
export function mergeCategories(
  db: Database.Database,
  userId: number,
  fromId: number,
  toId: number
): MergeResult {
  if (fromId === toId) throw new Error('Cannot merge a category into itself')

  const from = getCategory(db, userId, fromId)
  const to = getCategory(db, userId, toId)
  if (!from) throw new Error('Source category not found')
  if (!to) throw new Error('Target category not found')
  if (from.is_system) throw new Error('System categories cannot be merged away — hide them instead')

  const run = db.transaction((): MergeResult => {
    // Repoint transactions that used `from` as their top-level or sub category.
    const topResult = db
      .prepare('UPDATE transactions SET category_id = ? WHERE user_id = ? AND category_id = ?')
      .run(toId, userId, fromId)
    const subResult = db
      .prepare('UPDATE transactions SET sub_category_id = ? WHERE user_id = ? AND sub_category_id = ?')
      .run(toId, userId, fromId)

    const ruleResult = db
      .prepare('UPDATE category_rule SET category_id = ? WHERE user_id = ? AND category_id = ?')
      .run(toId, userId, fromId)

    // Re-parent any sub-categories of `from` so we don't orphan them, then delete `from`.
    db.prepare('UPDATE category SET parent_id = ? WHERE user_id = ? AND parent_id = ?').run(toId, userId, fromId)
    db.prepare('DELETE FROM category WHERE user_id = ? AND id = ?').run(userId, fromId)

    return {
      transactionsReassigned: (topResult.changes ?? 0) + (subResult.changes ?? 0),
      rulesReassigned: ruleResult.changes ?? 0
    }
  })

  return run()
}
