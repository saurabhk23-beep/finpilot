import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

export interface RefreshConfig {
  enabled: boolean
  /** 24h "HH:MM" local-to-IST time for the daily market-data refresh. */
  time: string
}

export interface AppSettings {
  refresh: RefreshConfig
}

const DEFAULTS: AppSettings = {
  refresh: { enabled: true, time: '19:00' } // PRD default: 7 PM IST
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
      refresh: { ...DEFAULTS.refresh, ...(parsed.refresh ?? {}) }
    }
  } catch {
    return DEFAULTS
  }
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
