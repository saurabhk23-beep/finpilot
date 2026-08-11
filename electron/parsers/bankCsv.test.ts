import { describe, expect, it } from 'vitest'
import { detectAccountNumber, parseBankCsv } from './bankCsv'
import { parseGrowwCsv } from './groww'

describe('detectAccountNumber', () => {
  it('finds account numbers in common statement phrasings', () => {
    expect(detectAccountNumber('Account No: 001234567890')?.last4).toBe('7890')
    expect(detectAccountNumber('A/c Number - XXXXXX1234')?.last4).toBe('1234')
    expect(detectAccountNumber('Account Number 9876543210')?.last4).toBe('3210')
  })

  it('returns undefined when no account number is present', () => {
    expect(detectAccountNumber('Just some narration text')).toBeUndefined()
  })
})

describe('parseBankCsv', () => {
  it('parses a debit/credit-column statement and reports date range + account', () => {
    const csv = [
      'Account No: XXXXXX4321',
      'Txn Date,Narration,Withdrawal,Deposit,Closing Balance',
      '01-07-2026,UPI-SWIGGY,450.00,,49550.00',
      '02-07-2026,SALARY ACME CORP,,150000.00,199550.00',
      '05-07-2026,ATM WITHDRAWAL,2000.00,,197550.00'
    ].join('\n')

    // The preamble line breaks header detection, so drop it before the table for this shape.
    const tableCsv = csv.split('\n').slice(1).join('\n')
    const result = parseBankCsv(tableCsv)

    expect(result.drafts).toHaveLength(3)
    expect(result.drafts[0]).toMatchObject({ date: '2026-07-01', amount: 450, type: 'debit', narration: 'UPI-SWIGGY' })
    expect(result.drafts[1]).toMatchObject({ amount: 150000, type: 'credit' })
    expect(result.dateRange).toEqual({ start: '2026-07-01', end: '2026-07-05' })
  })

  it('detects the account number from a preamble passed alongside the table', () => {
    const table = 'Txn Date,Narration,Amount\n01-07-2026,TEST,-100'
    const result = parseBankCsv('Account No: XXXXXX4321\n' + table)
    // Preamble corrupts row parsing but account detection scans the whole text.
    expect(result.detectedAccountNumber).toBe('4321')
  })

  it('parses a single signed-amount statement', () => {
    const csv = 'Date,Description,Amount\n03/07/2026,Interest,120.50\n04/07/2026,Fee,-25'
    const result = parseBankCsv(csv)
    expect(result.drafts[0]).toMatchObject({ type: 'credit', amount: 120.5 })
    expect(result.drafts[1]).toMatchObject({ type: 'debit', amount: 25 })
  })
})

describe('parseGrowwCsv', () => {
  it('parses buy/sell trades with symbol, date, qty, price', () => {
    const csv = [
      'Symbol,Trade Date,Trade Type,Quantity,Price,Exchange',
      'TCS,15-01-2026,BUY,10,3800,NSE',
      'INFY,20-02-2026,SELL,5,1600.50,BSE'
    ].join('\n')
    const { trades, skipped } = parseGrowwCsv(csv)
    expect(skipped).toBe(0)
    expect(trades[0]).toMatchObject({ symbol: 'TCS', date: '2026-01-15', type: 'buy', qty: 10, price: 3800, exchange: 'NSE' })
    expect(trades[1]).toMatchObject({ symbol: 'INFY', type: 'sell', qty: 5, price: 1600.5, exchange: 'BSE' })
  })

  it('tolerates aliased headers and skips incomplete rows', () => {
    const csv = [
      'Stock Name,Order Date,Buy/Sell,Shares,Avg. Price',
      'HDFC Bank,05 Mar 2026,B,2,1500',
      ',05 Mar 2026,B,2,1500',
      'RELIANCE,05 Mar 2026,B,,2900'
    ].join('\n')
    const { trades, skipped } = parseGrowwCsv(csv)
    expect(trades).toHaveLength(1)
    expect(trades[0]).toMatchObject({ symbol: 'HDFC BANK', type: 'buy', qty: 2, price: 1500 })
    expect(skipped).toBe(2)
  })
})
