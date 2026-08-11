import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { runMigrations } from './migrate'
import { migrations } from './migrations'

describe('runMigrations', () => {
  let dir: string
  let db: Database.Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-migrate-'))
    db = new Database(join(dir, 'test.db'))
    db.pragma('foreign_keys = ON')
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('003_cash_account_type preserves existing rows and their foreign keys through the table rebuild', () => {
    // Apply only 001 + 002 first, so account/credit_card/transactions exist pre-migration-003.
    runMigrations(db, migrations.slice(0, 2))

    db.prepare('INSERT INTO user (id) VALUES (1)').run()
    const accountId = db
      .prepare("INSERT INTO account (user_id, bank, nickname, type, opening_balance) VALUES (1, 'HDFC', 'HDFC Salary', 'salary', 5000)")
      .run().lastInsertRowid as number
    const cardId = db
      .prepare('INSERT INTO credit_card (user_id, issuer, nickname, credit_limit, linked_account_id) VALUES (1, ?, ?, ?, ?)')
      .run('HDFC', 'HDFC Regalia', 200000, accountId).lastInsertRowid as number
    db.prepare(
      "INSERT INTO transactions (user_id, account_id, date, amount, type, narration) VALUES (1, ?, '2026-01-01', 100, 'debit', 'TEST')"
    ).run(accountId)

    // Now apply the rest, including 003's rebuild of `account`.
    runMigrations(db, migrations)

    const account = db.prepare('SELECT * FROM account WHERE id = ?').get(accountId) as {
      id: number
      nickname: string
      type: string
    }
    expect(account).toMatchObject({ id: accountId, nickname: 'HDFC Salary', type: 'salary' })

    // FKs from other tables into the rebuilt account row must still resolve.
    const card = db.prepare('SELECT linked_account_id FROM credit_card WHERE id = ?').get(cardId) as {
      linked_account_id: number
    }
    expect(card.linked_account_id).toBe(accountId)

    const txnCount = db.prepare('SELECT count(*) as c FROM transactions WHERE account_id = ?').get(accountId) as {
      c: number
    }
    expect(txnCount.c).toBe(1)

    // The new 'cash' type is now accepted.
    expect(() =>
      db.prepare("INSERT INTO account (user_id, bank, nickname, type) VALUES (1, 'Cash', 'Cash', 'cash')").run()
    ).not.toThrow()

    // foreign_keys enforcement is restored, not left disabled.
    expect((db.pragma('foreign_keys', { simple: true }) as number)).toBe(1)
  })

  it('is idempotent: running the full set twice does not error or duplicate _migrations rows', () => {
    runMigrations(db, migrations)
    runMigrations(db, migrations)
    const count = db.prepare('SELECT count(*) as c FROM _migrations').get() as { c: number }
    expect(count.c).toBe(migrations.length)
  })
})
