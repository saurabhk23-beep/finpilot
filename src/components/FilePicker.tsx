import { ipc, type PickedFile } from '../lib/ipc'
import { Button } from './ui'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Attaches statement files via the native dialog. Files are referenced by path (parsed later in Phase D), not uploaded. */
export function FilePicker({
  files,
  onChange,
  accept,
  multiple = true,
  label = 'Attach files'
}: {
  files: PickedFile[]
  onChange: (files: PickedFile[]) => void
  accept?: string[]
  multiple?: boolean
  label?: string
}) {
  async function pick() {
    const picked = await ipc.dialog.openFiles({ accept, multiple })
    if (picked.length === 0) return
    // De-dup by path when appending.
    const byPath = new Map(files.map((f) => [f.path, f]))
    for (const f of picked) byPath.set(f.path, f)
    onChange(multiple ? [...byPath.values()] : picked)
  }

  return (
    <div>
      <Button type="button" variant="secondary" onClick={pick}>
        {label}
      </Button>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f) => (
            <li
              key={f.path}
              className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-xs"
            >
              <span className="truncate text-slate-600">{f.name}</span>
              <span className="ml-3 flex-none text-slate-400">
                {formatSize(f.size)}
                <button
                  type="button"
                  onClick={() => onChange(files.filter((x) => x.path !== f.path))}
                  className="ml-2 text-negative hover:underline"
                >
                  remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
