import { useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { Coverage, RefreshConfig } from '../../types'
import { Button, Card, Field, Input } from '../../components/ui'
import { SettingsSectionShell } from './SettingsSectionShell'

export function DataRefreshSettings() {
  const [config, setConfig] = useState<RefreshConfig | null>(null)
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null)
  const [catStatus, setCatStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'refresh' | 'categorize'>(null)

  async function loadCoverage() {
    setCoverage(await ipc.categorization.coverage())
  }
  useEffect(() => {
    ipc.settings.getRefresh().then(setConfig)
    loadCoverage()
  }, [])

  async function saveConfig(next: Partial<RefreshConfig>) {
    const updated = await ipc.settings.setRefresh(next)
    setConfig(updated)
  }

  async function refreshMarketData() {
    setBusy('refresh')
    setRefreshStatus(null)
    try {
      const r = await ipc.portfolio.refresh()
      const parts = [`${r.mfUpdated} funds`, `${r.stocksUpdated} stocks`]
      setRefreshStatus(`Updated ${parts.join(', ')}.${r.errors.length ? ` ${r.errors.length} failed.` : ''}`)
    } catch {
      setRefreshStatus('Refresh failed — check your connection.')
    } finally {
      setBusy(null)
    }
  }

  async function runCategorization() {
    setBusy('categorize')
    setCatStatus(null)
    try {
      const r = await ipc.categorization.run()
      setCatStatus(`Categorized ${r.updated} more transaction${r.updated === 1 ? '' : 's'}.`)
      await loadCoverage()
    } finally {
      setBusy(null)
    }
  }

  return (
    <SettingsSectionShell title="Data & refresh" description="Market-data refresh schedule and categorization tools.">
      <Card>
        <p className="mb-4 text-sm font-medium text-slate-700">Daily market-data refresh</p>
        {config && (
          <div className="flex flex-wrap items-end gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => saveConfig({ enabled: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              Enabled
            </label>
            <div className="w-40">
              <Field label="Time (IST)">
                <Input
                  type="time"
                  value={config.time}
                  disabled={!config.enabled}
                  onChange={(e) => saveConfig({ time: e.target.value })}
                />
              </Field>
            </div>
            <p className="text-xs text-slate-400">NAVs from mfapi.in and stock prices are fetched once a day.</p>
          </div>
        )}
        <div className="mt-5 flex items-center gap-3">
          <Button variant="secondary" onClick={refreshMarketData} disabled={busy !== null}>
            {busy === 'refresh' ? 'Refreshing…' : 'Refresh market data now'}
          </Button>
          {refreshStatus && <span className="text-sm text-slate-500">{refreshStatus}</span>}
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-700">Categorization</p>
        {coverage && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Coverage</span>
              <span className="font-medium">
                {coverage.categorized}/{coverage.total} ({coverage.pct}%)
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-positive" style={{ width: `${coverage.pct}%` }} />
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={runCategorization} disabled={busy !== null}>
            {busy === 'categorize' ? 'Running…' : 'Re-run categorization'}
          </Button>
          {catStatus && <span className="text-sm text-slate-500">{catStatus}</span>}
        </div>
      </Card>
    </SettingsSectionShell>
  )
}
