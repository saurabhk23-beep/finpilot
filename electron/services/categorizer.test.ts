import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3-multiple-ciphers'
import { openDatabase } from '../db/connection'
import { createCategory } from '../db/queries/categories'
import { createCategoryRule } from '../db/queries/categoryRules'
import {
  createCategorizer,
  extractVpaHandles,
  findRecurringDebitAmounts
} from './categorizer'

describe('extractVpaHandles', () => {
  it('pulls VPA handles from a narration', () => {
    expect(extractVpaHandles('UPI/swiggy@icici/Payment')).toEqual(['swiggy@icici'])
    // A hyphenated prefix glues onto the handle; substring matching still finds "swiggy".
    expect(extractVpaHandles('UPI-SWIGGY@YBL-123')).toEqual(['upi-swiggy@ybl'])
    expect(extractVpaHandles('NEFT SALARY CREDIT')).toEqual([])
  })
})

describe('findRecurringDebitAmounts', () => {
  it('flags debit amounts seen on 3+ distinct dates', () => {
    const txns = [
      { amount: 15000, type: 'debit' as const, date: '2026-01-05' },
      { amount: 15000, type: 'debit' as const, date: '2026-02-05' },
      { amount: 15000, type: 'debit' as const, date: '2026-03-05' },
      { amount: 450, type: 'debit' as const, date: '2026-01-06' },
      { amount: 15000, type: 'credit' as const, date: '2026-01-07' } // credits ignored
    ]
    const recurring = findRecurringDebitAmounts(txns)
    expect(recurring.has(15000)).toBe(true)
    expect(recurring.has(450)).toBe(false)
  })
})

describe('createCategorizer (real seeded DB)', () => {
  let dir: string
  let db: Database.Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-cat-'))
    db = openDatabase({ dbPath: join(dir, 'db.db'), saltPath: join(dir, 'salt'), password: 'pw' })
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function categoryName(id: number | null): string | null {
    if (id === null) return null
    const row = db.prepare('SELECT name FROM category WHERE id = ?').get(id) as { name: string } | undefined
    return row?.name ?? null
  }

  it('Layer 2 keyword: SWIGGY narration → Food & Dining > Delivery', () => {
    const cat = createCategorizer(db, 1)
    const r = cat.categorize({ narration: 'UPI SWIGGY ORDER 8842', amount: 450, type: 'debit' })
    expect(r?.layer).toBe('keyword')
    expect(categoryName(r!.categoryId)).toBe('Food & Dining')
    expect(categoryName(r!.subCategoryId)).toBe('Delivery')
  })

  it('Layer 1 MCC: code 5411 → Food & Dining > Groceries, beating a weaker keyword', () => {
    const cat = createCategorizer(db, 1)
    const r = cat.categorize({ narration: 'SOME LOCAL KIRANA', amount: 800, type: 'debit', mcc: '5411' })
    expect(r?.layer).toBe('mcc')
    expect(categoryName(r!.subCategoryId)).toBe('Groceries')
  })

  it('Layer 3 VPA: grofers@okhdfcbank handle → Groceries when no keyword matches', () => {
    // "grofers" is a VPA-only merchant (not in the keyword dictionary), so Layer 3 handles it.
    const cat = createCategorizer(db, 1)
    const r = cat.categorize({ narration: 'UPI/grofers@okhdfcbank/UPIIntent', amount: 300, type: 'debit' })
    expect(r?.layer).toBe('vpa')
    expect(categoryName(r!.subCategoryId)).toBe('Groceries')
  })

  it('Layer 4 salary: credit mentioning employer → Income > Salary', () => {
    const cat = createCategorizer(db, 1, { employerName: 'Acme Corp' })
    const r = cat.categorize({ narration: 'NEFT-ACME CORP PVT LTD-SAL', amount: 150000, type: 'credit' })
    expect(r?.layer).toBe('heuristic-salary')
    expect(categoryName(r!.categoryId)).toBe('Income')
    expect(categoryName(r!.subCategoryId)).toBe('Salary')
  })

  it('Layer 4 EMI: recurring debit → EMI / Loan', () => {
    const cat = createCategorizer(db, 1)
    const r = cat.categorize({ narration: 'ACH DEBIT HDFC LOAN', amount: 15000, type: 'debit', isRecurringAmount: true })
    expect(r?.layer).toBe('heuristic-emi')
    expect(categoryName(r!.categoryId)).toBe('EMI / Loan')
  })

  it('Layer 0 user override beats every default layer', () => {
    // Seeded keyword would send AMAZON → Shopping; a user rule overrides to Personal > Lifestyle.
    const personal = db.prepare("SELECT id FROM category WHERE name = 'Lifestyle'").get() as { id: number }
    createCategoryRule(db, 1, {
      rule_type: 'keyword',
      pattern: 'AMAZON',
      category_id: personal.id,
      priority: 100,
      is_user_created: 1
    })
    const cat = createCategorizer(db, 1)
    const r = cat.categorize({ narration: 'AMAZON PAY INDIA', amount: 999, type: 'debit', mcc: '5311' })
    expect(r?.layer).toBe('user')
    expect(categoryName(r!.subCategoryId)).toBe('Lifestyle')
  })

  it('returns null for an unrecognized narration', () => {
    const cat = createCategorizer(db, 1)
    expect(cat.categorize({ narration: 'RANDOM MERCHANT XYZ', amount: 100, type: 'debit' })).toBeNull()
  })

  it('does not salary-match when employer name is absent from the narration', () => {
    const cat = createCategorizer(db, 1, { employerName: 'Acme Corp' })
    const r = cat.categorize({ narration: 'NEFT FROM FRIEND', amount: 5000, type: 'credit' })
    expect(r).toBeNull()
  })

  it('resolves a top-level-only match with a null sub-category', () => {
    const custom = createCategory(db, 1, { name: 'Donations' }) // top-level, no parent
    createCategoryRule(db, 1, {
      rule_type: 'keyword',
      pattern: 'GIVEINDIA',
      category_id: custom.id,
      priority: 50,
      is_user_created: 1
    })
    const cat = createCategorizer(db, 1)
    const r = cat.categorize({ narration: 'UPI GIVEINDIA DONATION', amount: 500, type: 'debit' })
    expect(r!.categoryId).toBe(custom.id)
    expect(r!.subCategoryId).toBeNull()
  })
})
