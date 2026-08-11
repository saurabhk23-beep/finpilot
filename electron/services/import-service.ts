import type Database from 'better-sqlite3-multiple-ciphers'
import { readFileSync } from 'fs'
import { basename } from 'path'
import { parseBankCsv } from '../parsers/bankCsv'
import { hashFile } from '../parsers/hash'
import { splitDuplicates, type ExistingTransaction } from '../parsers/dedup'
import { matchAccount, type AccountMatch } from '../parsers/accountMatch'
import { parseBankPdf, type SidecarPaths } from '../parsers/sidecar'
import type { ColumnMapping } from '../parsers/csv'
import type { TransactionDraft } from '../parsers/types'
import { listAccounts } from '../db/queries/accounts'
import { listCategories } from '../db/queries/categories'
import { getUser } from '../db/queries/users'
import { createTransactions, listTransactions, type CreateTransactionInput } from '../db/queries/transactions'
import { createImportLog, findImportLogByHash } from '../db/queries/importLog'
import { createCategorizer, findRecurringDebitAmounts } from './categorizer'
import { detectAndApplyTransfers } from './transfer-service'
import type { CategoryRow } from '../db/types'

export type TransactionImportKind = 'bankCsv' | 'bankPdf'

export interface PreviewParams {
  path: string
  kind: TransactionImportKind
  /** CSV only: explicit column mapping. Omit to auto-map. */
  mapping?: ColumnMapping
  /** PDF only: bank hint for the sidecar. */
  bank?: string
  /** When known, scopes duplicate detection to this account's existing transactions. */
  targetAccountId?: number
}

export interface ImportPreview {
  fileName: string
  fileHash: string
  /** True if this exact file was already imported (by hash). */
  alreadyImported: boolean
  /** CSV only: detected headers + current mapping, so the UI can offer re-mapping. */
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

function existingInRange(
  db: Database.Database,
  userId: number,
  accountId: number | undefined,
  range: { start: string; end: string } | undefined
): ExistingTransaction[] {
  if (accountId === undefined || !range) return []
  return listTransactions(db, userId, {
    accountId,
    dateFrom: range.start,
    dateTo: range.end
  }).map((t) => ({ date: t.date, amount: t.amount, narration: t.narration }))
}

/**
 * Parses a statement (no writes) and reports: file-level dedup, which account it
 * belongs to, the transaction-level fresh/duplicate split, and (for CSV) the
 * column mapping so the UI can adjust it and re-preview.
 */
export async function previewTransactionImport(
  db: Database.Database,
  userId: number,
  sidecarPaths: SidecarPaths,
  params: PreviewParams
): Promise<ImportPreview> {
  const fileHash = hashFile(params.path)
  const alreadyImported = !!findImportLogByHash(db, userId, fileHash)

  let drafts: TransactionDraft[]
  let skipped = 0
  let detectedLast4: string | undefined
  let dateRange: { start: string; end: string } | undefined
  let headers: string[] | undefined
  let mapping: ColumnMapping | undefined

  if (params.kind === 'bankCsv') {
    const text = readFileSync(params.path, 'utf-8')
    const parsed = parseBankCsv(text, { mapping: params.mapping })
    drafts = parsed.drafts
    skipped = parsed.skipped
    detectedLast4 = parsed.detectedAccountNumber
    dateRange = parsed.dateRange
    headers = parsed.headers
    mapping = parsed.mapping
  } else {
    const parsed = await parseBankPdf(sidecarPaths, params.path, params.bank ?? '')
    drafts = parsed.transactions.map((t) => ({
      date: t.date,
      amount: t.amount,
      type: t.type,
      narration: t.narration,
      balance: t.balance ?? undefined
    }))
    detectedLast4 = parsed.account_number ?? undefined
    dateRange = rangeOf(drafts)
  }

  const accounts = listAccounts(db, userId)
  const accountMatch = matchAccount(
    accounts.map((a) => ({ id: a.id, last4: a.last4, nickname: a.nickname, type: a.type })),
    detectedLast4
  )

  const scopeAccountId =
    params.targetAccountId ?? (accountMatch.kind === 'matched' ? accountMatch.accountId : undefined)
  const existing = existingInRange(db, userId, scopeAccountId, dateRange)
  const { fresh, duplicates } = splitDuplicates(drafts, existing)

  return {
    fileName: basename(params.path),
    fileHash,
    alreadyImported,
    headers,
    mapping,
    detectedLast4,
    accountMatch,
    drafts,
    freshCount: fresh.length,
    duplicateCount: duplicates.length,
    skipped,
    dateRange
  }
}

function rangeOf(drafts: TransactionDraft[]): { start: string; end: string } | undefined {
  if (drafts.length === 0) return undefined
  let start = drafts[0].date
  let end = drafts[0].date
  for (const d of drafts) {
    if (d.date < start) start = d.date
    if (d.date > end) end = d.date
  }
  return { start, end }
}

export interface CommitParams {
  fileName: string
  fileHash: string
  accountId: number
  drafts: TransactionDraft[]
  dateRange?: { start: string; end: string }
}

export interface CommitResult {
  imported: number
  importLogId: number
  transfersLinked: number
  ccPaymentsLinked: number
}

/**
 * Writes the chosen drafts to an account and records an ImportLog — all in one
 * DB transaction. Each draft is auto-categorized on the way in: an explicit
 * category from the source file wins; otherwise the rule-based categorizer runs
 * (with EMI recurrence computed across the account's existing + incoming debits).
 */
export function commitTransactionImport(
  db: Database.Database,
  userId: number,
  params: CommitParams
): CommitResult {
  const categories = listCategories(db, userId)
  const catByName = new Map<string, CategoryRow>(categories.map((c) => [c.name.toLowerCase(), c]))

  function resolveRow(cat: CategoryRow): { categoryId: number; subCategoryId: number | undefined } {
    if (cat.parent_id) return { categoryId: cat.parent_id, subCategoryId: cat.id }
    return { categoryId: cat.id, subCategoryId: undefined }
  }

  const user = getUser(db, userId)
  const categorizer = createCategorizer(db, userId, { employerName: user?.employer_name })

  const existing = listTransactions(db, userId, { accountId: params.accountId })
  const recurring = findRecurringDebitAmounts([...existing, ...params.drafts])

  const inputs: CreateTransactionInput[] = params.drafts.map((d) => {
    let categoryId: number | undefined
    let subCategoryId: number | undefined

    const explicit = d.category ? catByName.get(d.category.toLowerCase()) : undefined
    if (explicit) {
      ;({ categoryId, subCategoryId } = resolveRow(explicit))
    } else {
      const result = categorizer.categorize({
        narration: d.narration,
        amount: d.amount,
        type: d.type,
        isRecurringAmount: recurring.has(d.amount)
      })
      if (result) {
        categoryId = result.categoryId
        subCategoryId = result.subCategoryId ?? undefined
      }
    }

    return {
      account_id: params.accountId,
      date: d.date,
      amount: d.amount,
      type: d.type,
      narration: d.narration,
      category_id: categoryId,
      sub_category_id: subCategoryId,
      source_file: params.fileName
    }
  })

  const commit = db.transaction(() => {
    const ids = createTransactions(db, userId, inputs)
    const log = createImportLog(db, userId, {
      file_name: params.fileName,
      file_hash: params.fileHash,
      account_id: params.accountId,
      txn_count: ids.length,
      date_range_start: params.dateRange?.start,
      date_range_end: params.dateRange?.end,
      status: 'success'
    })
    return { imported: ids.length, importLogId: log.id }
  })

  const { imported, importLogId } = commit()

  // Detection runs after the insert commits (it opens its own transaction) so the
  // freshly imported rows are matched against everything already in the DB.
  const detection = detectAndApplyTransfers(db, userId)

  return {
    imported,
    importLogId,
    transfersLinked: detection.transfersLinked,
    ccPaymentsLinked: detection.ccPaymentsLinked
  }
}
