import type { TransactionDraft } from './types'

/** Minimal shape needed to dedup against already-stored transactions. */
export interface ExistingTransaction {
  date: string
  amount: number
  narration: string
}

/** Normalizes a narration for fuzzy-equality: trim, uppercase, collapse whitespace. */
function normalizeNarration(narration: string): string {
  return narration.trim().toUpperCase().replace(/\s+/g, ' ')
}

/** A transaction's identity for dedup: same date + same amount + same normalized narration. */
export function dedupKey(txn: { date: string; amount: number; narration: string }): string {
  return `${txn.date}|${txn.amount.toFixed(2)}|${normalizeNarration(txn.narration)}`
}

export interface DedupResult {
  /** Drafts with no matching existing transaction — safe to import. */
  fresh: TransactionDraft[]
  /** Drafts that match an existing transaction — flagged for user confirmation. */
  duplicates: TransactionDraft[]
}

/**
 * Splits parsed drafts into fresh vs. likely-duplicate against existing transactions,
 * matching on date + amount + normalized narration. Handles repeated identical
 * transactions within one file by consuming each existing match at most once.
 */
export function splitDuplicates(
  drafts: TransactionDraft[],
  existing: ExistingTransaction[]
): DedupResult {
  const remaining = new Map<string, number>()
  for (const e of existing) {
    const key = dedupKey(e)
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
  }

  const fresh: TransactionDraft[] = []
  const duplicates: TransactionDraft[] = []
  for (const draft of drafts) {
    const key = dedupKey(draft)
    const count = remaining.get(key) ?? 0
    if (count > 0) {
      remaining.set(key, count - 1)
      duplicates.push(draft)
    } else {
      fresh.push(draft)
    }
  }
  return { fresh, duplicates }
}
