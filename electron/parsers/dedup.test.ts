import { describe, expect, it } from 'vitest'
import { dedupKey, splitDuplicates, type ExistingTransaction } from './dedup'
import { matchAccount, type MatchableAccount } from './accountMatch'
import type { TransactionDraft } from './types'

function draft(date: string, amount: number, narration: string): TransactionDraft {
  return { date, amount, narration, type: 'debit' }
}

describe('dedupKey', () => {
  it('is stable across narration whitespace/case differences', () => {
    expect(dedupKey({ date: '2026-07-01', amount: 450, narration: '  upi  swiggy ' })).toBe(
      dedupKey({ date: '2026-07-01', amount: 450, narration: 'UPI SWIGGY' })
    )
  })

  it('differs on date, amount, or narration', () => {
    const base = { date: '2026-07-01', amount: 450, narration: 'A' }
    expect(dedupKey(base)).not.toBe(dedupKey({ ...base, amount: 451 }))
    expect(dedupKey(base)).not.toBe(dedupKey({ ...base, date: '2026-07-02' }))
    expect(dedupKey(base)).not.toBe(dedupKey({ ...base, narration: 'B' }))
  })
})

describe('splitDuplicates', () => {
  const existing: ExistingTransaction[] = [
    { date: '2026-07-01', amount: 450, narration: 'UPI SWIGGY' },
    { date: '2026-07-02', amount: 150000, narration: 'SALARY ACME CORP' }
  ]

  it('flags drafts that match existing transactions', () => {
    const drafts = [
      draft('2026-07-01', 450, 'upi swiggy'), // dup (case/space-insensitive)
      draft('2026-07-03', 99, 'NEW TXN') // fresh
    ]
    const { fresh, duplicates } = splitDuplicates(drafts, existing)
    expect(duplicates).toHaveLength(1)
    expect(fresh).toHaveLength(1)
    expect(fresh[0].narration).toBe('NEW TXN')
  })

  it('consumes each existing match once, so a genuine repeat within the file stays fresh', () => {
    const drafts = [draft('2026-07-01', 450, 'UPI SWIGGY'), draft('2026-07-01', 450, 'UPI SWIGGY')]
    const { fresh, duplicates } = splitDuplicates(drafts, existing)
    expect(duplicates).toHaveLength(1) // first matches the one existing row
    expect(fresh).toHaveLength(1) // second is a new occurrence
  })
})

describe('matchAccount', () => {
  const accounts: MatchableAccount[] = [
    { id: 1, last4: '4321', nickname: 'ICICI Salary', type: 'salary' },
    { id: 2, last4: '9999', nickname: 'HDFC Savings', type: 'savings' },
    { id: 3, last4: null, nickname: 'Cash', type: 'cash' }
  ]

  it('matches a unique last4', () => {
    expect(matchAccount(accounts, '4321')).toEqual({ kind: 'matched', accountId: 1 })
  })

  it('reports unknown when the last4 has no account', () => {
    expect(matchAccount(accounts, '0000')).toEqual({ kind: 'unknown', detectedLast4: '0000' })
  })

  it('reports none when no account number was detected', () => {
    expect(matchAccount(accounts, undefined)).toEqual({ kind: 'none' })
  })

  it('flags ambiguity when multiple accounts share a last4', () => {
    const dup = [...accounts, { id: 4, last4: '4321', nickname: 'ICICI 2', type: 'savings' }]
    expect(matchAccount(dup, '4321')).toEqual({ kind: 'ambiguous', candidateIds: [1, 4] })
  })
})
