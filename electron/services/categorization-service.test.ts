import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3-multiple-ciphers'
import { openDatabase } from '../db/connection'
import { createAccount } from '../db/queries/accounts'
import { updateUser } from '../db/queries/users'
import { createTransaction, listTransactions } from '../db/queries/transactions'
import { listCategoryRules } from '../db/queries/categoryRules'
import {
  categorizeUncategorized,
  computeCoverage,
  deriveMerchantPattern,
  saveUserOverride,
  topUnidentifiedCredits
} from './categorization-service'

describe('deriveMerchantPattern', () => {
  it('uses the VPA merchant handle when present', () => {
    expect(deriveMerchantPattern('UPI/kumargeneralstore@okhdfcbank/pay')).toBe('kumargeneralstore')
    expect(deriveMerchantPattern('UPI-swiggy@ybl-1234')).toBe('swiggy')
  })

  it('strips rails/refs/digits and keeps merchant words', () => {
    expect(deriveMerchantPattern('NEFT KUMAR GENERAL STORE 123456')).toBe('KUMAR GENERAL STORE')
    expect(deriveMerchantPattern('POS 5231 RELIANCE FRESH')).toBe('RELIANCE FRESH')
  })

  it('escapes regex metacharacters in a VPA handle (dots are literal)', () => {
    expect(deriveMerchantPattern('UPI/john.doe@okaxis/pay')).toBe('john\\.doe')
  })
})

describe('categorization service (real DB)', () => {
  let dir: string
  let db: Database.Database
  let accountId: number

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-catsvc-'))
    db = openDatabase({ dbPath: join(dir, 'db.db'), saltPath: join(dir, 'salt'), password: 'pw' })
    accountId = createAccount(db, 1, { bank: 'ICICI', nickname: 'ICICI', type: 'salary' }).id
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function addTxn(narration: string, amount: number, type: 'credit' | 'debit', date = '2026-07-01') {
    return createTransaction(db, 1, { account_id: accountId, date, amount, type, narration })
  }

  it('computeCoverage reports categorized / total percentage', () => {
    addTxn('SWIGGY', 400, 'debit')
    addTxn('RANDOM MERCHANT', 100, 'debit')
    expect(computeCoverage(db, 1)).toMatchObject({ total: 2, categorized: 0, pct: 0 })

    categorizeUncategorized(db, 1)
    const cov = computeCoverage(db, 1)
    expect(cov.total).toBe(2)
    expect(cov.categorized).toBe(1) // SWIGGY matched, RANDOM did not
    expect(cov.pct).toBe(50)
  })

  it('categorizeUncategorized applies rules and heuristics across history', () => {
    updateUser(db, 1, { employer_name: 'Acme Corp' })
    addTxn('UPI SWIGGY ORDER', 450, 'debit')
    addTxn('NEFT ACME CORP SALARY', 150000, 'credit', '2026-07-02')
    // Recurring EMI: same debit amount on 3 dates.
    addTxn('HDFC HOME LOAN', 25000, 'debit', '2026-05-05')
    addTxn('HDFC HOME LOAN', 25000, 'debit', '2026-06-05')
    addTxn('HDFC HOME LOAN', 25000, 'debit', '2026-07-05')

    const { updated } = categorizeUncategorized(db, 1)
    expect(updated).toBe(5)

    const txns = listTransactions(db, 1)
    const byNarr = (n: string) => txns.find((t) => t.narration.includes(n))!
    const catName = (id: number | null) =>
      id === null ? null : (db.prepare('SELECT name FROM category WHERE id = ?').get(id) as { name: string }).name

    expect(catName(byNarr('SWIGGY').category_id)).toBe('Food & Dining')
    expect(catName(byNarr('SALARY').category_id)).toBe('Income')
    expect(catName(byNarr('HOME LOAN').category_id)).toBe('EMI / Loan')
  })

  it('saveUserOverride recategorizes the txn and learns a rule that applies to future imports', () => {
    const groceries = db.prepare("SELECT id FROM category WHERE name = 'Groceries'").get() as { id: number }
    const t1 = addTxn('UPI KUMAR GENERAL STORE 5521', 300, 'debit')

    const result = saveUserOverride(db, 1, { transactionId: t1.id, categoryId: groceries.id })
    expect(result.ruleCreated).toBe(true)

    // The transaction is now Groceries (top-level Food & Dining, sub Groceries).
    const updated = listTransactions(db, 1).find((t) => t.id === t1.id)!
    expect(updated.sub_category_id).toBe(groceries.id)

    // A future identical-merchant transaction auto-categorizes via the learned rule.
    const t2 = addTxn('UPI KUMAR GENERAL STORE 9987', 250, 'debit', '2026-08-01')
    categorizeUncategorized(db, 1)
    const t2row = listTransactions(db, 1).find((t) => t.id === t2.id)!
    expect(t2row.sub_category_id).toBe(groceries.id)

    // Learned rule is user-created with high priority.
    const userRules = listCategoryRules(db, 1).filter((r) => r.is_user_created === 1)
    expect(userRules).toHaveLength(1)
    expect(userRules[0].priority).toBe(100)
  })

  it('saveUserOverride re-points an existing learned rule instead of duplicating', () => {
    const groceries = db.prepare("SELECT id FROM category WHERE name = 'Groceries'").get() as { id: number }
    const restaurants = db.prepare("SELECT id FROM category WHERE name = 'Restaurants'").get() as { id: number }
    const t1 = addTxn('UPI CAFE COFFEE DAY 111', 200, 'debit')

    saveUserOverride(db, 1, { transactionId: t1.id, categoryId: groceries.id })
    const t2 = addTxn('UPI CAFE COFFEE DAY 222', 220, 'debit', '2026-08-01')
    const second = saveUserOverride(db, 1, { transactionId: t2.id, categoryId: restaurants.id })
    expect(second.ruleCreated).toBe(false)

    const userRules = listCategoryRules(db, 1).filter((r) => r.is_user_created === 1)
    expect(userRules).toHaveLength(1)
    expect(userRules[0].category_id).toBe(restaurants.id)
  })

  it('topUnidentifiedCredits surfaces the largest uncategorized credits', () => {
    addTxn('NEFT FROM DAD', 20000, 'credit')
    addTxn('INTEREST CREDIT', 500, 'credit')
    addTxn('UNKNOWN BIG CREDIT', 175000, 'credit')
    const top = topUnidentifiedCredits(db, 1, 2)
    expect(top).toHaveLength(2)
    expect(top[0].amount).toBe(175000)
    expect(top[1].amount).toBe(20000)
  })
})
