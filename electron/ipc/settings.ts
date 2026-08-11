import { readSettings, writeSettings, type RefreshConfig } from '../services/app-settings'
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
    }
  }
}
