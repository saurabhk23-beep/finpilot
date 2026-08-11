import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3-multiple-ciphers'
import { openDatabase } from '../db/connection'
import { createAccount } from '../db/queries/accounts'
import { updateUser } from '../db/queries/users'
import { listTransactions } from '../db/queries/transactions'
import { listImportLogs } from '../db/queries/importLog'
import { listStocks } from '../db/queries/stocks'
import {
  commitTransactionImport,
  previewTransactionImport,
  type ImportPreview
} from './import-service'
import { importGroww } from './investment-import'

const sidecarPaths = { scriptsDir: join(__dirname, '..', '..', 'python') }

describe('import-service (real DB)', () => {
  let dir: string
  let db: Database.Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-import-'))
    db = openDatabase({ dbPath: join(dir, 'db.db'), saltPath: join(dir, 'salt'), password: 'pw' })
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function writeCsv(name: string, content: string): string {
    const p = join(dir, name)
    writeFileSync(p, content, 'utf-8')
    return p
  }

  const bankCsv = [
    'Txn Date,Narration,Withdrawal,Deposit',
    '01-07-2026,UPI-SWIGGY,450.00,',
    '02-07-2026,SALARY ACME CORP,,150000.00',
    '05-07-2026,ATM WITHDRAWAL,2000.00,'
  ].join('\n')

  it('previews a bank CSV: auto-maps columns, no writes, reports counts', async () => {
    const path = writeCsv('icici.csv', bankCsv)
    const account = createAccount(db, 1, { bank: 'ICICI', nickname: 'ICICI', type: 'savings' })

    const preview = await previewTransactionImport(db, 1, sidecarPaths, {
      path,
      kind: 'bankCsv',
      targetAccountId: account.id
    })

    expect(preview.alreadyImported).toBe(false)
    expect(preview.drafts).toHaveLength(3)
    expect(preview.freshCount).toBe(3)
    expect(preview.duplicateCount).toBe(0)
    expect(preview.dateRange).toEqual({ start: '2026-07-01', end: '2026-07-05' })
    expect(preview.mapping?.debit).toBeTruthy()
    // Preview must not write.
    expect(listTransactions(db, 1)).toHaveLength(0)
  })

  it('commits drafts into an account and records an ImportLog', async () => {
    const path = writeCsv('icici.csv', bankCsv)
    const account = createAccount(db, 1, { bank: 'ICICI', nickname: 'ICICI', type: 'savings' })
    const preview = await previewTransactionImport(db, 1, sidecarPaths, {
      path,
      kind: 'bankCsv',
      targetAccountId: account.id
    })

    const result = commitTransactionImport(db, 1, {
      fileName: preview.fileName,
      fileHash: preview.fileHash,
      accountId: account.id,
      drafts: preview.drafts,
      dateRange: preview.dateRange
    })

    expect(result.imported).toBe(3)
    const txns = listTransactions(db, 1, { accountId: account.id })
    expect(txns).toHaveLength(3)
    expect(txns.some((t) => t.narration === 'SALARY ACME CORP' && t.type === 'credit')).toBe(true)

    const logs = listImportLogs(db, 1)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ txn_count: 3, file_hash: preview.fileHash })
  })

  it('auto-categorizes recognizable transactions on commit', async () => {
    updateUser(db, 1, { employer_name: 'Acme Corp' })
    const csv = [
      'Txn Date,Narration,Withdrawal,Deposit',
      '01-07-2026,UPI SWIGGY ORDER 42,450.00,',
      '02-07-2026,NEFT ACME CORP SALARY,,150000.00',
      '03-07-2026,RANDOM UNKNOWN MERCHANT,99.00,'
    ].join('\n')
    const path = writeCsv('cat.csv', csv)
    const account = createAccount(db, 1, { bank: 'ICICI', nickname: 'ICICI', type: 'salary' })
    const preview = await previewTransactionImport(db, 1, sidecarPaths, { path, kind: 'bankCsv', targetAccountId: account.id })
    commitTransactionImport(db, 1, {
      fileName: preview.fileName,
      fileHash: preview.fileHash,
      accountId: account.id,
      drafts: preview.drafts,
      dateRange: preview.dateRange
    })

    const txns = listTransactions(db, 1, { accountId: account.id })
    const catName = (id: number | null) =>
      id === null ? null : (db.prepare('SELECT name FROM category WHERE id = ?').get(id) as { name: string }).name
    const swiggy = txns.find((t) => t.narration.includes('SWIGGY'))!
    const salary = txns.find((t) => t.narration.includes('SALARY'))!
    const unknown = txns.find((t) => t.narration.includes('UNKNOWN'))!

    expect(catName(swiggy.category_id)).toBe('Food & Dining')
    expect(catName(salary.category_id)).toBe('Income')
    expect(unknown.category_id).toBeNull() // stays uncategorized
  })

  it('re-previewing after commit flags all rows as duplicates and reports alreadyImported', async () => {
    const path = writeCsv('icici.csv', bankCsv)
    const account = createAccount(db, 1, { bank: 'ICICI', nickname: 'ICICI', type: 'savings' })
    const first = await previewTransactionImport(db, 1, sidecarPaths, { path, kind: 'bankCsv', targetAccountId: account.id })
    commitTransactionImport(db, 1, {
      fileName: first.fileName,
      fileHash: first.fileHash,
      accountId: account.id,
      drafts: first.drafts,
      dateRange: first.dateRange
    })

    const second: ImportPreview = await previewTransactionImport(db, 1, sidecarPaths, {
      path,
      kind: 'bankCsv',
      targetAccountId: account.id
    })
    expect(second.alreadyImported).toBe(true)
    expect(second.duplicateCount).toBe(3)
    expect(second.freshCount).toBe(0)
  })

  it('detects account by last4 when the statement carries an account number', async () => {
    const csvWithAcct = 'Account No: XXXXXX4321\n' + 'Txn Date,Narration,Amount\n01-07-2026,TEST,-100'
    const path = writeCsv('withacct.csv', csvWithAcct)
    const account = createAccount(db, 1, { bank: 'ICICI', nickname: 'ICICI', type: 'savings', last4: '4321' })

    const preview = await previewTransactionImport(db, 1, sidecarPaths, { path, kind: 'bankCsv' })
    expect(preview.detectedLast4).toBe('4321')
    expect(preview.accountMatch).toEqual({ kind: 'matched', accountId: account.id })
  })

  it('importGroww creates stocks + trades and dedups by file hash', () => {
    const growwCsv = [
      'Symbol,Trade Date,Trade Type,Quantity,Price,Exchange',
      'TCS,15-01-2026,BUY,10,3800,NSE',
      'INFY,20-02-2026,BUY,5,1600,NSE'
    ].join('\n')
    const path = writeCsv('groww.csv', growwCsv)

    const r1 = importGroww(db, 1, path)
    expect(r1).toMatchObject({ alreadyImported: false, stocksCreated: 2, tradesImported: 2 })
    expect(listStocks(db, 1)).toHaveLength(2)

    // Same file again → dedup, no new rows.
    const r2 = importGroww(db, 1, path)
    expect(r2.alreadyImported).toBe(true)
    expect(listStocks(db, 1)).toHaveLength(2)
  })
})
