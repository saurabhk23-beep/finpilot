import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3-multiple-ciphers'
import { openDatabase } from '../db/connection'
import { createAccountsHandlers } from './accounts'
import { createCategoriesHandlers } from './categories'
import { createCategoryRulesHandlers } from './categoryRules'
import { createCreditCardsHandlers } from './creditCards'
import { createImportLog, findImportLogByHash } from '../db/queries/importLog'
import { createInvestmentsHandlers } from './investments'
import { createTransactionsHandlers } from './transactions'
import { createUserHandlers } from './user'
import type { AccountRow } from '../db/types'

describe('IPC handlers (integration, real SQLCipher DB)', () => {
  let dir: string
  let db: Database.Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-ipc-'))
    db = openDatabase({
      dbPath: join(dir, 'finpilot.db'),
      saltPath: join(dir, 'finpilot.salt'),
      password: 'test-password'
    })
    // Second user, to prove handlers never leak data across user_id.
    db.prepare('INSERT INTO user (id) VALUES (2)').run()
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const getDb = () => db

  it('user:get / user:update round-trips profile fields', async () => {
    const handlers = createUserHandlers(getDb)
    const before = (await handlers['user:get']({ userId: 1 })) as { name: string | null }
    expect(before.name).toBeNull()

    const updated = (await handlers['user:update']({
      userId: 1,
      name: 'Saurabh',
      monthly_salary: 150000,
      employer_name: 'FMS Delhi'
    })) as { name: string; monthly_salary: number; employer_name: string }
    expect(updated).toMatchObject({ name: 'Saurabh', monthly_salary: 150000, employer_name: 'FMS Delhi' })
  })

  it('accounts: create/list/update/delete are scoped to userId', async () => {
    const handlers = createAccountsHandlers(getDb)

    const created = (await handlers['accounts:create']({
      userId: 1,
      bank: 'ICICI',
      nickname: 'ICICI Salary',
      type: 'salary',
      opening_balance: 10000
    })) as AccountRow
    expect(created.id).toBeGreaterThan(0)

    await handlers['accounts:create']({ userId: 2, bank: 'HDFC', nickname: 'HDFC Other', type: 'savings' })

    const user1Accounts = (await handlers['accounts:list']({ userId: 1 })) as AccountRow[]
    expect(user1Accounts).toHaveLength(1)
    expect(user1Accounts[0].nickname).toBe('ICICI Salary')

    const user2Accounts = (await handlers['accounts:list']({ userId: 2 })) as AccountRow[]
    expect(user2Accounts).toHaveLength(1)
    expect(user2Accounts[0].nickname).toBe('HDFC Other')

    // Cross-user access must not leak or mutate another user's row.
    const crossUserGet = await handlers['accounts:get']({ userId: 2, id: created.id })
    expect(crossUserGet).toBeUndefined()

    const updated = (await handlers['accounts:update']({
      userId: 1,
      id: created.id,
      nickname: 'ICICI Primary'
    })) as AccountRow
    expect(updated.nickname).toBe('ICICI Primary')

    await handlers['accounts:delete']({ userId: 1, id: created.id })
    expect(await handlers['accounts:list']({ userId: 1 })).toHaveLength(0)
  })

  it('credit cards: create and link to an account', async () => {
    const accountHandlers = createAccountsHandlers(getDb)
    const cardHandlers = createCreditCardsHandlers(getDb)

    const account = (await accountHandlers['accounts:create']({
      userId: 1,
      bank: 'HDFC',
      nickname: 'HDFC Salary',
      type: 'salary'
    })) as AccountRow

    const card = (await cardHandlers['creditCards:create']({
      userId: 1,
      issuer: 'HDFC',
      nickname: 'HDFC Regalia',
      credit_limit: 200000,
      linked_account_id: account.id
    })) as { linked_account_id: number }
    expect(card.linked_account_id).toBe(account.id)

    expect(await cardHandlers['creditCards:list']({ userId: 1 })).toHaveLength(1)
  })

  it('categories: seeded system categories cannot be deleted, only hidden', async () => {
    const handlers = createCategoriesHandlers(getDb)
    const categories = (await handlers['categories:list']({ userId: 1 })) as { id: number; is_system: 0 | 1 }[]
    const systemCategory = categories.find((c) => c.is_system === 1)!

    await expect(handlers['categories:delete']({ userId: 1, id: systemCategory.id })).rejects.toThrow(
      /cannot be deleted/
    )

    const hidden = await handlers['categories:update']({ userId: 1, id: systemCategory.id, is_hidden: 1 })
    expect((hidden as { is_hidden: number }).is_hidden).toBe(1)
  })

  it('rules: user-created rule sorts ahead of seeded rules of equal priority', async () => {
    const catHandlers = createCategoriesHandlers(getDb)
    const ruleHandlers = createCategoryRulesHandlers(getDb)

    const categories = (await catHandlers['categories:list']({ userId: 1 })) as { id: number; name: string }[]
    const groceries = categories.find((c) => c.name === 'Groceries')!

    await ruleHandlers['rules:create']({
      userId: 1,
      rule_type: 'keyword',
      pattern: 'KUMAR GENERAL STORE',
      category_id: groceries.id,
      priority: 10
    })

    const rules = (await ruleHandlers['rules:list']({ userId: 1 })) as { pattern: string; is_user_created: number }[]
    expect(rules[0]).toMatchObject({ pattern: 'KUMAR GENERAL STORE', is_user_created: 1 })
  })

  it('transactions: create, filter by account, and re-categorize', async () => {
    const accountHandlers = createAccountsHandlers(getDb)
    const catHandlers = createCategoriesHandlers(getDb)
    const txnHandlers = createTransactionsHandlers(getDb)

    const account = (await accountHandlers['accounts:create']({
      userId: 1,
      bank: 'ICICI',
      nickname: 'ICICI Salary',
      type: 'salary'
    })) as AccountRow
    const categories = (await catHandlers['categories:list']({ userId: 1 })) as { id: number; name: string }[]
    const delivery = categories.find((c) => c.name === 'Delivery')!

    const txn = (await txnHandlers['transactions:create']({
      userId: 1,
      account_id: account.id,
      date: '2026-07-15',
      amount: 450,
      type: 'debit',
      narration: 'SWIGGY ORDER 123'
    })) as { id: number }

    const listed = (await txnHandlers['transactions:list']({ userId: 1, accountId: account.id })) as { id: number }[]
    expect(listed).toHaveLength(1)

    const recategorized = await txnHandlers['transactions:update']({
      userId: 1,
      id: txn.id,
      category_id: delivery.id,
      remarks: 'Dinner with friends'
    })
    expect(recategorized).toMatchObject({ category_id: delivery.id, remarks: 'Dinner with friends' })
  })

  it('import log: dedup lookup by file hash is scoped to userId', () => {
    createImportLog(db, 1, {
      file_name: 'icici_july.pdf',
      file_hash: 'abc123',
      status: 'success',
      txn_count: 42
    })

    expect(findImportLogByHash(db, 1, 'abc123')).toBeTruthy()
    expect(findImportLogByHash(db, 2, 'abc123')).toBeUndefined()
  })

  it('investments: MF scheme + transaction, stock + transaction', async () => {
    const handlers = createInvestmentsHandlers(getDb)

    const scheme = (await handlers['investments:mfSchemes:create']({
      userId: 1,
      scheme_code: '119551',
      scheme_name: 'Parag Parikh Flexi Cap Fund',
      folio: '12345/67'
    })) as { id: number }

    await handlers['investments:mfTransactions:create']({
      userId: 1,
      scheme_id: scheme.id,
      date: '2026-01-05',
      type: 'sip',
      amount: 5000,
      units: 45.2,
      nav: 110.6
    })
    expect(await handlers['investments:mfTransactions:list']({ userId: 1, schemeId: scheme.id })).toHaveLength(1)

    const stock = (await handlers['investments:stocks:create']({
      userId: 1,
      symbol: 'TCS',
      exchange: 'NSE'
    })) as { id: number }

    await handlers['investments:stockTransactions:create']({
      userId: 1,
      stock_id: stock.id,
      date: '2026-02-01',
      type: 'buy',
      qty: 10,
      price: 3800
    })
    expect(await handlers['investments:stockTransactions:list']({ userId: 1, stockId: stock.id })).toHaveLength(1)
  })

  it('rejects calls with a missing or invalid userId', async () => {
    const handlers = createAccountsHandlers(getDb)
    await expect(handlers['accounts:list']({})).rejects.toThrow(/userId/)
    await expect(handlers['accounts:list']({ userId: 0 })).rejects.toThrow(/userId/)
    await expect(handlers['accounts:list']({ userId: 'not-a-number' })).rejects.toThrow(/userId/)
  })
})
