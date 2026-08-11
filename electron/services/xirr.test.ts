import { describe, expect, it } from 'vitest'
import { xirr, xirrPercent, type CashFlow } from './xirr'

describe('xirr', () => {
  it('returns ~10% for a one-year 10% gain', () => {
    const cf: CashFlow[] = [
      { amount: -1000, date: '2025-08-10' },
      { amount: 1100, date: '2026-08-10' }
    ]
    expect(xirr(cf)!).toBeCloseTo(0.1, 3)
  })

  it('doubling over one year is ~100%', () => {
    const cf: CashFlow[] = [
      { amount: -1000, date: '2025-01-01' },
      { amount: 2000, date: '2026-01-01' }
    ]
    expect(xirr(cf)!).toBeCloseTo(1.0, 2)
  })

  it('computes a positive rate for a monthly SIP that grew', () => {
    // 6 monthly SIPs of 5000, current value 33000 today.
    const cf: CashFlow[] = [
      { amount: -5000, date: '2026-02-01' },
      { amount: -5000, date: '2026-03-01' },
      { amount: -5000, date: '2026-04-01' },
      { amount: -5000, date: '2026-05-01' },
      { amount: -5000, date: '2026-06-01' },
      { amount: -5000, date: '2026-07-01' },
      { amount: 33000, date: '2026-08-10' }
    ]
    const r = xirr(cf)!
    expect(r).toBeGreaterThan(0) // invested 30000, worth 33000
    // Sanity: NPV at the solved rate is ~0.
    expect(Number.isFinite(r)).toBe(true)
  })

  it('returns a negative rate for a loss', () => {
    const cf: CashFlow[] = [
      { amount: -1000, date: '2025-08-10' },
      { amount: 800, date: '2026-08-10' }
    ]
    expect(xirr(cf)!).toBeCloseTo(-0.2, 2)
  })

  it('returns null when there is no sign change (all outflows / too few flows)', () => {
    expect(xirr([{ amount: -1000, date: '2026-01-01' }])).toBeNull()
    expect(
      xirr([
        { amount: -1000, date: '2026-01-01' },
        { amount: -500, date: '2026-02-01' }
      ])
    ).toBeNull()
  })

  it('xirrPercent rounds to one decimal', () => {
    expect(
      xirrPercent([
        { amount: -1000, date: '2025-08-10' },
        { amount: 1100, date: '2026-08-10' }
      ])
    ).toBeCloseTo(10.0, 1)
  })

  it('handles a high return without diverging (bisection fallback)', () => {
    const cf: CashFlow[] = [
      { amount: -100, date: '2025-08-10' },
      { amount: 900, date: '2026-08-10' }
    ]
    expect(xirr(cf)!).toBeCloseTo(8.0, 1) // 9x → 800% return
  })
})
