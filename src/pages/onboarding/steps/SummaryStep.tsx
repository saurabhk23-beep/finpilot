import { useEffect, useState } from 'react'
import { ipc } from '../../../lib/ipc'
import type { User } from '../../../types'
import { Button, Card } from '../../../components/ui'
import { useAppStore } from '../../../stores/appStore'
import { useOnboardingStore } from '../../../stores/onboardingStore'
import StepLayout from '../StepLayout'

interface Counts {
  accounts: number
  cards: number
  stocks: number
  schemes: number
}

export default function SummaryStep() {
  const [user, setUser] = useState<User | null>(null)
  const [counts, setCounts] = useState<Counts>({ accounts: 0, cards: 0, stocks: 0, schemes: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const goToDashboard = useAppStore((s) => s.goToDashboard)
  const goTo = useOnboardingStore((s) => s.goTo)

  useEffect(() => {
    Promise.all([
      ipc.user.get(),
      ipc.accounts.list(),
      ipc.creditCards.list(),
      ipc.investments.listStocks(),
      ipc.investments.listMFSchemes()
    ]).then(([u, accounts, cards, stocks, schemes]) => {
      setUser(u ?? null)
      setCounts({
        accounts: accounts.filter((a) => a.type !== 'cash').length,
        cards: cards.length,
        stocks: stocks.length,
        schemes: schemes.length
      })
    })
  }, [])

  async function confirm() {
    setError(null)
    setBusy(true)
    try {
      await ipc.user.update({ onboarding_completed: 1 })
      goToDashboard()
    } catch {
      setError('Could not finish setup. Please try again.')
      setBusy(false)
    }
  }

  const rows: { label: string; value: string; stepIndex: number }[] = [
    { label: 'Name', value: user?.name ?? '—', stepIndex: 0 },
    {
      label: 'Monthly salary',
      value: user?.monthly_salary != null ? `₹${user.monthly_salary.toLocaleString('en-IN')}` : '—',
      stepIndex: 0
    },
    { label: 'Employer', value: user?.employer_name ?? '—', stepIndex: 0 },
    { label: 'Bank accounts', value: String(counts.accounts), stepIndex: 1 },
    { label: 'Credit cards', value: String(counts.cards), stepIndex: 2 },
    { label: 'Stocks', value: String(counts.stocks), stepIndex: 4 },
    { label: 'MF schemes', value: String(counts.schemes), stepIndex: 4 }
  ]

  return (
    <StepLayout
      title="Review & confirm"
      description="Check your setup, then build your dashboard."
      hideNext
      busy={busy}
    >
      <Card>
        <dl className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between py-2.5">
              <dt className="text-sm text-slate-500">{r.label}</dt>
              <dd className="flex items-center gap-3">
                <span className="text-sm font-medium">{r.value}</span>
                <button
                  type="button"
                  onClick={() => goTo(r.stepIndex)}
                  className="text-xs text-primary hover:underline"
                >
                  Edit
                </button>
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      {error && <p className="mt-4 text-sm text-negative">{error}</p>}

      <div className="mt-6">
        <Button onClick={confirm} disabled={busy} className="w-full">
          {busy ? 'Finishing…' : 'Confirm & enter dashboard'}
        </Button>
      </div>
    </StepLayout>
  )
}
