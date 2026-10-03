import { useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { Account, CreditCard } from '../../types'
import { Button, Card, Field, Input, Select } from '../../components/ui'
import { Combobox } from '../../components/Combobox'
import { StatementImport } from '../../components/StatementImport'
import { INDIAN_BANKS } from '../../lib/banks'
import { formatINR } from '../../utils/format'
import { SettingsSectionShell } from './SettingsSectionShell'

const emptyForm = { issuer: '', nickname: '', last4: '', credit_limit: '', bill_date: '', linked_account_id: '' }

export function CardsSettings() {
  const [cards, setCards] = useState<CreditCard[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [importFor, setImportFor] = useState<number | null>(null)

  async function refresh() {
    const [c, a] = await Promise.all([ipc.creditCards.list(), ipc.accounts.list()])
    setCards(c)
    setAccounts(a.filter((x) => x.type !== 'cash'))
  }
  useEffect(() => {
    refresh()
  }, [])

  async function add() {
    setError(null)
    const limit = Number(form.credit_limit)
    if (!form.issuer.trim() || !form.nickname.trim() || !Number.isFinite(limit) || limit <= 0) {
      setError('Issuer, nickname, and a valid credit limit are required.')
      return
    }
    await ipc.creditCards.create({
      issuer: form.issuer.trim(),
      nickname: form.nickname.trim(),
      last4: form.last4 || undefined,
      credit_limit: limit,
      bill_date: form.bill_date ? Number(form.bill_date) : undefined,
      linked_account_id: form.linked_account_id ? Number(form.linked_account_id) : undefined
    })
    setForm(emptyForm)
    await refresh()
  }

  async function rename(c: CreditCard, nickname: string) {
    await ipc.creditCards.update(c.id, { nickname })
    await refresh()
  }

  async function remove(id: number) {
    await ipc.creditCards.delete(id)
    await refresh()
  }

  return (
    <SettingsSectionShell title="Credit cards" description="Add, rename, or remove cards. Link to a bank account for bill-payment detection.">
      {cards.map((c) => (
        <Card key={c.id}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <Input
                defaultValue={c.nickname}
                onBlur={(e) => e.target.value.trim() && e.target.value !== c.nickname && rename(c, e.target.value.trim())}
                className="font-medium"
              />
              <p className="mt-1 text-xs text-slate-400">
                {c.issuer} · limit {formatINR(c.credit_limit)}
                {c.last4 ? ` · ••${c.last4}` : ''}
              </p>
            </div>
            <div className="flex flex-none items-center gap-3">
              <button
                type="button"
                onClick={() => setImportFor((cur) => (cur === c.id ? null : c.id))}
                className="text-xs text-primary hover:underline"
              >
                {importFor === c.id ? 'Close import' : 'Import statement'}
              </button>
              <button type="button" onClick={() => remove(c.id)} className="text-xs text-negative hover:underline">
                Remove
              </button>
            </div>
          </div>
          {importFor === c.id && (
            <div className="mt-4">
              <StatementImport
                target={{ kind: 'card', cardId: c.id, label: c.nickname }}
                bankHint={c.issuer}
                onClose={() => setImportFor(null)}
              />
            </div>
          )}
        </Card>
      ))}

      <Card>
        <p className="mb-4 text-sm font-medium text-slate-700">Add a card</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Issuer" required>
            <Combobox value={form.issuer} onChange={(issuer) => setForm((f) => ({ ...f, issuer }))} options={INDIAN_BANKS} placeholder="Search issuers…" />
          </Field>
          <Field label="Nickname" required>
            <Input value={form.nickname} onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))} placeholder="HDFC Regalia" />
          </Field>
          <Field label="Credit limit (₹)" required>
            <Input type="number" value={form.credit_limit} onChange={(e) => setForm((f) => ({ ...f, credit_limit: e.target.value }))} placeholder="200000" />
          </Field>
          <Field label="Last 4 digits">
            <Input value={form.last4} onChange={(e) => setForm((f) => ({ ...f, last4: e.target.value }))} maxLength={4} placeholder="1234" />
          </Field>
          <Field label="Bill cycle date">
            <Input type="number" value={form.bill_date} onChange={(e) => setForm((f) => ({ ...f, bill_date: e.target.value }))} min={1} max={31} placeholder="15" />
          </Field>
          <Field label="Linked bank account">
            <Select value={form.linked_account_id} onChange={(e) => setForm((f) => ({ ...f, linked_account_id: e.target.value }))}>
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.nickname}</option>
              ))}
            </Select>
          </Field>
        </div>
        {error && <p className="mt-3 text-sm text-negative">{error}</p>}
        <div className="mt-4">
          <Button onClick={add}>Add card</Button>
        </div>
      </Card>
    </SettingsSectionShell>
  )
}
