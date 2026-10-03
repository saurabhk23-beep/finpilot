export interface UserRow {
  id: number
  username: string | null
  name: string | null
  monthly_salary: number | null
  employer_name: string | null
  fy_start_month: number
  onboarding_completed: 0 | 1
  created_at: string
}

export interface AccountRow {
  id: number
  user_id: number
  bank: string
  nickname: string
  last4: string | null
  type: 'savings' | 'current' | 'salary' | 'cash'
  opening_balance: number
  created_at: string
}

export interface CreditCardRow {
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

export interface CategoryRow {
  id: number
  user_id: number
  name: string
  parent_id: number | null
  icon: string | null
  is_system: 0 | 1
  is_hidden: 0 | 1
}

export type CategoryRuleType = 'keyword' | 'mcc' | 'vpa' | 'amount'

export interface CategoryRuleRow {
  id: number
  user_id: number
  rule_type: CategoryRuleType
  pattern: string
  category_id: number
  priority: number
  is_user_created: 0 | 1
  created_at: string
}

export type TransactionType = 'credit' | 'debit'

export interface TransactionRow {
  id: number
  user_id: number
  account_id: number | null
  card_id: number | null
  date: string
  amount: number
  type: TransactionType
  narration: string
  raw_text: string | null
  category_id: number | null
  sub_category_id: number | null
  is_transfer: 0 | 1
  is_cc_payment: 0 | 1
  is_excluded: 0 | 1
  remarks: string | null
  source_file: string | null
  matched_transfer_id: number | null
  mcc: string | null
  import_log_id: number | null
  created_at: string
}

export interface MFSchemeRow {
  id: number
  user_id: number
  scheme_code: string
  scheme_name: string
  folio: string
  amc_name: string | null
}

export type MFTransactionType = 'sip' | 'lumpsum' | 'redemption' | 'switch_in' | 'switch_out'

export interface MFTransactionRow {
  id: number
  user_id: number
  scheme_id: number
  date: string
  type: MFTransactionType
  amount: number
  units: number
  nav: number
}

export interface MFNavRow {
  id: number
  scheme_code: string
  date: string
  nav: number
}

export interface StockRow {
  id: number
  user_id: number
  symbol: string
  name: string | null
  exchange: 'NSE' | 'BSE' | null
  sector: string | null
}

export type StockTransactionType = 'buy' | 'sell'

export interface StockTransactionRow {
  id: number
  user_id: number
  stock_id: number
  date: string
  type: StockTransactionType
  qty: number
  price: number
  charges: number
}

export interface StockPriceRow {
  id: number
  symbol: string
  date: string
  close_price: number
}

export type ImportStatus = 'success' | 'partial' | 'failed'

export interface ImportLogRow {
  id: number
  user_id: number
  file_name: string
  file_hash: string
  account_id: number | null
  import_date: string
  txn_count: number
  date_range_start: string | null
  date_range_end: string | null
  status: ImportStatus
}
