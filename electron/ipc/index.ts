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
import { createUserHandlers } from './user'

export interface IpcConfig {
  userDataDir: string
  sidecarPaths: SidecarPaths
  settingsPath: string
  onRefreshConfigChanged: () => void
}

function registerHandlerMap(handlers: IpcHandlerMap): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, params) => handler(params))
  }
}

export function registerIpcHandlers(config: IpcConfig): void {
  registerAppHandlers()
  registerAuthHandlers(config.userDataDir)
  registerDialogHandlers()

  // Domain handlers call getDb() lazily, so registering them before the DB is
  // unlocked is safe — the renderer only invokes them after auth:unlock succeeds.
  registerHandlerMap(createUserHandlers(getDb))
  registerHandlerMap(createAccountsHandlers(getDb))
  registerHandlerMap(createCreditCardsHandlers(getDb))
  registerHandlerMap(createCategoriesHandlers(getDb))
  registerHandlerMap(createCategoryRulesHandlers(getDb))
  registerHandlerMap(createCategorizationHandlers(getDb))
  registerHandlerMap(createTransactionsHandlers(getDb))
  registerHandlerMap(createTransfersHandlers(getDb))
  registerHandlerMap(createInvestmentsHandlers(getDb))
  registerHandlerMap(createImportHandlers(getDb, config.sidecarPaths))
  registerHandlerMap(createAnalyticsHandlers(getDb))
  registerHandlerMap(createPortfolioHandlers(getDb))
  registerHandlerMap(
    createSettingsHandlers({
      settingsPath: config.settingsPath,
      onRefreshConfigChanged: config.onRefreshConfigChanged
    })
  )
}
