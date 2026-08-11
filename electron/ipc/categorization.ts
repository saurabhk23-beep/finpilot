import {
  categorizeUncategorized,
  computeCoverage,
  saveUserOverride,
  topUnidentifiedCredits
} from '../services/categorization-service'
import { type GetDb, type IpcHandlerMap, requireUserId } from './types'

export function createCategorizationHandlers(getDb: GetDb): IpcHandlerMap {
  return {
    'categorization:coverage': async (params) => computeCoverage(getDb(), requireUserId(params)),

    // Run the engine over all uncategorized transactions (e.g. after editing rules).
    'categorization:run': async (params) => categorizeUncategorized(getDb(), requireUserId(params)),

    'categorization:topCredits': async (params) =>
      topUnidentifiedCredits(getDb(), requireUserId(params), (params.limit as number | undefined) ?? 5),

    // Layer 5: user re-categorizes a transaction; by default this also learns a rule.
    'transactions:recategorize': async (params) => {
      const userId = requireUserId(params)
      return saveUserOverride(getDb(), userId, {
        transactionId: params.transactionId as number,
        categoryId: params.categoryId as number,
        remarks: params.remarks as string | undefined,
        learn: params.learn as boolean | undefined
      })
    }
  }
}
