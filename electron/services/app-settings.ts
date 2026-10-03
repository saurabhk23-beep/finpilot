import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

export interface RefreshConfig {
  enabled: boolean
  /** 24h "HH:MM" local-to-IST time for the daily market-data refresh. */
  time: string
}

/**
 * Non-sensitive profile bits mirrored outside the encrypted DB so the unlock
 * screen can greet the user *before* the vault is decrypted. Only the username
 * lives here — never financial data. The DB row remains authoritative once open.
 */
export interface PublicProfile {
  username: string | null
}

export interface AppSettings {
  refresh: RefreshConfig
  profile: PublicProfile
  /** Developer mode: when on, raw internal errors are surfaced instead of friendly ones. */
  devMode: boolean
}

const DEFAULTS: AppSettings = {
  refresh: { enabled: true, time: '19:00' }, // PRD default: 7 PM IST
  profile: { username: null },
  devMode: false
}

/**
 * Tiny fs-backed settings store (userData/settings.json). Deliberately not
 * electron-store: that package is ESM-only and would break the CJS main bundle.
 * App-level config only — no user/financial data lives here.
 */
export function readSettings(path: string): AppSettings {
  if (!existsSync(path)) return DEFAULTS
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<AppSettings>
    return {
      refresh: { ...DEFAULTS.refresh, ...(parsed.refresh ?? {}) },
      profile: { ...DEFAULTS.profile, ...(parsed.profile ?? {}) },
      devMode: parsed.devMode ?? DEFAULTS.devMode
    }
  } catch {
    return DEFAULTS
  }
}

/**
 * Whether developer mode is active. The FINPILOT_DEV_MODE env var forces it on
 * (handy while developing); otherwise the persisted setting decides.
 */
export function isDevMode(path: string): boolean {
  if (process.env.FINPILOT_DEV_MODE === '1') return true
  return readSettings(path).devMode
}

/** Persists the developer-mode flag. */
export function setDevMode(path: string, devMode: boolean): boolean {
  const current = readSettings(path)
  writeSettings(path, { ...current, devMode })
  return devMode
}

/** Reads just the public profile (safe before the DB is unlocked). */
export function readPublicProfile(path: string): PublicProfile {
  return readSettings(path).profile
}

/** Merges and persists the public profile mirror. */
export function writePublicProfile(path: string, profile: Partial<PublicProfile>): PublicProfile {
  const current = readSettings(path)
  const next: PublicProfile = { ...current.profile, ...profile }
  writeSettings(path, { ...current, profile: next })
  return next
}

export function writeSettings(path: string, settings: AppSettings): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(settings, null, 2), 'utf-8')
}

/** Converts "HH:MM" to a node-cron expression `M H * * *`. Returns null if malformed. */
export function timeToCron(time: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return `${minute} ${hour} * * *`
}
