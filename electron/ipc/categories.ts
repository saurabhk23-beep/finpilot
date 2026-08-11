import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
  type CreateCategoryInput,
  type UpdateCategoryInput
} from '../db/queries/categories'
import { mergeCategories } from '../services/category-merge'
import { type GetDb, type IpcHandlerMap, requireUserId } from './types'

export function createCategoriesHandlers(getDb: GetDb): IpcHandlerMap {
  return {
    'categories:list': async (params) => listCategories(getDb(), requireUserId(params)),

    'categories:get': async (params) => getCategory(getDb(), requireUserId(params), params.id as number),

    'categories:create': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, ...input } = params
      return createCategory(getDb(), userId, input as unknown as CreateCategoryInput)
    },

    'categories:update': async (params) => {
      const userId = requireUserId(params)
      const { userId: _omit, id, ...input } = params
      return updateCategory(getDb(), userId, id as number, input as UpdateCategoryInput)
    },

    'categories:delete': async (params) => {
      deleteCategory(getDb(), requireUserId(params), params.id as number)
      return { ok: true }
    },

    'categories:merge': async (params) =>
      mergeCategories(getDb(), requireUserId(params), params.fromId as number, params.toId as number)
  }
}
