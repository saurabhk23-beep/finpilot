import { useCallback, useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { Category, RecentTransaction } from '../../types'
import { Button, Card } from '../../components/ui'
import { CategorySelect } from '../../components/CategorySelect'
import { formatINR, formatDate } from '../../utils/format'
import { SettingsSectionShell } from './SettingsSectionShell'

export function UncategorizedReview() {
  const [txns, setTxns] = useState<RecentTransaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const load = useCallback(() => {
    ipc.analytics.uncategorized({ limit: 200 }).then(setTxns)
  }, [])

  useEffect(() => {
    ipc.categories.list().then(setCategories)
    load()
  }, [load])

  async function categorize(t: RecentTransaction, categoryId: number) {
    // Learns a rule too, so similar future transactions auto-categorize.
    await ipc.transactions.recategorize({ transactionId: t.id, categoryId })
    setTxns((prev) => prev.filter((x) => x.id !== t.id))
  }

  async function autoRun() {
    setBusy(true)
    setStatus(null)
    try {
      const r = await ipc.categorization.run()
      setStatus(`Auto-categorized ${r.updated} transaction${r.updated === 1 ? '' : 's'}.`)
      load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSectionShell
      title="Uncategorized review"
      description="Assign a category to each transaction the engine couldn't place. Your choices are remembered as rules."
    >
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={autoRun} disabled={busy}>
          {busy ? 'Running…' : 'Auto-categorize'}
        </Button>
        {status && <span className="text-sm text-slate-500">{status}</span>}
        <span className="ml-auto text-sm text-slate-400">{txns.length} to review</span>
      </div>

      {txns.length === 0 ? (
        <Card>
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">
            Nothing to review — everything's categorized. 🎉
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Description</th>
                  <th className="py-2 pr-3 font-medium">Account</th>
                  <th className="py-2 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2 pr-3 font-medium">Categorize as</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id} className="border-b border-slate-50">
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-slate-500">{formatDate(t.date)}</td>
                    <td className="max-w-xs truncate py-2 pr-3 text-slate-700" title={t.narration}>{t.narration}</td>
                    <td className="py-2 pr-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t.accountLabel}</span>
                    </td>
                    <td className={`whitespace-nowrap py-2 pr-3 text-right font-medium ${t.type === 'credit' ? 'text-positive' : ''}`}>
                      {t.type === 'credit' ? '+' : '−'}{formatINR(t.amount)}
                    </td>
                    <td className="py-2 pr-3">
                      <CategorySelect categories={categories} value={null} onChange={(id) => categorize(t, id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </SettingsSectionShell>
  )
}
