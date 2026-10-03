import { useEffect, useState } from 'react'
import { ipc } from '../../../lib/ipc'
import { Field, Input, Select } from '../../../components/ui'
import StepLayout from '../StepLayout'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export default function ProfileStep() {
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [salary, setSalary] = useState('')
  const [employer, setEmployer] = useState('')
  const [fyStart, setFyStart] = useState(4) // April = Indian FY default
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Pre-fill if the user navigates back to this step.
  useEffect(() => {
    ipc.user.get().then((u) => {
      if (!u) return
      if (u.username) setUsername(u.username)
      if (u.name) setName(u.name)
      if (u.monthly_salary != null) setSalary(String(u.monthly_salary))
      if (u.employer_name) setEmployer(u.employer_name)
      setFyStart(u.fy_start_month)
    })
  }, [])

  async function handleNext(): Promise<boolean> {
    setError(null)
    const salaryNum = Number(salary)
    if (!username.trim() || !name.trim() || !employer.trim() || !salary.trim()) {
      setError('Username, name, monthly salary, and employer are required.')
      return false
    }
    if (!Number.isFinite(salaryNum) || salaryNum <= 0) {
      setError('Enter a valid monthly salary.')
      return false
    }

    setBusy(true)
    try {
      await ipc.user.update({
        username: username.trim(),
        name: name.trim(),
        monthly_salary: salaryNum,
        employer_name: employer.trim(),
        fy_start_month: fyStart
      })
      // Mirror the username outside the vault so the unlock screen can greet by name.
      await ipc.settings.setProfile({ username: username.trim() })
      return true
    } catch {
      setError('Could not save your profile. Please try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepLayout
      title="Your profile"
      description="Basic details used for savings-rate and salary detection."
      onNext={handleNext}
      canGoBack={false}
      busy={busy}
    >
      <div className="space-y-4">
        <Field label="Username" required hint="Shown when you unlock the app.">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="saurabh" />
        </Field>
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Saurabh" />
        </Field>
        <Field label="Monthly salary (post-tax, ₹)" required hint="Used to compute your savings rate.">
          <Input
            type="number"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            placeholder="150000"
          />
        </Field>
        <Field
          label="Employer / company name"
          required
          hint="Matched against credit narrations to auto-detect salary."
        >
          <Input value={employer} onChange={(e) => setEmployer(e.target.value)} placeholder="Acme Corp" />
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

      {error && <p className="mt-4 text-sm text-negative">{error}</p>}
    </StepLayout>
  )
}
