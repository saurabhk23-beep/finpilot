import type Database from 'better-sqlite3-multiple-ciphers'
import type { MFSchemeRow } from '../types'

export function listMFSchemes(db: Database.Database, userId: number): MFSchemeRow[] {
  return db.prepare('SELECT * FROM mf_scheme WHERE user_id = ? ORDER BY scheme_name').all(userId) as MFSchemeRow[]
}

export function getMFScheme(db: Database.Database, userId: number, id: number): MFSchemeRow | undefined {
  return db.prepare('SELECT * FROM mf_scheme WHERE user_id = ? AND id = ?').get(userId, id) as
    | MFSchemeRow
    | undefined
}

export function findMFSchemeByFolio(
  db: Database.Database,
  userId: number,
  schemeCode: string,
  folio: string
): MFSchemeRow | undefined {
  return db
    .prepare('SELECT * FROM mf_scheme WHERE user_id = ? AND scheme_code = ? AND folio = ?')
    .get(userId, schemeCode, folio) as MFSchemeRow | undefined
}

export interface CreateMFSchemeInput {
  scheme_code: string
  scheme_name: string
  folio: string
  amc_name?: string
}

export function createMFScheme(db: Database.Database, userId: number, input: CreateMFSchemeInput): MFSchemeRow {
  const result = db
    .prepare('INSERT INTO mf_scheme (user_id, scheme_code, scheme_name, folio, amc_name) VALUES (?, ?, ?, ?, ?)')
    .run(userId, input.scheme_code, input.scheme_name, input.folio, input.amc_name ?? null)
  return getMFScheme(db, userId, result.lastInsertRowid as number)!
}
