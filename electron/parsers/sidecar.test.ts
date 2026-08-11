import { execFileSync } from 'child_process'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { runSidecar, SidecarError, type BankPdfResult, type CasResult } from './sidecar'

const scriptsDir = join(__dirname, '..', '..', 'python')
const python = process.env.FINPILOT_PYTHON ?? 'python'

function pythonAvailable(): boolean {
  try {
    execFileSync(python, ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const maybe = pythonAvailable() ? describe : describe.skip

maybe('runSidecar (real Python child process)', () => {
  const paths = { scriptsDir, python }

  it('parses parse_cas --self-test JSON from stdout', async () => {
    const result = await runSidecar<CasResult>(paths, 'parse_cas', ['--self-test'])
    expect(result.ok).toBe(true)
    expect(result.schemes[0]).toMatchObject({ amfi: '119551', folio: '12345/67' })
    expect(result.schemes[0].transactions[0]).toMatchObject({ date: '2026-01-05', amount: 5000 })
  })

  it('parses parse_bank --self-test JSON from stdout', async () => {
    const result = await runSidecar<BankPdfResult>(paths, 'parse_bank', ['--self-test'])
    expect(result.account_number).toBe('4321')
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[1]).toMatchObject({ type: 'credit', amount: 150000 })
  })

  it('rejects with the script stderr message on non-zero exit', async () => {
    await expect(runSidecar(paths, 'parse_cas', [])).rejects.toBeInstanceOf(SidecarError)
    await expect(runSidecar(paths, 'parse_cas', [])).rejects.toThrow(/--file is required/)
  })
})
