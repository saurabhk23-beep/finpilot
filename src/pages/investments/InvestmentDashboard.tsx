import { useCallback, useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { MFHolding, PortfolioOverview, StockHolding } from '../../types'
import { Button, Card } from '../../components/ui'
import { formatDate } from '../../utils/format'
import { PortfolioCards } from './PortfolioCards'
import { MFHoldingsTable, StockHoldingsTable } from './HoldingsTable'
import { MFDetailPanel, StockDetailPanel } from './HoldingDetail'

type Tab = 'mf' | 'stocks'

export function InvestmentDashboard() {
  const [overview, setOverview] = useState<PortfolioOverview | null>(null)
  const [mf, setMf] = useState<MFHolding[]>([])
  const [stocks, setStocks] = useState<StockHolding[]>([])
  const [tab, setTab] = useState<Tab>('mf')
  const [selectedMf, setSelectedMf] = useState<number | null>(null)
  const [selectedStock, setSelectedStock] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(() => {
    ipc.portfolio.overview().then(setOverview)
    ipc.portfolio.mfHoldings().then(setMf)
    ipc.portfolio.stockHoldings().then(setStocks)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // "Auto on app open": if prices are stale the first time investments are viewed, refresh once.
  useEffect(() => {
    if (overview?.stale && !refreshing) {
      void refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview?.stale])

  async function refresh() {
    setRefreshing(true)
    try {
      await ipc.portfolio.refresh()
      load()
    } finally {
      setRefreshing(false)
    }
  }

  const hasHoldings = mf.length > 0 || stocks.length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400">
          {overview?.lastUpdated ? `Prices as of ${formatDate(overview.lastUpdated)}` : 'No price data yet'}
          {overview?.stale && <span className="ml-2 text-amber-600">• stale</span>}
        </div>
        <Button variant="secondary" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh Now'}
        </Button>
      </div>

      {overview && <PortfolioCards o={overview} />}

      {!hasHoldings ? (
        <Card>
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            No investments yet. Import a CAS PDF or Groww export from onboarding, or add holdings in Settings.
          </div>
        </Card>
      ) : (
        <Card>
          <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
            {(['mf', 'stocks'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  tab === t ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'mf' ? `Mutual Funds (${mf.length})` : `Stocks (${stocks.length})`}
              </button>
            ))}
          </div>

          {tab === 'mf' ? (
            <MFHoldingsTable holdings={mf} onSelect={(h) => setSelectedMf(h.schemeId)} />
          ) : (
            <StockHoldingsTable holdings={stocks} onSelect={(h) => setSelectedStock(h.stockId)} />
          )}
        </Card>
      )}

      {selectedMf != null && <MFDetailPanel schemeId={selectedMf} onClose={() => setSelectedMf(null)} />}
      {selectedStock != null && <StockDetailPanel stockId={selectedStock} onClose={() => setSelectedStock(null)} />}
    </div>
  )
}
