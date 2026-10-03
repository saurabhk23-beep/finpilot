import type {
  Account,
  AccountBalance,
  AccountType,
  AnalyticsRange,
  AuthStatus,
  CardUtilization,
  CasImportResult,
  Category,
  CategoryBreakdownItem,
  CategoryRule,
  ColumnMapping,
  CommitResult,
  Coverage,
  CreditCard,
  GrowwImportResult,
  ImportLog,
  ImportPreview,
  MerchantTotal,
  MFDetail,
  MFHolding,
  MFScheme,
  MonthlyTrendPoint,
  PortfolioOverview,
  PublicProfile,
  RecentTransaction,
  RefreshConfig,
  RefreshResult,
  Scope,
  Stock,
  StockDetail,
  StockHolding,
  Summary,
  TransactionDraft,
  TransferDetectSummary,
  UnlockResult,
  User
} from '../types'

/** Common analytics arguments: which accounts + which time range. */
type AnalyticsArgs = { scope: Scope } & AnalyticsRange

// Phase 1: single hardcoded user (per HLD IPC Contract). Domain calls inject
// this automatically; auth calls don't carry a userId.
export const CURRENT_USER_ID = 1

function raw<T>(channel: string, payload: object = {}): Promise<T> {
  return window.api.invoke(channel, payload as Record<string, unknown>) as Promise<T>
}

/** Domain call: auto-injects userId so callers never have to (and can't forget). */
function domain<T>(channel: string, params: object = {}): Promise<T> {
  return raw<T>(channel, { userId: CURRENT_USER_ID, ...params })
}

export interface PickedFile {
  path: string
  name: string
  size: number
}

export const ipc = {
  auth: {
    status: () => raw<AuthStatus>('auth:status'),
    unlock: (password: string) => raw<UnlockResult>('auth:unlock', { password }),
    changePassword: (currentPassword: string, newPassword: string) =>
      raw<{ ok: true }>('auth:changePassword', { currentPassword, newPassword })
  },
  dialog: {
    openFiles: (opts: { accept?: string[]; multiple?: boolean } = {}) =>
      raw<PickedFile[]>('dialog:openFiles', opts)
  },
  user: {
    get: () => domain<User | undefined>('user:get'),
    update: (input: Partial<Omit<User, 'id' | 'created_at'>>) => domain<User>('user:update', input)
  },
  accounts: {
    list: () => domain<Account[]>('accounts:list'),
    create: (input: {
      bank: string
      nickname: string
      last4?: string
      type: AccountType
      opening_balance?: number
    }) => domain<Account>('accounts:create', input),
    update: (id: number, input: Record<string, unknown>) => domain<Account>('accounts:update', { id, ...input }),
    delete: (id: number) => domain<{ ok: true }>('accounts:delete', { id })
  },
  creditCards: {
    list: () => domain<CreditCard[]>('creditCards:list'),
    create: (input: {
      issuer: string
      nickname: string
      last4?: string
      credit_limit: number
      bill_date?: number
      linked_account_id?: number
    }) => domain<CreditCard>('creditCards:create', input),
    update: (id: number, input: Record<string, unknown>) =>
      domain<CreditCard>('creditCards:update', { id, ...input }),
    delete: (id: number) => domain<{ ok: true }>('creditCards:delete', { id })
  },
  categories: {
    list: () => domain<Category[]>('categories:list'),
    create: (input: { name: string; parent_id?: number; icon?: string }) =>
      domain<Category>('categories:create', input),
    update: (id: number, input: { name?: string; icon?: string; is_hidden?: 0 | 1 }) =>
      domain<Category>('categories:update', { id, ...input }),
    delete: (id: number) => domain<{ ok: true }>('categories:delete', { id }),
    merge: (fromId: number, toId: number) =>
      domain<{ transactionsReassigned: number; rulesReassigned: number }>('categories:merge', { fromId, toId })
  },
  rules: {
    list: () => domain<CategoryRule[]>('rules:list'),
    create: (input: { rule_type: 'keyword' | 'mcc' | 'vpa' | 'amount'; pattern: string; category_id: number; priority?: number }) =>
      domain<CategoryRule>('rules:create', input),
    update: (id: number, input: { pattern?: string; category_id?: number; priority?: number }) =>
      domain<CategoryRule>('rules:update', { id, ...input }),
    delete: (id: number) => domain<{ ok: true }>('rules:delete', { id })
  },
  settings: {
    getRefresh: () => raw<RefreshConfig>('settings:getRefresh'),
    setRefresh: (input: { enabled?: boolean; time?: string }) => raw<RefreshConfig>('settings:setRefresh', input),
    // Public profile mirror (no userId) — readable before unlock for the greeting.
    getProfile: () => raw<PublicProfile>('settings:getProfile'),
    setProfile: (input: { username?: string | null }) => raw<PublicProfile>('settings:setProfile', input),
    getDevMode: () => raw<{ devMode: boolean }>('settings:getDevMode'),
    setDevMode: (devMode: boolean) => raw<{ devMode: boolean }>('settings:setDevMode', { devMode })
  },
  transactions: {
    create: (input: {
      account_id?: number
      card_id?: number
      date: string
      amount: number
      type: 'credit' | 'debit'
      narration: string
      category_id?: number
      sub_category_id?: number
      remarks?: string
      source_file?: string
    }) => domain<{ id: number }>('transactions:create', input),
    update: (id: number, input: { remarks?: string; is_excluded?: 0 | 1 }) =>
      domain<unknown>('transactions:update', { id, ...input }),
    /** Layer 5: re-categorize + (by default) learn a rule. */
    recategorize: (input: { transactionId: number; categoryId: number; remarks?: string; learn?: boolean }) =>
      domain<{ ruleCreated: boolean }>('transactions:recategorize', input)
  },
  analytics: {
    summary: (input: AnalyticsArgs) => domain<Summary>('analytics:summary', input),
    categoryBreakdown: (input: AnalyticsArgs) =>
      domain<CategoryBreakdownItem[]>('analytics:categoryBreakdown', input),
    monthlyTrend: (input: AnalyticsArgs) => domain<MonthlyTrendPoint[]>('analytics:monthlyTrend', input),
    topMerchants: (input: AnalyticsArgs & { limit?: number }) =>
      domain<MerchantTotal[]>('analytics:topMerchants', input),
    recentTransactions: (input: AnalyticsArgs & { limit?: number }) =>
      domain<RecentTransaction[]>('analytics:recentTransactions', input),
    accountBalance: (input: AnalyticsArgs & { accountId: number }) =>
      domain<AccountBalance>('analytics:accountBalance', input),
    cardUtilization: (input: { cardId: number }) => domain<CardUtilization>('analytics:cardUtilization', input),
    uncategorized: (input: { limit?: number } = {}) =>
      domain<RecentTransaction[]>('analytics:uncategorized', input)
  },
  categorization: {
    coverage: () => domain<Coverage>('categorization:coverage'),
    run: () => domain<{ updated: number }>('categorization:run')
  },
  investments: {
    listStocks: () => domain<Stock[]>('investments:stocks:list'),
    createStock: (input: { symbol: string; name?: string; exchange?: 'NSE' | 'BSE'; sector?: string }) =>
      domain<Stock>('investments:stocks:create', input),
    createStockTransaction: (input: {
      stock_id: number
      date: string
      type: 'buy' | 'sell'
      qty: number
      price: number
      charges?: number
    }) => domain<{ id: number }>('investments:stockTransactions:create', input),
    listMFSchemes: () => domain<MFScheme[]>('investments:mfSchemes:list')
  },
  import: {
    /** Parse + dedup + account-match with no writes; call again to re-map CSV columns. */
    preview: (input: {
      path: string
      kind: 'bankCsv' | 'bankPdf'
      mapping?: ColumnMapping
      bank?: string
      password?: string
      targetAccountId?: number
    }) => domain<ImportPreview>('import:preview', input),
    commit: (input: {
      fileName: string
      fileHash: string
      accountId?: number
      cardId?: number
      drafts: TransactionDraft[]
      dateRange?: { start: string; end: string }
    }) => domain<CommitResult>('import:commit', input),
    commitCash: (input: {
      fileName: string
      fileHash: string
      drafts: TransactionDraft[]
      dateRange?: { start: string; end: string }
    }) => domain<CommitResult>('import:commitCash', input),
    cas: (input: { path: string; password: string }) => domain<CasImportResult>('import:cas', input),
    groww: (input: { path: string }) => domain<GrowwImportResult>('import:groww', input),
    list: () => domain<ImportLog[]>('import:list'),
    remove: (importLogId: number) =>
      domain<{ deletedTransactions: number }>('import:delete', { importLogId })
  },
  transfers: {
    detect: () => domain<TransferDetectSummary>('transfers:detect'),
    confirm: (input: { debitId: number; creditId: number; kind?: 'inter-account' | 'cc-payment' }) =>
      domain<{ ok: true }>('transfers:confirm', input),
    unlink: (input: { transactionId: number }) => domain<{ ok: true }>('transfers:unlink', input)
  },
  portfolio: {
    overview: () => domain<PortfolioOverview>('portfolio:overview'),
    mfHoldings: () => domain<MFHolding[]>('portfolio:mfHoldings'),
    stockHoldings: () => domain<StockHolding[]>('portfolio:stockHoldings'),
    mfDetail: (schemeId: number) => domain<MFDetail>('portfolio:mfDetail', { schemeId }),
    stockDetail: (stockId: number) => domain<StockDetail>('portfolio:stockDetail', { stockId }),
    refresh: () => domain<RefreshResult>('portfolio:refresh')
  }
}
