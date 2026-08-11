import Papa from 'papaparse'
import { parseAmount, parseIndianDate } from './amount'
import type { TransactionDraft } from './types'

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
}

/** Parses CSV text into headers + header-keyed row objects, trimming header whitespace. */
export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim()
  })
  const headers = result.meta.fields ?? []
  return { headers, rows: result.data }
}

export type ColumnKind = 'date' | 'amount' | 'debit' | 'credit' | 'narration' | 'category' | 'balance'

/**
 * Column → header mapping. Two amount conventions are supported:
 *  - a single signed `amount` column, or
 *  - separate `debit` / `credit` columns (common in Indian bank statements).
 */
export type ColumnMapping = Partial<Record<ColumnKind, string | null>>

const HEADER_HINTS: Record<ColumnKind, RegExp> = {
  date: /^(txn|transaction|value|posting)?\s*date/i,
  amount: /^(amount|amt|value)/i,
  debit: /debit|withdrawal|dr\b|paid.?out/i,
  credit: /credit|deposit|cr\b|paid.?in/i,
  narration: /narration|description|desc|details|particular|remark|note|merchant/i,
  category: /category|tag|head/i,
  balance: /balance|closing.?bal|running.?bal/i
}

/** Best-effort auto-map of CSV headers to fields by name — the user can override in the UI. */
export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const kinds = Object.keys(HEADER_HINTS) as ColumnKind[]
  for (const kind of kinds) {
    const match = headers.find((h) => HEADER_HINTS[kind].test(h))
    if (match) mapping[kind] = match
  }
  // Prefer explicit debit/credit columns over a generic amount column when both matched.
  if (mapping.debit && mapping.credit) {
    delete mapping.amount
  }
  return mapping
}

/** True if the mapping has enough to extract transactions: a date, plus either amount or debit/credit. */
export function isMappingComplete(mapping: ColumnMapping): boolean {
  const hasDate = !!mapping.date
  const hasAmount = !!mapping.amount || !!(mapping.debit || mapping.credit)
  return hasDate && hasAmount
}

function cell(row: Record<string, string>, header: string | null | undefined): string {
  if (!header) return ''
  return (row[header] ?? '').trim()
}

/**
 * Turns mapped CSV rows into transaction drafts.
 *
 * With a signed `amount` column: negative/Dr → debit, positive/Cr → credit.
 * With separate `debit`/`credit` columns: whichever is non-empty sets the direction.
 * Dates are normalized to ISO. Rows missing a date or a usable amount are skipped and counted.
 */
export function rowsToDrafts(
  rows: Record<string, string>[],
  mapping: ColumnMapping
): { drafts: TransactionDraft[]; skipped: number } {
  const drafts: TransactionDraft[] = []
  let skipped = 0

  for (const row of rows) {
    const isoDate = parseIndianDate(cell(row, mapping.date))
    if (!isoDate) {
      skipped++
      continue
    }

    let amount: number | null = null
    let type: 'credit' | 'debit' | null = null

    if (mapping.debit || mapping.credit) {
      const debit = parseAmount(cell(row, mapping.debit))
      const credit = parseAmount(cell(row, mapping.credit))
      if (debit && debit !== 0) {
        amount = Math.abs(debit)
        type = 'debit'
      } else if (credit && credit !== 0) {
        amount = Math.abs(credit)
        type = 'credit'
      }
    } else {
      const signed = parseAmount(cell(row, mapping.amount))
      if (signed !== null && signed !== 0) {
        amount = Math.abs(signed)
        type = signed < 0 ? 'debit' : 'credit'
      }
    }

    if (amount === null || type === null) {
      skipped++
      continue
    }

    const balance = mapping.balance ? parseAmount(cell(row, mapping.balance)) : null

    drafts.push({
      date: isoDate,
      amount,
      type,
      narration: cell(row, mapping.narration) || '(no description)',
      category: cell(row, mapping.category) || undefined,
      balance: balance ?? undefined
    })
  }

  return { drafts, skipped }
}
