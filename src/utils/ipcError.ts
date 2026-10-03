/**
 * Extracts the human-readable message from an IPC rejection.
 *
 * The main process already sanitizes errors (friendly text when developer mode is
 * off, a "[dev] Type: message" string when it's on). Electron additionally wraps
 * rejections as `Error invoking remote method 'channel': Error: <message>` — this
 * strips that wrapper so the clean message is shown.
 */
export function ipcErrorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!(e instanceof Error)) return fallback
  let msg = e.message.replace(/^Error invoking remote method '[^']*':\s*/, '')
  // Developer-mode messages carry an intentional "[dev] …" prefix — keep them verbatim.
  if (msg.startsWith('[dev]')) return msg.trim()
  // Otherwise drop the generic "Error:" class prefix Electron prepends.
  msg = msg.replace(/^Error:\s*/, '')
  return msg.trim() || fallback
}
