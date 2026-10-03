import { useState } from 'react'
import { ipc } from '../../lib/ipc'
import { ipcErrorMessage } from '../../utils/ipcError'
import { Button, Card, Field, Input } from '../../components/ui'
import { SettingsSectionShell } from './SettingsSectionShell'

const errorMessage = (e: unknown) => ipcErrorMessage(e, 'Could not change the password.')

export function SecuritySettings() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function reset() {
    setCurrent('')
    setNext('')
    setConfirm('')
  }

  async function save() {
    setError(null)
    setStatus(null)
    if (!current || !next) {
      setError('Enter your current and new password.')
      return
    }
    if (next.length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }
    if (next !== confirm) {
      setError('New passwords do not match.')
      return
    }
    if (next === current) {
      setError('New password must be different from the current one.')
      return
    }

    setBusy(true)
    try {
      await ipc.auth.changePassword(current, next)
      reset()
      setStatus('Master password changed. Use the new password next time you unlock FinPilot.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSectionShell
      title="Security"
      description="Change the master password that encrypts your vault."
    >
      <Card>
        <div className="space-y-4">
          <Field label="Current password" required>
            <Input
              type="password"
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value)
                if (error) setError(null)
              }}
            />
          </Field>
          <Field label="New password" required hint="At least 6 characters.">
            <Input
              type="password"
              value={next}
              onChange={(e) => {
                setNext(e.target.value)
                if (error) setError(null)
              }}
            />
          </Field>
          <Field label="Confirm new password" required>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value)
                if (error) setError(null)
              }}
            />
          </Field>
        </div>

        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          This password encrypts your database and cannot be recovered. Store the new one safely.
        </p>

        {error && <p className="mt-3 text-sm text-negative">{error}</p>}
        {status && <p className="mt-3 text-sm text-positive">{status}</p>}

        <div className="mt-5">
          <Button onClick={save} disabled={busy}>
            {busy ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </Card>
    </SettingsSectionShell>
  )
}
