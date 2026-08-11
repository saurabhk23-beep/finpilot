import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSettings, timeToCron, writeSettings } from './app-settings'

describe('timeToCron', () => {
  it('converts HH:MM to a cron expression', () => {
    expect(timeToCron('19:00')).toBe('0 19 * * *')
    expect(timeToCron('7:05')).toBe('5 7 * * *')
    expect(timeToCron('00:30')).toBe('30 0 * * *')
  })
  it('rejects malformed or out-of-range times', () => {
    expect(timeToCron('25:00')).toBeNull()
    expect(timeToCron('12:60')).toBeNull()
    expect(timeToCron('noon')).toBeNull()
  })
})

describe('settings store', () => {
  let dir: string
  let path: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finpilot-settings-'))
    path = join(dir, 'settings.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('returns defaults when no file exists', () => {
    expect(readSettings(path).refresh).toEqual({ enabled: true, time: '19:00' })
  })

  it('round-trips written settings and merges over defaults', () => {
    writeSettings(path, { refresh: { enabled: false, time: '08:30' } })
    expect(readSettings(path).refresh).toEqual({ enabled: false, time: '08:30' })
  })

  it('recovers to defaults on a corrupt file', () => {
    writeSettings(path, { refresh: { enabled: false, time: '08:30' } })
    rmSync(path)
    require('fs').writeFileSync(path, '{ not json', 'utf-8')
    expect(readSettings(path).refresh.enabled).toBe(true)
  })
})
