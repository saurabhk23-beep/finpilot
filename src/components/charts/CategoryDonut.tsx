import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { CategoryBreakdownItem } from '../../types'
import { formatINR } from '../../utils/format'
import { colorForCategory } from './palette'

/**
 * Expense breakdown donut. Clicking a slice calls onSelect with that category
 * (drill-down into sub-categories / transactions).
 */
export function CategoryDonut({
  data,
  onSelect
}: {
  data: CategoryBreakdownItem[]
  onSelect?: (item: CategoryBreakdownItem) => void
}) {
  const total = data.reduce((s, d) => s + d.total, 0)

  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-400">No expenses in this period.</div>
  }

  return (
    <div className="flex flex-col items-center gap-4 md:flex-row">
      <div className="relative h-64 w-64 flex-none">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={100}
              paddingAngle={1}
              onClick={(_, index) => onSelect?.(data[index])}
              cursor={onSelect ? 'pointer' : 'default'}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={colorForCategory(d.name)} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatINR(Number(value))}
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-slate-400">Total</span>
          <span className="text-lg font-semibold">{formatINR(total)}</span>
        </div>
      </div>

      <ul className="flex-1 space-y-1.5">
        {data.slice(0, 8).map((d) => (
          <li key={d.name}>
            <button
              type="button"
              onClick={() => onSelect?.(d)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-slate-50"
            >
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 flex-none rounded-sm" style={{ background: colorForCategory(d.name) }} />
                <span className="text-slate-700">{d.name}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-medium">{formatINR(d.total)}</span>
                <span className="w-10 text-right text-xs text-slate-400">
                  {total > 0 ? Math.round((d.total / total) * 100) : 0}%
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
