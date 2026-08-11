import { describe, expect, it } from 'vitest'
import { parseAmount, parseIndianDate } from './amount'
import { autoMapColumns, isMappingComplete, parseCsv, rowsToDrafts } from './csv'
import { hashText } from './hash'

describe('parseAmount', () => {
  it('parses plain numbers and thousands separators', () => {
    expect(parseAmount('100')).toBe(100)
    expect(parseAmount('1,234.56')).toBeCloseTo(1234.56)
    expect(parseAmount(2500)).toBe(2500)
  })

  it('handles negatives, accounting parens, and Dr/Cr markers', () => {
    expect(parseAmount('-450')).toBe(-450)
    expect(parseAmount('(450)')).toBe(-450)
    expect(parseAmount('₹ 200 Dr')).toBe(-200)
    expect(parseAmount('500 Cr')).toBe(500)
    expect(parseAmount('₹1,000')).toBe(1000)
  })

  it('returns null for unparseable input', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('.')).toBeNull()
    expect(parseAmount(null)).toBeNull()
  })
})

describe('parseIndianDate', () => {
  it('normalizes day-first numeric formats to ISO', () => {
    expect(parseIndianDate('05/01/2026')).toBe('2026-01-05')
    expect(parseIndianDate('5-1-2026')).toBe('2026-01-05')
    expect(parseIndianDate('15.03.2026')).toBe('2026-03-15')
    expect(parseIndianDate('31/12/2025')).toBe('2025-12-31')
  })

  it('handles month-name formats', () => {
    expect(parseIndianDate('05-Jan-2026')).toBe('2026-01-05')
    expect(parseIndianDate('5 Jan 2026')).toBe('2026-01-05')
    expect(parseIndianDate('15-Aug-26')).toBe('2026-08-15')
  })

  it('passes through ISO and handles 2-digit years', () => {
    expect(parseIndianDate('2026-07-09')).toBe('2026-07-09')
    expect(parseIndianDate('09/07/26')).toBe('2026-07-09')
    expect(parseIndianDate('09/07/85')).toBe('1985-07-09')
  })

  it('returns null for junk and impossible dates', () => {
    expect(parseIndianDate('')).toBeNull()
    expect(parseIndianDate('not a date')).toBeNull()
    expect(parseIndianDate('45/45/2026')).toBeNull()
  })
})

describe('autoMapColumns', () => {
  it('maps single-amount bank/tracker headers', () => {
    const mapping = autoMapColumns(['Txn Date', 'Narration', 'Amount', 'Category'])
    expect(mapping).toMatchObject({
      date: 'Txn Date',
      amount: 'Amount',
      narration: 'Narration',
      category: 'Category'
    })
  })

  it('prefers separate Debit/Credit columns over a generic amount column', () => {
    const mapping = autoMapColumns(['Date', 'Description', 'Withdrawal (Dr)', 'Deposit (Cr)', 'Balance'])
    expect(mapping.debit).toBe('Withdrawal (Dr)')
    expect(mapping.credit).toBe('Deposit (Cr)')
    expect(mapping.balance).toBe('Balance')
    expect(mapping.amount).toBeUndefined()
  })
})

describe('isMappingComplete', () => {
  it('needs a date plus either amount or a debit/credit column', () => {
    expect(isMappingComplete({ date: 'D', amount: 'A' })).toBe(true)
    expect(isMappingComplete({ date: 'D', debit: 'W' })).toBe(true)
    expect(isMappingComplete({ date: 'D' })).toBe(false)
    expect(isMappingComplete({ amount: 'A' })).toBe(false)
  })
})

describe('rowsToDrafts — signed amount column', () => {
  const mapping = { date: 'D', amount: 'A', narration: 'N', category: 'C' }

  it('classifies debit vs credit by sign, stores absolute amount and ISO date', () => {
    const { headers, rows } = parseCsv('D,A,N,C\n05/01/2026,-450,Swiggy,Food\n06/01/2026,5000,Refund,')
    expect(headers).toContain('A')
    const { drafts, skipped } = rowsToDrafts(rows, mapping)
    expect(skipped).toBe(0)
    expect(drafts[0]).toMatchObject({ date: '2026-01-05', amount: 450, type: 'debit', narration: 'Swiggy', category: 'Food' })
    expect(drafts[1]).toMatchObject({ date: '2026-01-06', amount: 5000, type: 'credit', category: undefined })
  })

  it('skips rows missing a date or amount', () => {
    const rows = [
      { D: '', A: '100', N: 'x', C: '' },
      { D: '05/01/2026', A: 'nope', N: 'y', C: '' },
      { D: '05/01/2026', A: '10', N: 'z', C: '' }
    ]
    const { drafts, skipped } = rowsToDrafts(rows, mapping)
    expect(skipped).toBe(2)
    expect(drafts).toHaveLength(1)
  })
})

describe('rowsToDrafts — separate debit/credit columns', () => {
  const mapping = { date: 'Date', debit: 'Withdrawal', credit: 'Deposit', narration: 'Desc', balance: 'Bal' }

  it('uses whichever of debit/credit is populated to set direction', () => {
    const rows = [
      { Date: '01-07-2026', Withdrawal: '1,200.00', Deposit: '', Desc: 'Rent', Bal: '48,800.00' },
      { Date: '02-07-2026', Withdrawal: '', Deposit: '50000', Desc: 'Salary', Bal: '98,800.00' }
    ]
    const { drafts, skipped } = rowsToDrafts(rows, mapping)
    expect(skipped).toBe(0)
    expect(drafts[0]).toMatchObject({ amount: 1200, type: 'debit', narration: 'Rent', balance: 48800 })
    expect(drafts[1]).toMatchObject({ amount: 50000, type: 'credit', narration: 'Salary', balance: 98800 })
  })
})

describe('hashText', () => {
  it('is deterministic and content-sensitive', () => {
    expect(hashText('abc')).toBe(hashText('abc'))
    expect(hashText('abc')).not.toBe(hashText('abd'))
    expect(hashText('abc')).toHaveLength(64)
  })
})
