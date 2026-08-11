/**
 * Detects money that moved *within* a user's own accounts (so it isn't counted
 * as income/expense): inter-account transfers and credit-card bill payments.
 * Pure and deterministic — the DB apply/IPC layers sit on top.
 */

export interface DetectorTransaction {
  id: number
  account_id: number | null
  card_id: number | null
  date: string // ISO YYYY-MM-DD
  amount: number
  type: 'credit' | 'debit'
  narration: string
  is_transfer: 0 | 1
  is_cc_payment: 0 | 1
}

export interface DetectorCard {
  id: number
  linked_account_id: number | null
}

export type MatchKind = 'inter-account' | 'cc-payment'

export interface TransferMatch {
  debitId: number
  creditId: number
  kind: MatchKind
}

export interface AmbiguousMatch {
  debitId: number
  candidateCreditIds: number[]
  kind: MatchKind
}

export interface DetectionResult {
  matches: TransferMatch[]
  ambiguous: AmbiguousMatch[]
}

export interface DetectorOptions {
  /** Max |date difference| (days) for an inter-account debit↔credit pair. Default 1 (same/next day). */
  transferWindowDays?: number
  /** Max |date difference| (days) for a bank-debit↔card-credit CC payment. Default 3. */
  ccWindowDays?: number
}

const TRANSFER_KEYWORDS = /\b(NEFT|IMPS|RTGS|UPI|TRANSFER|FUND\s*TRANSFER|SELF)\b/i
const CC_PAYMENT_KEYWORDS = /\b(CREDIT\s*CARD|CC\s*PAYMENT|CARD\s*PAYMENT|CARD\s*BILL|VISA|MASTERCARD|RUPAY|AUTOPAY)\b/i

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(Date.parse(a) - Date.parse(b))
  return Math.round(ms / 86_400_000)
}

function amountsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01
}

/** Has this transaction already been tagged as a transfer/CC payment (so we skip it, keeping detection idempotent)? */
function alreadyTagged(t: DetectorTransaction): boolean {
  return t.is_transfer === 1 || t.is_cc_payment === 1
}

export function hasTransferKeyword(narration: string): boolean {
  return TRANSFER_KEYWORDS.test(narration)
}

export function hasCcPaymentKeyword(narration: string): boolean {
  return CC_PAYMENT_KEYWORDS.test(narration)
}

/**
 * Runs CC-payment detection first (so a "CREDIT CARD PAYMENT" bank debit is
 * consumed there rather than as a generic transfer), then inter-account
 * transfers on what remains. A debit with exactly one candidate credit is
 * matched; multiple candidates are reported as ambiguous for the user to
 * resolve rather than guessed.
 */
export function detectTransfers(
  transactions: DetectorTransaction[],
  cards: DetectorCard[],
  options: DetectorOptions = {}
): DetectionResult {
  const transferWindow = options.transferWindowDays ?? 1
  const ccWindow = options.ccWindowDays ?? 3
  const cardById = new Map(cards.map((c) => [c.id, c]))

  const matches: TransferMatch[] = []
  const ambiguous: AmbiguousMatch[] = []
  const consumed = new Set<number>() // transaction ids already used in a match

  const available = transactions.filter((t) => !alreadyTagged(t))
  const debits = available.filter((t) => t.type === 'debit')
  const credits = available.filter((t) => t.type === 'credit')

  function findMatch(
    debit: DetectorTransaction,
    isCandidate: (credit: DetectorTransaction) => boolean,
    windowDays: number,
    kind: MatchKind,
    rank?: (credit: DetectorTransaction) => number
  ): boolean {
    let candidates = credits.filter(
      (c) =>
        !consumed.has(c.id) &&
        isCandidate(c) &&
        amountsEqual(c.amount, debit.amount) &&
        daysBetween(c.date, debit.date) <= windowDays
    )
    if (candidates.length === 0) return false

    if (candidates.length > 1 && rank) {
      // A ranking hint (e.g. the card's linked account) can break a tie down to one.
      const scored = candidates.map((c) => ({ c, score: rank(c) }))
      const best = Math.max(...scored.map((s) => s.score))
      const top = scored.filter((s) => s.score === best).map((s) => s.c)
      if (top.length === 1) candidates = top
    }

    if (candidates.length === 1) {
      const credit = candidates[0]
      consumed.add(debit.id)
      consumed.add(credit.id)
      matches.push({ debitId: debit.id, creditId: credit.id, kind })
      return true
    }

    ambiguous.push({ debitId: debit.id, candidateCreditIds: candidates.map((c) => c.id), kind })
    return false
  }

  // Pass 1 — CC bill payments: a bank-account debit paying off a card, matched to
  // the "payment received" credit posted on that card.
  for (const debit of debits) {
    if (consumed.has(debit.id) || debit.account_id === null) continue
    const matched = findMatch(
      debit,
      (credit) => credit.card_id !== null,
      ccWindow,
      'cc-payment',
      (credit) => {
        // Prefer the card whose linked bank account is the debit's account.
        const card = credit.card_id !== null ? cardById.get(credit.card_id) : undefined
        return card && card.linked_account_id === debit.account_id ? 1 : 0
      }
    )
    if (matched) continue
  }

  // Pass 2 — inter-account transfers: a debit in one bank account matched to a
  // credit of the same amount in a *different* bank account.
  for (const debit of debits) {
    if (consumed.has(debit.id) || debit.account_id === null) continue
    findMatch(
      debit,
      (credit) => credit.account_id !== null && credit.account_id !== debit.account_id,
      transferWindow,
      'inter-account'
    )
  }

  return { matches, ambiguous }
}
