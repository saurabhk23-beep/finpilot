import {
  getAccountBalance,
  getCardUtilization,
  getCategoryBreakdown,
  getMonthlyTrend,
  getRecentTransactions,
  getSummary,
  getTopMerchants,
  getUncategorized,
  type AnalyticsFilter,
  type Scope
} from '../services/analytics'
import { type GetDb, type IpcHandlerMap, requireUserId } from './types'

function filterFrom(params: Record<string, unknown>): AnalyticsFilter {
  return {
    scope: params.scope as Scope,
    dateFrom: params.dateFrom as string | undefined,
    dateTo: params.dateTo as string | undefined
  }
}

export function createAnalyticsHandlers(getDb: GetDb): IpcHandlerMap {
  return {
    'analytics:summary': async (params) => getSummary(getDb(), requireUserId(params), filterFrom(params)),

    'analytics:categoryBreakdown': async (params) =>
      getCategoryBreakdown(getDb(), requireUserId(params), filterFrom(params)),

    'analytics:monthlyTrend': async (params) =>
      getMonthlyTrend(getDb(), requireUserId(params), filterFrom(params)),

    'analytics:topMerchants': async (params) =>
      getTopMerchants(getDb(), requireUserId(params), filterFrom(params), (params.limit as number) ?? 10),

    'analytics:recentTransactions': async (params) =>
      getRecentTransactions(getDb(), requireUserId(params), filterFrom(params), (params.limit as number) ?? 50),

    'analytics:accountBalance': async (params) =>
      getAccountBalance(getDb(), requireUserId(params), params.accountId as number, filterFrom(params)),

    'analytics:cardUtilization': async (params) =>
      getCardUtilization(getDb(), requireUserId(params), params.cardId as number),

    'analytics:uncategorized': async (params) =>
      getUncategorized(getDb(), requireUserId(params), (params.limit as number) ?? 100)
  }
}
