import { useCallback, useEffect, useMemo, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type {
  Category,
  CategoryBreakdownItem,
  MerchantTotal,
  MonthlyTrendPoint,
  RecentTransaction,
  Summary
} from '../../types'
import { useDashboardStore } from '../../stores/dashboardStore'
import { resolveRange } from '../../utils/dateRange'
import { Card } from '../../components/ui'
import { CategoryDonut } from '../../components/charts/CategoryDonut'
import { MonthlyTrend } from '../../components/charts/MonthlyTrend'
import { SummaryCards } from './SummaryCards'
import { TopMerchants } from './TopMerchants'
import { RecentTransactions } from './RecentTransactions'
import { AccountView } from './AccountView'
import { CategoryDrilldown } from './CategoryDrilldown'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold text-slate-700">{children}</h2>
}

export function SpendDashboard({ categories }: { categories: Category[] }) {
  const scope = useDashboardStore((s) => s.scope)
  // Subscribe to preset/customRange directly so the panels re-fetch when the range
  // changes (selecting the store's range() function wouldn't trigger a re-render).
  const preset = useDashboardStore((s) => s.preset)
  const customRange = useDashboardStore((s) => s.customRange)
  const range = useMemo(
    () => (preset === 'custom' && customRange ? customRange : resolveRange(preset)),
    [preset, customRange]
  )

  const [summary, setSummary] = useState<Summary | null>(null)
  const [breakdown, setBreakdown] = useState<CategoryBreakdownItem[]>([])
  const [trend, setTrend] = useState<MonthlyTrendPoint[]>([])
  const [merchants, setMerchants] = useState<MerchantTotal[]>([])
  const [recent, setRecent] = useState<RecentTransaction[]>([])
  const [drilldown, setDrilldown] = useState<CategoryBreakdownItem | null>(null)

  const args = { scope, dateFrom: range.dateFrom, dateTo: range.dateTo }

  const reload = useCallback(() => {
    ipc.analytics.summary(args).then(setSummary)
    ipc.analytics.categoryBreakdown(args).then(setBreakdown)
    ipc.analytics.monthlyTrend({ ...args, dateFrom: undefined, dateTo: undefined }).then(setTrend)
    ipc.analytics.topMerchants({ ...args, limit: 10 }).then(setMerchants)
    ipc.analytics.recentTransactions({ ...args, limit: 50 }).then(setRecent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, range.dateFrom, range.dateTo])

  useEffect(() => {
    reload()
  }, [reload])

  const goToSettings = useDashboardStore((s) => s.goToSettings)

  return (
    <div className="space-y-6">
      {summary && <SummaryCards summary={summary} onReviewUncategorized={() => goToSettings('review')} />}

      {scope.kind !== 'all' && <AccountView scope={scope} range={range} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>Spending by category</SectionTitle>
          <CategoryDonut data={breakdown} onSelect={setDrilldown} />
        </Card>
        <Card>
          <SectionTitle>Top merchants</SectionTitle>
          <TopMerchants merchants={merchants} />
        </Card>
      </div>

      <Card>
        <SectionTitle>Monthly trend</SectionTitle>
        <MonthlyTrend data={trend} />
      </Card>

      <Card>
        <SectionTitle>Recent transactions</SectionTitle>
        <RecentTransactions transactions={recent} categories={categories} onChanged={reload} />
      </Card>

      {drilldown && (
        <CategoryDrilldown
          item={drilldown}
          scope={scope}
          range={range}
          categories={categories}
          onClose={() => setDrilldown(null)}
          onChanged={reload}
        />
      )}
    </div>
  )
}
