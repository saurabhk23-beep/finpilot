import type Database from 'better-sqlite3-multiple-ciphers'
import type { Migration } from './migrations'

/**
 * Applies any migrations not yet recorded in _migrations, in list order.
 *
 * Each migration file owns its own transaction boundaries (BEGIN/COMMIT) rather
 * than being auto-wrapped here: `PRAGMA foreign_keys` can only be toggled outside
 * an open transaction, which some schema-rebuild migrations need to do.
 */
export function runMigrations(db: Database.Database, migrations: Migration[]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(
    db
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((row): string => (row as { name: string }).name)
  )

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue
    db.exec(migration.sql)
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name)
  }
}
