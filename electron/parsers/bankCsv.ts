import { autoMapColumns, parseCsv, rowsToDrafts, type ColumnMapping } from './csv'
import type { ParseResult, TransactionDraft } from './types'

/** Extracts a bank account number from statement text, if present. Returns the raw match and its last 4 digits. */
export function detectAccountNumber(text: string): { full: string; last4: string } | undefined {
  // Matches "Account No: 001234567890", "A/c Number - XXXXXX1234", "Account Number 1234567890".
  const m = text.match(/a(?:ccount|\/c)\s*(?:no|number|#)?\.?\s*[:\-]?\s*([xX*\d]{6,20})/i)
  if (!m) return undefined
  const raw = m[1]
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.length < 4) return undefined
  return { full: raw, last4: digits.slice(-4) }
}

function dateRange(drafts: TransactionDraft[]): { start: string; end: string } | undefined {
  if (drafts.length === 0) return undefined
  let start = drafts[0].date
  let end = drafts[0].date
  for (const d of drafts) {
    if (d.date < start) start = d.date
    if (d.date > end) end = d.date
  }
  return { start, end }
}

export interface ParseBankCsvOptions {
  /** Explicit column mapping (from the UI); if omitted, columns are auto-mapped. */
  mapping?: ColumnMapping
}

/**
 * Parses a generic bank statement CSV. Handles single signed-amount or separate
 * debit/credit column layouts, normalizes dates, detects the account number from
 * any preamble text, and reports the covered date range.
 */
export function parseBankCsv(text: string, options: ParseBankCsvOptions = {}): ParseResult & { headers: string[]; mapping: ColumnMapping } {
  const { headers, rows } = parseCsv(text)
  const mapping = options.mapping ?? autoMapColumns(headers)
  const { drafts, skipped } = rowsToDrafts(rows, mapping)
  const account = detectAccountNumber(text)

  return {
    headers,
    mapping,
    drafts,
    skipped,
    detectedAccountNumber: account?.last4,
    dateRange: dateRange(drafts)
  }
}
