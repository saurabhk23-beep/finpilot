// Renderer-side mirror of the DB row shapes returned over IPC. Kept in sync
// with electron/db/types.ts by hand (the renderer can't import main-process code).

export interface User {
  id: number
  name: string | null
  monthly_salary: number | null
  employer_name: string | null
  fy_start_month: number
  onboarding_completed: 0 | 1
  created_at: string
}

export type AccountType = 'savings' | 'current' | 'salary' | 'cash'

export interface Account {
  id: number
  user_id: number
  bank: string
  nickname: string
  last4: string | null
  type: AccountType
  opening_balance: number
  created_at: string
}

export interface CreditCard {
  id: number
  user_id: number
  issuer: string
  nickname: string
  last4: string | null
  credit_limit: number
  bill_date: number | null
  linked_account_id: number | null
  created_at: string
}

export interface Category {
  id: number
  user_id: number
  name: string
  parent_id: number | null
  icon: string | null
  is_system: 0 | 1
  is_hidden: 0 | 1
}

export interface Stock {
  id: number
  user_id: number
  symbol: string
  name: string | null
  exchange: 'NSE' | 'BSE' | null
  sector: string | null
}

export interface MFScheme {
  id: number
  user_id: number
  scheme_code: string
  scheme_name: string
  folio: string
  amc_name: string | null
}

export interface TransactionDraft {
  date: string
  amount: number
  type: 'credit' | 'debit'
  narration: string
  category?: string
  balance?: number
}

export type ColumnKind = 'date' | 'amount' | 'debit' | 'credit' | 'narration' | 'category' | 'balance'
export type ColumnMapping = Partial<Record<ColumnKind, string | null>>

export type AccountMatch =
  | { kind: 'matched'; accountId: number }
  | { kind: 'ambiguous'; candidateIds: number[] }
  | { kind: 'unknown'; detectedLast4: string }
  | { kind: 'none' }

export interface ImportPreview {
  fileName: string
  fileHash: string
  alreadyImported: boolean
  headers?: string[]
  mapping?: ColumnMapping
  detectedLast4?: string
  accountMatch: AccountMatch
  drafts: TransactionDraft[]
  freshCount: number
  duplicateCount: number
  skipped: number
  dateRange?: { start: string; end: string }
}

export interface CommitResult {
  imported: number
  importLogId: number
  transfersLinked: number
  ccPaymentsLinked: number
}

export interface AmbiguousTransferMatch {
  debitId: number
  candidateCreditIds: number[]
  kind: 'inter-account' | 'cc-payment'
}

export interface TransferDetectSummary {
  transfersLinked: number
  ccPaymentsLinked: number
  ambiguous: AmbiguousTransferMatch[]
}

export interface CasImportResult {
  alreadyImported: boolean
  schemesCreated: number
  transactionsImported: number
}

export interface GrowwImportResult {
  alreadyImported: boolean
  stocksCreated: number
  tradesImported: number
  skipped: number
}

export type Scope =
  | { kind: 'all' }
  | { kind: 'account'; id: number }
  | { kind: 'card'; id: number }

export interface AnalyticsRange {
  dateFrom?: string
  dateTo?: string
}

export interface Summary {
  income: number
  expenses: number
  netSavings: number
  savingsRatePct: number
  uncategorizedCount: number
}

export interface CategoryBreakdownItem {
  categoryId: number | null
  name: string
  total: number
  subcategories: { subCategoryId: number | null; name: string; total: number }[]
}

export interface MonthlyTrendPoint {
  month: string
  total: number
  categories: Record<string, number>
}

export interface MerchantTotal {
  merchant: string
  total: number
  count: number
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

export interface AccountBalance {
  opening: number
  closing: number
  daily: { date: string; balance: number }[]
}

export interface CardUtilization {
  limit: number
  outstanding: number
  available: number
  utilizationPct: number
}

export interface Coverage {
  total: number
  categorized: number
  pct: number
}

export interface HoldingValuation {
  invested: number
  currentValue: number
  gainLoss: number
  gainLossPct: number
  xirrPct: number | null
  dayChange: number
  dayChangePct: number
}

export interface MFHolding extends HoldingValuation {
  schemeId: number
  schemeCode: string
  schemeName: string
  folio: string
  amcName: string | null
  units: number
  avgNav: number
  currentNav: number
  hasPrice: boolean
}

export interface StockHolding extends HoldingValuation {
  stockId: number
  symbol: string
  name: string | null
  exchange: 'NSE' | 'BSE' | null
  qty: number
  avgBuyPrice: number
  currentPrice: number
  hasPrice: boolean
}

export interface PortfolioOverview {
  totalValue: number
  totalInvested: number
  totalGainLoss: number
  totalGainLossPct: number
  overallXirrPct: number | null
  dayChange: number
  dayChangePct: number
  lastUpdated: string | null
  stale: boolean
}

export interface MFTransaction {
  id: number
  scheme_id: number
  date: string
  type: string
  amount: number
  units: number
  nav: number
}

export interface StockTransaction {
  id: number
  stock_id: number
  date: string
  type: 'buy' | 'sell'
  qty: number
  price: number
  charges: number
}

export interface MFDetail {
  scheme: MFScheme
  transactions: MFTransaction[]
  navHistory: { date: string; nav: number }[]
}

export interface StockDetail {
  stock: Stock
  transactions: StockTransaction[]
  priceHistory: { date: string; close_price: number }[]
}

export interface RefreshResult {
  mfUpdated: number
  stocksUpdated: number
  errors: string[]
  lastUpdated: string | null
}

export interface CategoryRule {
  id: number
  user_id: number
  rule_type: 'keyword' | 'mcc' | 'vpa' | 'amount'
  pattern: string
  category_id: number
  priority: number
  is_user_created: 0 | 1
  created_at: string
}

export interface RefreshConfig {
  enabled: boolean
  time: string
}

export interface AuthStatus {
  dbExists: boolean
  unlocked: boolean
}

export interface UnlockResult {
  ok: true
  onboardingCompleted: boolean
}
