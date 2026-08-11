import type Database from 'better-sqlite3-multiple-ciphers'
import { readFileSync } from 'fs'
import { basename } from 'path'
import { parseGrowwCsv } from '../parsers/groww'
import { hashFile } from '../parsers/hash'
import { parseCasPdf, type SidecarPaths } from '../parsers/sidecar'
import type { MFTransactionType } from '../db/types'
import { createMFScheme, findMFSchemeByFolio } from '../db/queries/mfSchemes'
import { createMFTransaction } from '../db/queries/mfTransactions'
import { createStock, findStockBySymbol } from '../db/queries/stocks'
import { createStockTransaction } from '../db/queries/stockTransactions'
import { createImportLog, findImportLogByHash } from '../db/queries/importLog'

/** Maps casparser transaction-type strings to FinPilot's MF transaction types. Rows that don't move units return null (taxes, dividend payouts) and are skipped. */
export function mapCasTxnType(raw: string): MFTransactionType | null {
  const t = raw.toUpperCase()
  if (t.includes('SWITCH_IN') || t === 'SWITCH_IN_MERGER') return 'switch_in'
  if (t.includes('SWITCH_OUT') || t === 'SWITCH_OUT_MERGER') return 'switch_out'
  if (t.includes('REDEMPTION') || t.includes('REVERSAL')) return 'redemption'
  if (t.includes('SIP')) return 'sip'
  if (t.includes('PURCHASE') || t.includes('REINVEST')) return 'lumpsum'
  return null
}

export interface CasImportResult {
  alreadyImported: boolean
  schemesCreated: number
  transactionsImported: number
}

/** Parses a CAS PDF via the sidecar and upserts schemes + their unit-moving transactions. */
export async function importCas(
  db: Database.Database,
  userId: number,
  sidecarPaths: SidecarPaths,
  file: string,
  password: string
): Promise<CasImportResult> {
  const fileHash = hashFile(file)
  if (findImportLogByHash(db, userId, fileHash)) {
    return { alreadyImported: true, schemesCreated: 0, transactionsImported: 0 }
  }

  const result = await parseCasPdf(sidecarPaths, file, password)

  const run = db.transaction(() => {
    let schemesCreated = 0
    let transactionsImported = 0

    for (const scheme of result.schemes) {
      const schemeCode = scheme.amfi ?? scheme.isin ?? scheme.scheme
      let existing = findMFSchemeByFolio(db, userId, schemeCode, scheme.folio)
      if (!existing) {
        existing = createMFScheme(db, userId, {
          scheme_code: schemeCode,
          scheme_name: scheme.scheme,
          folio: scheme.folio,
          amc_name: scheme.amc || undefined
        })
        schemesCreated++
      }

      for (const txn of scheme.transactions) {
        const type = mapCasTxnType(txn.type)
        if (!type || !txn.date || txn.units == null || txn.units === 0 || txn.nav == null) continue
        createMFTransaction(db, userId, {
          scheme_id: existing.id,
          date: txn.date,
          type,
          amount: Math.abs(txn.amount ?? 0),
          units: Math.abs(txn.units),
          nav: txn.nav
        })
        transactionsImported++
      }
    }

    createImportLog(db, userId, {
      file_name: basename(file),
      file_hash: fileHash,
      txn_count: transactionsImported,
      status: 'success'
    })

    return { alreadyImported: false, schemesCreated, transactionsImported }
  })

  return run()
}

export interface GrowwImportResult {
  alreadyImported: boolean
  stocksCreated: number
  tradesImported: number
  skipped: number
}

/** Parses a Groww trade-history CSV and upserts stocks + their buy/sell transactions. */
export function importGroww(db: Database.Database, userId: number, file: string): GrowwImportResult {
  const fileHash = hashFile(file)
  if (findImportLogByHash(db, userId, fileHash)) {
    return { alreadyImported: true, stocksCreated: 0, tradesImported: 0, skipped: 0 }
  }

  const text = readFileSync(file, 'utf-8')
  const { trades, skipped } = parseGrowwCsv(text)

  const run = db.transaction(() => {
    let stocksCreated = 0
    let tradesImported = 0

    for (const trade of trades) {
      let stock = findStockBySymbol(db, userId, trade.symbol)
      if (!stock) {
        stock = createStock(db, userId, { symbol: trade.symbol, exchange: trade.exchange })
        stocksCreated++
      }
      createStockTransaction(db, userId, {
        stock_id: stock.id,
        date: trade.date,
        type: trade.type,
        qty: trade.qty,
        price: trade.price,
        charges: trade.charges
      })
      tradesImported++
    }

    createImportLog(db, userId, {
      file_name: basename(file),
      file_hash: fileHash,
      txn_count: tradesImported,
      status: 'success'
    })

    return { alreadyImported: false, stocksCreated, tradesImported, skipped }
  })

  return run()
}
