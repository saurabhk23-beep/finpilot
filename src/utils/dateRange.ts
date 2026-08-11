export type TimeRangePreset = 'thisMonth' | 'lastMonth' | 'last3m' | 'last6m' | 'ytd' | 'custom'

export interface DateRange {
  dateFrom: string
  dateTo: string
}

export const RANGE_LABELS: Record<TimeRangePreset, string> = {
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
  last3m: 'Last 3 Months',
  last6m: 'Last 6 Months',
  ytd: 'Year to Date',
  custom: 'Custom'
}

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Resolves a preset to a concrete {dateFrom, dateTo}. `now` is injectable for
 * tests. `fyStartMonth` (1-12) is used for a future FY-based YTD; the default
 * YTD here is calendar-year-to-date.
 */
export function resolveRange(preset: TimeRangePreset, now = new Date()): DateRange {
  const y = now.getFullYear()
  const m = now.getMonth() // 0-based

  switch (preset) {
    case 'thisMonth':
      return { dateFrom: iso(new Date(y, m, 1)), dateTo: iso(new Date(y, m + 1, 0)) }
    case 'lastMonth':
      return { dateFrom: iso(new Date(y, m - 1, 1)), dateTo: iso(new Date(y, m, 0)) }
    case 'last3m':
      return { dateFrom: iso(new Date(y, m - 2, 1)), dateTo: iso(new Date(y, m + 1, 0)) }
    case 'last6m':
      return { dateFrom: iso(new Date(y, m - 5, 1)), dateTo: iso(new Date(y, m + 1, 0)) }
    case 'ytd':
      return { dateFrom: iso(new Date(y, 0, 1)), dateTo: iso(now) }
    case 'custom':
      return { dateFrom: iso(new Date(y, m, 1)), dateTo: iso(new Date(y, m + 1, 0)) }
  }
}
