import { useState } from 'react'
import { ipc, type PickedFile } from '../lib/ipc'
import { ipcErrorMessage } from '../utils/ipcError'
import { Button, Card, Field, Input } from './ui'

/** One imported-file line with its per-file result. */
interface FileResult {
  name: string
  message: string
  ok: boolean
}

const errorMessage = (e: unknown) => ipcErrorMessage(e, 'Could not import this file.')

function FileResultList({ results }: { results: FileResult[] }) {
  if (results.length === 0) return null
  return (
    <ul className="mt-3 space-y-1">
      {results.map((r, i) => (
        <li
          key={`${r.name}-${i}`}
          className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-xs"
        >
          <span className="truncate text-slate-600">{r.name}</span>
          <span className={`ml-3 flex-none ${r.ok ? 'text-slate-500' : 'text-negative'}`}>{r.message}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Mutual-fund CAS importer: repeatable, per-file password, provider-neutral
 * (CAMS / KFintech / MFCentral). Reused in onboarding and settings.
 */
export function CasImporter() {
  const [password, setPassword] = useState('')
  const [file, setFile] = useState<PickedFile | null>(null)
  const [results, setResults] = useState<FileResult[]>([])
  const [busy, setBusy] = useState(false)

  async function chooseFile() {
    const files = await ipc.dialog.openFiles({ accept: ['pdf'], multiple: false })
    if (files.length > 0) setFile(files[0])
  }

  async function importFile() {
    if (!file) return
    setBusy(true)
    try {
      const r = await ipc.import.cas({ path: file.path, password })
      const message = r.alreadyImported
        ? 'Already imported.'
        : `${r.schemesCreated} scheme${r.schemesCreated === 1 ? '' : 's'}, ${r.transactionsImported} transactions.`
      setResults((prev) => [...prev, { name: file.name, message, ok: true }])
      setFile(null)
      setPassword('')
    } catch (e) {
      setResults((prev) => [...prev, { name: file.name, message: errorMessage(e), ok: false }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-5">
      <p className="mb-3 text-sm font-medium text-slate-700">Mutual funds — CAS statement(s)</p>
      <p className="mb-3 text-xs text-slate-400">
        Consolidated Account Statement from CAMS, KFintech (KFinKart) or MFCentral. Choose the file,
        enter its password, then import. Repeat for more statements.
      </p>
      <div className="max-w-xs">
        <Field label="CAS password" hint="Usually your PAN (uppercase) or the password you set.">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="ABCDE1234F" />
        </Field>
      </div>

      {file ? (
        <div className="mt-3">
          <div className="mb-3 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs">
            <span className="truncate text-slate-600">{file.name}</span>
            <button type="button" onClick={() => setFile(null)} className="ml-3 flex-none text-negative hover:underline" disabled={busy}>
              Remove
            </button>
          </div>
          <Button type="button" onClick={importFile} disabled={busy}>
            {busy ? 'Parsing…' : 'Import CAS'}
          </Button>
        </div>
      ) : (
        <div className="mt-3">
          <Button type="button" variant="secondary" onClick={chooseFile} disabled={busy}>
            {results.length > 0 ? 'Add another CAS PDF' : 'Choose CAS PDF'}
          </Button>
        </div>
      )}
      <FileResultList results={results} />
    </Card>
  )
}

/**
 * Stock broker importer: provider-neutral (Groww / Zerodha / Upstox / …),
 * multiple files at once. Calls `onImported` after a batch so callers refresh.
 */
export function BrokerImporter({ onImported }: { onImported?: () => void }) {
  const [files, setFiles] = useState<PickedFile[]>([])
  const [results, setResults] = useState<FileResult[]>([])
  const [busy, setBusy] = useState(false)

  async function chooseFiles() {
    const picked = await ipc.dialog.openFiles({ accept: ['csv'], multiple: true })
    if (picked.length === 0) return
    // Append, de-duped by path, so users can build up a set before importing.
    const byPath = new Map(files.map((f) => [f.path, f]))
    for (const f of picked) byPath.set(f.path, f)
    setFiles([...byPath.values()])
  }

  async function importFiles() {
    if (files.length === 0) return
    setBusy(true)
    try {
      for (const file of files) {
        try {
          const r = await ipc.import.groww({ path: file.path })
          const message = r.alreadyImported
            ? 'Already imported.'
            : `${r.stocksCreated} stock${r.stocksCreated === 1 ? '' : 's'}, ${r.tradesImported} trades.`
          setResults((prev) => [...prev, { name: file.name, message, ok: true }])
        } catch (e) {
          setResults((prev) => [...prev, { name: file.name, message: errorMessage(e), ok: false }])
        }
      }
      setFiles([])
      onImported?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-5">
      <p className="mb-3 text-sm font-medium text-slate-700">Stocks — broker trade file(s)</p>
      <p className="mb-3 text-xs text-slate-400">
        Trade / order history CSV exported from your broker (Groww, Zerodha, Upstox, …). Add one or
        more, review the list, then import.
      </p>

      {files.length > 0 && (
        <ul className="mb-3 space-y-1">
          {files.map((f) => (
            <li key={f.path} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-xs">
              <span className="truncate text-slate-600">{f.name}</span>
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((x) => x.path !== f.path))}
                className="ml-3 flex-none text-negative hover:underline"
                disabled={busy}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={chooseFiles} disabled={busy}>
          {files.length > 0 ? 'Add more' : 'Choose broker CSV(s)'}
        </Button>
        {files.length > 0 && (
          <Button type="button" onClick={importFiles} disabled={busy}>
            {busy ? 'Parsing…' : `Import ${files.length} file${files.length === 1 ? '' : 's'}`}
          </Button>
        )}
      </div>
      <FileResultList results={results} />
    </Card>
  )
}
