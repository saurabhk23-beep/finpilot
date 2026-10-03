import { useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { Card } from '../../components/ui'
import { SettingsSectionShell } from './SettingsSectionShell'

export function AdvancedSettings() {
  const [devMode, setDevMode] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ipc.settings.getDevMode().then((r) => setDevMode(r.devMode))
  }, [])

  async function toggle() {
    setBusy(true)
    try {
      const r = await ipc.settings.setDevMode(!devMode)
      setDevMode(r.devMode)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSectionShell title="Advanced" description="Developer options. Most people can leave these off.">
      <Card>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={devMode}
            disabled={busy}
            onChange={toggle}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-slate-700">Developer mode</span>
            <span className="mt-0.5 block text-xs text-slate-400">
              Show exact, technical error messages instead of friendly ones. Useful when reporting a
              problem; leave off for everyday use.
            </span>
          </span>
        </label>
      </Card>
    </SettingsSectionShell>
  )
}
