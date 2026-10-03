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

/**
 * Deletes an import and the transactions it created (a clean "undo"). Rows are
 * matched by import_log_id when present; rows imported before that column
 * existed fall back to matching the file name (+ account, when the log has one).
 * Any transfer links pointing at the removed rows are cleared first so no
 * dangling matched_transfer_id remains.
 */
export function deleteImport(
  db: Database.Database,
  userId: number,
  importLogId: number
): { deletedTransactions: number } {
  const log = db
    .prepare('SELECT * FROM import_log WHERE user_id = ? AND id = ?')
    .get(userId, importLogId) as ImportLogRow | undefined
  if (!log) throw new Error('Import not found')

  const run = db.transaction(() => {
    const rows = db
      .prepare(
        `SELECT id FROM transactions
         WHERE user_id = ?
           AND (import_log_id = ?
                OR (import_log_id IS NULL AND source_file = ? AND (? IS NULL OR account_id = ?)))`
      )
      .all(userId, importLogId, log.file_name, log.account_id, log.account_id) as { id: number }[]
    const ids = rows.map((r) => r.id)

    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',')
      // Unlink any counterpart transfer/CC-payment matches that reference these rows.
      db.prepare(
        `UPDATE transactions
         SET matched_transfer_id = NULL, is_transfer = 0, is_cc_payment = 0, is_excluded = 0
         WHERE user_id = ? AND matched_transfer_id IN (${placeholders})`
      ).run(userId, ...ids)
      db.prepare(`DELETE FROM transactions WHERE user_id = ? AND id IN (${placeholders})`).run(userId, ...ids)
    }

    db.prepare('DELETE FROM import_log WHERE user_id = ? AND id = ?').run(userId, importLogId)
    return { deletedTransactions: ids.length }
  })

  return run()
}
