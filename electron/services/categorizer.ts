import type Database from 'better-sqlite3-multiple-ciphers'
import { listCategories } from '../db/queries/categories'
import { listCategoryRules } from '../db/queries/categoryRules'
import type { CategoryRow, CategoryRuleRow } from '../db/types'

export type CategorizationLayer =
  | 'user'
  | 'mcc'
  | 'keyword'
  | 'vpa'
  | 'amount'
  | 'heuristic-salary'
  | 'heuristic-emi'

export interface CategorizeInput {
  narration: string
  amount: number
  type: 'credit' | 'debit'
  mcc?: string | null
  /** Set by the batch caller when this amount recurs like an EMI (Layer 4). */
  isRecurringAmount?: boolean
}

export interface CategorizeResult {
  categoryId: number
  subCategoryId: number | null
  layer: CategorizationLayer
}

export interface CategorizerOptions {
  employerName?: string | null
}

export interface Categorizer {
  categorize: (input: CategorizeInput) => CategorizeResult | null
}

/** Pulls UPI VPA handles (e.g. "swiggy@icici") out of a narration. */
export function extractVpaHandles(narration: string): string[] {
  const matches = narration.match(/[a-z0-9][a-z0-9._-]*@[a-z][a-z0-9.]*/gi)
  return matches ? matches.map((m) => m.toLowerCase()) : []
}

function compileRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i')
  } catch {
    return null
  }
}

/**
 * Builds a categorizer for one user: loads their rules + category tree once, then
 * classifies transactions through five layers (first match wins):
 *
 *   0. user overrides  — is_user_created rules of any type, checked first because
 *                        Layer 5 carries "highest priority" (a learned mapping must
 *                        win over any default rule).
 *   1. MCC             — exact merchant-category-code match (card transactions).
 *   2. keyword         — regex against the narration.
 *   3. UPI VPA         — VPA handle extracted from the narration, matched by substring.
 *   4. heuristics      — salary (employer name in a credit) and EMI (recurring debit).
 *
 * Returns the resolved top-level category_id + sub_category_id, or null if nothing matched.
 */
export function createCategorizer(
  db: Database.Database,
  userId: number,
  options: CategorizerOptions = {}
): Categorizer {
  const categories = listCategories(db, userId)
  const byId = new Map<number, CategoryRow>(categories.map((c) => [c.id, c]))

  /** Resolves a matched category id into (top-level id, sub id) using the parent link. */
  function resolve(categoryId: number): { categoryId: number; subCategoryId: number | null } {
    const cat = byId.get(categoryId)
    if (cat && cat.parent_id) {
      return { categoryId: cat.parent_id, subCategoryId: cat.id }
    }
    return { categoryId, subCategoryId: null }
  }

  function findByPath(topName: string, subName?: string): number | null {
    const top = categories.find((c) => c.parent_id === null && c.name === topName)
    if (!top) return null
    if (!subName) return top.id
    const sub = categories.find((c) => c.parent_id === top.id && c.name === subName)
    return sub ? sub.id : top.id
  }

  const rules = listCategoryRules(db, userId) // already ordered: is_user_created DESC, priority DESC
  const userRules = rules.filter((r) => r.is_user_created === 1)
  const mccRules = rules.filter((r) => r.is_user_created === 0 && r.rule_type === 'mcc')
  const keywordRules = rules.filter((r) => r.is_user_created === 0 && r.rule_type === 'keyword')
  const vpaRules = rules.filter((r) => r.is_user_created === 0 && r.rule_type === 'vpa')
  const amountRules = rules.filter((r) => r.is_user_created === 0 && r.rule_type === 'amount')

  const regexCache = new Map<string, RegExp | null>()
  function regexFor(pattern: string): RegExp | null {
    if (!regexCache.has(pattern)) regexCache.set(pattern, compileRegex(pattern))
    return regexCache.get(pattern) ?? null
  }

  function ruleMatches(rule: CategoryRuleRow, input: CategorizeInput, vpaHandles: string[]): boolean {
    switch (rule.rule_type) {
      case 'mcc':
        return !!input.mcc && input.mcc === rule.pattern
      case 'keyword': {
        const re = regexFor(rule.pattern)
        return re ? re.test(input.narration) : false
      }
      case 'vpa': {
        const p = rule.pattern.toLowerCase()
        return vpaHandles.some((h) => h.includes(p))
      }
      case 'amount':
        return Number(rule.pattern) === input.amount
      default:
        return false
    }
  }

  const salaryCategoryId = findByPath('Income', 'Salary')
  const emiCategoryId = findByPath('EMI / Loan')
  const normalizedEmployer = options.employerName?.trim().toLowerCase() || null

  function heuristicMatch(input: CategorizeInput): CategorizeResult | null {
    // Salary: a credit whose narration mentions the employer name.
    if (
      input.type === 'credit' &&
      normalizedEmployer &&
      salaryCategoryId !== null &&
      input.narration.toLowerCase().includes(normalizedEmployer)
    ) {
      return { ...resolve(salaryCategoryId), layer: 'heuristic-salary' }
    }
    // EMI: a recurring same-amount debit.
    if (input.type === 'debit' && input.isRecurringAmount && emiCategoryId !== null) {
      return { ...resolve(emiCategoryId), layer: 'heuristic-emi' }
    }
    return null
  }

  function categorize(input: CategorizeInput): CategorizeResult | null {
    const vpaHandles = extractVpaHandles(input.narration)

    // Layer 0/5 — user overrides (highest priority).
    for (const rule of userRules) {
      if (ruleMatches(rule, input, vpaHandles)) {
        return { ...resolve(rule.category_id), layer: 'user' }
      }
    }
    // Layer 1 — MCC.
    for (const rule of mccRules) {
      if (ruleMatches(rule, input, vpaHandles)) {
        return { ...resolve(rule.category_id), layer: 'mcc' }
      }
    }
    // Layer 2 — keyword.
    for (const rule of keywordRules) {
      if (ruleMatches(rule, input, vpaHandles)) {
        return { ...resolve(rule.category_id), layer: 'keyword' }
      }
    }
    // Layer 3 — UPI VPA.
    for (const rule of vpaRules) {
      if (ruleMatches(rule, input, vpaHandles)) {
        return { ...resolve(rule.category_id), layer: 'vpa' }
      }
    }
    // Layer 4 — heuristics (salary, EMI).
    const heuristic = heuristicMatch(input)
    if (heuristic) return heuristic

    // User-created amount rules are rare; check them last within their own priority.
    for (const rule of amountRules) {
      if (ruleMatches(rule, input, vpaHandles)) {
        return { ...resolve(rule.category_id), layer: 'amount' }
      }
    }

    return null
  }

  return { categorize }
}

/**
 * Finds debit amounts that recur enough to look like an EMI/subscription
 * (same amount on >= `minOccurrences` distinct dates). Used to set
 * `isRecurringAmount` for the categorizer's Layer 4.
 */
export function findRecurringDebitAmounts(
  transactions: { amount: number; type: 'credit' | 'debit'; date: string }[],
  minOccurrences = 3
): Set<number> {
  const datesByAmount = new Map<number, Set<string>>()
  for (const t of transactions) {
    if (t.type !== 'debit') continue
    if (!datesByAmount.has(t.amount)) datesByAmount.set(t.amount, new Set())
    datesByAmount.get(t.amount)!.add(t.date)
  }
  const recurring = new Set<number>()
  for (const [amount, dates] of datesByAmount) {
    if (dates.size >= minOccurrences) recurring.add(amount)
  }
  return recurring
}
