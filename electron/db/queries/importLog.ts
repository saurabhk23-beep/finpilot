import type Database from 'better-sqlite3-multiple-ciphers'
import type { ImportLogRow, ImportStatus } from '../types'

export function listImportLogs(db: Database.Database, userId: number): ImportLogRow[] {
  return db.prepare('SELECT * FROM import_log WHERE user_id = ? ORDER BY import_date DESC').all(
    userId
  ) as ImportLogRow[]
}

/** Dedup check: has this exact file already been imported for this user? */
export function findImportLogByHash(
  db: Database.Database,
  userId: number,
  fileHash: string
): ImportLogRow | undefined {
  return db.prepare('SELECT * FROM import_log WHERE user_id = ? AND file_hash = ?').get(userId, fileHash) as
    | ImportLogRow
    | undefined
}

export interface CreateImportLogInput {
  file_name: string
  file_hash: string
  account_id?: number
  txn_count?: number
  date_range_start?: string
  date_range_end?: string
  status: ImportStatus
}

export function createImportLog(
  db: Database.Database,
  userId: number,
  input: CreateImportLogInput
): ImportLogRow {
  const result = db
    .prepare(
      `INSERT INTO import_log (user_id, file_name, file_hash, account_id, txn_count, date_range_start, date_range_end, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      input.file_name,
      input.file_hash,
      input.account_id ?? null,
      input.txn_count ?? 0,
      input.date_range_start ?? null,
      input.date_range_end ?? null,
      input.status
    )
  return db.prepare('SELECT * FROM import_log WHERE id = ?').get(result.lastInsertRowid) as ImportLogRow
}
