import { useEffect, useState } from 'react'
import { ipc } from '../../../lib/ipc'
import type { Account, CreditCard, User } from '../../../types'
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

// Banks whose PDF statements the Python sidecar can parse (see CLAUDE.md Phase D).
const SUPPORTED_PDF_BANKS = ['icici', 'hdfc', 'sbi']

function detectBank(name: string): string | null {
  const s = name.toLowerCase()
  return SUPPORTED_PDF_BANKS.find((b) => s.includes(b)) ?? null
}

export default function SummaryStep() {
  const [user, setUser] = useState<User | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [counts, setCounts] = useState<Counts>({ accounts: 0, cards: 0, stocks: 0, schemes: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const goToDashboard = useAppStore((s) => s.goToDashboard)
  const goTo = useOnboardingStore((s) => s.goTo)
  const pendingFiles = useOnboardingStore((s) => s.pendingFiles)
  const pendingPasswords = useOnboardingStore((s) => s.pendingPasswords)

  useEffect(() => {
    Promise.all([
      ipc.user.get(),
      ipc.accounts.list(),
      ipc.creditCards.list(),
      ipc.investments.listStocks(),
      ipc.investments.listMFSchemes()
    ]).then(([u, accts, crds, stocks, schemes]) => {
      setUser(u ?? null)
      setAccounts(accts)
      setCards(crds)
      setCounts({
        accounts: accts.filter((a) => a.type !== 'cash').length,
        cards: crds.length,
        stocks: stocks.length,
        schemes: schemes.length
      })
    })
  }, [])

  /**
   * Imports the statements attached during the Bank Accounts / Credit Cards
   * steps (queued in onboardingStore.pendingFiles). Best-effort: CSVs are
   * auto-mapped, PDFs are parsed when the bank/issuer maps to a supported
   * sidecar. Files that can't be auto-imported are counted so the user knows to
   * finish them from the Transactions screen. Duplicates are skipped by hash.
   */
  async function importPendingStatements(): Promise<string[]> {
    let imported = 0
    let fileCount = 0
    let manual = 0

    for (const [key, list] of Object.entries(pendingFiles)) {
      const [kind, idStr] = key.split(':')
      const id = Number(idStr)
      for (const f of list) {
        fileCount++
        const isPdf = f.name.toLowerCase().endsWith('.pdf')
        try {
          let preview
          if (isPdf) {
            const source =
              kind === 'account'
                ? accounts.find((a) => a.id === id)?.bank ?? ''
                : cards.find((c) => c.id === id)?.issuer ?? ''
            const bank = detectBank(source)
            if (!bank) {
              manual++
              continue
            }
            preview = await ipc.import.preview({
              path: f.path,
              kind: 'bankPdf',
              bank,
              password: pendingPasswords[key] ?? ''
            })
          } else {
            preview = await ipc.import.preview({ path: f.path, kind: 'bankCsv' })
          }

          if (preview.alreadyImported || preview.drafts.length === 0) {
            if (preview.drafts.length === 0) manual++
            continue
          }

          const base = {
            fileName: preview.fileName,
            fileHash: preview.fileHash,
            drafts: preview.drafts,
            dateRange: preview.dateRange
          }
          const res =
            kind === 'card'
              ? await ipc.import.commit({ ...base, cardId: id })
              : await ipc.import.commit({ ...base, accountId: id })
          imported += res.imported
        } catch {
          manual++
        }
      }
    }

    const out: string[] = []
    if (fileCount > 0) {
      out.push(`Imported ${imported} transaction${imported === 1 ? '' : 's'} from your attached statements.`)
      if (manual > 0) {
        out.push(
          `${manual} file${manual === 1 ? '' : 's'} couldn't be imported automatically — add ${
            manual === 1 ? 'it' : 'them'
          } from the Transactions screen after setup.`
        )
      }
    }
    return out
  }

  async function confirm() {
    setError(null)
    setBusy(true)
    try {
      const importNotes = await importPendingStatements()
      await ipc.user.update({ onboarding_completed: 1 })
      if (importNotes.length > 0) {
        // Show the user what came in before entering the dashboard.
        setNotes(importNotes)
        setDone(true)
        setBusy(false)
      } else {
        goToDashboard()
      }
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

      {notes.length > 0 && (
        <Card className="mt-4">
          {notes.map((n, i) => (
            <p key={i} className={`text-sm ${i === 0 ? 'font-medium text-positive' : 'text-slate-500'}`}>
              {n}
            </p>
          ))}
        </Card>
      )}

      {error && <p className="mt-4 text-sm text-negative">{error}</p>}

      <div className="mt-6">
        {done ? (
          <Button onClick={goToDashboard} className="w-full">
            Enter dashboard
          </Button>
        ) : (
          <Button onClick={confirm} disabled={busy} className="w-full">
            {busy ? 'Finishing…' : 'Confirm & enter dashboard'}
          </Button>
        )}
      </div>
    </StepLayout>
  )
}
