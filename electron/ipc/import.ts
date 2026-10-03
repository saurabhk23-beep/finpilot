import type { SidecarPaths } from '../parsers/sidecar'
import type { ColumnMapping } from '../parsers/csv'
import type { TransactionDraft } from '../parsers/types'
import {
  commitTransactionImport,
  previewTransactionImport,
  type TransactionImportKind
} from '../services/import-service'
import { importCas, importGroww } from '../services/investment-import'
import { getOrCreateCashAccount } from '../db/queries/accounts'
import { deleteImport, listImportLogs } from '../db/queries/importLog'
import { type GetDb, type IpcHandlerMap, requireUserId } from './types'

/**
 * Import handlers own the statement-ingestion pipeline. They need the Python
 * sidecar location, so they take it at registration time (unlike the pure
 * getDb()-based domain handlers).
 */
export function createImportHandlers(getDb: GetDb, sidecarPaths: SidecarPaths): IpcHandlerMap {
  return {
    'import:list': async (params) => listImportLogs(getDb(), requireUserId(params)),

    // Undo an import: removes the import record and the transactions it created.
    'import:delete': async (params) =>
      deleteImport(getDb(), requireUserId(params), params.importLogId as number),

    // Parse + dedup + account-match with no writes; safe to call repeatedly as the
    // user adjusts the CSV column mapping.
    'import:preview': async (params) => {
      const userId = requireUserId(params)
      return previewTransactionImport(getDb(), userId, sidecarPaths, {
        path: params.path as string,
        kind: params.kind as TransactionImportKind,
        mapping: params.mapping as ColumnMapping | undefined,
        bank: params.bank as string | undefined,
        password: params.password as string | undefined,
        targetAccountId: params.targetAccountId as number | undefined
      })
    },

    // Write the chosen drafts to an account and record the ImportLog.
    'import:commit': async (params) => {
      const userId = requireUserId(params)
      return commitTransactionImport(getDb(), userId, {
        fileName: params.fileName as string,
        fileHash: params.fileHash as string,
        accountId: params.accountId as number | undefined,
        cardId: params.cardId as number | undefined,
        drafts: params.drafts as TransactionDraft[],
        dateRange: params.dateRange as { start: string; end: string } | undefined
      })
    },

    // Convenience for the cash tracker: import CSV drafts straight into the Cash account.
    'import:commitCash': async (params) => {
      const userId = requireUserId(params)
      const cash = getOrCreateCashAccount(getDb(), userId)
      return commitTransactionImport(getDb(), userId, {
        fileName: params.fileName as string,
        fileHash: params.fileHash as string,
        accountId: cash.id,
        drafts: params.drafts as TransactionDraft[],
        dateRange: params.dateRange as { start: string; end: string } | undefined
      })
    },

    'import:cas': async (params) => {
      const userId = requireUserId(params)
      return importCas(getDb(), userId, sidecarPaths, params.path as string, (params.password as string) ?? '')
    },

    'import:groww': async (params) => {
      const userId = requireUserId(params)
      return importGroww(getDb(), userId, params.path as string)
    }
  }
}
