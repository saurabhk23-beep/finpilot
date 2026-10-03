import { execFile, execFileSync } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

const SIDECAR_TIMEOUT_MS = 30_000
const MAX_BUFFER = 32 * 1024 * 1024 // CAS PDFs can yield large JSON

export interface SidecarPaths {
  /** Directory holding the .py scripts in dev, or the bundled executables when packaged. */
  scriptsDir: string
  /** Python interpreter to use in dev. Ignored when a bundled exe is found. */
  python?: string
}

interface Interpreter {
  cmd: string
  baseArgs: string[]
}

/**
 * Absolute `python.exe` paths from common Windows install locations. A GUI- or
 * shell-launched Electron process may not have `py`/`python` on PATH (or `python`
 * resolves to the Store stub), so we scan the real install dirs as a fallback.
 */
function discoverWindowsPythons(): string[] {
  if (process.platform !== 'win32') return []
  const found: string[] = []
  const local = process.env.LOCALAPPDATA
  const programFiles = process.env.ProgramFiles
  const systemDrive = process.env.SystemDrive || 'C:'

  // Directories whose `Python3*` / `pythoncore-*` subfolders each hold a python.exe.
  const parents: string[] = [systemDrive + '\\']
  if (programFiles) parents.push(programFiles)
  if (local) {
    parents.push(join(local, 'Programs', 'Python'))
    parents.push(join(local, 'Python'))
  }
  for (const parent of parents) {
    try {
      for (const name of readdirSync(parent)) {
        if (/^(Python3|pythoncore)/i.test(name)) {
          const exe = join(parent, name, 'python.exe')
          if (existsSync(exe)) found.push(exe)
        }
      }
    } catch {
      // parent doesn't exist / not readable — skip.
    }
  }
  // Direct locations that aren't under a versioned subdir.
  if (local) {
    const binExe = join(local, 'Python', 'bin', 'python.exe')
    if (existsSync(binExe)) found.push(binExe)
  }
  return found
}

/**
 * Candidate Python interpreters, best-first. `bare python` on Windows often
 * resolves to the Microsoft Store stub (no packages), so the `py -3` launcher
 * comes first there, and absolute install paths follow as a PATH-independent
 * fallback. The explicit override (FINPILOT_PYTHON / paths.python) wins.
 */
function candidateInterpreters(explicit?: string): Interpreter[] {
  const list: Interpreter[] = []
  const envPy = explicit ?? process.env.FINPILOT_PYTHON
  if (envPy) list.push({ cmd: envPy, baseArgs: [] })
  if (process.platform === 'win32') list.push({ cmd: 'py', baseArgs: ['-3'] })
  list.push({ cmd: 'python', baseArgs: [] })
  list.push({ cmd: 'python3', baseArgs: [] })
  for (const exe of discoverWindowsPythons()) list.push({ cmd: exe, baseArgs: [] })
  return list
}

/** True if this interpreter can import the sidecar dependencies. */
function interpreterHasDeps(intp: Interpreter): boolean {
  try {
    execFileSync(intp.cmd, [...intp.baseArgs, '-c', 'import casparser, pypdfium2'], {
      stdio: 'ignore',
      timeout: 15_000,
      windowsHide: true
    })
    return true
  } catch {
    return false
  }
}

let cachedInterpreter: Interpreter | null = null

/**
 * Picks a Python interpreter that actually has casparser + pypdfium2 installed,
 * probing candidates once and caching the result. Falls back to bare `python`
 * (the sidecar then emits a clear "not installed" message) if none qualify.
 */
function detectInterpreter(explicit?: string): Interpreter {
  if (cachedInterpreter) return cachedInterpreter
  for (const cand of candidateInterpreters(explicit)) {
    if (interpreterHasDeps(cand)) {
      cachedInterpreter = cand
      return cand
    }
  }
  cachedInterpreter = { cmd: explicit ?? process.env.FINPILOT_PYTHON ?? 'python', baseArgs: [] }
  return cachedInterpreter
}

/** Test seam: forget the cached interpreter so the next call re-detects. */
export function resetInterpreterCache(): void {
  cachedInterpreter = null
}

function resolveInvocation(paths: SidecarPaths, scriptBase: string): { cmd: string; prefixArgs: string[] } {
  // Packaged: a PyInstaller onefile exe (e.g. parse_cas.exe) sitting next to resources.
  const exe = join(paths.scriptsDir, process.platform === 'win32' ? `${scriptBase}.exe` : scriptBase)
  if (existsSync(exe)) {
    return { cmd: exe, prefixArgs: [] }
  }
  // Dev: run the .py with a Python interpreter that has the sidecar deps.
  const script = join(paths.scriptsDir, `${scriptBase}.py`)
  const intp = detectInterpreter(paths.python)
  return { cmd: intp.cmd, prefixArgs: [...intp.baseArgs, script] }
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
  bank: string,
  password = ''
): Promise<BankPdfResult> {
  const args = ['--file', file, '--bank', bank]
  if (password) args.push('--password', password)
  return runSidecar<BankPdfResult>(paths, 'parse_bank', args)
}
