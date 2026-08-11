import type Database from 'better-sqlite3-multiple-ciphers'

/** Resolves the live DB connection at call time (not at registration time) — the renderer may invoke a channel before the DB is unlocked, so this stays a function, not a captured value. */
export type GetDb = () => Database.Database

export type IpcHandler = (params: Record<string, unknown>) => Promise<unknown>

export type IpcHandlerMap = Record<string, IpcHandler>

/** Every IPC payload carries userId (HLD IPC Contract) — validated here so a bad/missing userId fails loudly instead of silently scoping to the wrong rows. */
export function requireUserId(params: Record<string, unknown>): number {
  const { userId } = params
  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
    throw new Error('IPC call missing a valid userId')
  }
  return userId
}
