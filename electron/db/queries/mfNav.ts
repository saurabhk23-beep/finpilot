import type Database from 'better-sqlite3-multiple-ciphers'
import type { MFNavRow } from '../types'

// No user_id: NAV history is shared public AMFI data cached across all users of the app.

export function getLatestNav(db: Database.Database, schemeCode: string): MFNavRow | undefined {
  return db
    .prepare('SELECT * FROM mf_nav WHERE scheme_code = ? ORDER BY date DESC LIMIT 1')
    .get(schemeCode) as MFNavRow | undefined
}

/** The most recent `n` NAV rows, newest first — used for latest + previous (day change). */
export function getRecentNavs(db: Database.Database, schemeCode: string, n = 2): MFNavRow[] {
  return db
    .prepare('SELECT * FROM mf_nav WHERE scheme_code = ? ORDER BY date DESC LIMIT ?')
    .all(schemeCode, n) as MFNavRow[]
}

export function listNavHistory(
  db: Database.Database,
  schemeCode: string,
  dateFrom?: string,
  dateTo?: string
): MFNavRow[] {
  const conditions = ['scheme_code = ?']
  const params: unknown[] = [schemeCode]
  if (dateFrom !== undefined) {
    conditions.push('date >= ?')
    params.push(dateFrom)
  }
  if (dateTo !== undefined) {
    conditions.push('date <= ?')
    params.push(dateTo)
  }
  return db.prepare(`SELECT * FROM mf_nav WHERE ${conditions.join(' AND ')} ORDER BY date`).all(
    ...params
  ) as MFNavRow[]
}

export function upsertNav(db: Database.Database, schemeCode: string, date: string, nav: number): void {
  db.prepare(
    `INSERT INTO mf_nav (scheme_code, date, nav) VALUES (?, ?, ?)
     ON CONFLICT (scheme_code, date) DO UPDATE SET nav = excluded.nav`
  ).run(schemeCode, date, nav)
}
