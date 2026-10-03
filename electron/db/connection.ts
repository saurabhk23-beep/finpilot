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
// The key that unlocked the open DB this session — kept so we can verify the
// current master password before a rekey (the password itself is never stored).
let currentKey: string | null = null

function dbFilePath(userDataDir: string): string {
  return join(userDataDir, 'finpilot.db')
}

function saltFilePath(userDataDir: string): string {
  return join(userDataDir, 'finpilot.salt')
}

/** True once the encrypted DB file exists on disk — i.e. a master password has been set (returning user, not first run). */
export function databaseExists(userDataDir: string): boolean {
  return existsSync(dbFilePath(userDataDir))
}

/** Electron-specific singleton: resolves paths under userData and opens/caches the DB. Throws on a wrong password. */
export function initDatabase(userDataDir: string, password: string): Database.Database {
  const saltPath = saltFilePath(userDataDir)
  currentDb = openDatabase({
    dbPath: dbFilePath(userDataDir),
    saltPath,
    password
  })
  // Remember the derived key for this session (salt already exists post-open).
  currentKey = deriveKey(password, getOrCreateSalt(saltPath))
  return currentDb
}

/**
 * Changes the master password on the open DB via SQLCipher's in-place rekey.
 * The salt is unchanged (it's not secret — only the derived key changes). The
 * current password is verified against the session key before rekeying, so a
 * wrong current password is rejected without touching the vault.
 */
export function changeMasterPassword(
  userDataDir: string,
  currentPassword: string,
  newPassword: string
): void {
  if (!currentDb || !currentKey) {
    throw new Error('Database is not unlocked')
  }
  const salt = getOrCreateSalt(saltFilePath(userDataDir))
  if (deriveKey(currentPassword, salt) !== currentKey) {
    throw new Error('Current password is incorrect')
  }
  const newKey = deriveKey(newPassword, salt)
  currentDb.pragma(`rekey="x'${newKey}'"`)
  currentKey = newKey
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
  currentKey = null
}
