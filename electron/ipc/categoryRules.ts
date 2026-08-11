import {
  createCategoryRule,
  deleteCategoryRule,
  listCategoryRules,
  updateCategoryRule,
  type CreateCategoryRuleInput,
  type UpdateCategoryRuleInput
} from '../db/queries/categoryRules'
import { type GetDb, type IpcHandlerMap, requireUserId } from './types'

export function createCategoryRulesHandlers(getDb: GetDb): IpcHandlerMap {
  return {
    'rules:list': async (params) => listCategoryRules(getDb(), requireUserId(params)),

    'rules:create': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, ...input } = params
      return createCategoryRule(getDb(), userId, input as unknown as CreateCategoryRuleInput)
    },

    'rules:update': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, id, ...input } = params
      return updateCategoryRule(getDb(), userId, id as number, input as UpdateCategoryRuleInput)
    },

    'rules:delete': async (params) => {
      deleteCategoryRule(getDb(), requireUserId(params), params.id as number)
      return { ok: true }
    }
  }
}
