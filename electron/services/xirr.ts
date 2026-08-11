export interface CashFlow {
  amount: number // negative = money invested (outflow), positive = money received (inflow)
  date: string // ISO YYYY-MM-DD
}

const DAYS_PER_YEAR = 365

function yearFraction(from: number, to: number): number {
  return (to - from) / (DAYS_PER_YEAR * 86_400_000)
}

/** Net present value of the cashflows at an annual `rate`, discounted from the earliest date. */
function npv(cashflows: CashFlow[], rate: number, t0: number): number {
  let sum = 0
  for (const cf of cashflows) {
    const t = yearFraction(t0, Date.parse(cf.date))
    sum += cf.amount / Math.pow(1 + rate, t)
  }
  return sum
}

/** Derivative of npv w.r.t. rate — used by Newton-Raphson. */
function dNpv(cashflows: CashFlow[], rate: number, t0: number): number {
  let sum = 0
  for (const cf of cashflows) {
    const t = yearFraction(t0, Date.parse(cf.date))
    if (t === 0) continue
    sum += (-t * cf.amount) / Math.pow(1 + rate, t + 1)
  }
  return sum
}

/**
 * Annualized internal rate of return for a series of dated cashflows (as a
 * decimal, e.g. 0.15 = 15%). Newton-Raphson from a sensible guess, falling back
 * to bisection if it doesn't converge or leaves the valid domain (rate > -1).
 *
 * Returns null when a rate is undefined: fewer than two flows, or all flows the
 * same sign (no solution where NPV crosses zero).
 */
export function xirr(cashflows: CashFlow[]): number | null {
  if (cashflows.length < 2) return null
  const hasPositive = cashflows.some((c) => c.amount > 0)
  const hasNegative = cashflows.some((c) => c.amount < 0)
  if (!hasPositive || !hasNegative) return null

  const t0 = Math.min(...cashflows.map((c) => Date.parse(c.date)))

  // Newton-Raphson.
  let rate = 0.1
  for (let i = 0; i < 100; i++) {
    const value = npv(cashflows, rate, t0)
    if (Math.abs(value) < 1e-7) return rate
    const deriv = dNpv(cashflows, rate, t0)
    if (deriv === 0) break
    const next = rate - value / deriv
    if (!Number.isFinite(next) || next <= -0.999999) break
    if (Math.abs(next - rate) < 1e-9) return next
    rate = next
  }

  // Bisection fallback over a wide bracket, expanding until it brackets a root.
  let low = -0.9999
  let high = 10
  let fLow = npv(cashflows, low, t0)
  let fHigh = npv(cashflows, high, t0)
  let expand = 0
  while (fLow * fHigh > 0 && expand < 60) {
    high *= 2
    fHigh = npv(cashflows, high, t0)
    expand++
  }
  if (fLow * fHigh > 0) return null

  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2
    const fMid = npv(cashflows, mid, t0)
    if (Math.abs(fMid) < 1e-7) return mid
    if (fLow * fMid < 0) {
      high = mid
      fHigh = fMid
    } else {
      low = mid
      fLow = fMid
    }
  }
  return (low + high) / 2
}

/** XIRR as a percentage rounded to 1 dp, or null when undefined. */
export function xirrPercent(cashflows: CashFlow[]): number | null {
  const rate = xirr(cashflows)
  if (rate === null) return null
  return Math.round(rate * 1000) / 10
}
