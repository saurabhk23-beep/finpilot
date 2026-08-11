import { describe, expect, it } from 'vitest'
import {
  detectTransfers,
  hasCcPaymentKeyword,
  hasTransferKeyword,
  type DetectorTransaction
} from './transfer-detector'

let nextId = 1
function txn(partial: Partial<DetectorTransaction> & { type: 'credit' | 'debit'; amount: number; date: string }): DetectorTransaction {
  return {
    id: partial.id ?? nextId++,
    account_id: partial.account_id ?? null,
    card_id: partial.card_id ?? null,
    date: partial.date,
    amount: partial.amount,
    type: partial.type,
    narration: partial.narration ?? '',
    is_transfer: partial.is_transfer ?? 0,
    is_cc_payment: partial.is_cc_payment ?? 0
  }
}

describe('keyword hints', () => {
  it('recognizes transfer and CC-payment narrations', () => {
    expect(hasTransferKeyword('NEFT SELF TRANSFER')).toBe(true)
    expect(hasTransferKeyword('SWIGGY ORDER')).toBe(false)
    expect(hasCcPaymentKeyword('HDFC CREDIT CARD PAYMENT')).toBe(true)
    expect(hasCcPaymentKeyword('VISA AUTOPAY')).toBe(true)
    expect(hasCcPaymentKeyword('GROCERY STORE')).toBe(false)
  })
})

describe('detectTransfers — inter-account', () => {
  it('matches a debit in A to a same-amount credit in B on the same/next day', () => {
    const debit = txn({ account_id: 1, type: 'debit', amount: 10000, date: '2026-07-10', narration: 'NEFT TO SBI' })
    const credit = txn({ account_id: 2, type: 'credit', amount: 10000, date: '2026-07-11', narration: 'NEFT FROM ICICI' })
    const { matches, ambiguous } = detectTransfers([debit, credit], [])
    expect(ambiguous).toHaveLength(0)
    expect(matches).toEqual([{ debitId: debit.id, creditId: credit.id, kind: 'inter-account' }])
  })

  it('does not match within the same account', () => {
    const debit = txn({ account_id: 1, type: 'debit', amount: 500, date: '2026-07-10' })
    const credit = txn({ account_id: 1, type: 'credit', amount: 500, date: '2026-07-10' })
    expect(detectTransfers([debit, credit], []).matches).toHaveLength(0)
  })

  it('does not match outside the date window', () => {
    const debit = txn({ account_id: 1, type: 'debit', amount: 500, date: '2026-07-10' })
    const credit = txn({ account_id: 2, type: 'credit', amount: 500, date: '2026-07-15' })
    expect(detectTransfers([debit, credit], []).matches).toHaveLength(0)
  })

  it('flags ambiguity when a debit could match two credits', () => {
    const debit = txn({ account_id: 1, type: 'debit', amount: 2000, date: '2026-07-10' })
    const c1 = txn({ account_id: 2, type: 'credit', amount: 2000, date: '2026-07-10' })
    const c2 = txn({ account_id: 3, type: 'credit', amount: 2000, date: '2026-07-11' })
    const { matches, ambiguous } = detectTransfers([debit, c1, c2], [])
    expect(matches).toHaveLength(0)
    expect(ambiguous).toEqual([{ debitId: debit.id, candidateCreditIds: [c1.id, c2.id], kind: 'inter-account' }])
  })

  it('consumes a matched credit so it is not reused by another debit', () => {
    const d1 = txn({ account_id: 1, type: 'debit', amount: 750, date: '2026-07-10' })
    const d2 = txn({ account_id: 1, type: 'debit', amount: 750, date: '2026-07-10' })
    const c1 = txn({ account_id: 2, type: 'credit', amount: 750, date: '2026-07-10' })
    const { matches } = detectTransfers([d1, d2, c1], [])
    // Only one debit can claim the single credit; the other finds nothing.
    expect(matches).toHaveLength(1)
  })

  it('skips already-tagged transactions (idempotent re-run)', () => {
    const debit = txn({ account_id: 1, type: 'debit', amount: 100, date: '2026-07-10', is_transfer: 1 })
    const credit = txn({ account_id: 2, type: 'credit', amount: 100, date: '2026-07-10', is_transfer: 1 })
    expect(detectTransfers([debit, credit], []).matches).toHaveLength(0)
  })
})

describe('detectTransfers — CC bill payments', () => {
  it('matches a bank debit to a payment credit on a card', () => {
    const debit = txn({ account_id: 1, type: 'debit', amount: 25000, date: '2026-07-15', narration: 'HDFC CREDIT CARD PAYMENT' })
    const cardCredit = txn({ card_id: 9, type: 'credit', amount: 25000, date: '2026-07-16', narration: 'PAYMENT RECEIVED' })
    const { matches } = detectTransfers([debit, cardCredit], [{ id: 9, linked_account_id: 1 }])
    expect(matches).toEqual([{ debitId: debit.id, creditId: cardCredit.id, kind: 'cc-payment' }])
  })

  it('uses the card linked-account hint to break a tie between two cards', () => {
    const debit = txn({ account_id: 1, type: 'debit', amount: 12000, date: '2026-07-15' })
    const cardA = txn({ card_id: 9, type: 'credit', amount: 12000, date: '2026-07-15' }) // linked to acct 1
    const cardB = txn({ card_id: 8, type: 'credit', amount: 12000, date: '2026-07-15' }) // linked elsewhere
    const { matches, ambiguous } = detectTransfers(
      [debit, cardA, cardB],
      [{ id: 9, linked_account_id: 1 }, { id: 8, linked_account_id: 2 }]
    )
    expect(ambiguous).toHaveLength(0)
    expect(matches).toEqual([{ debitId: debit.id, creditId: cardA.id, kind: 'cc-payment' }])
  })

  it('prefers CC-payment matching over inter-account for the same debit', () => {
    const debit = txn({ account_id: 1, type: 'debit', amount: 5000, date: '2026-07-15' })
    const cardCredit = txn({ card_id: 9, type: 'credit', amount: 5000, date: '2026-07-15' })
    const bankCredit = txn({ account_id: 2, type: 'credit', amount: 5000, date: '2026-07-15' })
    const { matches } = detectTransfers([debit, cardCredit, bankCredit], [{ id: 9, linked_account_id: 1 }])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ kind: 'cc-payment', creditId: cardCredit.id })
  })
})
