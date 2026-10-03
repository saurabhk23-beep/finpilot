# FinPilot — Technical Design Document (As-Built)

> **What this is:** a complete engineering reference for FinPilot *as it is actually implemented* — architecture, data model, IPC surface, and the algorithms behind each feature. It complements, and does not duplicate, the other docs:
>
> | Doc | Purpose |
> |-----|---------|
> | `docs/FinPilot_01_PRD.docx` | Product requirements (intended behaviour, user journeys) — written before the build |
> | `docs/FinPilot_02_HLD.docx` | Original high-level design — written before the build |
> | `Claude.md` | Build spec / phase order / hard rules for contributors |
> | `PROJECT_STATE.md` | Session handoff: status, git state, debugging gotchas |
> | **`TECHNICAL_DESIGN.md`** (this file) | **As-built** architecture & feature reference |
>
> **Last updated:** 2026-08-22. Reflects Phase 1 (A–I) complete. Update this file when features change.

---

## 1. Overview

FinPilot is a **desktop-first, offline-capable, encrypted personal-finance app for Indian users**. It consolidates bank accounts, credit cards, cash, mutual funds, and stocks into a single dashboard. Everything is stored locally and encrypted at rest; the only outbound network calls are read-only fetches of *public* market data (mutual-fund NAVs and stock prices). No transaction data, account numbers, or personal information ever leave the machine.

**Design pillars**
- **Local & private** — SQLite database encrypted with SQLCipher; master password required at launch.
- **Offline-capable** — all core features (import, categorization, analytics) work with no network. Only price refresh needs internet.
- **Single-user (Phase 1)** — the data model is multi-user-ready (`user_id` on every table) but the app hardcodes `user id = 1`.
- **Accuracy-first** — inter-account transfers and credit-card bill payments are detected and *excluded* from spend/income totals. This is the #1 correctness requirement.

---

## 2. Technology Stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Shell | **Electron** | main / preload / renderer process separation |
| Bundler | **electron-vite** | `electron.vite.config.ts`; three build targets |
| UI | **React 19 + TypeScript** | function components + hooks |
| State | **Zustand** | `appStore`, `onboardingStore`, `dashboardStore` |
| Charts | **Recharts v3** | donut, stacked bar, line, gauge |
| Styling | **Tailwind CSS v4** | `@tailwindcss/vite`; dark sidebar / light content theme |
| Database | **better-sqlite3-multiple-ciphers** | SQLCipher-compatible; **not** plain better-sqlite3 |
| CSV | **PapaParse** | generic column-mapped bank CSV + broker CSV |
| PDF | **Python sidecar** | `casparser` (CAS), `pypdfium2` (bank PDF) via `child_process` |
| Scheduler | **node-cron** | daily market-data refresh in the main process |
| Settings | fs-backed JSON | `userData/settings.json` (electron-store avoided — ESM-only, breaks CJS main) |
| Tests | **Vitest** | two projects: `node` (main/services/parsers) + `jsdom` (renderer, RTL) |

---

## 3. Process & Module Architecture

Electron splits into three isolated contexts. The renderer has **no** direct database or filesystem access — every privileged operation crosses the IPC bridge.

```
┌─────────────────────────────────────────────────────────────┐
│  RENDERER  (src/, React)                                     │
│  pages → stores (Zustand) → lib/ipc.ts (typed client)       │
│                    │  window.api.invoke(channel, {userId,…}) │
└────────────────────┼────────────────────────────────────────┘
                     │  contextBridge (preload.ts)
┌────────────────────┼────────────────────────────────────────┐
│  MAIN  (electron/)  ▼                                        │
│  ipc/  → services/ → db/queries/ → SQLCipher DB             │
│                    → parsers/    → Python sidecar (PDF)      │
│                    → market-data → mfapi.in / Yahoo (HTTP)   │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Renderer (`src/`)
- **`App.tsx`** — top-level router keyed on `appStore.screen`: `loading → password → onboarding → dashboard`.
- **`lib/ipc.ts`** — typed IPC client. A `domain()` helper auto-injects `userId` (= 1 in Phase 1) into every call, so feature code never passes it manually.
- **`stores/`** — `appStore` (routing / unlock state), `onboardingStore` (wizard progress + pending file uploads), `dashboardStore` (active section, account scope, time range).
- **`pages/`** — `Splash`, `onboarding/` (6-step wizard), `Dashboard` (shell), `dashboard/` (spend widgets), `investments/`, `settings/`.
- **`components/`** — reusable UI (`ui.tsx` primitives, `Combobox`, `FilePicker`, `CategorySelect`, chart palette).
- **`utils/`** — INR / date formatters, date-range helpers.

### 3.2 Main (`electron/`)
- **`main.ts`** — creates the window, registers IPC handlers, arms the cron refresh schedule from `settings.json`, and manages DB lifecycle (closes the DB on `will-quit`).
- **`preload.ts`** — exposes `window.api.invoke(channel, payload)` over `contextBridge`; no Node globals leak into the renderer.
- **`ipc/`** — one file per domain; `index.ts` registers them all; `types.ts` holds `requireUserId()`.
- **`db/`** — connection/crypto, migration runner, seed, per-entity query helpers, row types.
- **`parsers/`** — pure parsing (amounts, dates, CSV, broker CSV, dedup, account matching, hashing, sidecar invocation).
- **`services/`** — business logic (categorizer, transfer detector, analytics, portfolio, XIRR, market data, import orchestration, settings).

---

## 4. Security Model

- **Encryption at rest:** the entire SQLite file is encrypted via SQLCipher (`PRAGMA cipher='sqlcipher'`).
- **Key derivation:** the master password is run through **scrypt** with a **per-install random salt** (`db/crypto.ts`). The salt is stored beside the DB (`finpilot.salt`); the password itself is never stored anywhere.
- **Unlock flow:** on `auth:unlock`, the derived key is applied as the SQLCipher key. A **wrong password** surfaces as SQLite's `"file is not a database"` error on the first read (the ciphertext can't be interpreted) — the UI translates this to "Incorrect password."
- **Handle safety:** `openDatabase` closes the connection inside a `try/catch` on failure, so a wrong password doesn't leak a file handle (which caused Windows `EPERM` on cleanup).
- **No password recovery:** because the password *is* the key material and is never stored, a forgotten password means the data is cryptographically unrecoverable. (A **recovery-phrase** mechanism is planned; see §12.)
- **Network boundary:** only two outbound hosts are ever contacted — `api.mfapi.in` (NAV) and Yahoo Finance (prices). Both are read-only public data. No user data is transmitted.

---

## 5. Data Model

SQLite schema, built by **versioned migrations** in `electron/db/migrations/` (`001`–`005`), tracked in a `_migrations` table. **Rule: every table carries `user_id` except the two shared public caches** (`mf_nav`, `stock_price`), whose data is market-wide, not user-specific.

### 5.1 Entity summary

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `user` | The account holder (seeded blank at id=1) | `username`, `name`, `monthly_salary`, `employer_name`, `fy_start_month`, `onboarding_completed` |
| `account` | Bank account **or** the cash container | `bank`, `nickname`, `last4`, `type` (`savings`/`current`/`salary`/`cash`), `opening_balance` |
| `credit_card` | A credit card | `issuer`, `nickname`, `last4`, `credit_limit`, `bill_date`, `linked_account_id` |
| `transactions` | Every bank/card/cash transaction | `date`, `amount`, `type` (`credit`/`debit`), `narration`, `category_id`, `sub_category_id`, `is_transfer`, `is_cc_payment`, `is_excluded`, `matched_transfer_id`, `remarks`, `mcc`, `source_file` |
| `category` | Category tree (self-referential) | `name`, `parent_id`, `is_system`, `is_hidden` |
| `category_rule` | Categorization rules | `rule_type` (`keyword`/`mcc`/`vpa`/`amount`), `pattern`, `category_id`, `priority`, `is_user_created` |
| `mf_scheme` | A held mutual-fund scheme/folio | `scheme_code`, `scheme_name`, `folio`, `amc_name` |
| `mf_transaction` | MF buy/sell events | `type` (`sip`/`lumpsum`/`redemption`/`switch_in`/`switch_out`), `amount`, `units`, `nav` |
| `mf_nav` | **Shared cache** — public NAV history | `scheme_code`, `date`, `nav` (unique per code+date) |
| `stock` | A held stock | `symbol`, `name`, `exchange` (`NSE`/`BSE`), `sector` |
| `stock_transaction` | Stock buy/sell events | `type` (`buy`/`sell`), `qty`, `price`, `charges` |
| `stock_price` | **Shared cache** — public close prices | `symbol`, `date`, `close_price` (unique per symbol+date) |
| `import_log` | One row per imported file (dedup) | `file_name`, `file_hash`, `account_id`, `txn_count`, `date_range_*`, `status` (unique per user+hash) |

### 5.2 Notable modeling decisions
- **`transactions` (plural)** — named to avoid the SQL `TRANSACTION` keyword. A row must reference either an `account_id` **or** a `card_id` (`CHECK` constraint).
- **Cash as an account** (migration 003) — cash is an `account` with `type='cash'` rather than a null-account transaction, so it's a first-class peer in the account selector. SQLite can't alter a `CHECK` in place, so the table is rebuilt via the documented 12-step recipe (and toggles `PRAGMA foreign_keys` *outside* a transaction — the reason the migration runner does not auto-wrap migrations).
- **Two category columns** — `category_id` holds the **top-level** category, `sub_category_id` the leaf. Rules point at the leaf; the categorizer resolves the parent.
- **Exclusion flags** — `is_transfer`, `is_cc_payment`, and the derived `is_excluded` keep internal money movement out of spend/income (see §9).

---

## 6. IPC Reference

All calls go through `window.api.invoke(channel, { userId, ...params })`. Handlers are `async` and reject on a missing/invalid `userId` (auth/settings-profile channels run pre-unlock and carry no `userId`). Channels grouped by domain:

| Domain | Channels |
|--------|----------|
| **auth** | `auth:status`, `auth:unlock`, `auth:changePassword` |
| **user** | `user:get`, `user:update` |
| **accounts** | `accounts:list/get/create/update/delete` |
| **creditCards*** | `creditCards` CRUD (via accounts/cards handlers) |
| **categories** | `categories:list/get/create/update/delete`, `categories:merge` |
| **rules** | `rules:list/create/update/delete` |
| **transactions** | `transactions:list/get/create/update/delete`, `transactions:recategorize` |
| **categorization** | `categorization:coverage`, `categorization:run`, `categorization:topCredits` |
| **transfers** | `transfers:detect`, `transfers:confirm`, `transfers:unlink` |
| **import** | `import:preview`, `import:commit`, `import:commitCash`, `import:cas`, `import:groww`, `import:list` |
| **analytics** | `analytics:summary/categoryBreakdown/monthlyTrend/topMerchants/recentTransactions/accountBalance/cardUtilization/uncategorized` |
| **portfolio** | `portfolio:overview/mfHoldings/stockHoldings/mfDetail/stockDetail/refresh` |
| **settings** | `settings:getRefresh`, `settings:setRefresh`, `settings:getProfile`, `settings:setProfile`, `settings:getDevMode`, `settings:setDevMode` |
| **dialog** | `dialog:openFiles` |
| **app** | `app:ping` |

**Handler pattern**

```ts
ipcMain.handle('domain:action', async (event, params) => {
  const userId = requireUserId(params)      // rejects if absent
  return someService(getDb(), userId, params /* … */)
})
```

**Error boundary.** Every handler is wrapped so a thrown error is sanitized before it crosses to the renderer (`electron/ipc/errors.ts`): the full error is logged in the main process; `UserFacingError` messages (validation text meant for the user) pass through; otherwise a friendly, domain-appropriate message is returned — unless **developer mode** is on (`settings.json` `devMode`, or `FINPILOT_DEV_MODE=1`), which surfaces the raw `[dev] <Type>: <message>`. The renderer strips Electron's `Error invoking remote method` wrapper via `src/utils/ipcError.ts`.

`auth:*` handlers are special — they bootstrap the DB and therefore *cannot* use the shared `getDb()` path (the DB may not exist yet when they run).

---

## 7. Onboarding

A 6-step wizard (`src/pages/onboarding/`) gating first-run. On completion it sets `user.onboarding_completed = 1`; the splash screen then routes straight to the dashboard on subsequent launches.

1. **Profile** — name, monthly salary (post-tax INR), employer/company name, financial-year start month (default April).
2. **Bank accounts** — add multiple accounts (bank searchable dropdown, nickname, last4, type, opening balance) and attach one or more statement files (PDF/CSV) per account. Files are queued in `onboardingStore` and imported on confirm.
3. **Credit cards** — add multiple cards (issuer, nickname, last4, limit, bill-cycle date, linked bank account) + statements.
4. **Cash** — upload a cash-tracker CSV (with column mapping) or skip.
5. **Investments** — import CAS PDF (mutual funds) + broker CSV (stocks), or add stocks manually.
6. **Summary** — review everything, edit, confirm → runs categorization + transfer detection → enters the dashboard.

---

## 8. Statement Import Pipeline

The import pipeline lives in the **main process** and is a two-phase, side-effect-free-until-commit flow.

```
file → hash (sha256) → parse → dedup → account-match → PREVIEW  (no writes)
                                                          │  user confirms/maps
                                                          ▼
                                            COMMIT → insert txns → categorize → detect transfers
```

- **Parsing**
  - **Bank CSV** (`parsers/csv.ts`, `bankCsv.ts`) — PapaParse with a generic **column mapper** (date, amount *or* separate debit/credit columns, narration). Handles Indian date formats and amount strings.
  - **Bank PDF** — Python sidecar `python/parse_bank.py` (pypdfium2), invoked via `child_process` with a 30 s timeout. Accepts `--password` for protected statements.
  - **CAS PDF** (mutual funds) — Python sidecar `python/parse_cas.py` wrapping **`casparser`**, which reads CAMS *and* KFintech consolidated statements. Password-protected; password passed per file.
  - **Interpreter selection** — `sidecar.ts` auto-detects a Python that has `casparser`+`pypdfium2` (probing `FINPILOT_PYTHON` → `py -3` → `python` → `python3`, cached), so a bare `python` that resolves to the Windows Store stub doesn't break imports.
  - **Broker CSV** (stocks) — `parsers/groww.ts` uses **header-alias regexes** (symbol/date/type/qty/price/exchange), so it tolerates column-name variation across broker exports.
- **Deduplication** (`parsers/dedup.ts`, `hash.ts`)
  - **File-level:** each file is hashed (sha256); `import_log` has a unique index on `(user_id, file_hash)`, so re-importing the exact file is a no-op.
  - **Transaction-level:** for overlapping date ranges, candidate duplicates are matched by `date + amount + narration` and flagged for user confirmation.
- **New-account detection** (`parsers/accountMatch.ts`) — if a statement's account number matches no existing account, the user is prompted to add new / link / skip.
- **IPC:** `import:preview` (parse+dedup+match, **no writes**, safe to call repeatedly as the user adjusts the column mapping) → `import:commit` / `import:commitCash`. On commit, the service auto-runs categorization and transfer detection.

> **Statement import** everywhere goes through the reusable `src/components/StatementImport.tsx` (CSV column-mapping + PDF-with-bank), which targets a bank **account**, a **credit card**, or **cash**. `commitTransactionImport` accepts `accountId` *or* `cardId` (exactly one) and writes the matching column. It is hosted on the **Transactions screen** ("Import statement", choose target), in **Settings → Bank Accounts / Credit Cards** (per-item), and — for the files attached during onboarding — run best-effort by `SummaryStep` on confirm. Investments/cash use their own importers in **Settings → Import Data**.

---

## 9. Categorization Engine

`electron/services/categorizer.ts` builds a per-user categorizer that classifies each transaction through **five layers, first match wins**. It loads the user's rules and category tree once, then runs in memory.

| Order | Layer | Match logic |
|-------|-------|-------------|
| 0 / 5 | **User overrides** | `is_user_created` rules of any type, checked **first** so a learned mapping beats every default rule |
| 1 | **MCC** | exact merchant-category-code match (card transactions carry `mcc`) |
| 2 | **Keyword** | case-insensitive regex against the narration (e.g. `SWIGGY\|ZOMATO`) |
| 3 | **UPI VPA** | VPA handle (`name@bank`) extracted from narration, matched by substring |
| 4 | **Heuristics** | **salary** = credit whose narration contains the employer name; **EMI** = recurring same-amount debit |

- **Salary detection** is **employer-name-based, not date-based** — Indian salaries land on varying days each month. If no auto-match, the UI surfaces the top unidentified credits for the user to tag; that choice is saved as a learned rule.
- **EMI detection** uses `findRecurringDebitAmounts()` — a debit amount appearing on ≥ 3 distinct dates is treated as recurring.
- **Learning** — when the user re-categorizes a transaction (`transactions:recategorize`), a new `category_rule` is written with `is_user_created = 1` (highest priority), so the mapping sticks for future imports.
- **Category resolution** — a rule points at a leaf category; the categorizer walks `parent_id` to fill both `category_id` (top-level) and `sub_category_id`.
- **Coverage %** is tracked and shown; an uncategorized-review queue lets the user clear the remainder.
- **Removed rule:** the seeded `NEFT|IMPS|RTGS → Transfer` keyword rule was deleted — it pre-empted salary detection and real transfer detection (transfers are found by amount-matching, not narration keywords).

Starter rules ship as JSON in `data/`: `categories.json` (14 top-level + subs), `keyword_rules.json`, `mcc_mappings.json`, `vpa_mappings.json`.

---

## 10. Transfer & CC-Payment Detection

`electron/services/transfer-detector.ts` — pure/deterministic; the DB-apply and IPC layers sit on top. It keeps **internal money movement out of income/expense totals** (the #1 accuracy rule).

- **Two passes, CC-payments first** (so a "CREDIT CARD PAYMENT" bank debit is consumed there rather than as a generic transfer):
  1. **CC bill payment** — a **bank-account debit** matched to a **card credit** ("payment received") of the same amount within a ±3-day window. A ranking hint prefers the card whose `linked_account_id` is the debit's account, which can break a tie down to a single match.
  2. **Inter-account transfer** — a **debit** matched to a **credit of the same amount in a *different* bank account** within a ±1-day window (same/next day).
- **Matching rules** — amounts equal within ₹0.01; each transaction can be consumed by at most one match; already-tagged transactions are skipped, keeping detection **idempotent**.
- **Ambiguity** — a debit with **multiple** candidate credits is reported as *ambiguous* (not guessed) for the user to resolve. IPC: `transfers:confirm` / `transfers:unlink`. *(The confirmation-queue UI is still to be built.)*
- **Effect** — matched pairs are tagged `is_transfer` / `is_cc_payment` + `is_excluded` and linked via `matched_transfer_id`.
- **Narration keywords** (`NEFT|IMPS|RTGS|UPI|TRANSFER|SELF`, `CREDIT CARD|CC PAYMENT|VISA|…`) are used only as *hints*, not as the primary signal.

---

## 11. Analytics & Dashboards

### 11.1 Spend dashboard (`src/pages/dashboard/`)
- **Scope selector** (top bar): All Combined / a single account / a single card.
- **Summary cards:** Total Income, Total Expenses (excl. transfers + investments), Net Savings, Savings Rate %, Uncategorized count.
- **Category donut** with drill-down → sub-categories → transactions.
- **Monthly trend** stacked bar by category.
- **Top 10 merchants.**
- **Recent transactions** (last 50) — inline re-categorize + editable remarks.
- **Time ranges:** This Month (default), Last Month, Last 3M/6M, YTD, Custom.
- **Account view:** opening/closing balance + daily-balance line chart for an account; limit/outstanding/available + utilization gauge for a card.

**Definitions (authoritative):**
- **Expense** = `type='debit'` **AND** `is_excluded = 0` **AND** category ≠ Investment.
- **Income** = `type='credit'` **AND** `is_excluded = 0`.

> **Analytics query gotcha:** in the `where()` helper, extra conditions' `?` params must come **after** the date-condition params (callers append `exp.params` after `where().params`), and JOIN queries must pass the `'t.'` column prefix — otherwise `user_id` is "ambiguous." See `PROJECT_STATE.md` §5.8.

### 11.2 Investment dashboard (`src/pages/investments/`)
- **Overview cards:** Total Portfolio Value, Invested Amount, Gain/Loss (₹ and %), Overall XIRR %, Day Change.
- **MF tab:** scheme, folio, units, avg NAV, current NAV, invested/current value, gain/loss, XIRR %, day change → row opens transaction history + NAV chart.
- **Stocks tab:** symbol, qty, avg buy price, current price, invested/current value, gain/loss, XIRR %, day change → row opens trade log + price chart.
- **Time controls:** 1D / 1W / 1M / 3M / 6M / 1Y / All / Custom.

### 11.3 Transactions screen (`src/pages/transactions/TransactionsPage.tsx`)
A full transaction browser (replaces the old placeholder): scope filter (all / any account / cash / any card), time-range preset (This/Last Month, 3M/6M, YTD, All), and a client-side description/notes search over the fetched rows (via `analytics:recentTransactions`, limit 500). Rows reuse the dashboard's `RecentTransactions` table — inline re-categorize (`transactions:recategorize`), editable remarks, transfer/CC badges. Hosts the **"Import statement"** entry point (choose target account or cash → `StatementImport`).

---

## 12. XIRR

`electron/services/xirr.ts` — annualized internal rate of return over dated cashflows (outflows negative, inflows positive), computed per-holding and overall.

- **Primary:** Newton-Raphson from a 0.1 guess (≤ 100 iterations), using NPV and its analytic derivative, discounting from the earliest cashflow date with a 365-day year.
- **Fallback:** if Newton-Raphson fails to converge or leaves the valid domain (`rate ≤ -1`), **bisection** over a bracket that expands (doubling the upper bound up to 60×) until it brackets a root, then ≤ 200 bisection steps.
- **Returns `null`** when undefined: fewer than two flows, or all flows the same sign (NPV never crosses zero).
- **`xirrPercent()`** returns the rate ×100 rounded to 1 dp.

---

## 13. Market Data & Refresh

`electron/services/market-data.ts` + `refresh-scheduler.ts`.

- **Sources (read-only, public):** mutual-fund NAVs from `https://api.mfapi.in/mf/{scheme_code}`; stock prices from a Yahoo Finance wrapper.
- **Caching:** fetched history is written to the shared `mf_nav` / `stock_price` tables (no `user_id`).
- **Scheduling:** a **node-cron** job in the main process refreshes daily (default 7 PM IST, configurable in Settings → Data & Refresh, persisted to `settings.json`). It also auto-triggers on launch if data is stale, plus a manual "Refresh Now" (`portfolio:refresh`).
- **Resilience:** Yahoo can rate-limit from some networks; the fetcher degrades gracefully (per-symbol errors collected, holdings fall back to average cost). mfapi.in NAV is reliable.
- **Testability:** `fetch` is injectable so tests run deterministically; `FINPILOT_PYTHON` env selects the sidecar interpreter.

---

## 14. Settings (`src/pages/settings/`)

- **Profile** — edit username, name, salary, employer, FY start. Saving mirrors the username to `settings.json` for the unlock greeting.
- **Bank Accounts** — add, rename, delete; **per-account "Import statement"** opens the shared `StatementImport` targeted at that account.
- **Credit Cards** — add, rename, delete; **per-card "Import statement"** (card-scoped `StatementImport`).
- **Import Data** — post-onboarding importers for mutual funds (CAS, multi-file), stocks (broker CSV, multi-file), and cash (tracker CSV). Reuses `CasImporter` / `BrokerImporter` / `StatementImport`.
- **Categories** — create, rename, hide, **merge** (`categories:merge`), delete custom categories.
- **Rules** — view / edit / add categorization rules.
- **Data & Refresh** — refresh schedule, categorization coverage, re-run categorization.
- **Uncategorized review** — queue to clear un-categorized transactions (the dashboard's "Review →" jumps here).
- **Security** — change the master password (`auth:changePassword` → SQLCipher `PRAGMA rekey`; requires the current password, salt unchanged).
- **Advanced** — **Developer mode** toggle; when on, IPC errors show their exact `[dev]` detail instead of the friendly message.

---

## 15. Build, Run & Test

```bash
# (Bash tool only) Node/npm live at C:\Program Files\nodejs
export PATH="/c/Program Files/nodejs:$PATH"

npm install                       # postinstall rebuilds native SQLite for Electron
npm run dev                       # launch the app (electron-vite dev)
npx tsc --build --noEmit --force  # typecheck (rm stale *.tsbuildinfo if needed)
FINPILOT_PYTHON=python npx vitest run   # full suite (node + jsdom projects)
npx electron-vite build           # production build → out/
```

- **Dev-mode userData is `%APPDATA%\Electron\`** (unpackaged app resolves to "Electron"), holding `finpilot.db`, `finpilot.salt`, `-wal`, `-shm`. To reset onboarding, delete `%APPDATA%\Electron\finpilot.*`.
- **Live UI verification:** driving the native file dialog / combobox via SendKeys is flaky; to populate the dev DB, use a temporary env-guarded vitest test that calls the real services, then relaunch + unlock (pattern documented in `PROJECT_STATE.md` §6).
- **Tests:** ~141 across ~23 files (XIRR, categorizer, transfer detection, parsers, analytics, IPC integration with a real SQLite DB). All green.

---

## 16. Known Limitations & Roadmap

**Resolved in the UAT fix round (see `IMPLEMENTATION_PLAN.md`):** username (+ unlock greeting), password-error UX, multi-file/provider-neutral MF & stock imports, the **Transactions screen**, **post-onboarding statement upload** (Transactions + Settings), and **change-password** (Settings → Security).

**Current gaps:**
- **No password recovery** — only change-password exists. A **recovery-phrase** mechanism (offline, zero-knowledge) is the planned approach; email-OTP recovery was rejected (the password is the encryption key, and email breaks the no-network rule).
- **Onboarding PDF auto-import** covers only sidecar-supported banks (ICICI/HDFC/SBI); other PDFs fall through to manual import on the Transactions screen.
- Ambiguous-transfer **confirmation-queue UI** not built (IPC exists).

**Phase 2+ (from the PRD roadmap):** AI categorization via the Claude API, goal-based savings, budgets, net-worth trend, packaging (`electron-builder` + PyInstaller-bundled sidecar).

---

*Keep this document current: when a feature's behaviour, schema, or algorithm changes, update the relevant section here in the same change.*
