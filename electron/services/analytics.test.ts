import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3-multiple-ciphers'
import { openDatabase } from '../db/connection'
import { createAccount } from '../db/queries/accounts'
import { createCreditCard } from '../db/queries/creditCards'
import { createTransaction } from '../db/queries/transactions'
import {
  getAccountBalance,
  getCardUtilization,
  getCategoryBreakdown,
  getMonthlyTrend,
  getRecentTransactions,
  getSummary,
  getTopMerchants,
  merchantKey,
  type Scope
} from './analytics'

const ALL: Scope = { kind: 'all' }

describe('merchantKey', () => {
  it('normalizes narrations to a merchant name', () => {
    expect(merchantKey('UPI/swiggy@icici/pay')).toBe('SWIGGY')
    expect(merchantKey('POS 5231 RELIANCE FRESH 99')).toBe('RELIANCE FRESH')
  })
})

describe('analytics (real DB)', () => {
  let dir: string
  let db: Database.Database
  let acct: number
  let catId: (name: string) => number

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-an-'))
    db = openDatabase({ dbPath: join(dir, 'db.db'), saltPath: join(dir, 'salt'), password: 'pw' })
    acct = createAccount(db, 1, { bank: 'ICICI', nickname: 'ICICI', type: 'salary', opening_balance: 10000 }).id
    catId = (name: string) => (db.prepare('SELECT id FROM category WHERE name = ? LIMIT 1').get(name) as { id: number }).id
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function tx(p: {
    amount: number
    type: 'credit' | 'debit'
    date: string
    narration?: string
    category?: string
    sub?: string
    excluded?: boolean
    cardId?: number
  }) {
    return createTransaction(db, 1, {
      account_id: p.cardId ? undefined : acct,
      card_id: p.cardId,
      date: p.date,
      amount: p.amount,
      type: p.type,
      narration: p.narration ?? 'TXN',
      category_id: p.category ? catId(p.category) : undefined,
      sub_category_id: p.sub ? catId(p.sub) : undefined,
      is_excluded: p.excluded ? 1 : 0
    })
  }

  it('getSummary excludes transfers and investments from expenses', () => {
    tx({ amount: 150000, type: 'credit', date: '2026-07-02', category: 'Income', sub: 'Salary' })
    tx({ amount: 450, type: 'debit', date: '2026-07-03', narration: 'SWIGGY', category: 'Food & Dining', sub: 'Delivery' })
    tx({ amount: 5000, type: 'debit', date: '2026-07-04', category: 'Investment', sub: 'SIP' }) // not an expense
    tx({ amount: 20000, type: 'debit', date: '2026-07-05', narration: 'NEFT SELF', excluded: true }) // transfer, excluded
    tx({ amount: 99, type: 'debit', date: '2026-07-06', narration: 'UNKNOWN' }) // uncategorized expense

    const s = getSummary(db, 1, { scope: ALL })
    expect(s.income).toBe(150000)
    expect(s.expenses).toBe(450 + 99) // SIP + transfer excluded
    expect(s.netSavings).toBe(150000 - 549)
    expect(s.uncategorizedCount).toBe(1)
    expect(s.savingsRatePct).toBeCloseTo(99.6, 1)
  })

  it('getSummary respects the date range', () => {
    tx({ amount: 100, type: 'debit', date: '2026-06-30', narration: 'JUNE' })
    tx({ amount: 200, type: 'debit', date: '2026-07-15', narration: 'JULY' })
    const s = getSummary(db, 1, { scope: ALL, dateFrom: '2026-07-01', dateTo: '2026-07-31' })
    expect(s.expenses).toBe(200)
  })

  it('getCategoryBreakdown groups by top category with sub split, sorted by total', () => {
    tx({ amount: 450, type: 'debit', date: '2026-07-03', category: 'Food & Dining', sub: 'Delivery' })
    tx({ amount: 800, type: 'debit', date: '2026-07-04', category: 'Food & Dining', sub: 'Groceries' })
    tx({ amount: 300, type: 'debit', date: '2026-07-05', category: 'Transport', sub: 'Fuel' })
    tx({ amount: 50, type: 'debit', date: '2026-07-06', narration: 'MYSTERY' }) // uncategorized

    const b = getCategoryBreakdown(db, 1, { scope: ALL })
    expect(b[0]).toMatchObject({ name: 'Food & Dining', total: 1250 })
    expect(b[0].subcategories[0]).toMatchObject({ name: 'Groceries', total: 800 })
    expect(b.find((i) => i.categoryId === null)).toMatchObject({ name: 'Uncategorized', total: 50 })
  })

  it('getMonthlyTrend splits expenses by month and category', () => {
    tx({ amount: 400, type: 'debit', date: '2026-06-10', category: 'Food & Dining', sub: 'Delivery' })
    tx({ amount: 600, type: 'debit', date: '2026-07-10', category: 'Food & Dining', sub: 'Delivery' })
    tx({ amount: 300, type: 'debit', date: '2026-07-11', category: 'Transport', sub: 'Fuel' })

    const trend = getMonthlyTrend(db, 1, { scope: ALL })
    expect(trend.map((t) => t.month)).toEqual(['2026-06', '2026-07'])
    expect(trend[1]).toMatchObject({ month: '2026-07', total: 900 })
    expect(trend[1].categories['Food & Dining']).toBe(600)
    expect(trend[1].categories['Transport']).toBe(300)
  })

  it('getTopMerchants aggregates expenses by normalized merchant', () => {
    tx({ amount: 450, type: 'debit', date: '2026-07-03', narration: 'UPI/swiggy@icici/111', category: 'Food & Dining', sub: 'Delivery' })
    tx({ amount: 550, type: 'debit', date: '2026-07-10', narration: 'UPI/swiggy@icici/222', category: 'Food & Dining', sub: 'Delivery' })
    tx({ amount: 300, type: 'debit', date: '2026-07-05', narration: 'UPI/uber@ybl/333', category: 'Transport', sub: 'Ride-hailing' })

    const top = getTopMerchants(db, 1, { scope: ALL }, 10)
    expect(top[0]).toMatchObject({ merchant: 'SWIGGY', total: 1000, count: 2 })
    expect(top[1]).toMatchObject({ merchant: 'UBER', total: 300, count: 1 })
  })

  it('getRecentTransactions resolves account + category labels, newest first', () => {
    tx({ amount: 450, type: 'debit', date: '2026-07-03', narration: 'SWIGGY', category: 'Food & Dining', sub: 'Delivery' })
    tx({ amount: 99, type: 'debit', date: '2026-07-10', narration: 'NEWER' })
    const recent = getRecentTransactions(db, 1, { scope: ALL }, 50)
    expect(recent[0].narration).toBe('NEWER')
    expect(recent[0].accountLabel).toBe('ICICI')
    expect(recent[1]).toMatchObject({ categoryName: 'Food & Dining', subCategoryName: 'Delivery' })
  })

  it('getAccountBalance computes a running daily balance from opening balance', () => {
    tx({ amount: 5000, type: 'credit', date: '2026-07-02' })
    tx({ amount: 2000, type: 'debit', date: '2026-07-03' })
    const bal = getAccountBalance(db, 1, acct, { scope: ALL })
    expect(bal.opening).toBe(10000)
    expect(bal.daily).toEqual([
      { date: '2026-07-02', balance: 15000 },
      { date: '2026-07-03', balance: 13000 }
    ])
    expect(bal.closing).toBe(13000)
  })

  it('getCardUtilization computes outstanding = spend − payments against the limit', () => {
    const card = createCreditCard(db, 1, { issuer: 'HDFC', nickname: 'Regalia', credit_limit: 100000 })
    tx({ amount: 30000, type: 'debit', date: '2026-07-05', cardId: card.id }) // spend
    tx({ amount: 10000, type: 'credit', date: '2026-07-20', cardId: card.id }) // payment
    const u = getCardUtilization(db, 1, card.id)
    expect(u).toMatchObject({ limit: 100000, outstanding: 20000, available: 80000, utilizationPct: 20 })
  })

  it('scope=account filters to that account only', () => {
    const other = createAccount(db, 1, { bank: 'SBI', nickname: 'SBI', type: 'savings' }).id
    tx({ amount: 100, type: 'debit', date: '2026-07-03', narration: 'ICICI SPEND' })
    createTransaction(db, 1, { account_id: other, date: '2026-07-03', amount: 999, type: 'debit', narration: 'SBI SPEND' })

    expect(getSummary(db, 1, { scope: { kind: 'account', id: acct } }).expenses).toBe(100)
    expect(getSummary(db, 1, { scope: { kind: 'account', id: other } }).expenses).toBe(999)
    expect(getSummary(db, 1, { scope: ALL }).expenses).toBe(1099)
  })
})
