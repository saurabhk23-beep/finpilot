import { ipcMain } from 'electron'
import { getDb } from '../db/connection'
import type { SidecarPaths } from '../parsers/sidecar'
import { registerAppHandlers } from './app'
import { registerAuthHandlers } from './auth'
import { registerDialogHandlers } from './dialog'
import { createAccountsHandlers } from './accounts'
import { createAnalyticsHandlers } from './analytics'
import { createCategoriesHandlers } from './categories'
import { createCategorizationHandlers } from './categorization'
import { createCategoryRulesHandlers } from './categoryRules'
import { createCreditCardsHandlers } from './creditCards'
import { createImportHandlers } from './import'
import { createInvestmentsHandlers } from './investments'
import { createPortfolioHandlers } from './portfolio'
import { createSettingsHandlers } from './settings'
import { createTransactionsHandlers } from './transactions'
import { createTransfersHandlers } from './transfers'
import type { IpcHandlerMap } from './types'
import { sanitizeIpcError } from './errors'
import { createUserHandlers } from './user'

export interface IpcConfig {
  userDataDir: string
  sidecarPaths: SidecarPaths
  settingsPath: string
  onRefreshConfigChanged: () => void
  /** Read at call time so toggling developer mode takes effect immediately. */
  getDevMode: () => boolean
}

function registerHandlerMap(handlers: IpcHandlerMap, getDevMode: () => boolean): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (_event, params) => {
      try {
        return await handler(params)
      } catch (err) {
        // Sanitize before it crosses to the renderer (raw internals never leak).
        throw sanitizeIpcError(channel, err, getDevMode())
      }
    })
  }
}

export function registerIpcHandlers(config: IpcConfig): void {
  const { getDevMode } = config
  registerAppHandlers()
  registerAuthHandlers(config.userDataDir, getDevMode)
  registerDialogHandlers()

  // Domain handlers call getDb() lazily, so registering them before the DB is
  // unlocked is safe — the renderer only invokes them after auth:unlock succeeds.
  registerHandlerMap(createUserHandlers(getDb), getDevMode)
  registerHandlerMap(createAccountsHandlers(getDb), getDevMode)
  registerHandlerMap(createCreditCardsHandlers(getDb), getDevMode)
  registerHandlerMap(createCategoriesHandlers(getDb), getDevMode)
  registerHandlerMap(createCategoryRulesHandlers(getDb), getDevMode)
  registerHandlerMap(createCategorizationHandlers(getDb), getDevMode)
  registerHandlerMap(createTransactionsHandlers(getDb), getDevMode)
  registerHandlerMap(createTransfersHandlers(getDb), getDevMode)
  registerHandlerMap(createInvestmentsHandlers(getDb), getDevMode)
  registerHandlerMap(createImportHandlers(getDb, config.sidecarPaths), getDevMode)
  registerHandlerMap(createAnalyticsHandlers(getDb), getDevMode)
  registerHandlerMap(createPortfolioHandlers(getDb), getDevMode)
  registerHandlerMap(
    createSettingsHandlers({
      settingsPath: config.settingsPath,
      onRefreshConfigChanged: config.onRefreshConfigChanged
    }),
    getDevMode
  )
}
