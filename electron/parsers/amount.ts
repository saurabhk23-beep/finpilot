/** Parses "1,234.56", "-450", "(450)", "₹ 200 Dr", "500 Cr" into a signed number; null if unparseable. */
export function parseAmount(raw: string | number | null | undefined): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null

  let s = String(raw).trim()
  if (s === '') return null

  let sign = 1
  // Accounting negatives: (450)
  if (/^\(.*\)$/.test(s)) {
    sign = -1
    s = s.slice(1, -1)
  }
  // Dr/Cr markers (common in Indian bank statements).
  if (/\bdr\b/i.test(s)) sign = -1
  if (/\bcr\b/i.test(s)) sign = 1
  if (s.trim().startsWith('-')) sign = -1

  const cleaned = s.replace(/[^0-9.]/g, '')
  if (cleaned === '' || cleaned === '.') return null
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return null
  return sign * num
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const yyyy = String(y).padStart(4, '0')
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Normalizes the date formats seen in Indian statements to ISO `YYYY-MM-DD`.
 * Handles: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD-Mon-YYYY, DD Mon YYYY,
 * YYYY-MM-DD, and 2-digit years. Day-first is assumed for all-numeric dates
 * (the Indian convention); ambiguous <=12/<=12 pairs still resolve day-first.
 * Returns null if it can't parse.
 */
export function parseIndianDate(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (s === '') return null

  // Already ISO (YYYY-MM-DD or YYYY/MM/DD).
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]))

  // DD-Mon-YYYY / DD Mon YYYY / DD-Mon-YY (e.g. 05-Jan-2026, 5 Jan 26).
  m = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,})[-\s/](\d{2,4})$/)
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()]
    if (!mon) return null
    return iso(normalizeYear(m[3]), mon, Number(m[1]))
  }

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (+ 2-digit year variants), day-first.
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (m) {
    return iso(normalizeYear(m[3]), Number(m[2]), Number(m[1]))
  }

  return null
}

function normalizeYear(raw: string): number {
  const n = Number(raw)
  if (raw.length <= 2) {
    // Two-digit year: 00–69 → 2000s, 70–99 → 1900s.
    return n <= 69 ? 2000 + n : 1900 + n
  }
  return n
}
