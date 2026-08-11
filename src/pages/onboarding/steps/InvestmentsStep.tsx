import { useEffect, useState } from 'react'
import { ipc } from '../../../lib/ipc'
import type { Stock } from '../../../types'
import { Button, Card, Field, Input, Select } from '../../../components/ui'
import StepLayout from '../StepLayout'

const emptyStock = {
  symbol: '',
  exchange: 'NSE' as 'NSE' | 'BSE',
  qty: '',
  price: '',
  date: ''
}

export default function InvestmentsStep() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [form, setForm] = useState(emptyStock)
  const [error, setError] = useState<string | null>(null)

  const [casPassword, setCasPassword] = useState('')
  const [casStatus, setCasStatus] = useState<string | null>(null)
  const [growwStatus, setGrowwStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'cas' | 'groww'>(null)

  async function refresh() {
    setStocks(await ipc.investments.listStocks())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function importCas() {
    setCasStatus(null)
    const files = await ipc.dialog.openFiles({ accept: ['pdf'], multiple: false })
    if (files.length === 0) return
    setBusy('cas')
    try {
      const r = await ipc.import.cas({ path: files[0].path, password: casPassword })
      setCasStatus(
        r.alreadyImported
          ? 'This CAS file was already imported.'
          : `Imported ${r.schemesCreated} scheme${r.schemesCreated === 1 ? '' : 's'}, ${r.transactionsImported} transactions.`
      )
    } catch (e) {
      setCasStatus(`Could not parse CAS: ${errorMessage(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function importGroww() {
    setGrowwStatus(null)
    const files = await ipc.dialog.openFiles({ accept: ['csv'], multiple: false })
    if (files.length === 0) return
    setBusy('groww')
    try {
      const r = await ipc.import.groww({ path: files[0].path })
      setGrowwStatus(
        r.alreadyImported
          ? 'This Groww file was already imported.'
          : `Imported ${r.stocksCreated} stock${r.stocksCreated === 1 ? '' : 's'}, ${r.tradesImported} trades.`
      )
      await refresh()
    } catch (e) {
      setGrowwStatus(`Could not parse Groww export: ${errorMessage(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function addStock() {
    setError(null)
    const qty = Number(form.qty)
    const price = Number(form.price)
    if (!form.symbol.trim()) {
      setError('Stock symbol is required.')
      return
    }
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
      setError('Enter a valid quantity and buy price.')
      return
    }
    if (!form.date) {
      setError('Buy date is required.')
      return
    }

    const stock = await ipc.investments.createStock({
      symbol: form.symbol.trim().toUpperCase(),
      exchange: form.exchange
    })
    await ipc.investments.createStockTransaction({
      stock_id: stock.id,
      date: form.date,
      type: 'buy',
      qty,
      price
    })

    setForm(emptyStock)
    await refresh()
  }

  return (
    <StepLayout
      title="Investments"
      description="Import your CAS (mutual funds) and Groww (stocks) exports, or add stocks manually."
      canSkip
    >
      <Card className="mb-5">
        <p className="mb-3 text-sm font-medium text-slate-700">Mutual funds — CAS PDF</p>
        <p className="mb-3 text-xs text-slate-400">
          CAMS/KFintech/MFCentral statement. Enter its password, then choose the file.
        </p>
        <div className="max-w-xs">
          <Field label="CAS password" hint="Usually your PAN (uppercase) or the password you set.">
            <Input
              type="password"
              value={casPassword}
              onChange={(e) => setCasPassword(e.target.value)}
              placeholder="ABCDE1234F"
            />
          </Field>
        </div>
        <div className="mt-3">
          <Button type="button" variant="secondary" onClick={importCas} disabled={busy !== null}>
            {busy === 'cas' ? 'Parsing…' : 'Choose CAS PDF'}
          </Button>
        </div>
        {casStatus && <p className="mt-2 text-xs text-slate-600">{casStatus}</p>}
      </Card>

      <Card className="mb-5">
        <p className="mb-3 text-sm font-medium text-slate-700">Stocks — Groww export</p>
        <p className="mb-3 text-xs text-slate-400">Groww trade-history CSV.</p>
        <Button type="button" variant="secondary" onClick={importGroww} disabled={busy !== null}>
          {busy === 'groww' ? 'Parsing…' : 'Choose Groww CSV'}
        </Button>
        {growwStatus && <p className="mt-2 text-xs text-slate-600">{growwStatus}</p>}
      </Card>

      <Card>
        <p className="mb-1 text-sm font-medium text-slate-700">Add a stock manually</p>
        <p className="mb-4 text-xs text-slate-400">Fallback if you don't have a Groww export.</p>

        {stocks.length > 0 && (
          <ul className="mb-4 space-y-1">
            {stocks.map((s) => (
              <li key={s.id} className="rounded-md bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                {s.symbol}
                {s.exchange ? ` · ${s.exchange}` : ''}
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Symbol" required>
            <Input
              value={form.symbol}
              onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
              placeholder="TCS"
            />
          </Field>
          <Field label="Exchange">
            <Select
              value={form.exchange}
              onChange={(e) => setForm((f) => ({ ...f, exchange: e.target.value as 'NSE' | 'BSE' }))}
            >
              <option value="NSE">NSE</option>
              <option value="BSE">BSE</option>
            </Select>
          </Field>
          <Field label="Quantity" required>
            <Input
              type="number"
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
              placeholder="10"
            />
          </Field>
          <Field label="Buy price (₹)" required>
            <Input
              type="number"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              placeholder="3800"
            />
          </Field>
          <Field label="Buy date" required>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </Field>
        </div>

        {error && <p className="mt-3 text-sm text-negative">{error}</p>}

        <div className="mt-4">
          <Button type="button" onClick={addStock}>
            Add stock
          </Button>
        </div>
      </Card>
    </StepLayout>
  )
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    // Electron wraps main-process throws as "Error invoking remote method 'x': Error: <msg>".
    const m = e.message.match(/:\s*(?:Error:\s*)?([^:]+)$/)
    return (m?.[1] ?? e.message).trim()
  }
  return 'unknown error'
}
