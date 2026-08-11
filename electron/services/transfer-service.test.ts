import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3-multiple-ciphers'
import { openDatabase } from '../db/connection'
import { createAccount } from '../db/queries/accounts'
import { createCreditCard } from '../db/queries/creditCards'
import { createTransaction, getTransaction } from '../db/queries/transactions'
import {
  confirmTransfer,
  detectAndApplyTransfers,
  unlinkTransfer
} from './transfer-service'

describe('transfer-service (real DB)', () => {
  let dir: string
  let db: Database.Database
  let acctA: number
  let acctB: number

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-xfer-'))
    db = openDatabase({ dbPath: join(dir, 'db.db'), saltPath: join(dir, 'salt'), password: 'pw' })
    acctA = createAccount(db, 1, { bank: 'ICICI', nickname: 'ICICI', type: 'savings' }).id
    acctB = createAccount(db, 1, { bank: 'SBI', nickname: 'SBI', type: 'savings' }).id
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function tx(accountOrCard: { account_id?: number; card_id?: number }, type: 'credit' | 'debit', amount: number, date: string, narration = '') {
    return createTransaction(db, 1, { ...accountOrCard, date, amount, type, narration })
  }

  it('links an inter-account transfer on both sides and excludes them from spend', () => {
    const debit = tx({ account_id: acctA }, 'debit', 10000, '2026-07-10', 'NEFT TO SBI')
    const credit = tx({ account_id: acctB }, 'credit', 10000, '2026-07-11', 'NEFT FROM ICICI')

    const summary = detectAndApplyTransfers(db, 1)
    expect(summary.transfersLinked).toBe(1)
    expect(summary.ambiguous).toHaveLength(0)

    const d = getTransaction(db, 1, debit.id)!
    const c = getTransaction(db, 1, credit.id)!
    expect(d).toMatchObject({ is_transfer: 1, is_excluded: 1, matched_transfer_id: credit.id })
    expect(c).toMatchObject({ is_transfer: 1, is_excluded: 1, matched_transfer_id: debit.id })
  })

  it('links a CC bill payment (bank debit ↔ card payment credit)', () => {
    const card = createCreditCard(db, 1, {
      issuer: 'HDFC',
      nickname: 'Regalia',
      credit_limit: 200000,
      linked_account_id: acctA
    })
    const debit = tx({ account_id: acctA }, 'debit', 25000, '2026-07-15', 'HDFC CREDIT CARD PAYMENT')
    const cardCredit = tx({ card_id: card.id }, 'credit', 25000, '2026-07-16', 'PAYMENT RECEIVED')

    const summary = detectAndApplyTransfers(db, 1)
    expect(summary.ccPaymentsLinked).toBe(1)

    expect(getTransaction(db, 1, debit.id)).toMatchObject({ is_cc_payment: 1, is_excluded: 1, matched_transfer_id: cardCredit.id })
    expect(getTransaction(db, 1, cardCredit.id)).toMatchObject({ is_cc_payment: 1, is_excluded: 1 })
  })

  it('is idempotent: a second run links nothing new', () => {
    tx({ account_id: acctA }, 'debit', 500, '2026-07-10')
    tx({ account_id: acctB }, 'credit', 500, '2026-07-10')
    expect(detectAndApplyTransfers(db, 1).transfersLinked).toBe(1)
    expect(detectAndApplyTransfers(db, 1).transfersLinked).toBe(0)
  })

  it('leaves ambiguous matches unapplied for user confirmation', () => {
    const debit = tx({ account_id: acctA }, 'debit', 3000, '2026-07-10')
    const c1 = tx({ account_id: acctB }, 'credit', 3000, '2026-07-10')
    const acctC = createAccount(db, 1, { bank: 'Axis', nickname: 'Axis', type: 'savings' }).id
    const c2 = tx({ account_id: acctC }, 'credit', 3000, '2026-07-11')

    const summary = detectAndApplyTransfers(db, 1)
    expect(summary.transfersLinked).toBe(0)
    expect(summary.ambiguous).toHaveLength(1)
    expect(summary.ambiguous[0].debitId).toBe(debit.id)
    // Order is not guaranteed (listTransactions returns date DESC), so compare as a set.
    expect([...summary.ambiguous[0].candidateCreditIds].sort()).toEqual([c1.id, c2.id].sort())
    // Nothing tagged yet.
    expect(getTransaction(db, 1, debit.id)!.is_transfer).toBe(0)

    // The user confirms which credit it was.
    confirmTransfer(db, 1, debit.id, c2.id)
    expect(getTransaction(db, 1, debit.id)).toMatchObject({ is_transfer: 1, matched_transfer_id: c2.id })
    expect(getTransaction(db, 1, c2.id)!.is_excluded).toBe(1)
  })

  it('unlinkTransfer restores both sides to spend totals', () => {
    const debit = tx({ account_id: acctA }, 'debit', 800, '2026-07-10')
    const credit = tx({ account_id: acctB }, 'credit', 800, '2026-07-10')
    detectAndApplyTransfers(db, 1)
    expect(getTransaction(db, 1, debit.id)!.is_excluded).toBe(1)

    unlinkTransfer(db, 1, debit.id)
    expect(getTransaction(db, 1, debit.id)).toMatchObject({ is_transfer: 0, is_excluded: 0 })
    expect(getTransaction(db, 1, credit.id)).toMatchObject({ is_transfer: 0, is_excluded: 0 })
  })
})
