import { useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { Button, Card, Field, Input, Select } from '../../components/ui'
import { SettingsSectionShell } from './SettingsSectionShell'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export function ProfileSettings() {
  const [name, setName] = useState('')
  const [salary, setSalary] = useState('')
  const [employer, setEmployer] = useState('')
  const [fyStart, setFyStart] = useState(4)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ipc.user.get().then((u) => {
      if (!u) return
      setName(u.name ?? '')
      setSalary(u.monthly_salary != null ? String(u.monthly_salary) : '')
      setEmployer(u.employer_name ?? '')
      setFyStart(u.fy_start_month)
    })
  }, [])

  async function save() {
    setStatus(null)
    const salaryNum = Number(salary)
    if (!name.trim() || !employer.trim() || !Number.isFinite(salaryNum) || salaryNum <= 0) {
      setStatus('Please enter a valid name, employer, and salary.')
      return
    }
    setBusy(true)
    try {
      await ipc.user.update({
        name: name.trim(),
        monthly_salary: salaryNum,
        employer_name: employer.trim(),
        fy_start_month: fyStart
      })
      setStatus('Saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSectionShell title="Profile" description="Used for savings-rate and salary detection.">
      <Card>
        <div className="space-y-4">
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Monthly salary (post-tax, ₹)" required>
            <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} />
          </Field>
          <Field label="Employer / company name" required>
            <Input value={employer} onChange={(e) => setEmployer(e.target.value)} />
          </Field>
          <Field label="Financial year starts">
            <Select value={fyStart} onChange={(e) => setFyStart(Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
          {status && <span className="text-sm text-slate-500">{status}</span>}
        </div>
      </Card>
    </SettingsSectionShell>
  )
}
