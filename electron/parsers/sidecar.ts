import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

const SIDECAR_TIMEOUT_MS = 30_000
const MAX_BUFFER = 32 * 1024 * 1024 // CAS PDFs can yield large JSON

export interface SidecarPaths {
  /** Directory holding the .py scripts in dev, or the bundled executables when packaged. */
  scriptsDir: string
  /** Python interpreter to use in dev. Ignored when a bundled exe is found. */
  python?: string
}

function resolveInvocation(paths: SidecarPaths, scriptBase: string): { cmd: string; prefixArgs: string[] } {
  // Packaged: a PyInstaller onefile exe (e.g. parse_cas.exe) sitting next to resources.
  const exe = join(paths.scriptsDir, process.platform === 'win32' ? `${scriptBase}.exe` : scriptBase)
  if (existsSync(exe)) {
    return { cmd: exe, prefixArgs: [] }
  }
  // Dev: run the .py with a Python interpreter.
  const script = join(paths.scriptsDir, `${scriptBase}.py`)
  const python = paths.python ?? process.env.FINPILOT_PYTHON ?? 'python'
  return { cmd: python, prefixArgs: [script] }
}

export class SidecarError extends Error {}

/**
 * Runs a FinPilot Python sidecar and returns its parsed JSON stdout.
 * Enforces a 30s timeout; a non-zero exit or unparseable stdout throws with the
 * script's stderr message so the caller can surface it (and fall back if needed).
 */
export function runSidecar<T>(paths: SidecarPaths, scriptBase: string, args: string[]): Promise<T> {
  const { cmd, prefixArgs } = resolveInvocation(paths, scriptBase)

  return new Promise<T>((resolve, reject) => {
    execFile(
      cmd,
      [...prefixArgs, ...args],
      { timeout: SIDECAR_TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          const msg = (stderr || error.message || '').trim()
          reject(new SidecarError(msg || `Sidecar ${scriptBase} failed`))
          return
        }
        try {
          resolve(JSON.parse(stdout) as T)
        } catch {
          reject(new SidecarError(`Sidecar ${scriptBase} returned invalid JSON`))
        }
      }
    )
  })
}

export interface CasScheme {
  amc: string
  scheme: string
  isin: string | null
  amfi: string | null
  folio: string
  close_units: number | null
  close_value: number | null
  transactions: {
    date: string
    type: string
    amount: number | null
    units: number | null
    nav: number | null
    balance: number | null
    description: string
  }[]
}

export interface CasResult {
  ok: true
  investor: Record<string, unknown>
  schemes: CasScheme[]
}

export interface BankPdfTransaction {
  date: string
  narration: string
  amount: number
  type: 'debit' | 'credit'
  balance: number | null
}

export interface BankPdfResult {
  ok: true
  bank: string
  account_number: string | null
  transactions: BankPdfTransaction[]
}

export function parseCasPdf(paths: SidecarPaths, file: string, password: string): Promise<CasResult> {
  return runSidecar<CasResult>(paths, 'parse_cas', ['--file', file, '--password', password])
}

export function parseBankPdf(
  paths: SidecarPaths,
  file: string,
  bank: string
): Promise<BankPdfResult> {
  return runSidecar<BankPdfResult>(paths, 'parse_bank', ['--file', file, '--bank', bank])
}
