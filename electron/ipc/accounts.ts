import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  updateAccount,
  type CreateAccountInput,
  type UpdateAccountInput
} from '../db/queries/accounts'
import { type GetDb, type IpcHandlerMap, requireUserId } from './types'

export function createAccountsHandlers(getDb: GetDb): IpcHandlerMap {
  return {
    'accounts:list': async (params) => listAccounts(getDb(), requireUserId(params)),

    'accounts:get': async (params) => getAccount(getDb(), requireUserId(params), params.id as number),

    'accounts:create': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, ...input } = params
      return createAccount(getDb(), userId, input as unknown as CreateAccountInput)
    },

    'accounts:update': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, id, ...input } = params
      return updateAccount(getDb(), userId, id as number, input as UpdateAccountInput)
    },

    'accounts:delete': async (params) => {
      deleteAccount(getDb(), requireUserId(params), params.id as number)
      return { ok: true }
    }
  }
}
