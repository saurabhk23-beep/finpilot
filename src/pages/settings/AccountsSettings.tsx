import { useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { Account, AccountType } from '../../types'
import { Button, Card, Field, Input, Select } from '../../components/ui'
import { Combobox } from '../../components/Combobox'
import { INDIAN_BANKS } from '../../lib/banks'
import { formatINR } from '../../utils/format'
import { SettingsSectionShell } from './SettingsSectionShell'

const TYPES: { value: AccountType; label: string }[] = [
  { value: 'savings', label: 'Savings' },
  { value: 'current', label: 'Current' },
  { value: 'salary', label: 'Salary' }
]

const emptyForm = { bank: '', nickname: '', last4: '', type: 'savings' as AccountType, opening_balance: '' }

export function AccountsSettings() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const all = await ipc.accounts.list()
    setAccounts(all.filter((a) => a.type !== 'cash'))
  }
  useEffect(() => {
    refresh()
  }, [])

  async function add() {
    setError(null)
    if (!form.bank.trim() || !form.nickname.trim()) {
      setError('Bank and nickname are required.')
      return
    }
    await ipc.accounts.create({
      bank: form.bank.trim(),
      nickname: form.nickname.trim(),
      last4: form.last4 || undefined,
      type: form.type,
      opening_balance: form.opening_balance ? Number(form.opening_balance) : undefined
    })
    setForm(emptyForm)
    await refresh()
  }

  async function rename(a: Account, nickname: string) {
    await ipc.accounts.update(a.id, { nickname })
    await refresh()
  }

  async function remove(id: number) {
    await ipc.accounts.delete(id)
    await refresh()
  }

  return (
    <SettingsSectionShell title="Bank accounts" description="Add, rename, or remove your accounts.">
      {accounts.map((a) => (
        <Card key={a.id}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <Input
                defaultValue={a.nickname}
                onBlur={(e) => e.target.value.trim() && e.target.value !== a.nickname && rename(a, e.target.value.trim())}
                className="font-medium"
              />
              <p className="mt-1 text-xs text-slate-400">
                {a.bank} · {a.type}
                {a.last4 ? ` · ••${a.last4}` : ''} · opening {formatINR(a.opening_balance)}
              </p>
            </div>
            <button type="button" onClick={() => remove(a.id)} className="text-xs text-negative hover:underline">
              Remove
            </button>
          </div>
        </Card>
      ))}

      <Card>
        <p className="mb-4 text-sm font-medium text-slate-700">Add an account</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bank" required>
            <Combobox value={form.bank} onChange={(bank) => setForm((f) => ({ ...f, bank }))} options={INDIAN_BANKS} placeholder="Search banks…" />
          </Field>
          <Field label="Nickname" required>
            <Input value={form.nickname} onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))} placeholder="ICICI Salary" />
          </Field>
          <Field label="Type" required>
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AccountType }))}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Last 4 digits">
            <Input value={form.last4} onChange={(e) => setForm((f) => ({ ...f, last4: e.target.value }))} maxLength={4} placeholder="1234" />
          </Field>
          <Field label="Opening balance (₹)">
            <Input type="number" value={form.opening_balance} onChange={(e) => setForm((f) => ({ ...f, opening_balance: e.target.value }))} placeholder="0" />
          </Field>
        </div>
        {error && <p className="mt-3 text-sm text-negative">{error}</p>}
        <div className="mt-4">
          <Button onClick={add}>Add account</Button>
        </div>
      </Card>
    </SettingsSectionShell>
  )
}
