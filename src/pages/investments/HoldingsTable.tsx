import type { MFHolding, StockHolding } from '../../types'
import { formatINR } from '../../utils/format'

function gainClass(n: number): string {
  return n > 0 ? 'text-positive' : n < 0 ? 'text-negative' : 'text-slate-500'
}

function Num({ value, pct }: { value: number; pct?: number }) {
  return (
    <span className={gainClass(value)}>
      {formatINR(value)}
      {pct != null && <span className="ml-1 text-xs">({pct >= 0 ? '+' : ''}{pct}%)</span>}
    </span>
  )
}

const th = 'py-2 px-3 font-medium text-xs uppercase tracking-wide text-slate-400'
const td = 'py-2 px-3 whitespace-nowrap'

export function MFHoldingsTable({ holdings, onSelect }: { holdings: MFHolding[]; onSelect: (h: MFHolding) => void }) {
  if (holdings.length === 0) {
    return <div className="flex h-32 items-center justify-center text-sm text-slate-400">No mutual fund holdings yet.</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className={th}>Scheme</th>
            <th className={`${th} text-right`}>Units</th>
            <th className={`${th} text-right`}>Avg NAV</th>
            <th className={`${th} text-right`}>Cur NAV</th>
            <th className={`${th} text-right`}>Invested</th>
            <th className={`${th} text-right`}>Value</th>
            <th className={`${th} text-right`}>Gain / Loss</th>
            <th className={`${th} text-right`}>XIRR</th>
            <th className={`${th} text-right`}>Day</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr
              key={h.schemeId}
              onClick={() => onSelect(h)}
              className="cursor-pointer border-b border-slate-50 hover:bg-slate-50"
            >
              <td className={td}>
                <div className="max-w-xs truncate font-medium text-slate-700" title={h.schemeName}>
                  {h.schemeName}
                </div>
                <div className="text-xs text-slate-400">Folio {h.folio}</div>
              </td>
              <td className={`${td} text-right`}>{h.units}</td>
              <td className={`${td} text-right`}>{formatINR(h.avgNav, { decimals: true })}</td>
              <td className={`${td} text-right`}>{formatINR(h.currentNav, { decimals: true })}</td>
              <td className={`${td} text-right`}>{formatINR(h.invested)}</td>
              <td className={`${td} text-right`}>{formatINR(h.currentValue)}</td>
              <td className={`${td} text-right`}><Num value={h.gainLoss} pct={h.gainLossPct} /></td>
              <td className={`${td} text-right ${h.xirrPct != null ? gainClass(h.xirrPct) : ''}`}>
                {h.xirrPct != null ? `${h.xirrPct}%` : '—'}
              </td>
              <td className={`${td} text-right`}><Num value={h.dayChange} pct={h.dayChangePct} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function StockHoldingsTable({
  holdings,
  onSelect
}: {
  holdings: StockHolding[]
  onSelect: (h: StockHolding) => void
}) {
  if (holdings.length === 0) {
    return <div className="flex h-32 items-center justify-center text-sm text-slate-400">No stock holdings yet.</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className={th}>Stock</th>
            <th className={`${th} text-right`}>Qty</th>
            <th className={`${th} text-right`}>Avg Buy</th>
            <th className={`${th} text-right`}>Cur Price</th>
            <th className={`${th} text-right`}>Invested</th>
            <th className={`${th} text-right`}>Value</th>
            <th className={`${th} text-right`}>Gain / Loss</th>
            <th className={`${th} text-right`}>XIRR</th>
            <th className={`${th} text-right`}>Day</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr
              key={h.stockId}
              onClick={() => onSelect(h)}
              className="cursor-pointer border-b border-slate-50 hover:bg-slate-50"
            >
              <td className={td}>
                <span className="font-medium text-slate-700">{h.symbol}</span>
                {h.exchange && <span className="ml-1 text-xs text-slate-400">{h.exchange}</span>}
              </td>
              <td className={`${td} text-right`}>{h.qty}</td>
              <td className={`${td} text-right`}>{formatINR(h.avgBuyPrice, { decimals: true })}</td>
              <td className={`${td} text-right`}>{formatINR(h.currentPrice, { decimals: true })}</td>
              <td className={`${td} text-right`}>{formatINR(h.invested)}</td>
              <td className={`${td} text-right`}>{formatINR(h.currentValue)}</td>
              <td className={`${td} text-right`}><Num value={h.gainLoss} pct={h.gainLossPct} /></td>
              <td className={`${td} text-right ${h.xirrPct != null ? gainClass(h.xirrPct) : ''}`}>
                {h.xirrPct != null ? `${h.xirrPct}%` : '—'}
              </td>
              <td className={`${td} text-right`}><Num value={h.dayChange} pct={h.dayChangePct} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
