import { useState } from 'react'
import { ipc } from '../../../lib/ipc'
import type { ColumnKind, ColumnMapping, ImportPreview } from '../../../types'
import { Button, Card, Field, Select } from '../../../components/ui'
import StepLayout from '../StepLayout'

type Phase = 'idle' | 'mapping' | 'imported'

// Cash tracker exports only need date/amount; description/category are optional.
const COLUMN_FIELDS: { kind: ColumnKind; label: string; required: boolean }[] = [
  { kind: 'date', label: 'Date', required: true },
  { kind: 'amount', label: 'Amount', required: true },
  { kind: 'narration', label: 'Description', required: false },
  { kind: 'category', label: 'Category', required: false }
]

export default function CashTransactionsStep() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [importedCount, setImportedCount] = useState(0)

  async function pickFile() {
    setError(null)
    const files = await ipc.dialog.openFiles({ accept: ['csv'], multiple: false })
    if (files.length === 0) return

    setBusy(true)
    try {
      const result = await ipc.import.preview({ path: files[0].path, kind: 'bankCsv' })
      if (!result.headers || result.headers.length === 0) {
        setError('That file has no readable columns.')
        return
      }
      setPath(files[0].path)
      setPreview(result)
      setMapping(result.mapping ?? {})
      setPhase('mapping')
    } catch {
      setError('Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  async function repreviewWithMapping(next: ColumnMapping) {
    if (!path) return
    setMapping(next)
    // Re-parse in the main process so counts/drafts reflect the new mapping.
    const result = await ipc.import.preview({ path, kind: 'bankCsv', mapping: next })
    setPreview(result)
  }

  async function runImport(): Promise<boolean> {
    setError(null)
    // The preview is the source of truth: it already parsed the rows (whether the
    // file uses a single amount column or separate debit/credit columns).
    if (!preview || preview.drafts.length === 0) {
      setError('No valid rows found. Map the Date and Amount columns and try again.')
      return false
    }

    setBusy(true)
    try {
      const result = await ipc.import.commitCash({
        fileName: preview.fileName,
        fileHash: preview.fileHash,
        drafts: preview.drafts,
        dateRange: preview.dateRange
      })
      setImportedCount(result.imported)
      setPhase('imported')
      return true
    } catch {
      setError('Import failed. Please check the file and try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepLayout
      title="Cash transactions"
      description="Import a CSV from a tracker app, or skip and add cash entries later."
      canSkip
      busy={busy}
      onNext={phase === 'mapping' ? runImport : undefined}
      nextLabel={phase === 'mapping' ? 'Import' : 'Continue'}
    >
      {phase === 'idle' && (
        <Card>
          <p className="text-sm text-slate-600">
            Upload a CSV export from your cash tracker. You'll map its columns to date, amount, and
            description on the next screen.
          </p>
          <div className="mt-4">
            <Button type="button" variant="secondary" onClick={pickFile} disabled={busy}>
              Choose CSV file
            </Button>
          </div>
        </Card>
      )}

      {phase === 'mapping' && preview && (
        <Card>
          <p className="mb-1 text-sm font-medium text-slate-700">Map columns</p>
          <p className="mb-4 text-xs text-slate-400">
            {preview.drafts.length} rows ready
            {preview.skipped > 0 ? `, ${preview.skipped} skipped` : ''}. Negative amounts (or “Dr”) are
            expenses.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {COLUMN_FIELDS.map((field) => (
              <Field key={field.kind} label={field.label} required={field.required}>
                <Select
                  value={mapping[field.kind] ?? ''}
                  onChange={(e) =>
                    repreviewWithMapping({ ...mapping, [field.kind]: e.target.value || null })
                  }
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
          {error && <p className="mt-3 text-sm text-negative">{error}</p>}
        </Card>
      )}

      {phase === 'imported' && (
        <Card>
          <p className="text-sm font-medium text-positive">
            Imported {importedCount} cash transaction{importedCount === 1 ? '' : 's'}.
          </p>
        </Card>
      )}

      {phase === 'idle' && error && <p className="mt-3 text-sm text-negative">{error}</p>}
    </StepLayout>
  )
}
