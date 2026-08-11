import { useEffect, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ipc } from '../../lib/ipc'
import type { MFDetail, StockDetail } from '../../types'
import { formatINR, formatINRCompact, formatDate, formatMonth } from '../../utils/format'

function PriceChart({ data }: { data: { date: string; value: number }[] }) {
  if (data.length < 2) {
    return <div className="flex h-48 items-center justify-center text-sm text-slate-400">No price history yet — refresh to fetch.</div>
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="date" tickFormatter={(v) => formatMonth(String(v))} tick={{ fontSize: 12, fill: '#64748b' }} minTickGap={40} />
        <YAxis tickFormatter={(v) => formatINRCompact(Number(v))} tick={{ fontSize: 12, fill: '#64748b' }} width={56} domain={['auto', 'auto']} />
        <Tooltip
          formatter={(v) => formatINR(Number(v), { decimals: true })}
          labelFormatter={(l) => formatDate(String(l))}
          contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
        />
        <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} fill="url(#pv)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function Panel({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-content p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const cell = 'py-1.5 px-2 text-sm'

export function MFDetailPanel({ schemeId, onClose }: { schemeId: number; onClose: () => void }) {
  const [detail, setDetail] = useState<MFDetail | null>(null)
  useEffect(() => {
    ipc.portfolio.mfDetail(schemeId).then(setDetail)
  }, [schemeId])
  if (!detail) return null

  const chartData = detail.navHistory.map((n) => ({ date: n.date, value: n.nav }))
  return (
    <Panel title={detail.scheme.scheme_name} onClose={onClose}>
      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-sm font-medium text-slate-700">NAV history</p>
        <PriceChart data={chartData} />
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-sm font-medium text-slate-700">Transactions</p>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-slate-400">
              <th className={cell}>Date</th><th className={cell}>Type</th>
              <th className={`${cell} text-right`}>Amount</th><th className={`${cell} text-right`}>Units</th><th className={`${cell} text-right`}>NAV</th>
            </tr>
          </thead>
          <tbody>
            {detail.transactions.map((t) => (
              <tr key={t.id} className="border-b border-slate-50">
                <td className={cell}>{formatDate(t.date)}</td>
                <td className={`${cell} capitalize`}>{t.type.replace('_', ' ')}</td>
                <td className={`${cell} text-right`}>{formatINR(t.amount)}</td>
                <td className={`${cell} text-right`}>{t.units}</td>
                <td className={`${cell} text-right`}>{formatINR(t.nav, { decimals: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

export function StockDetailPanel({ stockId, onClose }: { stockId: number; onClose: () => void }) {
  const [detail, setDetail] = useState<StockDetail | null>(null)
  useEffect(() => {
    ipc.portfolio.stockDetail(stockId).then(setDetail)
  }, [stockId])
  if (!detail) return null

  const chartData = detail.priceHistory.map((p) => ({ date: p.date, value: p.close_price }))
  return (
    <Panel title={detail.stock.symbol} onClose={onClose}>
      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-sm font-medium text-slate-700">Price history</p>
        <PriceChart data={chartData} />
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-sm font-medium text-slate-700">Trades</p>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-slate-400">
              <th className={cell}>Date</th><th className={cell}>Type</th>
              <th className={`${cell} text-right`}>Qty</th><th className={`${cell} text-right`}>Price</th><th className={`${cell} text-right`}>Charges</th>
            </tr>
          </thead>
          <tbody>
            {detail.transactions.map((t) => (
              <tr key={t.id} className="border-b border-slate-50">
                <td className={cell}>{formatDate(t.date)}</td>
                <td className={`${cell} capitalize`}>{t.type}</td>
                <td className={`${cell} text-right`}>{t.qty}</td>
                <td className={`${cell} text-right`}>{formatINR(t.price, { decimals: true })}</td>
                <td className={`${cell} text-right`}>{formatINR(t.charges, { decimals: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
