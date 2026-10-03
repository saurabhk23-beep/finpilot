import { useEffect, useState } from 'react'
import { ipc } from '../../../lib/ipc'
import type { Stock } from '../../../types'
import { Button, Card, Field, Input, Select } from '../../../components/ui'
import { CasImporter, BrokerImporter } from '../../../components/InvestmentImporters'
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

  async function refresh() {
    setStocks(await ipc.investments.listStocks())
  }

  useEffect(() => {
    refresh()
  }, [])

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
      description="Import your mutual-fund and stock statements (add as many as you like), or add stocks manually."
      canSkip
    >
      <CasImporter />
      <BrokerImporter onImported={refresh} />

      <Card>
        <p className="mb-1 text-sm font-medium text-slate-700">Add a stock manually</p>
        <p className="mb-4 text-xs text-slate-400">Fallback if you don't have a broker export.</p>

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
