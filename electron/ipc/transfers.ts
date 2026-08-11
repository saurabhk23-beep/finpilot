import {
  confirmTransfer,
  detectAndApplyTransfers,
  unlinkTransfer
} from '../services/transfer-service'
import type { MatchKind } from '../services/transfer-detector'
import { type GetDb, type IpcHandlerMap, requireUserId } from './types'

export function createTransfersHandlers(getDb: GetDb): IpcHandlerMap {
  return {
    // Run detection over all transactions; returns counts + any ambiguous matches to confirm.
    'transfers:detect': async (params) => detectAndApplyTransfers(getDb(), requireUserId(params)),

    // User resolves an ambiguous match (or manually links a pair).
    'transfers:confirm': async (params) => {
      const userId = requireUserId(params)
      confirmTransfer(
        getDb(),
        userId,
        params.debitId as number,
        params.creditId as number,
        (params.kind as MatchKind | undefined) ?? 'inter-account'
      )
      return { ok: true }
    },

    // Undo a wrong match — both sides return to spend totals.
    'transfers:unlink': async (params) => {
      unlinkTransfer(getDb(), requireUserId(params), params.transactionId as number)
      return { ok: true }
    }
  }
}
