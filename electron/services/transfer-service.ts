import type Database from 'better-sqlite3-multiple-ciphers'
import { listCreditCards } from '../db/queries/creditCards'
import { getTransaction, listTransactions, updateTransaction } from '../db/queries/transactions'
import {
  detectTransfers,
  type AmbiguousMatch,
  type DetectorOptions,
  type DetectorTransaction,
  type MatchKind
} from './transfer-detector'

export interface DetectSummary {
  transfersLinked: number
  ccPaymentsLinked: number
  ambiguous: AmbiguousMatch[]
}

function toDetectorTxn(t: {
  id: number
  account_id: number | null
  card_id: number | null
  date: string
  amount: number
  type: 'credit' | 'debit'
  narration: string
  is_transfer: 0 | 1
  is_cc_payment: 0 | 1
}): DetectorTransaction {
  return {
    id: t.id,
    account_id: t.account_id,
    card_id: t.card_id,
    date: t.date,
    amount: t.amount,
    type: t.type,
    narration: t.narration,
    is_transfer: t.is_transfer,
    is_cc_payment: t.is_cc_payment
  }
}

/** Tags both sides of one matched pair, links them, and excludes them from spend totals. */
function linkPair(db: Database.Database, userId: number, debitId: number, creditId: number, kind: MatchKind): void {
  const tag = kind === 'cc-payment' ? { is_cc_payment: 1 as const } : { is_transfer: 1 as const }
  updateTransaction(db, userId, debitId, { ...tag, is_excluded: 1, matched_transfer_id: creditId })
  updateTransaction(db, userId, creditId, { ...tag, is_excluded: 1, matched_transfer_id: debitId })
}

/**
 * Detects and applies inter-account transfers and CC bill payments across the
 * user's transactions, tagging + excluding both sides of every unambiguous match.
 * Idempotent: already-tagged transactions are skipped. Ambiguous matches are
 * returned (not applied) for the user to confirm.
 */
export function detectAndApplyTransfers(
  db: Database.Database,
  userId: number,
  options: DetectorOptions = {}
): DetectSummary {
  const transactions = listTransactions(db, userId).map(toDetectorTxn)
  const cards = listCreditCards(db, userId).map((c) => ({ id: c.id, linked_account_id: c.linked_account_id }))

  const { matches, ambiguous } = detectTransfers(transactions, cards, options)

  let transfersLinked = 0
  let ccPaymentsLinked = 0
  const run = db.transaction(() => {
    for (const m of matches) {
      linkPair(db, userId, m.debitId, m.creditId, m.kind)
      if (m.kind === 'cc-payment') ccPaymentsLinked++
      else transfersLinked++
    }
  })
  run()

  return { transfersLinked, ccPaymentsLinked, ambiguous }
}

/** Applies a user-confirmed pairing (e.g. resolving an ambiguous match from the UI). */
export function confirmTransfer(
  db: Database.Database,
  userId: number,
  debitId: number,
  creditId: number,
  kind: MatchKind = 'inter-account'
): void {
  const debit = getTransaction(db, userId, debitId)
  const credit = getTransaction(db, userId, creditId)
  if (!debit || !credit) throw new Error('Both transactions must exist')
  if (debit.type !== 'debit' || credit.type !== 'credit') {
    throw new Error('confirmTransfer expects a debit and a credit')
  }
  linkPair(db, userId, debitId, creditId, kind)
}

/** Clears a transfer/CC-payment link on both sides (undo a wrong match) and un-excludes them. */
export function unlinkTransfer(db: Database.Database, userId: number, transactionId: number): void {
  const txn = getTransaction(db, userId, transactionId)
  if (!txn) return
  const run = db.transaction(() => {
    const clear = { is_transfer: 0 as const, is_cc_payment: 0 as const, is_excluded: 0 as const }
    updateTransaction(db, userId, transactionId, clear)
    if (txn.matched_transfer_id !== null) {
      updateTransaction(db, userId, txn.matched_transfer_id, clear)
      // matched_transfer_id is only cleared implicitly by the UI re-detecting; leave the
      // pointer so the pair can be re-linked, but both sides are back in spend totals.
    }
  })
  run()
}
