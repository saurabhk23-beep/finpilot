import type { MerchantTotal } from '../../types'
import { formatINR } from '../../utils/format'

export function TopMerchants({ merchants }: { merchants: MerchantTotal[] }) {
  if (merchants.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-slate-400">No merchant spend yet.</div>
  }
  const max = merchants[0].total

  return (
    <ol className="space-y-2">
      {merchants.map((m, i) => (
        <li key={m.merchant} className="flex items-center gap-3">
          <span className="w-4 flex-none text-xs text-slate-400">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="truncate text-sm text-slate-700" title={m.merchant}>
                {m.merchant}
              </span>
              <span className="ml-2 flex-none text-sm font-medium">{formatINR(m.total)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(m.total / max) * 100}%` }} />
            </div>
          </div>
          <span className="w-10 flex-none text-right text-xs text-slate-400">{m.count}×</span>
        </li>
      ))}
    </ol>
  )
}
