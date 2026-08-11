import type { PortfolioOverview } from '../../types'
import { formatINR } from '../../utils/format'

function signClass(n: number): string {
  return n > 0 ? 'text-positive' : n < 0 ? 'text-negative' : 'text-content-foreground'
}

function Card({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs">{sub}</p>}
    </div>
  )
}

export function PortfolioCards({ o }: { o: PortfolioOverview }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <Card label="Portfolio Value" value={formatINR(o.totalValue)} />
      <Card label="Invested" value={formatINR(o.totalInvested)} />
      <Card
        label="Gain / Loss"
        value={<span className={signClass(o.totalGainLoss)}>{formatINR(o.totalGainLoss)}</span>}
        sub={<span className={signClass(o.totalGainLoss)}>{o.totalGainLossPct >= 0 ? '+' : ''}{o.totalGainLossPct}%</span>}
      />
      <Card
        label="Overall XIRR"
        value={
          <span className={o.overallXirrPct != null ? signClass(o.overallXirrPct) : ''}>
            {o.overallXirrPct != null ? `${o.overallXirrPct}%` : '—'}
          </span>
        }
      />
      <Card
        label="Day Change"
        value={<span className={signClass(o.dayChange)}>{formatINR(o.dayChange)}</span>}
        sub={<span className={signClass(o.dayChange)}>{o.dayChangePct >= 0 ? '+' : ''}{o.dayChangePct}%</span>}
      />
    </div>
  )
}
