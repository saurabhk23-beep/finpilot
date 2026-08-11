import { ipcMain } from 'electron'
import { databaseExists, getDb, initDatabase, isDatabaseOpen } from '../db/connection'
import { getUser } from '../db/queries/users'

const CURRENT_USER_ID = 1

/**
 * Auth handlers bootstrap the encrypted DB and therefore can't use the shared
 * getDb()-based registration path — the DB doesn't exist yet when they run.
 *
 *  - auth:status  — is this a first run (no DB file) and is the DB already unlocked this session?
 *  - auth:unlock  — derive the key from the master password, open/create the DB
 *                   (migrations + seed run inside), and report onboarding state.
 *                   A wrong password surfaces as a rejected promise.
 */
export function registerAuthHandlers(userDataDir: string): void {
  ipcMain.handle('auth:status', async () => {
    return {
      dbExists: databaseExists(userDataDir),
      unlocked: isDatabaseOpen()
    }
  })

  ipcMain.handle('auth:unlock', async (_event, params: { password?: unknown }) => {
    const { password } = params
    if (typeof password !== 'string' || password.length === 0) {
      throw new Error('A master password is required')
    }

    if (!isDatabaseOpen()) {
      // Throws "file is not a database" on a wrong password for an existing DB.
      initDatabase(userDataDir, password)
    }

    const user = getUser(getDb(), CURRENT_USER_ID)
    return {
      ok: true,
      onboardingCompleted: user?.onboarding_completed === 1
    }
  })
}
