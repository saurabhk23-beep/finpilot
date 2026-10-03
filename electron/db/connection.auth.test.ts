import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { changeMasterPassword, closeDatabase, databaseExists, initDatabase } from './connection'
import { getUser } from './queries/users'

// Mirrors what the auth:status / auth:unlock IPC handlers do, minus Electron's ipcMain.
describe('auth flow (connection layer)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-auth-'))
  })

  afterEach(() => {
    closeDatabase()
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports first-run before any DB is created', () => {
    expect(databaseExists(dir)).toBe(false)
  })

  it('creates the DB on first unlock and reports onboarding not completed', () => {
    const db = initDatabase(dir, 'master-pw')
    expect(databaseExists(dir)).toBe(true)

    const user = getUser(db, 1)
    expect(user?.onboarding_completed).toBe(0)
  })

  it('persists onboarding completion across a lock/unlock cycle', () => {
    const db = initDatabase(dir, 'master-pw')
    db.prepare('UPDATE user SET onboarding_completed = 1 WHERE id = 1').run()
    closeDatabase()

    const reopened = initDatabase(dir, 'master-pw')
    expect(getUser(reopened, 1)?.onboarding_completed).toBe(1)
  })

  it('rejects a wrong password on an existing DB', () => {
    initDatabase(dir, 'correct-pw')
    closeDatabase()

    expect(() => initDatabase(dir, 'wrong-pw')).toThrow()
  })

  it('changes the master password and re-opens with the new one only', () => {
    const db = initDatabase(dir, 'old-pw')
    db.prepare('UPDATE user SET onboarding_completed = 1 WHERE id = 1').run()

    changeMasterPassword(dir, 'old-pw', 'new-pw')
    closeDatabase()

    // Old password no longer works…
    expect(() => initDatabase(dir, 'old-pw')).toThrow()
    closeDatabase()

    // …new password unlocks and the data survived the rekey.
    const reopened = initDatabase(dir, 'new-pw')
    expect(getUser(reopened, 1)?.onboarding_completed).toBe(1)
  })

  it('rejects a rekey when the current password is wrong', () => {
    initDatabase(dir, 'old-pw')
    expect(() => changeMasterPassword(dir, 'not-the-pw', 'new-pw')).toThrow(/current password/i)
    closeDatabase()

    // The vault is untouched — old password still works.
    const reopened = initDatabase(dir, 'old-pw')
    expect(getUser(reopened, 1)).toBeTruthy()
  })
})
