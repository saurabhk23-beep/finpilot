import { createMFScheme, listMFSchemes, type CreateMFSchemeInput } from '../db/queries/mfSchemes'
import { createMFTransaction, listMFTransactions, type CreateMFTransactionInput } from '../db/queries/mfTransactions'
import { createStock, listStocks, type CreateStockInput } from '../db/queries/stocks'
import {
  createStockTransaction,
  listStockTransactions,
  type CreateStockTransactionInput
} from '../db/queries/stockTransactions'
import { type GetDb, type IpcHandlerMap, requireUserId } from './types'

// NAV/price refresh (mfapi.in, stock price API) is a Phase H concern (node-cron job) —
// this module only covers Phase B CRUD for holdings and their transaction logs.
export function createInvestmentsHandlers(getDb: GetDb): IpcHandlerMap {
  return {
    'investments:mfSchemes:list': async (params) => listMFSchemes(getDb(), requireUserId(params)),

    'investments:mfSchemes:create': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, ...input } = params
      return createMFScheme(getDb(), userId, input as unknown as CreateMFSchemeInput)
    },

    'investments:mfTransactions:list': async (params) =>
      listMFTransactions(getDb(), requireUserId(params), params.schemeId as number | undefined),

    'investments:mfTransactions:create': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, ...input } = params
      return createMFTransaction(getDb(), userId, input as unknown as CreateMFTransactionInput)
    },

    'investments:stocks:list': async (params) => listStocks(getDb(), requireUserId(params)),

    'investments:stocks:create': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, ...input } = params
      return createStock(getDb(), userId, input as unknown as CreateStockInput)
    },

    'investments:stockTransactions:list': async (params) =>
      listStockTransactions(getDb(), requireUserId(params), params.stockId as number | undefined),

    'investments:stockTransactions:create': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, ...input } = params
      return createStockTransaction(getDb(), userId, input as unknown as CreateStockTransactionInput)
    }
  }
}
