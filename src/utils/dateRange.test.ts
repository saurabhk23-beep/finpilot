import { describe, expect, it } from 'vitest'
import { resolveRange } from './dateRange'

// Fixed "now": 2026-08-10.
const now = new Date(2026, 7, 10)

describe('resolveRange', () => {
  it('thisMonth spans the current calendar month', () => {
    expect(resolveRange('thisMonth', now)).toEqual({ dateFrom: '2026-08-01', dateTo: '2026-08-31' })
  })

  it('lastMonth spans the previous month', () => {
    expect(resolveRange('lastMonth', now)).toEqual({ dateFrom: '2026-07-01', dateTo: '2026-07-31' })
  })

  it('last3m covers this month plus the two prior', () => {
    expect(resolveRange('last3m', now)).toEqual({ dateFrom: '2026-06-01', dateTo: '2026-08-31' })
  })

  it('last6m covers this month plus the five prior, crossing the year boundary correctly', () => {
    expect(resolveRange('last6m', now)).toEqual({ dateFrom: '2026-03-01', dateTo: '2026-08-31' })
  })

  it('ytd runs from Jan 1 to today', () => {
    expect(resolveRange('ytd', now)).toEqual({ dateFrom: '2026-01-01', dateTo: '2026-08-10' })
  })
})
