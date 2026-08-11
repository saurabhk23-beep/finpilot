import { parseAmount, parseIndianDate } from './amount'
import { parseCsv } from './csv'
import type { StockTradeDraft } from './types'

/**
 * Header aliases seen across Groww's stock exports (order/trade history and
 * holdings vary by export type and over time). Matched case-insensitively.
 */
const HEADERS = {
  symbol: /symbol|stock\s*name|company|scrip|instrument/i,
  isin: /isin/i,
  date: /trade\s*date|order\s*date|date|executed/i,
  type: /trade\s*type|order\s*type|buy\s*\/\s*sell|transaction\s*type|side/i,
  qty: /qty|quantity|shares|units/i,
  price: /price|avg\.?\s*price|average\s*price|buy\s*price/i,
  exchange: /exchange|exch/i,
  charges: /charges|brokerage|fees/i
}

function findHeader(headers: string[], pattern: RegExp): string | undefined {
  return headers.find((h) => pattern.test(h))
}

function normalizeType(raw: string): 'buy' | 'sell' | null {
  const s = raw.trim().toLowerCase()
  if (s.startsWith('b')) return 'buy'
  if (s.startsWith('s')) return 'sell'
  return null
}

function normalizeExchange(raw: string | undefined): 'NSE' | 'BSE' | undefined {
  if (!raw) return undefined
  const s = raw.trim().toUpperCase()
  if (s.includes('NSE')) return 'NSE'
  if (s.includes('BSE')) return 'BSE'
  return undefined
}

export interface GrowwParseResult {
  trades: StockTradeDraft[]
  skipped: number
}

/**
 * Parses a Groww stock trade-history CSV into buy/sell drafts. Symbol, date,
 * type, quantity, and price are required per row; rows missing any are skipped.
 * Column names are matched by alias so minor export-format changes still work.
 */
export function parseGrowwCsv(text: string): GrowwParseResult {
  const { headers, rows } = parseCsv(text)

  const cols = {
    symbol: findHeader(headers, HEADERS.symbol),
    date: findHeader(headers, HEADERS.date),
    type: findHeader(headers, HEADERS.type),
    qty: findHeader(headers, HEADERS.qty),
    price: findHeader(headers, HEADERS.price),
    exchange: findHeader(headers, HEADERS.exchange),
    charges: findHeader(headers, HEADERS.charges)
  }

  const trades: StockTradeDraft[] = []
  let skipped = 0

  for (const row of rows) {
    const symbol = cols.symbol ? (row[cols.symbol] ?? '').trim() : ''
    const date = cols.date ? parseIndianDate(row[cols.date]) : null
    const type = cols.type ? normalizeType(row[cols.type] ?? '') : null
    const qty = cols.qty ? parseAmount(row[cols.qty]) : null
    const price = cols.price ? parseAmount(row[cols.price]) : null

    if (!symbol || !date || !type || qty === null || qty <= 0 || price === null || price <= 0) {
      skipped++
      continue
    }

    const charges = cols.charges ? parseAmount(row[cols.charges]) : null

    trades.push({
      symbol: symbol.toUpperCase(),
      exchange: normalizeExchange(cols.exchange ? row[cols.exchange] : undefined),
      date,
      type,
      qty: Math.abs(qty),
      price: Math.abs(price),
      charges: charges != null ? Math.abs(charges) : undefined
    })
  }

  return { trades, skipped }
}
