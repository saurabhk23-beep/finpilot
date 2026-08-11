import { useState, type FormEvent } from 'react'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'
import { Button, Input } from '../components/ui'

export default function Splash() {
  const isFirstRun = useAppStore((s) => s.isFirstRun)
  const completeUnlock = useAppStore((s) => s.completeUnlock)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (isFirstRun && password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 6) {
      setError('Use at least 6 characters.')
      return
    }

    setBusy(true)
    try {
      const result = await ipc.auth.unlock(password)
      completeUnlock(result.onboardingCompleted)
    } catch {
      // A wrong password surfaces from SQLCipher as "file is not a database".
      setError(isFirstRun ? 'Could not create the vault. Please try again.' : 'Incorrect password.')
      setBusy(false)
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-sidebar">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl bg-white p-8 shadow-2xl"
      >
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-content-foreground">FinPilot</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isFirstRun ? 'Create a master password to encrypt your data' : 'Enter your master password'}
          </p>
        </div>

        <div className="space-y-3">
          <Input
            type="password"
            placeholder="Master password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
          />
          {isFirstRun && (
            <Input
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </div>

        {error && <p className="mt-3 text-sm text-negative">{error}</p>}

        {isFirstRun && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            This password encrypts your database and cannot be recovered. Store it safely.
          </p>
        )}

        <Button type="submit" disabled={busy} className="mt-6 w-full">
          {busy ? 'Unlocking…' : isFirstRun ? 'Create Vault' : 'Unlock'}
        </Button>
      </form>
    </div>
  )
}
