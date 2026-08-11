import { useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { Category, RecentTransaction } from '../../types'
import { formatINR, formatDate } from '../../utils/format'
import { CategorySelect } from '../../components/CategorySelect'
import { colorForCategory } from '../../components/charts/palette'

function RemarksCell({ txn, onSaved }: { txn: RecentTransaction; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(txn.remarks ?? '')

  async function save() {
    setEditing(false)
    if (value !== (txn.remarks ?? '')) {
      await ipc.transactions.update(txn.id, { remarks: value })
      onSaved()
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder="Add a note…"
        className="w-full rounded border border-border px-1.5 py-0.5 text-xs outline-none focus:border-primary"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-left text-xs text-slate-400 hover:text-slate-600"
    >
      {txn.remarks || '+ note'}
    </button>
  )
}

export function RecentTransactions({
  transactions,
  categories,
  onChanged
}: {
  transactions: RecentTransaction[]
  categories: Category[]
  onChanged: () => void
}) {
  async function recategorize(txn: RecentTransaction, categoryId: number) {
    await ipc.transactions.recategorize({ transactionId: txn.id, categoryId })
    onChanged()
  }

  if (transactions.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-slate-400">No transactions in this period.</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Description</th>
            <th className="py-2 pr-3 font-medium">Category</th>
            <th className="py-2 pr-3 font-medium">Account</th>
            <th className="py-2 pr-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => {
            const catName = t.subCategoryName ?? t.categoryName
            return (
              <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                <td className="whitespace-nowrap py-2 pr-3 text-xs text-slate-500">{formatDate(t.date)}</td>
                <td className="max-w-xs py-2 pr-3">
                  <div className="truncate text-slate-700" title={t.narration}>
                    {t.narration}
                  </div>
                  <RemarksCell txn={t} onSaved={onChanged} />
                </td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    {catName && (
                      <span
                        className="h-2 w-2 flex-none rounded-full"
                        style={{ background: colorForCategory(t.categoryName ?? 'Uncategorized') }}
                      />
                    )}
                    <CategorySelect
                      categories={categories}
                      value={t.subCategoryId ?? t.categoryId}
                      onChange={(id) => recategorize(t, id)}
                    />
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t.accountLabel}</span>
                  {(t.isTransfer === 1 || t.isCcPayment === 1) && (
                    <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                      {t.isCcPayment === 1 ? 'CC pay' : 'transfer'}
                    </span>
                  )}
                </td>
                <td
                  className={`whitespace-nowrap py-2 pr-3 text-right font-medium ${
                    t.type === 'credit' ? 'text-positive' : 'text-content-foreground'
                  }`}
                >
                  {t.type === 'credit' ? '+' : '−'}
                  {formatINR(t.amount)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
