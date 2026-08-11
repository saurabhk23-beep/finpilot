import { getUser, updateUser, type UpdateUserInput } from '../db/queries/users'
import { type GetDb, type IpcHandlerMap, requireUserId } from './types'

export function createUserHandlers(getDb: GetDb): IpcHandlerMap {
  return {
    'user:get': async (params) => getUser(getDb(), requireUserId(params)),

    'user:update': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, ...input } = params
      return updateUser(getDb(), userId, input as UpdateUserInput)
    }
  }
}
