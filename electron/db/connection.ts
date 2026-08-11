import Database from 'better-sqlite3-multiple-ciphers'
import { existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { deriveKey, getOrCreateSalt } from './crypto'
import { runMigrations } from './migrate'
import { migrations } from './migrations'
import { seedDatabase } from './seed'

export interface OpenDatabaseOptions {
  dbPath: string
  saltPath: string
  password: string
}

/** Opens (creating if needed) a SQLCipher-encrypted SQLite DB and brings it up to the latest schema. Pure — no Electron dependency, so it's directly testable. */
export function openDatabase(opts: OpenDatabaseOptions): Database.Database {
  mkdirSync(dirname(opts.dbPath), { recursive: true })

  const salt = getOrCreateSalt(opts.saltPath)
  const key = deriveKey(opts.password, salt)

  const db = new Database(opts.dbPath)
  try {
    db.pragma("cipher='sqlcipher'")
    db.pragma(`key="x'${key}'"`)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // Cheap check that the key was actually correct: SQLCipher only reports
    // "file is not a database" lazily, on the first real read.
    db.prepare('SELECT count(*) FROM sqlite_master').get()

    runMigrations(db, migrations)
    seedDatabase(db)
  } catch (err) {
    db.close()
    throw err
  }

  return db
}

let currentDb: Database.Database | null = null

function dbFilePath(userDataDir: string): string {
  return join(userDataDir, 'finpilot.db')
}

/** True once the encrypted DB file exists on disk — i.e. a master password has been set (returning user, not first run). */
export function databaseExists(userDataDir: string): boolean {
  return existsSync(dbFilePath(userDataDir))
}

/** Electron-specific singleton: resolves paths under userData and opens/caches the DB. Throws on a wrong password. */
export function initDatabase(userDataDir: string, password: string): Database.Database {
  currentDb = openDatabase({
    dbPath: dbFilePath(userDataDir),
    saltPath: join(userDataDir, 'finpilot.salt'),
    password
  })
  return currentDb
}

export function isDatabaseOpen(): boolean {
  return currentDb !== null
}

export function getDb(): Database.Database {
  if (!currentDb) {
    throw new Error('Database not initialized — call initDatabase(userDataDir, password) first.')
  }
  return currentDb
}

export function closeDatabase(): void {
  currentDb?.close()
  currentDb = null
}
