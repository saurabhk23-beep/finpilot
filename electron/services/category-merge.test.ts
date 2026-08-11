import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3-multiple-ciphers'
import { openDatabase } from '../db/connection'
import { createAccount } from '../db/queries/accounts'
import { createCategory, listCategories } from '../db/queries/categories'
import { createCategoryRule, listCategoryRules } from '../db/queries/categoryRules'
import { createTransaction, listTransactions } from '../db/queries/transactions'
import { getUncategorized } from './analytics'
import { mergeCategories } from './category-merge'

describe('mergeCategories (real DB)', () => {
  let dir: string
  let db: Database.Database
  let acct: number

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-merge-'))
    db = openDatabase({ dbPath: join(dir, 'db.db'), saltPath: join(dir, 'salt'), password: 'pw' })
    acct = createAccount(db, 1, { bank: 'ICICI', nickname: 'ICICI', type: 'savings' }).id
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('reassigns transactions + rules from source to target, then deletes the source', () => {
    const dining = createCategory(db, 1, { name: 'Dining Out' }) // custom source
    const food = listCategories(db, 1).find((c) => c.name === 'Food & Dining')! // target

    createTransaction(db, 1, { account_id: acct, date: '2026-08-01', amount: 500, type: 'debit', narration: 'X', category_id: dining.id })
    createTransaction(db, 1, { account_id: acct, date: '2026-08-02', amount: 300, type: 'debit', narration: 'Y', sub_category_id: dining.id })
    createCategoryRule(db, 1, { rule_type: 'keyword', pattern: 'BISTRO', category_id: dining.id, priority: 10, is_user_created: 1 })

    const result = mergeCategories(db, 1, dining.id, food.id)
    expect(result.transactionsReassigned).toBe(2)
    expect(result.rulesReassigned).toBe(1)

    // Source gone; everything repointed to the target.
    expect(listCategories(db, 1).some((c) => c.id === dining.id)).toBe(false)
    const txns = listTransactions(db, 1)
    expect(txns.find((t) => t.narration === 'X')!.category_id).toBe(food.id)
    expect(txns.find((t) => t.narration === 'Y')!.sub_category_id).toBe(food.id)
    expect(listCategoryRules(db, 1).some((r) => r.pattern === 'BISTRO' && r.category_id === food.id)).toBe(true)
  })

  it('refuses to merge a system category away, or into itself', () => {
    const food = listCategories(db, 1).find((c) => c.name === 'Food & Dining')!
    const transport = listCategories(db, 1).find((c) => c.name === 'Transport')!
    expect(() => mergeCategories(db, 1, food.id, transport.id)).toThrow(/System categories/)
    const custom = createCategory(db, 1, { name: 'Temp' })
    expect(() => mergeCategories(db, 1, custom.id, custom.id)).toThrow(/into itself/)
  })
})

describe('getUncategorized', () => {
  let dir: string
  let db: Database.Database
  let acct: number

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-uncat-'))
    db = openDatabase({ dbPath: join(dir, 'db.db'), saltPath: join(dir, 'salt'), password: 'pw' })
    acct = createAccount(db, 1, { bank: 'ICICI', nickname: 'ICICI', type: 'savings' }).id
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns only non-excluded transactions with no category', () => {
    const food = listCategories(db, 1).find((c) => c.name === 'Food & Dining')!
    createTransaction(db, 1, { account_id: acct, date: '2026-08-01', amount: 100, type: 'debit', narration: 'UNCAT' })
    createTransaction(db, 1, { account_id: acct, date: '2026-08-02', amount: 200, type: 'debit', narration: 'CATEGORIZED', category_id: food.id })
    createTransaction(db, 1, { account_id: acct, date: '2026-08-03', amount: 300, type: 'debit', narration: 'EXCLUDED TRANSFER', is_excluded: 1 })

    const rows = getUncategorized(db, 1)
    expect(rows).toHaveLength(1)
    expect(rows[0].narration).toBe('UNCAT')
    expect(rows[0].accountLabel).toBe('ICICI')
  })
})
