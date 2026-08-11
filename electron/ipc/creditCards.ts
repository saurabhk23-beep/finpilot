import {
  createCreditCard,
  deleteCreditCard,
  getCreditCard,
  listCreditCards,
  updateCreditCard,
  type CreateCreditCardInput,
  type UpdateCreditCardInput
} from '../db/queries/creditCards'
import { type GetDb, type IpcHandlerMap, requireUserId } from './types'

export function createCreditCardsHandlers(getDb: GetDb): IpcHandlerMap {
  return {
    'creditCards:list': async (params) => listCreditCards(getDb(), requireUserId(params)),

    'creditCards:get': async (params) => getCreditCard(getDb(), requireUserId(params), params.id as number),

    'creditCards:create': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, ...input } = params
      return createCreditCard(getDb(), userId, input as unknown as CreateCreditCardInput)
    },

    'creditCards:update': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, id, ...input } = params
      return updateCreditCard(getDb(), userId, id as number, input as UpdateCreditCardInput)
    },

    'creditCards:delete': async (params) => {
      deleteCreditCard(getDb(), requireUserId(params), params.id as number)
      return { ok: true }
    }
  }
}
