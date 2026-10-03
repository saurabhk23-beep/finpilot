/**
 * IPC error boundary. Handlers may throw anything — sidecar/SQLite/internal
 * errors carry implementation detail that must not reach the customer. This
 * module turns a thrown value into a safe, user-facing message (unless developer
 * mode is on, in which case the real message is surfaced for debugging). The
 * full error is always logged in the main process.
 */

/**
 * Marks an error whose message is written *for the user* (e.g. "Current password
 * is incorrect"). These pass through unchanged even when developer mode is off.
 */
export class UserFacingError extends Error {
  readonly userFacing = true
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

function isUserFacing(err: unknown): err is Error {
  return err instanceof Error && (err as { userFacing?: boolean }).userFacing === true
}

/** Domain-specific friendly fallbacks, keyed by the channel prefix (before ':'). */
const FRIENDLY_BY_DOMAIN: Record<string, string> = {
  import: 'We couldn’t process that file. Please check the file (and password, if any) and try again.',
  auth: 'Something went wrong while unlocking. Please try again.',
  portfolio: 'We couldn’t refresh your investments right now. Please try again later.',
  analytics: 'We couldn’t load this view. Please try again.',
  categorization: 'We couldn’t update categories right now. Please try again.',
  transfers: 'We couldn’t update transfers right now. Please try again.',
  settings: 'We couldn’t save that setting. Please try again.'
}

const GENERIC_MESSAGE = 'Something went wrong. Please try again.'

function friendlyMessage(channel: string): string {
  const domain = channel.split(':')[0]
  return FRIENDLY_BY_DOMAIN[domain] ?? GENERIC_MESSAGE
}

function rawMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * Converts a thrown value into the Error that is sent across IPC:
 *  - always logs the real error (with the channel) in the main process;
 *  - user-facing errors pass through unchanged;
 *  - dev mode passes the real message through (prefixed with the error type);
 *  - otherwise a friendly, domain-appropriate message is returned.
 */
export function sanitizeIpcError(channel: string, err: unknown, devMode: boolean): Error {
  // Full detail stays in the main-process log regardless of mode.
  console.error(`[ipc:${channel}]`, err)

  if (isUserFacing(err)) return new Error(rawMessage(err))

  if (devMode) {
    const type = err instanceof Error ? err.name : typeof err
    return new Error(`[dev] ${type}: ${rawMessage(err)}`)
  }

  return new Error(friendlyMessage(channel))
}
