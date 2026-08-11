# FinPilot — Project State & Session Handoff

> Living handoff doc for FinPilot (Electron + React desktop personal-finance app for India).
> Written so a fresh session can pick up without re-deriving context. Update it as work progresses.

**Last updated:** after completing Phase 1 (Phases A–I) and pushing to GitHub.

---

## 1. What FinPilot is

A **desktop-first, offline-capable, encrypted** personal-finance app for Indian users. Consolidates
bank accounts, credit cards, cash, mutual funds, and stocks into one dashboard. All data is local and
encrypted at rest (SQLCipher). No cloud dependency for core features. Source of truth for requirements:
`docs/FinPilot_01_PRD.docx` (product) and `docs/FinPilot_02_HLD.docx` (architecture); build order and
rules are in `Claude.md` at the repo root.

---

## 2. Current status — DONE

**Phase 1 is complete: all nine build phases A–I are implemented, tested, and committed.**

- Git: commit `25c1a03` "Phase 1: complete FinPilot desktop personal-finance app (A–I)".
- Branches (all at `25c1a03`): `master`, `UAT-testing`. **Currently checked out: `UAT-testing`.**
- Remote: `origin` = `https://github.com/saurabhk23-beep/finpilot.git`. `master` and `UAT-testing`
  are pushed and tracking. NOTE: the remote also has a pre-existing `main` branch (unrelated initial
  commit `fc129d3`) which is still GitHub's **default branch** — so the repo's default view does not
  show the app until someone switches to `master`, or the default branch is changed in GitHub settings.
- Tests: full suite green (see "Verification" — ~141 tests across ~23 files). Typecheck clean.
  Production build (`electron-vite build`) succeeds.

There is no active in-progress work. Phase 2+ (see PRD roadmap) has not been started.

---

## 3. Tech stack & repo layout

- **Electron + React 18 + Vite + TypeScript**, bundled by **electron-vite** (`electron.vite.config.ts`).
  Main/preload/renderer separation; renderer has no direct DB/FS access — everything goes through IPC.
- **DB:** SQLite via **`better-sqlite3-multiple-ciphers`** (SQLCipher-compatible; NOT plain better-sqlite3).
- **State:** Zustand. **Charts:** Recharts. **Styling:** Tailwind v4 (`@tailwindcss/vite`), dark sidebar /
  light content theme in `src/index.css`.
- **CSV:** PapaParse. **Scheduler:** node-cron. **Python sidecar:** casparser (CAS PDFs), pypdfium2.
- **Tests:** Vitest, two projects — `node` (main/services/parsers) and `jsdom` (renderer, RTL).

```
electron/
  main.ts                 window, IPC registration, cron refresh schedule, DB lifecycle
  preload.ts              contextBridge → window.api.invoke(channel, {userId, ...})
  ipc/                    one file per domain; index.ts registers them; types.ts has requireUserId()
  db/
    connection.ts         openDatabase (pure, testable) + initDatabase/getDb/closeDatabase singleton
    crypto.ts             scrypt key derivation + per-install salt
    migrate.ts            versioned migration runner (_migrations table)
    migrations/           001..004 .sql + index.ts (bundled via ?raw)
    seed.ts               user id=1 + categories + keyword/mcc/vpa rules
    queries/              per-entity CRUD; EVERY query WHERE user_id = ? (except mf_nav/stock_price)
    types.ts              row types
  parsers/                pure parsing: amount/date, csv, bankCsv, groww, dedup, accountMatch, hash, sidecar
  services/               categorizer, categorization-service, transfer-detector/-service, analytics,
                          portfolio, xirr, market-data, refresh-scheduler, import-service,
                          investment-import, category-merge, app-settings
src/
  App.tsx                 routes on appStore.screen: loading|password|onboarding|dashboard
  lib/ipc.ts              typed IPC client; domain() auto-injects userId=1
  stores/                 appStore (routing), onboardingStore, dashboardStore
  pages/
    Splash.tsx            create-vault / unlock
    onboarding/           6-step wizard (Profile, Bank, Cards, Cash, Investments, Summary)
    Dashboard.tsx         shell: sidebar nav + section switch (dashboard/investments/settings/transactions)
    dashboard/            SpendDashboard + SummaryCards, CategoryDonut, MonthlyTrend, TopMerchants,
                          RecentTransactions, CategoryDrilldown, AccountView, TopBar
    investments/          InvestmentDashboard + PortfolioCards, HoldingsTable, HoldingDetail
    settings/             SettingsPage + Profile/Accounts/Cards/Categories/Rules/DataRefresh/UncategorizedReview
  components/             ui.tsx, Combobox, FilePicker, CategorySelect, charts/palette
  utils/                  format (INR/date), dateRange
data/                     categories.json, keyword_rules.json, mcc_mappings.json, vpa_mappings.json
python/                   parse_cas.py, parse_bank.py (both support --self-test), requirements.txt
```

---

## 4. What each phase delivered

- **A — Scaffold:** Electron+Vite+React+TS, Tailwind theme, folder structure, IPC bridge.
- **B — Data layer:** SQLCipher DB, migration runner, seed (user id=1, 14 categories + subs, rules),
  per-entity query helpers (all `WHERE user_id = ?`), domain IPC handlers with `requireUserId`.
- **C — Onboarding:** master-password create/unlock (auth IPC + scrypt), 6-step wizard, dashboard placeholder.
- **D — Statement parsing:** generic bank CSV (single-amount or debit/credit cols, Indian dates), Groww CSV,
  Python sidecars for CAS/bank PDF, sha256 file-level dedup + transaction-level dedup, new-account detection.
  Import pipeline is main-process: `import:preview` (no writes, re-mappable) → `import:commit`/`commitCash`.
- **E — Categorizer (5 layers):** user-overrides → MCC → keyword → UPI VPA → heuristics (salary via employer
  match, EMI via recurring debit). First match wins; user rules checked first. Runs on import commit. Coverage %,
  learned rules from re-categorization (`transactions:recategorize`).
- **F — Transfer detection:** inter-account (debit↔credit, other account, same/next day) + CC bill payments
  (bank debit↔card credit). Tags `is_transfer`/`is_cc_payment` + `is_excluded` + `matched_transfer_id`.
  Ambiguous matches surfaced, not auto-linked. Runs after each import commit.
- **G — Spend dashboard:** account/card scope + time-range picker; summary cards (income, expenses excl.
  transfers+investments, net savings, savings rate, uncategorized), category donut (drill-down), monthly
  stacked-bar trend, top merchants, recent txns (inline re-categorize + remarks), per-account balance line /
  per-card utilization gauge.
- **H — Investment dashboard:** XIRR (Newton-Raphson + bisection fallback), portfolio/holdings service (MF +
  stocks, gain/loss, day change, per-holding + overall XIRR), market data (mfapi.in NAV, Yahoo prices) with
  daily node-cron refresh + manual "Refresh Now", MF/Stocks tables + row→detail (chart + txn log).
- **I — Settings & extras:** Profile edit; Accounts/Cards manage; Categories (add/rename/hide/**merge**/delete);
  Rules editor; Data & Refresh (schedule config via `settings.json`, coverage, re-run categorization);
  Uncategorized review queue (dashboard "Review →" link jumps here).

---

## 5. Key architecture decisions & non-obvious gotchas

**Read these before making changes — several cost real debugging time.**

1. **`userId` everywhere.** Phase 1 hardcodes user id=1 (renderer `CURRENT_USER_ID`, injected by `domain()`).
   Every DB query filters by `user_id` except the shared public caches `mf_nav` and `stock_price`. Keep it.
2. **Node/npm not on PATH.** They live at `C:\Program Files\nodejs`. In Bash tool prefix with
   `export PATH="/c/Program Files/nodejs:$PATH"`. PowerShell can call `node_modules\electron\dist\electron.exe`.
3. **Dev-mode Electron userData is `%APPDATA%\Electron\`** (unpackaged app name resolves to "Electron"),
   NOT `%APPDATA%\finpilot\`. Encrypted DB files: `finpilot.db`, `finpilot.salt`, `-wal`, `-shm`. To reset
   onboarding, delete `%APPDATA%\Electron\finpilot.*` (use `Get-Item "$env:APPDATA\Electron\finpilot.*" | Remove-Item`;
   a path string containing "C:\Program Files" can trip a sandbox guard).
4. **Migrations own their transactions.** `runMigrations` does NOT auto-wrap in a transaction because
   migration 003 rebuilds the `account` table and must toggle `PRAGMA foreign_keys` outside a transaction.
   001/002 wrap themselves in BEGIN/COMMIT; 003 follows SQLite's 12-step ALTER recipe.
5. **`openDatabase` closes on failure.** A wrong master password throws "file is not a database" on first
   read; the connection is closed in a try/catch so it doesn't leak a file handle (Windows EPERM on rmSync).
6. **IPC handlers must be `async`.** They throw for a bad `userId`; if not async the throw doesn't reject.
7. **Categorizer `category_id` = top-level, `sub_category_id` = the sub.** Rules point at the sub category;
   the categorizer resolves parent/sub. The old `NEFT|IMPS|RTGS → Transfer` keyword rule was REMOVED because
   it pre-empted salary detection and real transfer detection (transfers are found by amount-matching, not narration).
8. **Analytics `where()` param ordering.** Extra conditions (with their `?` params) MUST come after the date
   conditions in the SQL, because callers append `exp.params` after `where().params`. Getting this wrong
   silently corrupts every date-filtered query. Also: JOIN queries alias transactions as `t` and must pass
   the `'t.'` column prefix to `where()`/`expenseExtra()` (else "ambiguous column name: user_id").
9. **Dashboard range subscription.** `SpendDashboard` must subscribe to `preset`/`customRange` (not the store's
   `range()` function, which is a stable ref) or the time-range picker is silently inert.
10. **electron-store avoided.** It's ESM-only and would break the CJS main bundle. App settings use a small
    fs-backed `services/app-settings.ts` writing `userData/settings.json` instead.
11. **Recharts v3 tooltip/formatter types** are strict — use `(v) => fmt(Number(v))`, not `(v: number)`.
12. **Expense definition:** debit AND `is_excluded = 0` AND not the Investment category. Income: credit AND
    not excluded. This is the PRD's #1 accuracy rule (transfers/CC payments excluded from spend/income).
13. **Sidecar Python:** `electron/parsers/sidecar.ts` runs `python` from PATH by default; override with
    `FINPILOT_PYTHON` env (used to make sidecar/market-data tests run vs skip). `casparser` is pip-installed
    in this env. Both `.py` scripts support `--self-test` (no-deps JSON) for contract tests.

---

## 6. Commands

```bash
export PATH="/c/Program Files/nodejs:$PATH"   # Bash tool only
npx tsc --build --noEmit --force              # typecheck (rm -f *.tsbuildinfo first if stale)
FINPILOT_PYTHON=python npx vitest run         # full test suite (node + jsdom projects)
npx electron-vite build                       # production build → out/
# run built app (PowerShell): electron.exe out\main\main.js
```

**Live UI verification** (the app is desktop Electron, not the in-app browser): launch the built app and
drive it with PowerShell `SendKeys`/`mouse_event` + screenshot helpers. Two gotchas: (a) button-sized clicks
are flaky and the datalist combobox (bank/issuer search) doesn't reliably retain SendKeys text; (b) driving
the native file-open dialog is unreliable. **To populate the dev DB for a live check, don't fight the file
dialog** — write a temporary env-guarded vitest test (`describe.skip` unless `FINPILOT_DEV_DB` is set) that
opens the real dev DB (`%APPDATA%\Electron\finpilot.db` + `.salt`, password from onboarding) and calls the
real services (`commitTransactionImport`, `updateUser({onboarding_completed:1})`, MF/stock seeders), then
relaunch + unlock. Delete the temp test afterward. (This pattern was used to verify Phases G and H live.)

---

## 7. Verification (this session)

Phases A–I each verified with: clean `tsc`, green `vitest`, successful `electron-vite build`, and a live
click-through of the running app (screenshots) for the UI-heavy phases:
- **G live:** dashboard rendered correct income/expenses/savings, donut, top merchants; time-range filter
  confirmed (This Month full data, Last Month empty).
- **H live:** portfolio value/XIRR/day-change correct; SIP vs lumpsum XIRR distinction right; partial sells
  reduce qty; losses render red with negative XIRR; row→detail chart + trade log worked.

Bugs found & fixed by tests this session: leaked file handle on bad-password DB open; sync-throwing IPC
handlers; analytics param-ordering corruption; dashboard range-subscription no-op; a greedy NEFT keyword rule.

Known caveat: Yahoo stock-price endpoint can rate-limit/block from some networks — the fetcher degrades
gracefully (per-symbol errors collected, holdings fall back to avg cost). mfapi.in NAV is reliable.
Benign flake: vitest occasionally reports "1 error" (exit 0) from a Windows teardown race (temp-dir rm vs
SQLite WAL handle) — cosmetic.

---

## 8. Persistent memory

Cross-session facts live in the user's memory dir (loaded via `MEMORY.md` each session):
`dev-runtime-notes.md` captures the PATH / userData / sidecar / live-verification facts above. Keep it in sync.

---

## 9. Suggested next steps (not started)

- Change GitHub default branch to `master` (or reconcile with `main`) so the repo shows the app by default.
- A dedicated **Transactions** screen (nav item exists but is a placeholder) with per-account statement upload
  (the import pipeline + IPC already exist; only the cash step currently uploads).
- UI for the **ambiguous-transfer confirmation** queue (`transfers:confirm`/`unlink` IPC already exist).
- Phase 2 (PRD roadmap): AI categorization via Claude API, goal-based savings, budgets, net-worth trend.
- Packaging (`electron-builder`) + bundling the Python sidecar via PyInstaller for distribution.
