import type Database from 'better-sqlite3-multiple-ciphers'

/** What slice of accounts the dashboard is showing. */
export type Scope =
  | { kind: 'all' }
  | { kind: 'account'; id: number }
  | { kind: 'card'; id: number }

export interface AnalyticsFilter {
  scope: Scope
  dateFrom?: string
  dateTo?: string
}

function scopeClause(scope: Scope, p: string): { clause: string; params: unknown[] } {
  switch (scope.kind) {
    case 'account':
      return { clause: `${p}account_id = ?`, params: [scope.id] }
    case 'card':
      return { clause: `${p}card_id = ?`, params: [scope.id] }
    case 'all':
      return { clause: '1=1', params: [] }
  }
}

/**
 * Builds the shared WHERE (user + scope + date range) plus any extra conditions.
 * `p` is the column prefix (e.g. "t." when transactions is aliased in a JOIN,
 * "" otherwise); `extra` conditions must already carry the same prefix.
 */
function where(
  userId: number,
  filter: AnalyticsFilter,
  p = '',
  extra: string[] = []
): { clause: string; params: unknown[] } {
  const scope = scopeClause(filter.scope, p)
  const conditions = [`${p}user_id = ?`, scope.clause]
  const params: unknown[] = [userId, ...scope.params]
  if (filter.dateFrom) {
    conditions.push(`${p}date >= ?`)
    params.push(filter.dateFrom)
  }
  if (filter.dateTo) {
    conditions.push(`${p}date <= ?`)
    params.push(filter.dateTo)
  }
  // Extra conditions carry their own params, which callers append *after* where()'s
  // params — so they must come last in the clause for the bindings to line up.
  conditions.push(...extra)
  return { clause: conditions.filter((c) => c !== '1=1').join(' AND '), params }
}

/** The top-level "Investment" category id — its spend isn't counted as an expense. */
function investmentCategoryId(db: Database.Database, userId: number): number | null {
  const row = db
    .prepare("SELECT id FROM category WHERE user_id = ? AND parent_id IS NULL AND name = 'Investment'")
    .get(userId) as { id: number } | undefined
  return row?.id ?? null
}

/** Condition (+ params) that keeps only real expenses: non-excluded debits that aren't investments. */
function expenseExtra(investmentId: number | null, p = ''): { conds: string[]; params: unknown[] } {
  const conds = [`${p}type = 'debit'`, `${p}is_excluded = 0`]
  const params: unknown[] = []
  if (investmentId !== null) {
    conds.push(`(${p}category_id IS NULL OR ${p}category_id != ?)`)
    params.push(investmentId)
  }
  return { conds, params }
}

export interface Summary {
  income: number
  expenses: number
  netSavings: number
  savingsRatePct: number
  uncategorizedCount: number
}

export function getSummary(db: Database.Database, userId: number, filter: AnalyticsFilter): Summary {
  const investmentId = investmentCategoryId(db, userId)

  const incomeW = where(userId, filter, '', ["type = 'credit'", 'is_excluded = 0'])
  const income =
    (db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE ${incomeW.clause}`).get(
      ...incomeW.params
    ) as { s: number }).s

  const exp = expenseExtra(investmentId)
  const expenseW = where(userId, filter, '', exp.conds)
  const expenses =
    (db
      .prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE ${expenseW.clause}`)
      .get(...expenseW.params, ...exp.params) as { s: number }).s

  const uncatW = where(userId, filter, '', ['category_id IS NULL', 'is_excluded = 0'])
  const uncategorizedCount =
    (db.prepare(`SELECT COUNT(*) AS c FROM transactions WHERE ${uncatW.clause}`).get(...uncatW.params) as {
      c: number
    }).c

  const netSavings = income - expenses
  const savingsRatePct = income > 0 ? Math.round((netSavings / income) * 1000) / 10 : 0

  return { income, expenses, netSavings, savingsRatePct, uncategorizedCount }
}

export interface CategoryBreakdownItem {
  categoryId: number | null
  name: string
  total: number
  subcategories: { subCategoryId: number | null; name: string; total: number }[]
}

/** Expense totals grouped by top-level category, each with its sub-category split. */
export function getCategoryBreakdown(
  db: Database.Database,
  userId: number,
  filter: AnalyticsFilter
): CategoryBreakdownItem[] {
  const investmentId = investmentCategoryId(db, userId)
  const exp = expenseExtra(investmentId, 't.')
  const w = where(userId, filter, 't.', exp.conds)

  const rows = db
    .prepare(
      `SELECT t.category_id AS categoryId, t.sub_category_id AS subCategoryId,
              c.name AS catName, s.name AS subName, SUM(t.amount) AS total
       FROM transactions t
       LEFT JOIN category c ON c.id = t.category_id
       LEFT JOIN category s ON s.id = t.sub_category_id
       WHERE ${w.clause}
       GROUP BY t.category_id, t.sub_category_id`
    )
    .all(...w.params, ...exp.params) as {
    categoryId: number | null
    subCategoryId: number | null
    catName: string | null
    subName: string | null
    total: number
  }[]

  const byTop = new Map<string, CategoryBreakdownItem>()
  for (const r of rows) {
    const key = r.categoryId === null ? 'uncategorized' : String(r.categoryId)
    if (!byTop.has(key)) {
      byTop.set(key, {
        categoryId: r.categoryId,
        name: r.catName ?? 'Uncategorized',
        total: 0,
        subcategories: []
      })
    }
    const item = byTop.get(key)!
    item.total += r.total
    item.subcategories.push({
      subCategoryId: r.subCategoryId,
      name: r.subName ?? (r.categoryId === null ? 'Uncategorized' : 'Other'),
      total: r.total
    })
  }

  const result = [...byTop.values()]
  result.forEach((i) => i.subcategories.sort((a, b) => b.total - a.total))
  return result.sort((a, b) => b.total - a.total)
}

export interface MonthlyTrendPoint {
  month: string // YYYY-MM
  total: number
  categories: Record<string, number>
}

/** Monthly expense totals, split by top-level category name (for a stacked bar chart). */
export function getMonthlyTrend(
  db: Database.Database,
  userId: number,
  filter: AnalyticsFilter
): MonthlyTrendPoint[] {
  const investmentId = investmentCategoryId(db, userId)
  const exp = expenseExtra(investmentId, 't.')
  const w = where(userId, filter, 't.', exp.conds)

  const rows = db
    .prepare(
      `SELECT substr(t.date,1,7) AS month, COALESCE(c.name,'Uncategorized') AS catName, SUM(t.amount) AS total
       FROM transactions t
       LEFT JOIN category c ON c.id = t.category_id
       WHERE ${w.clause}
       GROUP BY month, catName
       ORDER BY month`
    )
    .all(...w.params, ...exp.params) as { month: string; catName: string; total: number }[]

  const byMonth = new Map<string, MonthlyTrendPoint>()
  for (const r of rows) {
    if (!byMonth.has(r.month)) byMonth.set(r.month, { month: r.month, total: 0, categories: {} })
    const point = byMonth.get(r.month)!
    point.categories[r.catName] = (point.categories[r.catName] ?? 0) + r.total
    point.total += r.total
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
}

/** Words that are payment rails / plumbing, never a merchant name. */
const RAIL_WORDS = new Set([
  'UPI', 'NEFT', 'IMPS', 'RTGS', 'POS', 'ACH', 'ATM', 'TXN', 'REF', 'CR', 'DR', 'TFR',
  'WDL', 'DEP', 'PAYMENT', 'PAY', 'TO', 'FROM', 'THE', 'AND', 'OF', 'VIA', 'NA'
])

/**
 * Turns one UPI field into a merchant name, or null if it's plumbing. A VPA like
 * "swiggy@icici" yields its readable handle ("SWIGGY"), but masked handles
 * ("XXyao7@ptys"), phone numbers ("9125449069@pz"), ref numbers and rail words
 * are rejected so they never become a merchant.
 */
function nameFromPart(part: string): string | null {
  let t = part.trim()
  const at = t.indexOf('@')
  if (at >= 0) t = t.slice(0, at) // VPA handle before '@'
  if (t.length < 3) return null
  if (RAIL_WORDS.has(t.toUpperCase())) return null
  if (/^X{2,}/i.test(t)) return null // masked handle, e.g. "XXyao7"
  const letters = t.replace(/[^a-zA-Z]/g, '')
  if (letters.length < 3) return null // phone numbers / ref ids / too few letters
  const cleaned = t.replace(/[^a-zA-Z .&'-]/g, '').trim()
  return cleaned ? cleaned.toUpperCase().slice(0, 24) : null
}

/**
 * Reduces a narration to a display merchant name for grouping. UPI narrations
 * are structured `…/UPI/<name>/<vpa>/<note>/<bank>/<ref>/…` (ICICI) or
 * `…/UPI/CR|DR/<ref>/<name>/<bank>/…` (SBI), and simpler ones as `UPI/<vpa>/…`;
 * the first field that yields a real name wins. Masked VPA handles
 * ("XXyao7@ptys") and ref numbers are skipped. Non-UPI narrations fall back to
 * stripping rails/digits.
 */
export function merchantKey(narration: string): string {
  const upiIdx = narration.toUpperCase().indexOf('UPI/')
  if (upiIdx >= 0) {
    const parts = narration.slice(upiIdx + 4).split('/')
    for (const part of parts) {
      const name = nameFromPart(part)
      if (name) return name
    }
  }
  const cleaned = narration
    .toUpperCase()
    .replace(/\b(UPI|NEFT|IMPS|RTGS|POS|ACH|ATM|TXN|REF|NO|PVT|LTD|IN|OUT|CR|DR|TFR|WDL|DEP)\b/g, ' ')
    .replace(/\d[\d/-]*/g, ' ')
    .replace(/[^A-Z&\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || narration.trim().toUpperCase()).slice(0, 24)
}

export interface MerchantTotal {
  merchant: string
  total: number
  count: number
}

/** Top merchants by expense spend within the current scope/range. */
export function getTopMerchants(
  db: Database.Database,
  userId: number,
  filter: AnalyticsFilter,
  limit = 10
): MerchantTotal[] {
  const investmentId = investmentCategoryId(db, userId)
  const exp = expenseExtra(investmentId)
  const w = where(userId, filter, '', exp.conds)

  const rows = db
    .prepare(`SELECT narration, amount FROM transactions WHERE ${w.clause}`)
    .all(...w.params, ...exp.params) as { narration: string; amount: number }[]

  const byMerchant = new Map<string, MerchantTotal>()
  for (const r of rows) {
    const key = merchantKey(r.narration)
    if (!byMerchant.has(key)) byMerchant.set(key, { merchant: key, total: 0, count: 0 })
    const m = byMerchant.get(key)!
    m.total += r.amount
    m.count++
  }
  return [...byMerchant.values()].sort((a, b) => b.total - a.total).slice(0, limit)
}

export interface RecentTransaction {
  id: number
  date: string
  amount: number
  type: 'credit' | 'debit'
  narration: string
  categoryId: number | null
  categoryName: string | null
  subCategoryId: number | null
  subCategoryName: string | null
  accountId: number | null
  cardId: number | null
  accountLabel: string
  isTransfer: 0 | 1
  isCcPayment: 0 | 1
  isExcluded: 0 | 1
  remarks: string | null
}

/** Most recent transactions in scope/range, with account + category display names resolved. */
export function getRecentTransactions(
  db: Database.Database,
  userId: number,
  filter: AnalyticsFilter,
  limit = 50
): RecentTransaction[] {
  const w = where(userId, filter, 't.')
  return db
    .prepare(
      `SELECT t.id, t.date, t.amount, t.type, t.narration,
              t.category_id AS categoryId, c.name AS categoryName,
              t.sub_category_id AS subCategoryId, s.name AS subCategoryName,
              t.account_id AS accountId, t.card_id AS cardId,
              COALESCE(a.nickname, cc.nickname, 'Unknown') AS accountLabel,
              t.is_transfer AS isTransfer, t.is_cc_payment AS isCcPayment,
              t.is_excluded AS isExcluded, t.remarks
       FROM transactions t
       LEFT JOIN category c ON c.id = t.category_id
       LEFT JOIN category s ON s.id = t.sub_category_id
       LEFT JOIN account a ON a.id = t.account_id
       LEFT JOIN credit_card cc ON cc.id = t.card_id
       WHERE ${w.clause}
       ORDER BY t.date DESC, t.id DESC
       LIMIT ?`
    )
    .all(...w.params, limit) as RecentTransaction[]
}

/**
 * Uncategorized transactions for the review queue: non-excluded (transfers/CC
 * payments don't need categorizing) with no category, newest first.
 */
export function getUncategorized(
  db: Database.Database,
  userId: number,
  limit = 100
): RecentTransaction[] {
  return db
    .prepare(
      `SELECT t.id, t.date, t.amount, t.type, t.narration,
              t.category_id AS categoryId, c.name AS categoryName,
              t.sub_category_id AS subCategoryId, s.name AS subCategoryName,
              t.account_id AS accountId, t.card_id AS cardId,
              COALESCE(a.nickname, cc.nickname, 'Unknown') AS accountLabel,
              t.is_transfer AS isTransfer, t.is_cc_payment AS isCcPayment,
              t.is_excluded AS isExcluded, t.remarks
       FROM transactions t
       LEFT JOIN category c ON c.id = t.category_id
       LEFT JOIN category s ON s.id = t.sub_category_id
       LEFT JOIN account a ON a.id = t.account_id
       LEFT JOIN credit_card cc ON cc.id = t.card_id
       WHERE t.user_id = ? AND t.category_id IS NULL AND t.is_excluded = 0
       ORDER BY t.date DESC, t.id DESC
       LIMIT ?`
    )
    .all(userId, limit) as RecentTransaction[]
}

export interface AccountBalance {
  opening: number
  closing: number
  daily: { date: string; balance: number }[]
}

/**
 * Running daily balance for a single account: opening_balance plus the cumulative
 * signed transaction total, one point per day that had activity.
 */
export function getAccountBalance(
  db: Database.Database,
  userId: number,
  accountId: number,
  filter: AnalyticsFilter
): AccountBalance {
  const account = db
    .prepare('SELECT opening_balance FROM account WHERE user_id = ? AND id = ?')
    .get(userId, accountId) as { opening_balance: number } | undefined
  const opening = account?.opening_balance ?? 0

  const w = where(userId, { ...filter, scope: { kind: 'account', id: accountId } })
  const rows = db
    .prepare(
      `SELECT date, SUM(CASE WHEN type='credit' THEN amount ELSE -amount END) AS delta
       FROM transactions WHERE ${w.clause}
       GROUP BY date ORDER BY date`
    )
    .all(...w.params) as { date: string; delta: number }[]

  let running = opening
  const daily = rows.map((r) => {
    running += r.delta
    return { date: r.date, balance: Math.round(running * 100) / 100 }
  })
  return { opening, closing: daily.length ? daily[daily.length - 1].balance : opening, daily }
}

export interface CardUtilization {
  limit: number
  outstanding: number
  available: number
  utilizationPct: number
}

/** Current utilization for a card: net outstanding (spend − payments) against its limit, all-time. */
export function getCardUtilization(
  db: Database.Database,
  userId: number,
  cardId: number
): CardUtilization {
  const card = db
    .prepare('SELECT credit_limit FROM credit_card WHERE user_id = ? AND id = ?')
    .get(userId, cardId) as { credit_limit: number } | undefined
  const limit = card?.credit_limit ?? 0

  const row = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN type='debit' THEN amount ELSE -amount END),0) AS outstanding
       FROM transactions WHERE user_id = ? AND card_id = ?`
    )
    .get(userId, cardId) as { outstanding: number }
  const outstanding = Math.round(row.outstanding * 100) / 100
  const available = Math.round((limit - outstanding) * 100) / 100
  const utilizationPct = limit > 0 ? Math.round((outstanding / limit) * 1000) / 10 : 0
  return { limit, outstanding, available, utilizationPct }
}
