# CLAUDE.md — FinPilot Build Instructions

## What is FinPilot?

A desktop personal finance app (Electron + React) for Indian users. It consolidates bank accounts, credit cards, cash transactions, mutual funds, and stocks into a single offline-capable dashboard. All data is local and encrypted.

**Companion documents** (read these for full detail — they are the source of truth):
- `FinPilot_01_PRD.docx` — Complete product requirements, user journeys, screen inventory
- `FinPilot_02_HLD.docx` — Technical architecture, data model, security, parsing strategy

---

## Build Order (follow this sequence)

### Phase A — Project Scaffold
1. Initialize Electron + Vite + React + TypeScript project
2. Install core dependencies: `better-sqlite3`, `zustand`, `recharts`, `tailwindcss`, `papaparse`, `electron-store`
3. Set up Tailwind CSS with a financial dashboard theme (dark sidebar, light content area)
4. Create the folder structure:
   ```
   finpilot/
   ├── electron/
   │   ├── main.ts
   │   ├── preload.ts
   │   ├── ipc/           # IPC handlers by domain
   │   ├── db/            # Schema, migrations, query helpers
   │   ├── parsers/       # JS-side parsing
   │   └── services/      # Categorization, market data, transfer detection
   ├── src/
   │   ├── components/    # Reusable UI
   │   ├── pages/         # Route-level components
   │   ├── hooks/         # useIPC, useAccounts, etc.
   │   ├── stores/        # Zustand stores
   │   └── utils/         # Formatters, helpers
   ├── python/            # Sidecar scripts
   ├── data/              # Default rules, MCC mappings (JSON)
   └── assets/
   ```
5. Configure Electron main/renderer process separation with IPC bridge via preload.ts

### Phase B — Database & Core Data Layer
1. Create SQLite schema with SQLCipher encryption support. **All tables (except User, MFNav, StockPrice) must have a `user_id` column.** Seed User with id=1.
2. Tables to create (see HLD Section 4 for full field list):
   - User, Account, CreditCard, Transaction, Category, CategoryRule
   - MFScheme, MFTransaction, MFNav, Stock, StockTransaction, StockPrice, ImportLog
3. Seed default categories from `data/categories.json` (14 top-level categories with sub-categories — see PRD Section 4.3.1)
4. Seed default keyword rules from `data/keyword_rules.json` (see HLD appendix for starter regex patterns)
5. Create DB query helpers — every query MUST include `WHERE user_id = ?`. No exceptions. Even in Phase 1 where userId is always 1.
6. Create IPC handlers following the pattern: `ipcMain.handle('domain:action', async (event, { userId, ...params }) => { ... })`

### Phase C — Onboarding Flow
1. **Splash/Password screen**: Master password entry → decrypt DB. First-run → redirect to onboarding.
2. **Step 1 — Profile**: Name, monthly salary (INR), employer/company name, FY start (default April)
3. **Step 2 — Bank Accounts**: Add multiple accounts. Fields: bank (searchable dropdown of Indian banks), nickname, last4, type (Savings/Current/Salary), opening balance, file upload (PDF/CSV)
4. **Step 3 — Credit Cards**: Add multiple cards. Fields: issuer, nickname, last4, credit limit, bill cycle date, linked bank account (dropdown of added accounts), file upload
5. **Step 4 — Cash Transactions**: Upload tracker CSV with column mapping UI, or skip
6. **Step 5 — Investments**: Upload CAS PDF (MF) + Groww CSV (stocks)
7. **Step 6 — Summary**: Review all accounts/cards/investments, edit any, confirm → run categorization → enter dashboard

### Phase D — Statement Parsing
1. **CSV parsing**: Use PapaParse. Generic column mapper that lets user map date, amount, narration, category columns.
2. **Bank PDF parsing**: Call Python sidecar (`python/parse_bank.py`) via child_process. Accepts: `--file <path> --bank <icici|hdfc|sbi>`. Returns JSON array of transactions.
3. **CAS PDF parsing**: Call Python sidecar (`python/parse_cas.py`) via child_process. Accepts: `--file <path> --password <password>`. Returns JSON with schemes, folios, transactions, units.
4. **Groww CSV parsing**: Fixed-format parser for Groww's trade history export.
5. **Import dedup**: Hash each file (sha256). Check ImportLog. For overlapping date ranges, detect duplicate transactions by date+amount+narration match and flag for user confirmation.
6. **New account detection**: If statement contains account number not matching any existing account, prompt user to add new / link to existing / skip.

### Phase E — Transaction Categorization Engine
Build in `electron/services/categorizer.ts`:
1. **Layer 1 — MCC**: Lookup `data/mcc_mappings.json` (credit card transactions)
2. **Layer 2 — Keywords**: Regex match narration against `data/keyword_rules.json`. Examples:
   - `SWIGGY|ZOMATO|UBEREATS` → Food & Dining > Delivery
   - `BIGBASKET|BLINKIT|ZEPTO` → Groceries
   - `UBER|OLA|RAPIDO` → Transport > Ride-hailing
   - `NETFLIX|HOTSTAR|SPOTIFY` → Subscriptions
3. **Layer 3 — UPI VPA**: Extract VPA from narration, lookup `data/vpa_mappings.json`
4. **Layer 4 — Heuristics**: Recurring same-amount debits → EMI. Salary detection: match employer name from User.employer_name against credit narrations in salary-type accounts. First import: if no auto-match, surface top credits for user to identify salary. Save that pattern.
5. **Layer 5 — User overrides**: When user re-categorizes a transaction, save the merchant/narration → category mapping as a new CategoryRule with is_user_created=true and highest priority.
6. Run layers in order (1→5). First match wins. Track categorization coverage %.

### Phase F — Transfer Detection
Build in `electron/services/transfer-detector.ts`:
1. **Inter-account**: For each debit, search for a credit in another account with same amount ± same/next day. Tag both as is_transfer=true, link via matched_transfer_id. Exclude from expenses.
2. **CC bill payments**: For debits in bank accounts, match against CC bill amounts near bill cycle date on linked accounts. Tag as is_cc_payment=true. Exclude from expenses.
3. Use narration keywords as hints: NEFT, IMPS, RTGS, CREDIT CARD, CC PAYMENT, VISA, MASTERCARD.
4. Ambiguous matches → flag for user confirmation.

### Phase G — Spend Analytics Dashboard
1. **Account selector** (top bar): All Combined / individual account / individual card
2. **Summary cards**: Total Income, Total Expenses (excl transfers+investments), Net Savings, Savings Rate %, Uncategorized count
3. **Category donut chart**: Click slice → sub-categories → transactions
4. **Monthly trend bar chart**: Stacked by category
5. **Top 10 merchants** list
6. **Recent transactions** table (last 50): category tag, amount, account badge, editable (re-categorize, add remarks)
7. **Time range**: This Month (default), Last Month, Last 3M/6M, YTD, Custom Range
8. **Account view**: When single account selected → opening/closing balance, daily balance line chart. When CC selected → limit, outstanding, available, utilization gauge.
9. **Category drill-down panel**: Total spend, sub-category breakdown, MoM trend, transaction list, re-categorize option.

### Phase H — Investment Dashboard
1. **Overview cards**: Total Portfolio Value, Invested Amount, Gain/Loss (₹ and %), Overall XIRR %, Day Change
2. **MF tab**: Table with columns: Scheme Name, Folio, Units, Avg NAV, Current NAV, Invested Value, Current Value, Gain/Loss, XIRR %, Day Change. Click row → transaction history + NAV chart.
3. **Stocks tab**: Table with: Stock/Symbol, Qty, Avg Buy Price, Current Price, Invested/Current Value, Gain/Loss, XIRR %, Day Change. Click row → trade log + price chart.
4. **Time controls**: 1D, 1W, 1M, 3M, 6M, 1Y, All Time, Custom
5. **XIRR calculation**: Implement Newton-Raphson method. ~50 lines. Calculate per-scheme/stock and overall.
6. **Daily refresh**: node-cron job in main process. MF NAVs from `https://api.mfapi.in/mf/{scheme_code}`. Stock prices from Yahoo Finance wrapper or free NSE API. Default 7 PM IST. Auto-trigger on app launch if stale. Manual "Refresh Now" button.

### Phase I — Settings & Extras
1. Profile edit (name, salary, employer)
2. Manage accounts/cards (add, edit, delete)
3. Category management (create, rename, hide, merge custom categories)
4. Rule editor (view/edit/add categorization rules)
5. Refresh schedule config
6. Uncategorized review queue

---

## Critical Rules

1. **user_id everywhere**: Every IPC handler receives userId. Every DB query includes `WHERE user_id = ?`. Zustand stores hold currentUserId. Phase 1 hardcodes to 1. NO EXCEPTIONS.
2. **No network calls with user data**: Only outbound calls are mfapi.in and stock price API. Never transmit transaction data, account numbers, or personal info.
3. **SQLCipher encryption**: DB encrypted at rest. Master password required on launch.
4. **Remarks field**: Every transaction has a user-editable remarks field.
5. **Transfer exclusion**: Inter-account transfers and CC bill payments must be detected and excluded from expense totals. This is the #1 data accuracy requirement.
6. **Salary detection**: Use employer name matching + user confirmation (not a fixed date). Companies pay on different days each month.

---

## Tech Stack (do not deviate)

- Electron + React 18+ + Vite + TypeScript
- Zustand (state), Recharts (charts), Tailwind CSS (styling)
- SQLite via better-sqlite3 + SQLCipher
- Drizzle ORM or raw SQL (dev's choice)
- PapaParse (CSV), pdf-parse (JS PDF)
- Python sidecar: casparser + statementsparser (bundled via PyInstaller)
- mfapi.in (MF NAV), Yahoo Finance wrapper (stock prices)
- Vitest + React Testing Library (tests)

---

## Testing Requirements

- Unit tests for: XIRR calculation, categorization engine, transfer detection, CSV/PDF parsers
- Integration tests for: IPC handlers with real SQLite DB
- All tests must pass before any commit
