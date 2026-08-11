import { listMFTransactions } from '../db/queries/mfTransactions'
import { listNavHistory } from '../db/queries/mfNav'
import { getMFScheme } from '../db/queries/mfSchemes'
import { listStockTransactions } from '../db/queries/stockTransactions'
import { listPriceHistory } from '../db/queries/stockPrices'
import { getStock } from '../db/queries/stocks'
import {
  getMFHoldings,
  getPortfolioOverview,
  getStockHoldings
} from '../services/portfolio'
import { getRefreshMeta, isMarketDataStale, refreshAll } from '../services/market-data'
import { type GetDb, type IpcHandlerMap, requireUserId } from './types'

export function createPortfolioHandlers(getDb: GetDb): IpcHandlerMap {
  return {
    'portfolio:overview': async (params) => {
      const userId = requireUserId(params)
      return {
        ...getPortfolioOverview(getDb(), userId),
        ...getRefreshMeta(getDb(), userId),
        stale: isMarketDataStale(getDb(), userId)
      }
    },

    'portfolio:mfHoldings': async (params) => getMFHoldings(getDb(), requireUserId(params)),

    'portfolio:stockHoldings': async (params) => getStockHoldings(getDb(), requireUserId(params)),

    // Row drill-down: a scheme's transactions + its NAV history for the chart.
    'portfolio:mfDetail': async (params) => {
      const userId = requireUserId(params)
      const schemeId = params.schemeId as number
      const scheme = getMFScheme(getDb(), userId, schemeId)
      if (!scheme) throw new Error('Scheme not found')
      return {
        scheme,
        transactions: listMFTransactions(getDb(), userId, schemeId),
        navHistory: listNavHistory(getDb(), scheme.scheme_code, params.dateFrom as string | undefined)
      }
    },

    'portfolio:stockDetail': async (params) => {
      const userId = requireUserId(params)
      const stockId = params.stockId as number
      const stock = getStock(getDb(), userId, stockId)
      if (!stock) throw new Error('Stock not found')
      return {
        stock,
        transactions: listStockTransactions(getDb(), userId, stockId),
        priceHistory: listPriceHistory(getDb(), stock.symbol, params.dateFrom as string | undefined)
      }
    },

    // Manual "Refresh Now" — fetches latest NAVs/prices, then returns fresh overview.
    'portfolio:refresh': async (params) => {
      const userId = requireUserId(params)
      const result = await refreshAll(getDb(), userId)
      return { ...result, ...getRefreshMeta(getDb(), userId) }
    }
  }
}
