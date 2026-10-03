import { ipcMain } from 'electron'
import {
  changeMasterPassword,
  databaseExists,
  getDb,
  initDatabase,
  isDatabaseOpen
} from '../db/connection'
import { getUser } from '../db/queries/users'
import { sanitizeIpcError, UserFacingError } from './errors'

const CURRENT_USER_ID = 1

/** Wraps an auth handler so raw errors are sanitized before crossing IPC. */
function guard(
  channel: string,
  getDevMode: () => boolean,
  handler: (event: Electron.IpcMainInvokeEvent, params: Record<string, unknown>) => Promise<unknown>
): void {
  ipcMain.handle(channel, async (event, params) => {
    try {
      return await handler(event, params ?? {})
    } catch (err) {
      throw sanitizeIpcError(channel, err, getDevMode())
    }
  })
}

/**
 * Auth handlers bootstrap the encrypted DB and therefore can't use the shared
 * getDb()-based registration path — the DB doesn't exist yet when they run.
 *
 *  - auth:status  — is this a first run (no DB file) and is the DB already unlocked this session?
 *  - auth:unlock  — derive the key from the master password, open/create the DB
 *                   (migrations + seed run inside), and report onboarding state.
 *                   A wrong password surfaces as a rejected promise.
 */
export function registerAuthHandlers(userDataDir: string, getDevMode: () => boolean): void {
  guard('auth:status', getDevMode, async () => ({
    dbExists: databaseExists(userDataDir),
    unlocked: isDatabaseOpen()
  }))

  guard('auth:unlock', getDevMode, async (_event, params) => {
    const { password } = params
    if (typeof password !== 'string' || password.length === 0) {
      throw new UserFacingError('A master password is required')
    }

    if (!isDatabaseOpen()) {
      // Throws "file is not a database" on a wrong password for an existing DB;
      // the renderer shows its own "Incorrect password" for this rejection.
      initDatabase(userDataDir, password)
    }

    const user = getUser(getDb(), CURRENT_USER_ID)
    return {
      ok: true,
      onboardingCompleted: user?.onboarding_completed === 1
    }
  })

  // Change the master password on the unlocked vault (SQLCipher in-place rekey).
  // Requires the correct current password; validates the new one server-side too.
  guard('auth:changePassword', getDevMode, async (_event, params) => {
    const { currentPassword, newPassword } = params
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      throw new UserFacingError('Both current and new passwords are required')
    }
    if (newPassword.length < 6) {
      throw new UserFacingError('New password must be at least 6 characters')
    }
    try {
      changeMasterPassword(userDataDir, currentPassword, newPassword)
    } catch (err) {
      // A wrong current password is a user error, not an internal one.
      if (err instanceof Error && /current password/i.test(err.message)) {
        throw new UserFacingError('Current password is incorrect')
      }
      throw err
    }
    return { ok: true }
  })
}
