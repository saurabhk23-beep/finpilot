import type { Summary } from '../../types'
import { formatINR } from '../../utils/format'

function StatCard({
  label,
  value,
  tone,
  footer
}: {
  label: string
  value: string
  tone?: 'positive' | 'negative' | 'default'
  footer?: React.ReactNode
}) {
  const valueColor =
    tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-content-foreground'
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueColor}`}>{value}</p>
      {footer && <div className="mt-1 text-xs text-slate-400">{footer}</div>}
    </div>
  )
}

export function SummaryCards({
  summary,
  onReviewUncategorized
}: {
  summary: Summary
  onReviewUncategorized?: () => void
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <StatCard label="Income" value={formatINR(summary.income)} tone="positive" />
      <StatCard label="Expenses" value={formatINR(summary.expenses)} tone="negative" footer="excl. transfers & investments" />
      <StatCard
        label="Net Savings"
        value={formatINR(summary.netSavings)}
        tone={summary.netSavings >= 0 ? 'positive' : 'negative'}
      />
      <StatCard label="Savings Rate" value={`${summary.savingsRatePct}%`} />
      <StatCard
        label="Uncategorized"
        value={String(summary.uncategorizedCount)}
        footer={
          summary.uncategorizedCount > 0 && onReviewUncategorized ? (
            <button type="button" onClick={onReviewUncategorized} className="text-primary hover:underline">
              Review →
            </button>
          ) : (
            'all set'
          )
        }
      />
    </div>
  )
}
