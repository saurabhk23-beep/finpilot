import { useEffect, useState } from 'react'
import { ipc, type PickedFile } from '../../../lib/ipc'
import { INDIAN_BANKS } from '../../../lib/banks'
import type { Account, CreditCard } from '../../../types'
import { Button, Card, Field, Input, Select } from '../../../components/ui'
import { Combobox } from '../../../components/Combobox'
import { FilePicker } from '../../../components/FilePicker'
import { useOnboardingStore } from '../../../stores/onboardingStore'
import StepLayout from '../StepLayout'

const emptyForm = {
  issuer: '',
  nickname: '',
  last4: '',
  credit_limit: '',
  bill_date: '',
  linked_account_id: ''
}

export default function CreditCardsStep() {
  const [cards, setCards] = useState<CreditCard[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [form, setForm] = useState(emptyForm)
  const [files, setFiles] = useState<PickedFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const setPendingFiles = useOnboardingStore((s) => s.setPendingFiles)

  async function refresh() {
    const [cardList, accountList] = await Promise.all([ipc.creditCards.list(), ipc.accounts.list()])
    setCards(cardList)
    setAccounts(accountList.filter((a) => a.type !== 'cash'))
  }

  useEffect(() => {
    refresh()
  }, [])

  async function addCard() {
    setError(null)
    if (!form.issuer.trim() || !form.nickname.trim()) {
      setError('Issuer and nickname are required.')
      return
    }
    const limit = Number(form.credit_limit)
    if (!form.credit_limit || !Number.isFinite(limit) || limit <= 0) {
      setError('Enter a valid credit limit.')
      return
    }
    if (form.last4 && !/^\d{4}$/.test(form.last4)) {
      setError('Last 4 digits must be exactly 4 numbers.')
      return
    }

    const created = await ipc.creditCards.create({
      issuer: form.issuer.trim(),
      nickname: form.nickname.trim(),
      last4: form.last4 || undefined,
      credit_limit: limit,
      bill_date: form.bill_date ? Number(form.bill_date) : undefined,
      linked_account_id: form.linked_account_id ? Number(form.linked_account_id) : undefined
    })

    if (files.length > 0) {
      setPendingFiles(`card:${created.id}`, files)
    }

    setForm(emptyForm)
    setFiles([])
    await refresh()
  }

  async function removeCard(id: number) {
    await ipc.creditCards.delete(id)
    await refresh()
  }

  return (
    <StepLayout
      title="Credit cards"
      description="Add each card and attach its statement(s). Link to a bank account for bill-payment detection."
      canSkip={cards.length === 0}
    >
      {cards.length > 0 && (
        <ul className="mb-6 space-y-2">
          {cards.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-md border border-border bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{c.nickname}</p>
                <p className="text-xs text-slate-400">
                  {c.issuer} · limit ₹{c.credit_limit.toLocaleString('en-IN')}
                  {c.last4 ? ` · ••${c.last4}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeCard(c.id)}
                className="text-xs text-negative hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <p className="mb-4 text-sm font-medium text-slate-700">Add a credit card</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Issuer" required>
            <Combobox
              value={form.issuer}
              onChange={(issuer) => setForm((f) => ({ ...f, issuer }))}
              options={INDIAN_BANKS}
              placeholder="Search issuers…"
            />
          </Field>
          <Field label="Nickname" required>
            <Input
              value={form.nickname}
              onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
              placeholder="HDFC Regalia"
            />
          </Field>
          <Field label="Credit limit (₹)" required>
            <Input
              type="number"
              value={form.credit_limit}
              onChange={(e) => setForm((f) => ({ ...f, credit_limit: e.target.value }))}
              placeholder="200000"
            />
          </Field>
          <Field label="Last 4 digits">
            <Input
              value={form.last4}
              onChange={(e) => setForm((f) => ({ ...f, last4: e.target.value }))}
              placeholder="1234"
              maxLength={4}
            />
          </Field>
          <Field label="Bill cycle date" hint="Day of month the statement generates.">
            <Input
              type="number"
              value={form.bill_date}
              onChange={(e) => setForm((f) => ({ ...f, bill_date: e.target.value }))}
              placeholder="15"
              min={1}
              max={31}
            />
          </Field>
          <Field label="Linked bank account">
            <Select
              value={form.linked_account_id}
              onChange={(e) => setForm((f) => ({ ...f, linked_account_id: e.target.value }))}
            >
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nickname} ({a.bank})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Statement(s)">
            <FilePicker files={files} onChange={setFiles} accept={['pdf']} label="Attach PDF" />
          </Field>
        </div>

        {error && <p className="mt-3 text-sm text-negative">{error}</p>}

        <div className="mt-4">
          <Button type="button" onClick={addCard}>
            Add card
          </Button>
        </div>
      </Card>
    </StepLayout>
  )
}
