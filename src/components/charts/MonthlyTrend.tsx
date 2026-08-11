import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthlyTrendPoint } from '../../types'
import { formatINR, formatINRCompact, formatMonth } from '../../utils/format'
import { colorForCategory } from './palette'

/** Monthly expense trend as a stacked bar chart, one stack segment per top-level category. */
export function MonthlyTrend({ data }: { data: MonthlyTrendPoint[] }) {
  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-400">Not enough data yet.</div>
  }

  // Union of all category names across months → one <Bar> per category.
  const categories = [...new Set(data.flatMap((d) => Object.keys(d.categories)))]

  const rows = data.map((d) => ({ month: d.month, ...d.categories }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="month" tickFormatter={(v) => formatMonth(String(v))} tick={{ fontSize: 12, fill: '#64748b' }} />
        <YAxis tickFormatter={(v) => formatINRCompact(Number(v))} tick={{ fontSize: 12, fill: '#64748b' }} width={56} />
        <Tooltip
          formatter={(value, name) => [formatINR(Number(value)), String(name)]}
          labelFormatter={(l) => formatMonth(String(l))}
          contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
        />
        {categories.map((cat) => (
          <Bar key={cat} dataKey={cat} stackId="spend" fill={colorForCategory(cat)} maxBarSize={48} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
