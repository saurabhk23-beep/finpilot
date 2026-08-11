import cron, { type ScheduledTask } from 'node-cron'
import { timeToCron } from './app-settings'

let current: ScheduledTask | null = null

/**
 * (Re)schedules the daily market-data refresh at the given "HH:MM" IST time,
 * replacing any existing schedule. Passing enabled=false (or an invalid time)
 * cancels it. node-cron runs in the local zone, so IST is set explicitly.
 */
export function applyRefreshSchedule(enabled: boolean, time: string, onFire: () => void): void {
  current?.stop()
  current = null
  if (!enabled) return
  const expr = timeToCron(time)
  if (!expr) return
  current = cron.schedule(expr, onFire, { timezone: 'Asia/Kolkata' })
}
