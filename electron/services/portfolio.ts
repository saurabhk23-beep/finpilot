import type Database from 'better-sqlite3-multiple-ciphers'
import { listMFSchemes } from '../db/queries/mfSchemes'
import { listMFTransactions } from '../db/queries/mfTransactions'
import { getRecentNavs } from '../db/queries/mfNav'
import { listStocks } from '../db/queries/stocks'
import { listStockTransactions } from '../db/queries/stockTransactions'
import { getRecentPrices } from '../db/queries/stockPrices'
import type { MFTransactionRow, StockTransactionRow } from '../db/types'
import { xirr, type CashFlow } from './xirr'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Common per-holding valuation figures shared by MF and stock holdings. */
export interface HoldingValuation {
  invested: number
  currentValue: number
  gainLoss: number
  gainLossPct: number
  xirrPct: number | null
  dayChange: number
  dayChangePct: number
}

export interface MFHolding extends HoldingValuation {
  schemeId: number
  schemeCode: string
  schemeName: string
  folio: string
  amcName: string | null
  units: number
  avgNav: number
  currentNav: number
  hasPrice: boolean
}

export interface StockHolding extends HoldingValuation {
  stockId: number
  symbol: string
  name: string | null
  exchange: 'NSE' | 'BSE' | null
  qty: number
  avgBuyPrice: number
  currentPrice: number
  hasPrice: boolean
}

export interface PortfolioOverview {
  totalValue: number
  totalInvested: number
  totalGainLoss: number
  totalGainLossPct: number
  overallXirrPct: number | null
  dayChange: number
  dayChangePct: number
}

const MF_BUY_TYPES = new Set(['sip', 'lumpsum', 'switch_in'])

function valuation(
  cashflows: CashFlow[],
  invested: number,
  currentValue: number,
  prevValue: number,
  asOf: string
): HoldingValuation {
  const gainLoss = currentValue - invested
  const gainLossPct = invested > 0 ? Math.round((gainLoss / invested) * 1000) / 10 : 0

  let xirrPct: number | null = null
  if (currentValue > 0) {
    const rate = xirr([...cashflows, { amount: currentValue, date: asOf }])
    xirrPct = rate === null ? null : Math.round(rate * 1000) / 10
  }

  const dayChange = currentValue - prevValue
  const dayChangePct = prevValue > 0 ? Math.round((dayChange / prevValue) * 1000) / 10 : 0

  return {
    invested: round2(invested),
    currentValue: round2(currentValue),
    gainLoss: round2(gainLoss),
    gainLossPct,
    xirrPct,
    dayChange: round2(dayChange),
    dayChangePct
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Computes the holding for one MF scheme from its transactions and latest/previous NAV. */
export function computeMFHolding(
  db: Database.Database,
  userId: number,
  scheme: { id: number; scheme_code: string; scheme_name: string; folio: string; amc_name: string | null },
  asOf: string
): MFHolding {
  const txns = listMFTransactions(db, userId, scheme.id)

  let units = 0
  let buyUnits = 0
  let buyAmount = 0
  const cashflows: CashFlow[] = []

  for (const t of txns as MFTransactionRow[]) {
    const isBuy = MF_BUY_TYPES.has(t.type)
    if (isBuy) {
      units += t.units
      buyUnits += t.units
      buyAmount += t.amount
      cashflows.push({ amount: -t.amount, date: t.date })
    } else {
      units -= t.units
      cashflows.push({ amount: t.amount, date: t.date })
    }
  }

  const avgNav = buyUnits > 0 ? buyAmount / buyUnits : 0
  const navs = getRecentNavs(db, scheme.scheme_code, 2)
  const hasPrice = navs.length > 0
  const currentNav = hasPrice ? navs[0].nav : avgNav
  const prevNav = navs.length > 1 ? navs[1].nav : currentNav

  const invested = units * avgNav
  const currentValue = units * currentNav
  const prevValue = units * prevNav

  return {
    schemeId: scheme.id,
    schemeCode: scheme.scheme_code,
    schemeName: scheme.scheme_name,
    folio: scheme.folio,
    amcName: scheme.amc_name,
    units: round2(units),
    avgNav: round2(avgNav),
    currentNav: round2(currentNav),
    hasPrice,
    ...valuation(cashflows, invested, currentValue, prevValue, asOf)
  }
}

/** Computes the holding for one stock from its trades and latest/previous price. */
export function computeStockHolding(
  db: Database.Database,
  userId: number,
  stock: { id: number; symbol: string; name: string | null; exchange: 'NSE' | 'BSE' | null },
  asOf: string
): StockHolding {
  const trades = listStockTransactions(db, userId, stock.id)

  let qty = 0
  let buyQty = 0
  let buyCost = 0
  const cashflows: CashFlow[] = []

  for (const t of trades as StockTransactionRow[]) {
    if (t.type === 'buy') {
      qty += t.qty
      buyQty += t.qty
      buyCost += t.qty * t.price
      cashflows.push({ amount: -(t.qty * t.price + t.charges), date: t.date })
    } else {
      qty -= t.qty
      cashflows.push({ amount: t.qty * t.price - t.charges, date: t.date })
    }
  }

  const avgBuyPrice = buyQty > 0 ? buyCost / buyQty : 0
  const prices = getRecentPrices(db, stock.symbol, 2)
  const hasPrice = prices.length > 0
  const currentPrice = hasPrice ? prices[0].close_price : avgBuyPrice
  const prevPrice = prices.length > 1 ? prices[1].close_price : currentPrice

  const invested = qty * avgBuyPrice
  const currentValue = qty * currentPrice
  const prevValue = qty * prevPrice

  return {
    stockId: stock.id,
    symbol: stock.symbol,
    name: stock.name,
    exchange: stock.exchange,
    qty: round2(qty),
    avgBuyPrice: round2(avgBuyPrice),
    currentPrice: round2(currentPrice),
    hasPrice,
    ...valuation(cashflows, invested, currentValue, prevValue, asOf)
  }
}

/** All MF holdings with a non-zero unit balance. */
export function getMFHoldings(db: Database.Database, userId: number, asOf = todayIso()): MFHolding[] {
  return listMFSchemes(db, userId)
    .map((s) => computeMFHolding(db, userId, s, asOf))
    .filter((h) => h.units > 0.0001)
}

/** All stock holdings with a non-zero quantity. */
export function getStockHoldings(db: Database.Database, userId: number, asOf = todayIso()): StockHolding[] {
  return listStocks(db, userId)
    .map((s) => computeStockHolding(db, userId, s, asOf))
    .filter((h) => h.qty > 0.0001)
}

/** Portfolio-wide totals across MF + stocks, with an overall XIRR over every cashflow. */
export function getPortfolioOverview(db: Database.Database, userId: number, asOf = todayIso()): PortfolioOverview {
  const mf = getMFHoldings(db, userId, asOf)
  const stocks = getStockHoldings(db, userId, asOf)
  const holdings = [...mf, ...stocks]

  const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0)
  const totalInvested = holdings.reduce((s, h) => s + h.invested, 0)
  const totalGainLoss = totalValue - totalInvested
  const dayChange = holdings.reduce((s, h) => s + h.dayChange, 0)
  const prevValue = totalValue - dayChange

  // Overall XIRR: every buy/sell cashflow plus today's total value as one inflow.
  const cashflows: CashFlow[] = []
  for (const s of listMFSchemes(db, userId)) {
    for (const t of listMFTransactions(db, userId, s.id) as MFTransactionRow[]) {
      cashflows.push({ amount: MF_BUY_TYPES.has(t.type) ? -t.amount : t.amount, date: t.date })
    }
  }
  for (const st of listStocks(db, userId)) {
    for (const t of listStockTransactions(db, userId, st.id) as StockTransactionRow[]) {
      cashflows.push({
        amount: t.type === 'buy' ? -(t.qty * t.price + t.charges) : t.qty * t.price - t.charges,
        date: t.date
      })
    }
  }
  let overallXirrPct: number | null = null
  if (totalValue > 0 && cashflows.length > 0) {
    const rate = xirr([...cashflows, { amount: totalValue, date: asOf }])
    overallXirrPct = rate === null ? null : Math.round(rate * 1000) / 10
  }

  return {
    totalValue: round2(totalValue),
    totalInvested: round2(totalInvested),
    totalGainLoss: round2(totalGainLoss),
    totalGainLossPct: totalInvested > 0 ? Math.round((totalGainLoss / totalInvested) * 1000) / 10 : 0,
    overallXirrPct,
    dayChange: round2(dayChange),
    dayChangePct: prevValue > 0 ? Math.round((dayChange / prevValue) * 1000) / 10 : 0
  }
}
