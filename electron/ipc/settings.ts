import {
  isDevMode,
  readPublicProfile,
  readSettings,
  setDevMode,
  writePublicProfile,
  writeSettings,
  type RefreshConfig
} from '../services/app-settings'
import type { IpcHandlerMap } from './types'

export interface SettingsDeps {
  settingsPath: string
  /** Called after the refresh config changes so main can re-arm the cron. */
  onRefreshConfigChanged: () => void
}

export function createSettingsHandlers(deps: SettingsDeps): IpcHandlerMap {
  return {
    'settings:getRefresh': async () => readSettings(deps.settingsPath).refresh,

    'settings:setRefresh': async (params) => {
      const current = readSettings(deps.settingsPath)
      const refresh: RefreshConfig = {
        enabled: (params.enabled as boolean | undefined) ?? current.refresh.enabled,
        time: (params.time as string | undefined) ?? current.refresh.time
      }
      writeSettings(deps.settingsPath, { ...current, refresh })
      deps.onRefreshConfigChanged()
      return refresh
    },

    // Public profile mirror — readable before the vault is unlocked, so the
    // splash screen can greet the returning user. No userId (pre-unlock capable).
    'settings:getProfile': async () => readPublicProfile(deps.settingsPath),

    'settings:setProfile': async (params) =>
      writePublicProfile(deps.settingsPath, {
        username: (params.username as string | undefined) ?? null
      }),

    // Developer mode: raw internal errors surfaced when on, friendly ones when off.
    'settings:getDevMode': async () => ({ devMode: isDevMode(deps.settingsPath) }),

    'settings:setDevMode': async (params) => ({
      devMode: setDevMode(deps.settingsPath, params.devMode === true)
    })
  }
}
