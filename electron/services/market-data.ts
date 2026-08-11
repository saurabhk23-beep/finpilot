import type Database from 'better-sqlite3-multiple-ciphers'
import { parseIndianDate } from '../parsers/amount'
import { listMFSchemes } from '../db/queries/mfSchemes'
import { getLatestNav, upsertNav } from '../db/queries/mfNav'
import { listStocks } from '../db/queries/stocks'
import { getLatestPrice, upsertPrice } from '../db/queries/stockPrices'

/** Minimal fetch surface so tests can inject canned responses. Defaults to global fetch. */
export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

const defaultFetch: FetchFn = (url) => fetch(url)

export interface NavPoint {
  date: string // ISO
  nav: number
}

export interface PricePoint {
  date: string // ISO
  close: number
}

/** Fetches a scheme's NAV history from mfapi.in (free, no auth). Returns newest-first ISO points. */
export async function fetchMFNavHistory(schemeCode: string, fetchFn: FetchFn = defaultFetch): Promise<NavPoint[]> {
  const res = await fetchFn(`https://api.mfapi.in/mf/${encodeURIComponent(schemeCode)}`)
  if (!res.ok) throw new Error(`mfapi.in returned ${res.status} for scheme ${schemeCode}`)
  const body = (await res.json()) as { data?: { date: string; nav: string }[] }
  const rows = body.data ?? []
  const points: NavPoint[] = []
  for (const r of rows) {
    const iso = parseIndianDate(r.date) // mfapi dates are DD-MM-YYYY
    const nav = Number(r.nav)
    if (iso && Number.isFinite(nav) && nav > 0) points.push({ date: iso, nav })
  }
  return points
}

/** Fetches a stock's recent daily closes from Yahoo Finance. NSE → .NS, BSE → .BO. */
export async function fetchStockPriceHistory(
  symbol: string,
  exchange: 'NSE' | 'BSE' | null,
  fetchFn: FetchFn = defaultFetch
): Promise<PricePoint[]> {
  const suffix = exchange === 'BSE' ? '.BO' : '.NS'
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}${suffix}?range=1mo&interval=1d`
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`Yahoo returned ${res.status} for ${symbol}`)
  const body = (await res.json()) as {
    chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] }
  }
  const result = body.chart?.result?.[0]
  const timestamps = result?.timestamp ?? []
  const closes = result?.indicators?.quote?.[0]?.close ?? []
  const points: PricePoint[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i]
    if (close == null || !Number.isFinite(close)) continue
    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10)
    points.push({ date, close })
  }
  return points
}

export interface RefreshResult {
  mfUpdated: number
  stocksUpdated: number
  errors: string[]
}

/** Refreshes NAV + price caches for everything the user holds. Per-item failures are collected, not thrown. */
export async function refreshAll(
  db: Database.Database,
  userId: number,
  fetchFn: FetchFn = defaultFetch
): Promise<RefreshResult> {
  const errors: string[] = []
  let mfUpdated = 0
  let stocksUpdated = 0

  const seenSchemes = new Set<string>()
  for (const scheme of listMFSchemes(db, userId)) {
    if (seenSchemes.has(scheme.scheme_code)) continue
    seenSchemes.add(scheme.scheme_code)
    try {
      const points = await fetchMFNavHistory(scheme.scheme_code, fetchFn)
      const insert = db.transaction(() => {
        for (const p of points) upsertNav(db, scheme.scheme_code, p.date, p.nav)
      })
      insert()
      if (points.length > 0) mfUpdated++
    } catch (e) {
      errors.push(`MF ${scheme.scheme_code}: ${(e as Error).message}`)
    }
  }

  const seenSymbols = new Set<string>()
  for (const stock of listStocks(db, userId)) {
    if (seenSymbols.has(stock.symbol)) continue
    seenSymbols.add(stock.symbol)
    try {
      const points = await fetchStockPriceHistory(stock.symbol, stock.exchange, fetchFn)
      const insert = db.transaction(() => {
        for (const p of points) upsertPrice(db, stock.symbol, p.date, p.close)
      })
      insert()
      if (points.length > 0) stocksUpdated++
    } catch (e) {
      errors.push(`Stock ${stock.symbol}: ${(e as Error).message}`)
    }
  }

  return { mfUpdated, stocksUpdated, errors }
}

/** True if any held scheme/stock has no cached price, or its latest price predates today (IST). */
export function isMarketDataStale(db: Database.Database, userId: number, today = new Date().toISOString().slice(0, 10)): boolean {
  for (const scheme of listMFSchemes(db, userId)) {
    const nav = getLatestNav(db, scheme.scheme_code)
    if (!nav || nav.date < today) return true
  }
  for (const stock of listStocks(db, userId)) {
    const price = getLatestPrice(db, stock.symbol)
    if (!price || price.date < today) return true
  }
  return false
}

export interface RefreshMeta {
  /** Latest date across all cached NAVs/prices, or null if none. */
  lastUpdated: string | null
}

export function getRefreshMeta(db: Database.Database, userId: number): RefreshMeta {
  let latest: string | null = null
  for (const scheme of listMFSchemes(db, userId)) {
    const nav = getLatestNav(db, scheme.scheme_code)
    if (nav && (!latest || nav.date > latest)) latest = nav.date
  }
  for (const stock of listStocks(db, userId)) {
    const price = getLatestPrice(db, stock.symbol)
    if (price && (!latest || price.date > latest)) latest = price.date
  }
  return { lastUpdated: latest }
}
