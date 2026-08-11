import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './connection'
import type Database from 'better-sqlite3-multiple-ciphers'

describe('openDatabase', () => {
  let dir: string
  let db: Database.Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-db-'))
  })

  afterEach(() => {
    db?.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function open(password = 'correct-horse-battery-staple') {
    db = openDatabase({
      dbPath: join(dir, 'finpilot.db'),
      saltPath: join(dir, 'finpilot.salt'),
      password
    })
    return db
  }

  it('creates the schema and seeds user id=1, categories, and rules', () => {
    open()

    const user = db.prepare('SELECT * FROM user WHERE id = 1').get() as { id: number; name: string | null }
    expect(user).toBeTruthy()
    expect(user.name).toBeNull()

    const categoryCount = db.prepare('SELECT count(*) as c FROM category WHERE user_id = 1').get() as { c: number }
    expect(categoryCount.c).toBeGreaterThan(14) // 14 top-level + subcategories

    const topLevel = db
      .prepare('SELECT name FROM category WHERE user_id = 1 AND parent_id IS NULL ORDER BY name')
      .all() as { name: string }[]
    expect(topLevel.map((c) => c.name)).toContain('Food & Dining')

    const ruleCount = db.prepare('SELECT count(*) as c FROM category_rule WHERE user_id = 1').get() as { c: number }
    expect(ruleCount.c).toBeGreaterThan(0)

    // All three rule-based layers are seeded.
    const byType = db
      .prepare('SELECT rule_type, count(*) as c FROM category_rule WHERE user_id = 1 GROUP BY rule_type')
      .all() as { rule_type: string; c: number }[]
    const counts = Object.fromEntries(byType.map((r) => [r.rule_type, r.c]))
    expect(counts.keyword).toBeGreaterThan(0)
    expect(counts.mcc).toBeGreaterThan(0)
    expect(counts.vpa).toBeGreaterThan(0)

    // A seeded MCC rule resolves to the right sub-category (5411 → Groceries).
    const mccRow = db
      .prepare(
        `SELECT cat.name FROM category_rule r JOIN category cat ON cat.id = r.category_id
         WHERE r.user_id = 1 AND r.rule_type = 'mcc' AND r.pattern = '5411'`
      )
      .get() as { name: string } | undefined
    expect(mccRow?.name).toBe('Groceries')
  })

  it('is idempotent: reopening does not duplicate seed data', () => {
    open()
    const firstCount = db.prepare('SELECT count(*) as c FROM category').get() as { c: number }
    db.close()

    open()
    const secondCount = db.prepare('SELECT count(*) as c FROM category').get() as { c: number }
    expect(secondCount.c).toBe(firstCount.c)
  })

  it('persists data across reopen with the correct password', () => {
    open()
    db.prepare("UPDATE user SET name = 'Saurabh' WHERE id = 1").run()
    db.close()

    open()
    const user = db.prepare('SELECT name FROM user WHERE id = 1').get() as { name: string }
    expect(user.name).toBe('Saurabh')
  })

  it('rejects the wrong password', () => {
    open('correct-horse-battery-staple')
    db.close()

    expect(() => open('wrong-password')).toThrow()
  })

  it('enforces foreign keys', () => {
    open()
    expect(() =>
      db.prepare('INSERT INTO account (user_id, bank, nickname, type) VALUES (999, ?, ?, ?)').run(
        'HDFC',
        'Test',
        'savings'
      )
    ).toThrow()
  })
})
