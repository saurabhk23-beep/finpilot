import { useState } from 'react'
import { ipc, type PickedFile } from '../lib/ipc'
import type { ColumnKind, ColumnMapping, CommitResult, ImportPreview } from '../types'
import { ipcErrorMessage } from '../utils/ipcError'
import { Button, Card, Field, Input, Select } from './ui'

/** Where imported transactions land. Cash uses the dedicated cash container. */
export type ImportTarget =
  | { kind: 'account'; accountId: number; label: string }
  | { kind: 'card'; cardId: number; label: string }
  | { kind: 'cash' }

/** Banks whose PDF statements the Python sidecar can parse (see CLAUDE.md Phase D). */
const PDF_BANKS = [
  { value: 'icici', label: 'ICICI' },
  { value: 'hdfc', label: 'HDFC' },
  { value: 'sbi', label: 'SBI' },
  { value: 'bob', label: 'Bank of Baroda' }
]

/** Keyword → sidecar code, so issuer names like "BOB Eterna" or "Bank of Baroda" map correctly. */
const BANK_ALIASES: { re: RegExp; code: string }[] = [
  { re: /icici/i, code: 'icici' },
  { re: /hdfc/i, code: 'hdfc' },
  { re: /\bsbi\b|state bank/i, code: 'sbi' },
  { re: /\bbob\b|baroda|bobcard/i, code: 'bob' }
]

/** Maps a free-text bank/issuer name to a supported sidecar code, if any. */
function toSidecarBank(hint?: string): string | null {
  if (!hint) return null
  return BANK_ALIASES.find((a) => a.re.test(hint))?.code ?? null
}

const COLUMN_FIELDS: { kind: ColumnKind; label: string; required: boolean }[] = [
  { kind: 'date', label: 'Date', required: true },
  { kind: 'amount', label: 'Amount', required: false },
  { kind: 'debit', label: 'Debit (withdrawal)', required: false },
  { kind: 'credit', label: 'Credit (deposit)', required: false },
  { kind: 'narration', label: 'Description', required: false }
]

// idle → (pick) → selected [PDF: bank+password before Parse] → mapping → done.
// The file can be removed/replaced at 'selected' (before parse) and 'mapping' (before commit).
type Phase = 'idle' | 'selected' | 'mapping' | 'done'

/**
 * Reusable statement importer: pick a CSV/PDF, confirm/replace the file, parse it
 * (PDFs ask for a password and — unless the bank is known from the target account —
 * the bank), then commit to the target account/card/cash. Wraps the existing
 * import:preview / import:commit(Cash) IPC.
 */
export function StatementImport({
  target,
  bankHint,
  onImported,
  onClose
}: {
  target: ImportTarget
  /** Bank/issuer name of the target, used to skip the "Statement Bank" prompt for PDFs. */
  bankHint?: string
  onImported?: (result: CommitResult) => void
  onClose?: () => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [file, setFile] = useState<PickedFile | null>(null)
  const [isPdf, setIsPdf] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [bank, setBank] = useState('icici')
  // 'known' = derived from the target account/card (supported bank, read-only);
  // 'generic' = target bank isn't one we parse automatically (use generic parser);
  // 'ask' = no target bank context (cash) → let the user pick.
  const [bankMode, setBankMode] = useState<'known' | 'generic' | 'ask'>('ask')
  const [password, setPassword] = useState('')
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CommitResult | null>(null)

  const targetLabel = target.kind === 'cash' ? 'Cash' : target.label

  function resetToIdle() {
    setPhase('idle')
    setFile(null)
    setPreview(null)
    setPassword('')
    setMapping({})
    setError(null)
    setResult(null)
  }

  async function pickFile() {
    setError(null)
    const files = await ipc.dialog.openFiles({ accept: ['csv', 'pdf'], multiple: false })
    if (files.length === 0) return
    const picked = files[0]
    setFile(picked)
    const pdf = picked.name.toLowerCase().endsWith('.pdf')
    setIsPdf(pdf)

    if (pdf) {
      // Derive the bank from the target account/card so we don't ask again.
      const derived = toSidecarBank(bankHint)
      if (target.kind === 'cash') {
        // No bank context — let the user pick a supported bank.
        setBankMode('ask')
        setBank(derived ?? 'icici')
      } else if (derived) {
        // Known, supported bank — use it, no prompt.
        setBankMode('known')
        setBank(derived)
      } else {
        // Target bank isn't one we parse automatically (e.g. Bank of Baroda) —
        // fall back to the generic parser instead of asking an irrelevant question.
        setBankMode('generic')
        setBank('')
      }
      setPassword('')
      setPhase('selected')
    } else {
      await previewCsv(picked.path)
    }
  }

  async function previewCsv(filePath: string, map?: ColumnMapping) {
    setBusy(true)
    setError(null)
    try {
      // Omit the mapping on the first pass so the main process auto-maps columns;
      // an empty object would be treated as "mapped to nothing" (0 rows).
      const hasMap = map && Object.keys(map).length > 0
      const r = await ipc.import.preview({ path: filePath, kind: 'bankCsv', mapping: hasMap ? map : undefined })
      if (!r.headers || r.headers.length === 0) {
        setError('That file has no readable columns.')
        return
      }
      setPreview(r)
      setMapping(r.mapping ?? {})
      setPhase('mapping')
    } catch {
      setError('Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  async function parsePdf() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const r = await ipc.import.preview({ path: file.path, kind: 'bankPdf', bank, password })
      if (r.drafts.length === 0) {
        setError(
          bankMode === 'generic'
            ? `We couldn't read this ${bankHint ?? 'bank'} PDF automatically — please import a CSV export instead.`
            : 'No transactions could be read from this PDF. Check the password and try again, or import a CSV.'
        )
        return
      }
      setPreview(r)
      setPhase('mapping')
    } catch (e) {
      setError(ipcErrorMessage(e, 'Could not parse the PDF. Check the bank and password, or try a CSV.'))
    } finally {
      setBusy(false)
    }
  }

  async function remap(next: ColumnMapping) {
    if (!file) return
    setMapping(next)
    const r = await ipc.import.preview({ path: file.path, kind: 'bankCsv', mapping: next })
    setPreview(r)
  }

  function commitToTarget(p: ImportPreview) {
    const base = { fileName: p.fileName, fileHash: p.fileHash, drafts: p.drafts, dateRange: p.dateRange }
    if (target.kind === 'cash') return ipc.import.commitCash(base)
    if (target.kind === 'card') return ipc.import.commit({ ...base, cardId: target.cardId })
    return ipc.import.commit({ ...base, accountId: target.accountId })
  }

  async function commit() {
    if (!preview || preview.drafts.length === 0) {
      setError('No valid rows found. Map the Date and Amount columns and try again.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await commitToTarget(preview)
      setResult(res)
      setPhase('done')
      onImported?.(res)
    } catch {
      setError(preview.alreadyImported ? 'This file was already imported.' : 'Import failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const isCsvMapping = phase === 'mapping' && (preview?.headers?.length ?? 0) > 0

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">Import statement → {targetLabel}</p>
        {onClose && (
          <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">
            Close
          </button>
        )}
      </div>

      {phase === 'idle' && (
        <div>
          <p className="text-sm text-slate-500">
            Choose a CSV or PDF bank statement. You can review and replace the file before it's parsed.
          </p>
          <div className="mt-4">
            <Button type="button" variant="secondary" onClick={pickFile} disabled={busy}>
              Choose CSV / PDF
            </Button>
          </div>
        </div>
      )}

      {/* Selected-file header with a remove/replace control (before parsing). */}
      {(phase === 'selected' || phase === 'mapping') && file && (
        <div className="mb-4 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs">
          <span className="truncate text-slate-600">{file.name}</span>
          <button
            type="button"
            onClick={resetToIdle}
            className="ml-3 flex-none text-negative hover:underline"
            disabled={busy}
          >
            {phase === 'selected' ? 'Remove' : 'Change file'}
          </button>
        </div>
      )}

      {phase === 'selected' && isPdf && (
        <div>
          {bankMode === 'generic' && (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Automatic PDF parsing isn't available for {bankHint ?? 'this bank'} yet — we'll try a generic
              parser. If it can't read the statement, import a CSV export instead.
            </p>
          )}
          <div className="grid max-w-md grid-cols-2 gap-4">
            {bankMode === 'ask' ? (
              <Field label="Statement bank" hint="Which bank issued this PDF?">
                <Select value={bank} onChange={(e) => setBank(e.target.value)}>
                  {PDF_BANKS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : bankMode === 'known' ? (
              <Field label="Statement bank">
                <div className="rounded-md border border-border bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {PDF_BANKS.find((b) => b.value === bank)?.label ?? bank}{' '}
                  <span className="text-slate-400">(from account)</span>
                </div>
              </Field>
            ) : null}
            <Field label="PDF password" hint="Leave blank if the statement isn't protected.">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
            </Field>
          </div>
          <div className="mt-4">
            <Button type="button" onClick={parsePdf} disabled={busy}>
              {busy ? 'Parsing…' : 'Parse PDF'}
            </Button>
          </div>
        </div>
      )}

      {phase === 'mapping' && preview && (
        <div>
          <p className="mb-3 text-xs text-slate-400">
            {preview.drafts.length} rows ready
            {preview.skipped > 0 ? `, ${preview.skipped} skipped` : ''}
            {preview.duplicateCount > 0 ? `, ${preview.duplicateCount} look like duplicates` : ''}.
          </p>

          {isCsvMapping && (
            <div className="mb-4 grid grid-cols-2 gap-4">
              {COLUMN_FIELDS.map((field) => (
                <Field key={field.kind} label={field.label} required={field.required}>
                  <Select
                    value={mapping[field.kind] ?? ''}
                    onChange={(e) => remap({ ...mapping, [field.kind]: e.target.value || null })}
                  >
                    <option value="">— none —</option>
                    {(preview.headers ?? []).map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
          )}

          <Button type="button" onClick={commit} disabled={busy}>
            {busy ? 'Importing…' : `Import ${preview.drafts.length} transactions`}
          </Button>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="text-sm">
          <p className="font-medium text-positive">
            Imported {result.imported} transaction{result.imported === 1 ? '' : 's'}
            {result.transfersLinked + result.ccPaymentsLinked > 0
              ? ` · ${result.transfersLinked + result.ccPaymentsLinked} transfer/CC-payment link(s) detected`
              : ''}
            .
          </p>
          {result.duplicatesSkipped > 0 && (
            <p className="mt-1 text-amber-700">
              Skipped {result.duplicatesSkipped} duplicate{result.duplicatesSkipped === 1 ? '' : 's'} already in this
              account.
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-negative">{error}</p>}
    </Card>
  )
}
