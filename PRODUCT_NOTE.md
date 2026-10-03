# FinPilot — Product Note

| | |
|---|---|
| **Product** | FinPilot — private, offline personal-finance manager for India |
| **Platform** | Desktop (Windows / macOS) — Electron + React |
| **Document type** | Product Note / feature reference |
| **Status** | Phase 1 feature-complete; hardened via real-statement UAT |
| **Version** | 1.1 |
| **Last updated** | 2026-10-03 |
| **Related docs** | `TECHNICAL_DESIGN.md` (architecture), `PROJECT_STATE.md` (build log), `docs/FinPilot_01_PRD.docx`, `docs/FinPilot_02_HLD.docx` |

> **How to read this document:** §1–§4 are the "why". §5 is the navigation map. **§6 is the complete feature inventory** (every shipped capability, with IDs). §7–§17 are per-module specifications. §18+ cover data, non-functionals, metrics, edge cases, limitations, and roadmap. This note is intended to be self-sufficient: anyone should be able to understand the full product and its feature set from this file alone.

---

## 1. Executive summary

FinPilot consolidates a person's entire financial life — bank accounts, credit cards, cash, mutual funds, and stocks — into a single desktop dashboard that runs **entirely on their own machine**. Users import statements (PDF/CSV), and FinPilot automatically parses, de-duplicates, categorizes, and reconciles them into a clear picture of **income, true spending, savings rate, and net investment performance**.

Its defining choices are **privacy** (an encrypted local vault; no cloud, no data upload) and **accuracy** (money moved between a user's own accounts, and credit-card bill payments, are detected and excluded from "expenses" — the single most common way other trackers mislead users).

---

## 2. Vision & positioning

**Vision:** *"Your complete financial picture, private by default, honest by design."*

**Positioning:** FinPilot sits between (a) bank/card apps that each show only a sliver, and (b) cloud aggregators (which require linking accounts and uploading data). FinPilot gives the **aggregator's consolidated view without the privacy trade-off** — the user stays the sole custodian of their data and the only holder of the decryption key.

**Primary differentiators:**
1. **Local-only, encrypted vault** — nothing leaves the device except public price lookups.
2. **Transfer / CC-payment exclusion** — expense figures reflect real consumption.
3. **Multi-institution statement ingestion** — bank-specific PDF parsers + generic CSV, with passwords, de-dup, and undo.
4. **Learns the user's categories** — re-categorizations become rules.
5. **Works offline** — only price refresh needs a connection.

---

## 3. Target users & personas

| Persona | Description | Key needs |
|---------|-------------|-----------|
| **"Multi-bank Salaried" (primary)** | Salaried professional with 2–3 bank accounts, 1–2 credit cards, SIPs + some stocks. | One consolidated view; accurate spend vs. savings; privacy. |
| **"Privacy-conscious"** | Unwilling to link accounts to cloud fintechs. | Local, encrypted, no uploads. |
| **"Investor"** | Tracks MF/stock performance across platforms. | XIRR, gain/loss, consolidated portfolio. |
| **"Spreadsheet quitter"** | Currently maintains a manual expense sheet. | Automation: auto-import + auto-categorize, but still editable. |

**Assumptions:** desktop user, Indian banking context (INR, UPI, NEFT/IMPS/RTGS, CAS statements), comfortable downloading statements from net-banking.

---

## 4. Goals, non-goals & success signals

**Goals**
- G1. Give an accurate, consolidated view of income, expenses, savings, and investments.
- G2. Keep all personal financial data local and encrypted.
- G3. Make statement ingestion low-effort and forgiving (auto-parse, auto-categorize, de-dup, undo).
- G4. Exclude internal transfers and CC payments from spend (accuracy).

**Non-goals (Phase 1)**
- No bank API / account linking / screen-scraping.
- No cloud sync, multi-device, or sharing.
- No bill-pay, money movement, or transactions initiation.
- No tax filing, advisory, or multi-user households (data model is ready; UI is single-user).

**Success signals (product health)**
- Categorization coverage % (surfaced in-app).
- Transfer/CC-payment detection rate (expenses not inflated).
- Import success rate per bank/format.
- Re-categorization volume trending down (learning works).

---

## 5. Information architecture (navigation map)

```
Launch
 └─ Splash / Unlock  (Create Vault on first run)
     └─ Onboarding wizard (first run only)
         1 Profile → 2 Bank Accounts → 3 Credit Cards → 4 Cash → 5 Investments → 6 Review & Confirm
     └─ Main app (left sidebar)
         ├─ Dashboard        (spend analytics)
         ├─ Transactions     (ledger + import + import history)
         ├─ Investments      (portfolio: MF + Stocks)
         └─ Settings
              ├─ Profile
              ├─ Bank Accounts
              ├─ Credit Cards
              ├─ Import Data
              ├─ Categories
              ├─ Rules
              ├─ Data & Refresh
              ├─ Uncategorized (review queue)
              ├─ Security (change password)
              └─ Advanced (developer mode)
```

---

## 6. Feature inventory (complete)

Every shipped capability, grouped by area. IDs are for reference only.

### 6.1 Access & security
| ID | Feature | Notes |
|----|---------|-------|
| SEC-1 | Create encrypted vault (first run) | Master password, min 6 chars |
| SEC-2 | SQLCipher encryption at rest | scrypt key derivation + per-install salt |
| SEC-3 | Unlock with master password | Password *is* the key; never stored |
| SEC-4 | "Welcome back, <username>" greeting | Username mirrored outside vault for pre-unlock display |
| SEC-5 | Password error clears on retype | No stale error messages |
| SEC-6 | Change master password | In-place SQLCipher re-key; verifies current password |
| SEC-7 | Developer mode toggle | Controls error verbosity (friendly vs. raw) |
| SEC-8 | No-recovery safeguard messaging | Clear warning that password can't be recovered |

### 6.2 Onboarding
| ID | Feature |
|----|---------|
| ONB-1 | 6-step guided wizard (first run) |
| ONB-2 | Profile capture (username, name, salary, employer, FY start) |
| ONB-3 | Add multiple bank accounts with details |
| ONB-4 | Add multiple credit cards with details + linked account |
| ONB-5 | Attach statements (PDF/CSV) per account/card, with PDF password |
| ONB-6 | Cash CSV import with column mapping (skippable) |
| ONB-7 | Multi-file, multi-provider MF (CAS) import |
| ONB-8 | Multi-file, provider-neutral broker (stocks) import |
| ONB-9 | Manual stock entry |
| ONB-10 | Remove/replace attached files before importing |
| ONB-11 | Review & confirm → imports attachments, categorizes, detects transfers, reports results |

### 6.3 Spend dashboard
| ID | Feature |
|----|---------|
| DSH-1 | Scope selector (All / per account / per card) |
| DSH-2 | Summary cards: Income, Expenses (ex-transfers/investments), Net Savings, Savings Rate %, Uncategorized count |
| DSH-3 | Category donut with drill-down to sub-categories → transactions |
| DSH-4 | Monthly trend stacked bar (by category) |
| DSH-5 | Top merchants (clean payee names) |
| DSH-6 | Recent transactions with inline re-categorize + remarks |
| DSH-7 | Time-range presets (This/Last Month, 3M, 6M, YTD) + Custom |
| DSH-8 | Per-account balance view (opening/closing + daily line) |
| DSH-9 | Per-card view (limit, outstanding, available, utilization gauge) |
| DSH-10 | "Review →" jump to uncategorized queue |

### 6.4 Transactions
| ID | Feature |
|----|---------|
| TXN-1 | Full transaction ledger |
| TXN-2 | Filters: scope, time range, free-text search (description + notes) |
| TXN-3 | Inline re-categorize |
| TXN-4 | Editable remarks (every transaction) |
| TXN-5 | Transfer / CC-payment badges |
| TXN-6 | Import statement (choose account/card/cash target) |
| TXN-7 | Imported-files history (last 5, "View more") |
| TXN-8 | Delete an import (removes import + its transactions) |

### 6.5 Statement import pipeline
| ID | Feature |
|----|---------|
| IMP-1 | Reusable importer (onboarding, Transactions, Settings) |
| IMP-2 | CSV parsing with auto + manual column mapping (single-amount or debit/credit columns) |
| IMP-3 | Bank-specific PDF parsers (see §11 matrix) |
| IMP-4 | Generic PDF parser fallback + "use CSV" guidance |
| IMP-5 | PDF password support |
| IMP-6 | Bank auto-derived from the target (no redundant prompt) |
| IMP-7 | Pick → review → remove/replace → parse → commit flow |
| IMP-8 | File-level de-dup (SHA-256 hash) |
| IMP-9 | Transaction-level de-dup at commit (skip + report duplicates) |
| IMP-10 | New-account detection (add/link/skip) |
| IMP-11 | Auto-categorize + transfer-detect on commit |
| IMP-12 | Multi-file, provider-neutral MF (CAS) & broker imports |
| IMP-13 | Python interpreter auto-detection (robust sidecar execution) |

### 6.6 Categorization
| ID | Feature |
|----|---------|
| CAT-1 | 5-layer engine (MCC → keyword → VPA → heuristics → user overrides) |
| CAT-2 | Salary detection via employer-name match (not fixed date) |
| CAT-3 | EMI/recurring detection |
| CAT-4 | Learned rules from user re-categorization |
| CAT-5 | 14 seeded top-level categories + sub-categories |
| CAT-6 | Coverage % tracking |
| CAT-7 | Uncategorized review queue |
| CAT-8 | Rule editor (view/add/edit) |
| CAT-9 | Category management (create/rename/hide/merge/delete) |

### 6.7 Transfer & CC-payment detection
| ID | Feature |
|----|---------|
| TRF-1 | Inter-account transfer detection (amount + date window) |
| TRF-2 | Credit-card bill-payment detection (linked account aware) |
| TRF-3 | Ambiguous-match flagging (no silent guessing) |
| TRF-4 | Exclusion of both from income/expense totals |

### 6.8 Investments
| ID | Feature |
|----|---------|
| INV-1 | Portfolio overview (value, invested, gain/loss ₹ & %, overall XIRR, day change) |
| INV-2 | Mutual-fund holdings table |
| INV-3 | Stock holdings table |
| INV-4 | Holding detail (MF: txns + NAV chart; Stock: trades + price chart) |
| INV-5 | XIRR per holding and overall |
| INV-6 | Daily market-data refresh (auto, scheduled) |
| INV-7 | Refresh-on-launch when stale |
| INV-8 | Manual "Refresh Now" |

### 6.9 Settings & cross-cutting
| ID | Feature |
|----|---------|
| SET-1 | Profile edit |
| SET-2 | Accounts / Cards management + per-item import |
| SET-3 | Import Data hub (MF/stocks/cash) |
| SET-4 | Refresh schedule config |
| SET-5 | Developer mode toggle |
| SYS-1 | Friendly, sanitized error messages (raw detail logged, not shown) |
| SYS-2 | INR formatting + Indian date parsing |
| SYS-3 | User-scoped data (multi-user-ready model) |
| SYS-4 | Offline operation for all core features |

---

## 7. Access & security (detail)

**First-run (Create Vault):** user enters and confirms a master password (min 6). FinPilot derives an encryption key (scrypt + per-install salt), creates the encrypted SQLite DB, and routes to onboarding. The screen warns that the password cannot be recovered.

**Returning (Unlock):** shows *"Welcome back, <username>"* (the username is mirrored in plaintext **outside** the vault, since the DB can't be read before unlock). User enters the master password → dashboard (or onboarding if incomplete).

**States & edge cases**
- Wrong password → "Incorrect password." The message **clears as soon as the user edits the field**, reappearing only if the next submit still fails.
- Change password (Settings → Security): requires the current password; on success re-encrypts the vault in place and reports success; the old password stops working and data is preserved.
- Developer mode (Settings → Advanced): ON → exact technical errors shown for debugging; OFF (default) → friendly messages, with full errors logged locally.
- **No recovery** path today; a zero-knowledge **recovery phrase** is the planned mechanism. Email-OTP recovery was explicitly rejected (would require a server and break the no-network guarantee).

---

## 8. Onboarding (detail)

A one-time wizard; each step is editable later in Settings.

1. **Profile** — username (shown at unlock), name, monthly post-tax salary (₹), employer/company name (drives salary detection), financial-year start month (default April). All required except FY (defaulted).
2. **Bank accounts** — repeatable. Fields: bank (searchable Indian-bank list), nickname, last-4, type (Savings/Current/Salary), opening balance. Attach one or more statements (PDF/CSV); a password field appears when a PDF is attached.
3. **Credit cards** — repeatable. Fields: issuer, nickname, last-4, credit limit, bill-cycle date, linked bank account (for bill-payment detection). Attach statements (+ password).
4. **Cash** — upload a tracker CSV with column mapping, or skip.
5. **Investments** — MF: add one or more **CAS** PDFs (CAMS / KFintech / MFCentral), each with its password; Stocks: add one or more **broker** trade CSVs (Groww / Zerodha / Upstox / …); or add a stock manually. Files can be removed/replaced before import.
6. **Review & confirm** — a summary of profile + counts of accounts/cards/stocks/schemes with Edit links. On confirm, FinPilot imports the queued statements (best-effort per file), runs categorization + transfer detection, reports *"Imported N transactions…"* (and how many files need manual handling), then enters the dashboard.

---

## 9. Spend dashboard (detail)

The default post-unlock screen.

- **Scope** (top bar): All Combined / a specific account / a specific card.
- **Summary cards:** Total Income; Total Expenses *(debits that are not transfers, not CC payments, not investments)*; Net Savings; Savings Rate %; Uncategorized count.
- **Spending by category:** donut; click a slice → sub-category breakdown → transaction list (with re-categorize).
- **Monthly trend:** stacked bar by category over time.
- **Top merchants:** ranked by spend; names are extracted intelligently from UPI narrations (real payee/merchant, not masked VPA handles or reference/phone numbers).
- **Recent transactions:** latest rows with inline category change, editable note, and transfer/CC badges.
- **Time range:** This Month (default), Last Month, Last 3M, Last 6M, YTD, Custom.
- **Account view** (single account selected): opening/closing balance + daily-balance line chart.
- **Card view** (single card selected): limit, outstanding, available, utilization gauge.

**Definitions (authoritative):** *Expense* = debit AND not excluded AND not Investment category. *Income* = credit AND not excluded.

---

## 10. Transactions screen (detail)

A full ledger plus import tooling.

- **Filters:** scope (All / any account / cash / any card), time range, free-text search over description and remarks; live "N shown" count.
- **Table columns:** Date · Description (+ "add note") · Category (inline dropdown) · Account/Card badge (+ transfer/CC badge) · Amount (credits in green).
- **Import statement:** choose a target (Cash / any account / any card) and upload a CSV or PDF — runs the §11 importer.
- **Imported files:** a history card (always visible when imports exist) listing file name, transaction count, account, and date. Shows the **last 5** with a **"View more (N more)"** toggle. Each has **Delete**, which removes the import record **and the transactions it created** — the supported way to undo a wrong/mis-parsed import and re-import cleanly.

---

## 11. Statement import pipeline (detail)

The reusable importer used across onboarding, Transactions, and Settings.

**Flow:** *pick file → review (remove/replace before parsing) → parse → commit.* Nothing is written until commit; a wrong file can be swapped out first.

**CSV:** generic column-mapper (date, amount **or** separate debit/credit columns, narration) with auto-mapping on first pass and manual override.

**PDF:**
- The **bank is taken from the target** account/card — no "which bank?" prompt when it's known. For a target whose bank has no dedicated parser, FinPilot shows a note and uses the generic parser, suggesting a CSV export if it can't read the file. (The bank picker appears only for a Cash import, which has no bank context.)
- **Password** field for protected statements.

**Supported PDF formats (verified on real statements):**

| Institution | Statement type | Parser | Verified |
|-------------|----------------|--------|----------|
| ICICI Bank | Savings account ("OpTransactionHistory") | `parse_icici` (multi-line rows, DD.MM.YYYY, balance-delta direction) | 527/527 txns |
| ICICI Bank | Credit card | `parse_icici_card` (single-line rows, reward points stripped, `CR`=credit) | 4/4 txns |
| SBI | Savings account | `parse_sbi` (two-date rows, explicit Debit/Credit columns) | 60/60 txns |
| Bank of Baroda (BOBCARD) | Credit card | `parse_bob_card` (`INR <amt> <amt> DR|CR`) | 26/26 txns |
| Any other | Any | Generic line parser → else prompt for CSV | best-effort |

**De-duplication (two layers):**
1. **File-level** — the exact same file (SHA-256) is rejected as "already imported."
2. **Transaction-level (commit-time)** — rows already present on the target (same date + amount + normalized narration) are **skipped and reported** ("Imported N · Skipped M duplicates already in this account"). This defeats the renamed/re-downloaded-statement case where the file hash differs but the content is identical.

**Other:** new-account detection (prompt to add/link/skip); after commit, auto-categorization and transfer detection run; imports can be undone (§10).

**Reliability note:** the Python PDF sidecar auto-detects a working interpreter (needed because a bare `python` can resolve to a dependency-less OS stub), so parsing works regardless of how the app was launched.

---

## 12. Categorization engine (detail)

Runs on every import; **first match wins**; the user teaches it over time.

| Layer | Basis | Example |
|-------|-------|---------|
| 1. MCC | Merchant-category code on card txns | 5411 → Groceries |
| 2. Keyword | Regex on narration | `SWIGGY\|ZOMATO` → Food/Delivery |
| 3. UPI VPA | Payment handle | `name@bank` → mapped category |
| 4. Heuristics | Salary (employer-name match on a credit) · EMI (recurring same-amount debit) | "ACME CORP" credit → Salary |
| 5. User overrides | Learned from re-categorization | re-tag "BHARAT GAS" → Utilities, sticks |

- **Coverage %** is tracked and surfaced; an **Uncategorized review queue** (Settings) lists remaining items (and the dashboard links to it).
- **14 top-level categories** with sub-categories ship by default; users can create/rename/hide/merge/delete and edit the underlying rules.

---

## 13. Transfer & CC-payment detection (detail)

The mechanism behind accurate expenses.

- **Inter-account transfer:** a debit matched to a same-amount credit in a *different* account within a short date window → both tagged `is_transfer`, linked, and excluded from income/expense.
- **CC bill payment:** a bank debit matched to a card "payment received" near the bill cycle (uses the card's linked account as a tie-breaker) → tagged `is_cc_payment` and excluded.
- **Ambiguous matches** (multiple candidates) are flagged for the user rather than guessed.
- Narration keywords (NEFT/IMPS/RTGS/UPI/CARD PAYMENT) are hints only; amount-matching is primary.

---

## 14. Investment dashboard (detail)

- **Overview cards:** Total Portfolio Value, Invested Amount, Gain/Loss (₹ and %), Overall **XIRR %**, Day Change.
- **Mutual funds tab:** scheme, folio, units, avg NAV, current NAV, invested value, current value, gain/loss, XIRR %, day change → row opens transaction history + NAV chart.
- **Stocks tab:** symbol, qty, avg buy price, current price, invested/current value, gain/loss, XIRR %, day change → row opens trade log + price chart.
- **XIRR:** computed per holding and overall (Newton-Raphson with bisection fallback), handling SIPs and lump sums.
- **Market data:** MF NAVs from mfapi.in, stock prices via a Yahoo Finance wrapper; cached locally in shared tables. Auto-refresh daily (default 7 PM IST, configurable), on-launch when stale, and a manual "Refresh Now." Graceful degradation if a price source is unavailable (falls back to average cost).

---

## 15. Settings (detail)

| Section | What the user can do |
|---------|----------------------|
| Profile | Edit username, name, salary, employer, FY start |
| Bank Accounts | Add / rename / delete accounts; import a statement per account |
| Credit Cards | Add / rename / delete cards; import a statement per card |
| Import Data | Post-onboarding import of MF (CAS), stocks (broker), cash (CSV) |
| Categories | Create, rename, hide, merge, delete categories |
| Rules | View / add / edit categorization rules |
| Data & Refresh | Configure refresh schedule; view categorization coverage; re-run categorization |
| Uncategorized | Review queue to label remaining transactions |
| Security | Change the master password |
| Advanced | Toggle developer mode (error verbosity) |

---

## 16. Data model (overview)

Entities (all user-scoped except the shared public price caches): **User, Account** (incl. a cash container), **Credit Card, Transaction** (with remarks, transfer/CC/exclusion flags, category + sub-category, source file, import link), **Category, Category Rule, MF Scheme, MF Transaction, MF NAV** (shared cache), **Stock, Stock Transaction, Stock Price** (shared cache), **Import Log.** Every transaction carries a user-editable **remarks** field. Schema evolves via versioned migrations.

---

## 17. Security, privacy & data handling

- **Encryption at rest:** full SQLite file encrypted (SQLCipher); the master password derives the key and is never persisted.
- **No egress of user data:** the only outbound calls are to public market-price endpoints (NAV, stock price). Transactions, balances, account numbers, and personal details never leave the device.
- **User control:** reversible imports, two-layer duplicate protection, editable remarks/categories, and local-only storage keep the user in control.
- **Multi-user-ready:** every record is user-scoped; Phase 1 operates as a single user.

---

## 18. Non-functional characteristics

- **Offline-first:** import, categorization, dashboards, and analytics work with no connection; only price refresh needs internet.
- **Performance:** handles hundreds of transactions per statement; bulk inserts in a single DB transaction; local queries.
- **Platforms:** Windows and macOS desktop.
- **Resilience:** friendly error handling with local logging; graceful fallback when a price source or an unsupported PDF can't be read (guides to CSV).

---

## 19. Metrics & instrumentation (product health)

Surfaced in-app and/or derivable locally (no external analytics — privacy):
- **Categorization coverage %** (shown in Data & Refresh).
- **Uncategorized count** (dashboard card + review queue).
- **Transfers / CC payments detected** (reported on import).
- **Import outcomes** (imported vs. duplicates skipped; per-import history).
- Implicit signal: **re-categorization frequency** (should fall as rules are learned).

---

## 20. Key user journeys

1. **First-time setup:** Create vault → onboarding (profile, accounts, cards, cash, investments) → attachments import → dashboard populated.
2. **Monthly update:** Transactions → Import statement → pick account → upload PDF/CSV (+ password) → review → commit → duplicates skipped, new txns categorized, transfers excluded.
3. **Fix a mis-parse:** Transactions → Imported files → Delete the bad import → re-upload corrected file.
4. **Clean up categories:** Dashboard "Review →" or Settings → Uncategorized → label items → rules learned for next time.
5. **Check investments:** Investments → overview + per-holding XIRR → Refresh Now for latest prices.
6. **Rotate password:** Settings → Security → change master password.

---

## 21. Edge cases & how they're handled

| Situation | Handling |
|-----------|----------|
| Re-uploading the exact same file | File-hash de-dup → "already imported" |
| Renamed / re-downloaded statement (same txns, new hash) | Commit-time txn de-dup → duplicates skipped & reported |
| Wrong PDF selected | Remove/replace before parsing; or delete the import after |
| Password-protected statement | Password field in the importer / onboarding |
| Unsupported bank PDF | Generic parse attempt; clear guidance to use CSV |
| Salary paid on varying dates | Employer-name match, not a fixed date |
| Internal transfers / CC bill payments | Detected and excluded from spend |
| Ambiguous transfer match | Flagged, not auto-linked |
| Price source down | Degrades to average cost; per-symbol errors isolated |
| Forgotten master password | Not recoverable (by design); recovery phrase planned |

---

## 22. Known limitations (current)

- PDF parsers exist for ICICI (account + card), SBI, and BOB card; **other banks rely on the generic parser or CSV**.
- **No password recovery** (recovery phrase planned).
- Ambiguous-transfer resolution is flagged but **lacks a dedicated confirmation UI**.
- The developer-mode toggle's Settings entry is being finalized (the mechanism works).
- Single-user; no cloud sync, budgets, goals, or net-worth trend yet.
- Onboarding-time PDF auto-import covers supported banks; others fall through to manual import.

---

## 23. Roadmap

**Near-term**
- Zero-knowledge **recovery phrase**.
- More bank/card PDF templates (HDFC, Axis, Kotak, Amazon Pay ICICI, …).
- Ambiguous-transfer **confirmation queue** UI.
- Finalize the Advanced/developer-mode settings entry.

**Mid-term**
- **Budgets** and **savings goals**.
- **Net-worth trend** over time.
- AI-assisted categorization (local-first).

**Long-term**
- Packaging & distribution (installers, bundled sidecar).
- Optional, user-controlled encrypted backup/export.

---

## 24. Glossary

- **Vault** — the encrypted local database holding all user data.
- **CAS** — Consolidated Account Statement for mutual funds (CAMS/KFintech/MFCentral).
- **VPA** — UPI Virtual Payment Address (e.g. `name@bank`).
- **XIRR** — annualized return across dated cashflows.
- **Transfer exclusion** — keeping self-transfers and CC payments out of income/expense totals.
- **Sidecar** — the Python helper process that parses PDF statements.
- **Developer mode** — a toggle that shows exact technical errors instead of friendly ones.

---

*This Product Note is the canonical feature reference for FinPilot. For implementation specifics see `TECHNICAL_DESIGN.md`; for build/change state see `PROJECT_STATE.md`.*
