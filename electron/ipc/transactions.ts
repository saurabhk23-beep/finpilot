import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
  type CreateTransactionInput,
  type ListTransactionsFilters,
  type UpdateTransactionInput
} from '../db/queries/transactions'
import { type GetDb, type IpcHandlerMap, requireUserId } from './types'

export function createTransactionsHandlers(getDb: GetDb): IpcHandlerMap {
  return {
    'transactions:list': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, ...filters } = params
      return listTransactions(getDb(), userId, filters as ListTransactionsFilters)
    },

    'transactions:get': async (params) => getTransaction(getDb(), requireUserId(params), params.id as number),

    'transactions:create': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, ...input } = params
      return createTransaction(getDb(), userId, input as unknown as CreateTransactionInput)
    },

    'transactions:update': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, id, ...input } = params
      return updateTransaction(getDb(), userId, id as number, input as UpdateTransactionInput)
    },

    'transactions:delete': async (params) => {
      deleteTransaction(getDb(), requireUserId(params), params.id as number)
      return { ok: true }
    }
  }
}
