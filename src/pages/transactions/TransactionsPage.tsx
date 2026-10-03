import { useEffect, useMemo, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { Account, Category, CreditCard, ImportLog, RecentTransaction, Scope } from '../../types'
import { Button, Card, Input, Select } from '../../components/ui'
import { RecentTransactions } from '../dashboard/RecentTransactions'
import { StatementImport, type ImportTarget } from '../../components/StatementImport'
import { formatDate } from '../../utils/format'
import { ipcErrorMessage } from '../../utils/ipcError'
import { resolveRange, type TimeRangePreset } from '../../utils/dateRange'

type RangeChoice = TimeRangePreset | 'all'

const RANGE_OPTIONS: { value: RangeChoice; label: string }[] = [
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'last3m', label: 'Last 3 Months' },
  { value: 'last6m', label: 'Last 6 Months' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'all', label: 'All Time' }
]

function rangeFor(choice: RangeChoice) {
  if (choice === 'all') return { dateFrom: '2000-01-01', dateTo: new Date().toISOString().slice(0, 10) }
  return resolveRange(choice)
}

export function TransactionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [txns, setTxns] = useState<RecentTransaction[]>([])

  const [scopeKey, setScopeKey] = useState('all')
  const [rangeChoice, setRangeChoice] = useState<RangeChoice>('last6m')
  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importTargetKey, setImportTargetKey] = useState('cash')
  const [imports, setImports] = useState<ImportLog[]>([])
  const [deleting, setDeleting] = useState<number | null>(null)
  const [showAllImports, setShowAllImports] = useState(false)

  async function refreshImports() {
    setImports(await ipc.import.list())
  }

  useEffect(() => {
    ipc.accounts.list().then(setAccounts)
    ipc.creditCards.list().then(setCards)
    ipc.categories.list().then(setCategories)
    refreshImports()
  }, [])

  const accountLabel = (id: number | null) =>
    id == null ? '' : (accounts.find((a) => a.id === id)?.nickname ?? `Account ${id}`)

  async function deleteImport(log: ImportLog) {
    const ok = window.confirm(
      `Delete the import "${log.file_name}" and the ${log.txn_count} transaction(s) it added? This cannot be undone.`
    )
    if (!ok) return
    setDeleting(log.id)
    try {
      await ipc.import.remove(log.id)
      await Promise.all([refreshImports(), refresh()])
    } catch (e) {
      window.alert(ipcErrorMessage(e, 'Could not delete that import.'))
    } finally {
      setDeleting(null)
    }
  }

  const scope: Scope = useMemo(() => {
    if (scopeKey === 'all') return { kind: 'all' }
    const [kind, id] = scopeKey.split(':')
    return { kind: kind as 'account' | 'card', id: Number(id) }
  }, [scopeKey])

  const range = rangeFor(rangeChoice)

  async function refresh() {
    const rows = await ipc.analytics.recentTransactions({ scope, dateFrom: range.dateFrom, dateTo: range.dateTo, limit: 500 })
    setTxns(rows)
  }

  // Refetch whenever scope or range changes.
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, rangeChoice])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return txns
    return txns.filter(
      (t) => t.narration.toLowerCase().includes(q) || (t.remarks ?? '').toLowerCase().includes(q)
    )
  }, [txns, search])

  const nonCashAccounts = accounts.filter((a) => a.type !== 'cash')

  const importTarget: ImportTarget = useMemo(() => {
    if (importTargetKey === 'cash') return { kind: 'cash' }
    const [kind, idStr] = importTargetKey.split(':')
    const id = Number(idStr)
    if (kind === 'card') {
      const card = cards.find((c) => c.id === id)
      return { kind: 'card', cardId: id, label: card?.nickname ?? 'Card' }
    }
    const acc = nonCashAccounts.find((a) => a.id === id)
    return { kind: 'account', accountId: id, label: acc?.nickname ?? 'Account' }
  }, [importTargetKey, nonCashAccounts, cards])

  // Bank/issuer name of the chosen target, so the PDF importer can skip the bank prompt.
  const importBankHint = useMemo(() => {
    if (importTargetKey === 'cash') return undefined
    const [kind, idStr] = importTargetKey.split(':')
    const id = Number(idStr)
    return kind === 'card' ? cards.find((c) => c.id === id)?.issuer : nonCashAccounts.find((a) => a.id === id)?.bank
  }, [importTargetKey, nonCashAccounts, cards])

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <Button type="button" onClick={() => setImportOpen((v) => !v)}>
          {importOpen ? 'Hide import' : 'Import statement'}
        </Button>
      </div>

      {importOpen && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm text-slate-500">Import into:</span>
            <Select value={importTargetKey} onChange={(e) => setImportTargetKey(e.target.value)} className="w-56">
              <option value="cash">Cash</option>
              {nonCashAccounts.map((a) => (
                <option key={`a${a.id}`} value={`account:${a.id}`}>
                  {a.nickname}
                </option>
              ))}
              {cards.map((c) => (
                <option key={`c${c.id}`} value={`card:${c.id}`}>
                  {c.nickname} (card)
                </option>
              ))}
            </Select>
          </div>
          <StatementImport
            key={importTargetKey}
            target={importTarget}
            bankHint={importBankHint}
            onImported={() => {
              refresh()
              refreshImports()
            }}
            onClose={() => setImportOpen(false)}
          />
        </div>
      )}

      {/* Always visible when imports exist, so a wrongly-parsed import can be undone. */}
      {imports.length > 0 && (
        <Card className="mb-4">
          <p className="mb-2 text-sm font-medium text-slate-700">Imported files ({imports.length})</p>
          <p className="mb-3 text-xs text-slate-400">
            Delete an import to remove it and the transactions it added — e.g. to re-import a file that
            parsed incorrectly (a file can't be re-imported until its earlier import is deleted).
          </p>
          <ul className="space-y-1">
            {(showAllImports ? imports : imports.slice(0, 5)).map((log) => (
              <li key={log.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-slate-600" title={log.file_name}>
                  {log.file_name}
                </span>
                <span className="mx-3 flex-none text-slate-400">
                  {log.txn_count} txns{accountLabel(log.account_id) ? ` · ${accountLabel(log.account_id)}` : ''} ·{' '}
                  {formatDate(log.import_date.slice(0, 10))}
                </span>
                <button
                  type="button"
                  onClick={() => deleteImport(log)}
                  disabled={deleting === log.id}
                  className="flex-none text-negative hover:underline disabled:opacity-50"
                >
                  {deleting === log.id ? 'Deleting…' : 'Delete'}
                </button>
              </li>
            ))}
          </ul>
          {imports.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllImports((v) => !v)}
              className="mt-2 text-xs text-primary hover:underline"
            >
              {showAllImports ? 'Show less' : `View more (${imports.length - 5} more)`}
            </button>
          )}
        </Card>
      )}

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={scopeKey} onChange={(e) => setScopeKey(e.target.value)} className="w-48">
            <option value="all">All accounts &amp; cards</option>
            {nonCashAccounts.map((a) => (
              <option key={`a${a.id}`} value={`account:${a.id}`}>
                {a.nickname}
              </option>
            ))}
            {accounts
              .filter((a) => a.type === 'cash')
              .map((a) => (
                <option key={`a${a.id}`} value={`account:${a.id}`}>
                  {a.nickname}
                </option>
              ))}
            {cards.map((c) => (
              <option key={`c${c.id}`} value={`card:${c.id}`}>
                {c.nickname}
              </option>
            ))}
          </Select>
          <Select value={rangeChoice} onChange={(e) => setRangeChoice(e.target.value as RangeChoice)} className="w-44">
            {RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description or notes…"
            className="min-w-[16rem] flex-1"
          />
          <span className="text-xs text-slate-400">{filtered.length} shown</span>
        </div>
      </Card>

      <Card>
        <RecentTransactions transactions={filtered} categories={categories} onChanged={refresh} />
      </Card>
    </div>
  )
}
