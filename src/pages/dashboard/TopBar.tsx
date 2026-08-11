import type { Account, CreditCard, Scope } from '../../types'
import { RANGE_LABELS, type TimeRangePreset } from '../../utils/dateRange'
import { useDashboardStore } from '../../stores/dashboardStore'

const PRESETS: TimeRangePreset[] = ['thisMonth', 'lastMonth', 'last3m', 'last6m', 'ytd']

function scopeValue(scope: Scope): string {
  if (scope.kind === 'all') return 'all'
  return `${scope.kind}:${scope.id}`
}

export function TopBar({ accounts, cards }: { accounts: Account[]; cards: CreditCard[] }) {
  const scope = useDashboardStore((s) => s.scope)
  const setScope = useDashboardStore((s) => s.setScope)
  const preset = useDashboardStore((s) => s.preset)
  const setPreset = useDashboardStore((s) => s.setPreset)

  function onScopeChange(value: string) {
    if (value === 'all') return setScope({ kind: 'all' })
    const [kind, id] = value.split(':')
    setScope({ kind: kind as 'account' | 'card', id: Number(id) })
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-8 py-3">
      <select
        value={scopeValue(scope)}
        onChange={(e) => onScopeChange(e.target.value)}
        className="rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium outline-none focus:border-primary"
      >
        <option value="all">All Combined</option>
        {accounts.length > 0 && (
          <optgroup label="Accounts">
            {accounts.map((a) => (
              <option key={`a${a.id}`} value={`account:${a.id}`}>
                {a.nickname}
              </option>
            ))}
          </optgroup>
        )}
        {cards.length > 0 && (
          <optgroup label="Credit Cards">
            {cards.map((c) => (
              <option key={`c${c.id}`} value={`card:${c.id}`}>
                {c.nickname}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPreset(p)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              preset === p ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {RANGE_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
  )
}
