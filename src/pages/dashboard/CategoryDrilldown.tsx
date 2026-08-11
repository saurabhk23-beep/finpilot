import { useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { Category, CategoryBreakdownItem, RecentTransaction, Scope } from '../../types'
import type { DateRange } from '../../utils/dateRange'
import { formatINR } from '../../utils/format'
import { colorForCategory } from '../../components/charts/palette'
import { RecentTransactions } from './RecentTransactions'

/**
 * Slide-over panel for one category: total, sub-category split, and the
 * transactions in it (re-categorizable inline). Opened by clicking a donut slice.
 */
export function CategoryDrilldown({
  item,
  scope,
  range,
  categories,
  onClose,
  onChanged
}: {
  item: CategoryBreakdownItem
  scope: Scope
  range: DateRange
  categories: Category[]
  onClose: () => void
  onChanged: () => void
}) {
  const [txns, setTxns] = useState<RecentTransaction[]>([])

  useEffect(() => {
    // Pull the period's transactions and filter to this category client-side.
    ipc.analytics
      .recentTransactions({ scope, dateFrom: range.dateFrom, dateTo: range.dateTo, limit: 500 })
      .then((all) => setTxns(all.filter((t) => (t.categoryId ?? null) === item.categoryId && t.type === 'debit')))
  }, [item.categoryId, scope, range.dateFrom, range.dateTo])

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-content p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ background: colorForCategory(item.name) }} />
              <h2 className="text-lg font-semibold">{item.name}</h2>
            </div>
            <p className="mt-1 text-2xl font-semibold">{formatINR(item.total)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        </div>

        {item.subcategories.length > 1 && (
          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">Sub-categories</p>
            <ul className="space-y-2">
              {item.subcategories.map((s) => (
                <li key={s.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{s.name}</span>
                    <span className="font-medium">{formatINR(s.total)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${item.total > 0 ? (s.total / item.total) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">Transactions</p>
          <RecentTransactions
            transactions={txns}
            categories={categories}
            onChanged={() => {
              onChanged()
              onClose()
            }}
          />
        </div>
      </div>
    </div>
  )
}
