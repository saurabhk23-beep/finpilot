import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3-multiple-ciphers'
import { openDatabase } from '../db/connection'
import { createAccount } from '../db/queries/accounts'
import { createCreditCard } from '../db/queries/creditCards'
import { updateUser } from '../db/queries/users'
import { listTransactions } from '../db/queries/transactions'
import { previewTransactionImport, commitTransactionImport } from './import-service'
import { writeFileSync } from 'fs'

// End-to-end: two bank statements imported through the real pipeline, where a
// transfer from ICICI → SBI appears as a debit in one file and a credit in the
// other. Proves categorization AND transfer detection fire on real imports, and
// that transfers are excluded from spend/income totals (the #1 accuracy rule).
describe('full import pipeline: cross-account transfer detection + spend exclusion', () => {
  let dir: string
  let db: Database.Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-live-'))
    db = openDatabase({ dbPath: join(dir, 'db.db'), saltPath: join(dir, 'salt'), password: 'pw' })
    updateUser(db, 1, { employer_name: 'Acme Corp' })
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('tags both sides of the transfer and excludes them, while categorizing the rest', async () => {
    const icici = createAccount(db, 1, { bank: 'ICICI', nickname: 'ICICI', type: 'salary', last4: '1111' })
    const sbi = createAccount(db, 1, { bank: 'SBI', nickname: 'SBI', type: 'savings', last4: '2222' })
    createCreditCard(db, 1, { issuer: 'HDFC', nickname: 'Regalia', credit_limit: 200000, linked_account_id: icici.id })

    const iciciCsv = [
      'Txn Date,Narration,Withdrawal,Deposit',
      '01-08-2026,UPI SWIGGY ORDER,450.00,',
      '02-08-2026,NEFT ACME CORP SALARY,,150000.00',
      '05-08-2026,NEFT SELF TRANSFER TO SBI,50000.00,' // the transfer OUT
    ].join('\n')
    const sbiCsv = [
      'Txn Date,Narration,Withdrawal,Deposit',
      '05-08-2026,NEFT FROM ICICI,,50000.00', // the transfer IN
      '06-08-2026,BLINKIT GROCERIES,820.00,'
    ].join('\n')

    const iciciPath = join(dir, 'icici.csv')
    const sbiPath = join(dir, 'sbi.csv')
    writeFileSync(iciciPath, iciciCsv)
    writeFileSync(sbiPath, sbiCsv)

    const sidecar = { scriptsDir: join(__dirname, '..', '..', 'python') }

    const p1 = await previewTransactionImport(db, 1, sidecar, { path: iciciPath, kind: 'bankCsv', targetAccountId: icici.id })
    const r1 = commitTransactionImport(db, 1, { fileName: p1.fileName, fileHash: p1.fileHash, accountId: icici.id, drafts: p1.drafts, dateRange: p1.dateRange })
    // No SBI credit imported yet, so the transfer isn't linkable on the first import.
    expect(r1.transfersLinked).toBe(0)

    const p2 = await previewTransactionImport(db, 1, sidecar, { path: sbiPath, kind: 'bankCsv', targetAccountId: sbi.id })
    const r2 = commitTransactionImport(db, 1, { fileName: p2.fileName, fileHash: p2.fileHash, accountId: sbi.id, drafts: p2.drafts, dateRange: p2.dateRange })
    // Now both sides exist → detection links them on the second import.
    expect(r2.transfersLinked).toBe(1)

    const txns = listTransactions(db, 1)
    const out = txns.find((t) => t.narration.includes('SELF TRANSFER'))!
    const inn = txns.find((t) => t.narration.includes('NEFT FROM ICICI'))!
    expect(out).toMatchObject({ is_transfer: 1, is_excluded: 1, matched_transfer_id: inn.id })
    expect(inn).toMatchObject({ is_transfer: 1, is_excluded: 1, matched_transfer_id: out.id })

    // The transfer is excluded from spend; real expenses are not.
    const spendDebits = txns.filter((t) => t.type === 'debit' && t.is_excluded === 0)
    const spendTotal = spendDebits.reduce((s, t) => s + t.amount, 0)
    expect(spendTotal).toBe(450 + 820) // Swiggy + Blinkit only; the 50000 transfer is excluded

    // Salary credit is categorized; the transfer credit is excluded (not counted as income).
    const income = txns.filter((t) => t.type === 'credit' && t.is_excluded === 0)
    expect(income.map((t) => t.amount)).toEqual([150000])
  })
})
