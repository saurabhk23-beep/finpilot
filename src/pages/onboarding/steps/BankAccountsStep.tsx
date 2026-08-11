import { useEffect, useState } from 'react'
import { ipc, type PickedFile } from '../../../lib/ipc'
import { INDIAN_BANKS } from '../../../lib/banks'
import type { Account, AccountType } from '../../../types'
import { Button, Card, Field, Input, Select } from '../../../components/ui'
import { Combobox } from '../../../components/Combobox'
import { FilePicker } from '../../../components/FilePicker'
import { useOnboardingStore } from '../../../stores/onboardingStore'
import StepLayout from '../StepLayout'

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'savings', label: 'Savings' },
  { value: 'current', label: 'Current' },
  { value: 'salary', label: 'Salary' }
]

const emptyForm = {
  bank: '',
  nickname: '',
  last4: '',
  type: 'savings' as AccountType,
  opening_balance: ''
}

export default function BankAccountsStep() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [form, setForm] = useState(emptyForm)
  const [files, setFiles] = useState<PickedFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const setPendingFiles = useOnboardingStore((s) => s.setPendingFiles)

  async function refresh() {
    // Show only real bank accounts here, not the cash container.
    const all = await ipc.accounts.list()
    setAccounts(all.filter((a) => a.type !== 'cash'))
  }

  useEffect(() => {
    refresh()
  }, [])

  async function addAccount() {
    setError(null)
    if (!form.bank.trim() || !form.nickname.trim()) {
      setError('Bank and nickname are required.')
      return
    }
    if (form.last4 && !/^\d{4}$/.test(form.last4)) {
      setError('Last 4 digits must be exactly 4 numbers.')
      return
    }

    const created = await ipc.accounts.create({
      bank: form.bank.trim(),
      nickname: form.nickname.trim(),
      last4: form.last4 || undefined,
      type: form.type,
      opening_balance: form.opening_balance ? Number(form.opening_balance) : undefined
    })

    if (files.length > 0) {
      setPendingFiles(`account:${created.id}`, files)
    }

    setForm(emptyForm)
    setFiles([])
    await refresh()
  }

  async function removeAccount(id: number) {
    await ipc.accounts.delete(id)
    await refresh()
  }

  return (
    <StepLayout
      title="Bank accounts"
      description="Add each account and attach its statement(s). You can add more later."
      canSkip={accounts.length === 0}
    >
      {accounts.length > 0 && (
        <ul className="mb-6 space-y-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-md border border-border bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{a.nickname}</p>
                <p className="text-xs text-slate-400">
                  {a.bank} · {a.type}
                  {a.last4 ? ` · ••${a.last4}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeAccount(a.id)}
                className="text-xs text-negative hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <p className="mb-4 text-sm font-medium text-slate-700">Add a bank account</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bank" required>
            <Combobox
              value={form.bank}
              onChange={(bank) => setForm((f) => ({ ...f, bank }))}
              options={INDIAN_BANKS}
              placeholder="Search banks…"
            />
          </Field>
          <Field label="Nickname" required>
            <Input
              value={form.nickname}
              onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
              placeholder="ICICI Salary"
            />
          </Field>
          <Field label="Account type" required>
            <Select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AccountType }))}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Last 4 digits">
            <Input
              value={form.last4}
              onChange={(e) => setForm((f) => ({ ...f, last4: e.target.value }))}
              placeholder="1234"
              maxLength={4}
            />
          </Field>
          <Field label="Opening balance (₹)">
            <Input
              type="number"
              value={form.opening_balance}
              onChange={(e) => setForm((f) => ({ ...f, opening_balance: e.target.value }))}
              placeholder="0"
            />
          </Field>
          <Field label="Statement(s)">
            <FilePicker files={files} onChange={setFiles} accept={['pdf', 'csv']} label="Attach PDF/CSV" />
          </Field>
        </div>

        {error && <p className="mt-3 text-sm text-negative">{error}</p>}

        <div className="mt-4">
          <Button type="button" onClick={addAccount}>
            Add account
          </Button>
        </div>
      </Card>
    </StepLayout>
  )
}
