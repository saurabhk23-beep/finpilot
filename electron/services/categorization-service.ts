import type Database from 'better-sqlite3-multiple-ciphers'
import { getUser } from '../db/queries/users'
import { listCategories } from '../db/queries/categories'
import { createCategoryRule, listCategoryRules } from '../db/queries/categoryRules'
import { listTransactions, updateTransaction } from '../db/queries/transactions'
import { createCategorizer, findRecurringDebitAmounts } from './categorizer'

const USER_RULE_PRIORITY = 100

export interface Coverage {
  total: number
  categorized: number
  pct: number
}

/** Categorization coverage across all of a user's transactions (category_id set / total). */
export function computeCoverage(db: Database.Database, userId: number): Coverage {
  const row = db
    .prepare(
      `SELECT count(*) AS total,
              sum(CASE WHEN category_id IS NOT NULL THEN 1 ELSE 0 END) AS categorized
       FROM transactions WHERE user_id = ?`
    )
    .get(userId) as { total: number; categorized: number | null }
  const total = row.total
  const categorized = row.categorized ?? 0
  return { total, categorized, pct: total === 0 ? 0 : Math.round((categorized / total) * 1000) / 10 }
}

/**
 * Derives a reusable keyword pattern (a literal-substring regex) from a messy
 * narration, so a one-off user correction becomes a durable rule. Prefers the
 * UPI VPA merchant handle; otherwise strips rails/refs/digits and keeps the
 * merchant words.
 */
export function deriveMerchantPattern(narration: string): string | null {
  const vpa = narration.match(/([a-z0-9][a-z0-9._]*)@[a-z][a-z0-9.]*/i)
  if (vpa) {
    const merchant = vpa[1].replace(/^(upi|paytm|okaxis|okhdfcbank|okicici|oksbi)[-._]?/i, '')
    if (merchant.length >= 3) return escapeRegex(merchant)
  }

  const cleaned = narration
    .toUpperCase()
    .replace(/\b(UPI|NEFT|IMPS|RTGS|POS|ACH|ATM|VPS|MMT|INF|TXN|REF|NO|IN|OUT|PVT|LTD)\b/g, ' ')
    .replace(/\d[\d/-]*/g, ' ') // ref numbers, dates
    .replace(/[^A-Z&\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length >= 3) return escapeRegex(cleaned)
  const fallback = narration.trim()
  return fallback.length >= 3 ? escapeRegex(fallback) : null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Resolves a chosen category id into (top-level id, sub id) using the parent link. */
function resolveCategory(
  db: Database.Database,
  userId: number,
  categoryId: number
): { categoryId: number; subCategoryId: number | null } {
  const categories = listCategories(db, userId)
  const cat = categories.find((c) => c.id === categoryId)
  if (cat && cat.parent_id) return { categoryId: cat.parent_id, subCategoryId: cat.id }
  return { categoryId, subCategoryId: null }
}

export interface SaveUserOverrideInput {
  transactionId: number
  categoryId: number
  remarks?: string
  /** When false, only the transaction is updated (no learned rule is created). Default true. */
  learn?: boolean
}

/**
 * Layer 5: applies a user's re-categorization to the transaction AND (by default)
 * learns a highest-priority keyword rule from its narration so future matching
 * transactions auto-categorize the same way.
 */
export function saveUserOverride(
  db: Database.Database,
  userId: number,
  input: SaveUserOverrideInput
): { ruleCreated: boolean } {
  const txn = db
    .prepare('SELECT narration FROM transactions WHERE user_id = ? AND id = ?')
    .get(userId, input.transactionId) as { narration: string } | undefined
  if (!txn) throw new Error('Transaction not found')

  const resolved = resolveCategory(db, userId, input.categoryId)

  const run = db.transaction(() => {
    updateTransaction(db, userId, input.transactionId, {
      category_id: resolved.categoryId,
      sub_category_id: resolved.subCategoryId ?? undefined,
      remarks: input.remarks
    })

    if (input.learn === false) return { ruleCreated: false }

    const pattern = deriveMerchantPattern(txn.narration)
    if (!pattern) return { ruleCreated: false }

    // Don't pile up duplicate learned rules for the same merchant → category.
    const existing = listCategoryRules(db, userId).find(
      (r) => r.is_user_created === 1 && r.rule_type === 'keyword' && r.pattern === pattern
    )
    if (existing) {
      if (existing.category_id !== input.categoryId) {
        // The user changed their mind about this merchant — repoint the learned rule.
        db.prepare('UPDATE category_rule SET category_id = ? WHERE user_id = ? AND id = ?').run(
          input.categoryId,
          userId,
          existing.id
        )
      }
      return { ruleCreated: false }
    }

    createCategoryRule(db, userId, {
      rule_type: 'keyword',
      pattern,
      category_id: input.categoryId,
      priority: USER_RULE_PRIORITY,
      is_user_created: 1
    })
    return { ruleCreated: true }
  })

  return run()
}

/**
 * Runs the categorizer over every uncategorized transaction and applies matches.
 * EMI recurrence is computed across the user's whole history. Returns how many
 * transactions were newly categorized.
 */
export function categorizeUncategorized(db: Database.Database, userId: number): { updated: number } {
  const user = getUser(db, userId)
  const categorizer = createCategorizer(db, userId, { employerName: user?.employer_name })

  const all = listTransactions(db, userId)
  const recurring = findRecurringDebitAmounts(all)

  let updated = 0
  const run = db.transaction(() => {
    for (const t of all) {
      if (t.category_id !== null) continue
      const result = categorizer.categorize({
        narration: t.narration,
        amount: t.amount,
        type: t.type,
        mcc: t.mcc,
        isRecurringAmount: recurring.has(t.amount)
      })
      if (!result) continue
      updateTransaction(db, userId, t.id, {
        category_id: result.categoryId,
        sub_category_id: result.subCategoryId ?? undefined
      })
      updated++
    }
  })
  run()
  return { updated }
}

/**
 * Largest uncategorized credits, for the onboarding "which of these is your
 * salary?" prompt (PRD Layer 4 fallback when employer auto-match fails).
 */
export function topUnidentifiedCredits(
  db: Database.Database,
  userId: number,
  limit = 5
): { id: number; date: string; amount: number; narration: string }[] {
  return db
    .prepare(
      `SELECT id, date, amount, narration FROM transactions
       WHERE user_id = ? AND type = 'credit' AND category_id IS NULL
       ORDER BY amount DESC LIMIT ?`
    )
    .all(userId, limit) as { id: number; date: string; amount: number; narration: string }[]
}
