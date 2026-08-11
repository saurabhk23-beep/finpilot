/** A transaction extracted from a statement, before it's assigned an account/category and persisted. */
export interface TransactionDraft {
  date: string // ISO YYYY-MM-DD
  amount: number // always positive; direction is in `type`
  type: 'credit' | 'debit'
  narration: string
  category?: string // free-text category name from the source file, if any (matched to a category later)
  balance?: number // running balance if the statement provides it
}

/** A stock trade extracted from a Groww export. */
export interface StockTradeDraft {
  symbol: string
  exchange?: 'NSE' | 'BSE'
  date: string // ISO
  type: 'buy' | 'sell'
  qty: number
  price: number
  charges?: number
}

export interface ParseResult {
  drafts: TransactionDraft[]
  /** Rows that couldn't be parsed (missing date/amount) — surfaced to the user. */
  skipped: number
  /** Account number found in the statement, if any — used for new-account detection. */
  detectedAccountNumber?: string
  dateRange?: { start: string; end: string }
}
