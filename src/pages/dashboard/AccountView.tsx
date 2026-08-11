import { useEffect, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ipc } from '../../lib/ipc'
import type { AccountBalance, CardUtilization, Scope } from '../../types'
import type { DateRange } from '../../utils/dateRange'
import { formatINR, formatINRCompact, formatDate, formatMonth } from '../../utils/format'

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  const color = tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : ''
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
    </div>
  )
}

function BalanceView({ scope, range }: { scope: Extract<Scope, { kind: 'account' }>; range: DateRange }) {
  const [balance, setBalance] = useState<AccountBalance | null>(null)

  useEffect(() => {
    ipc.analytics
      .accountBalance({ scope, accountId: scope.id, dateFrom: range.dateFrom, dateTo: range.dateTo })
      .then(setBalance)
  }, [scope.id, range.dateFrom, range.dateTo])

  if (!balance) return null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Opening Balance" value={formatINR(balance.opening)} />
        <Stat
          label="Closing Balance"
          value={formatINR(balance.closing)}
          tone={balance.closing >= balance.opening ? 'positive' : 'negative'}
        />
        <Stat
          label="Change"
          value={formatINR(balance.closing - balance.opening)}
          tone={balance.closing - balance.opening >= 0 ? 'positive' : 'negative'}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="mb-3 text-sm font-medium text-slate-700">Daily balance</p>
        {balance.daily.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-slate-400">No activity in this period.</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={balance.daily} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={(v) => formatMonth(String(v))} tick={{ fontSize: 12, fill: '#64748b' }} minTickGap={40} />
              <YAxis tickFormatter={(v) => formatINRCompact(Number(v))} tick={{ fontSize: 12, fill: '#64748b' }} width={56} />
              <Tooltip
                formatter={(v) => formatINR(Number(v))}
                labelFormatter={(l) => formatDate(String(l))}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Area type="monotone" dataKey="balance" stroke="#2563eb" strokeWidth={2} fill="url(#bal)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function UtilizationGauge({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(pct, 100))
  const tone = clamped >= 80 ? '#dc2626' : clamped >= 50 ? '#f59e0b' : '#16a34a'
  const r = 52
  const circ = Math.PI * r // half circle
  return (
    <div className="relative flex h-32 w-56 items-end justify-center">
      <svg viewBox="0 0 140 78" className="w-full">
        <path d="M 12 70 A 52 52 0 0 1 128 70" fill="none" stroke="#e2e8f0" strokeWidth={12} strokeLinecap="round" />
        <path
          d="M 12 70 A 52 52 0 0 1 128 70"
          fill="none"
          stroke={tone}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * circ} ${circ}`}
        />
      </svg>
      <div className="absolute bottom-0 flex flex-col items-center">
        <span className="text-2xl font-semibold" style={{ color: tone }}>
          {clamped.toFixed(0)}%
        </span>
        <span className="text-xs text-slate-400">utilization</span>
      </div>
    </div>
  )
}

function CardView({ cardId }: { cardId: number }) {
  const [util, setUtil] = useState<CardUtilization | null>(null)

  useEffect(() => {
    ipc.analytics.cardUtilization({ cardId }).then(setUtil)
  }, [cardId])

  if (!util) return null

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Stat label="Credit Limit" value={formatINR(util.limit)} />
      <Stat label="Outstanding" value={formatINR(util.outstanding)} tone="negative" />
      <Stat label="Available" value={formatINR(util.available)} tone="positive" />
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm md:col-span-3">
        <div className="flex items-center justify-center">
          <UtilizationGauge pct={util.utilizationPct} />
        </div>
      </div>
    </div>
  )
}

/** Renders the extra account/card-specific panels shown when a single account or card is selected. */
export function AccountView({ scope, range }: { scope: Scope; range: DateRange }) {
  if (scope.kind === 'account') return <BalanceView scope={scope} range={range} />
  if (scope.kind === 'card') return <CardView cardId={scope.id} />
  return null
}
