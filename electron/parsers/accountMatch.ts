/** Minimal account shape needed to match a statement to an existing account. */
export interface MatchableAccount {
  id: number
  last4: string | null
  nickname: string
  type: string
}

export type AccountMatch =
  | { kind: 'matched'; accountId: number }
  | { kind: 'ambiguous'; candidateIds: number[] }
  | { kind: 'unknown'; detectedLast4: string }
  | { kind: 'none' }

/**
 * Decides which existing account a statement belongs to, from a detected last-4.
 *  - matched   : exactly one account with that last4 → import straight in
 *  - ambiguous : multiple accounts share the last4 → ask the user which
 *  - unknown   : a last4 was detected but no account has it → offer add/link/skip
 *  - none      : no account number could be detected → user picks the target account
 */
export function matchAccount(accounts: MatchableAccount[], detectedLast4: string | undefined): AccountMatch {
  if (!detectedLast4) return { kind: 'none' }

  const matches = accounts.filter((a) => a.last4 && a.last4 === detectedLast4 && a.type !== 'cash')
  if (matches.length === 1) return { kind: 'matched', accountId: matches[0].id }
  if (matches.length > 1) return { kind: 'ambiguous', candidateIds: matches.map((a) => a.id) }
  return { kind: 'unknown', detectedLast4 }
}
