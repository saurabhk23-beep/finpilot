# FinPilot — Implementation Plan (UAT Bug-Fix Round)

> **Scope:** the fixes agreed for the `UAT-testing` branch after Phase 1. Ordered by build sequence; each item is broken into concrete steps with the files touched, and acceptance criteria. Companion to `TECHNICAL_DESIGN.md` (as-built) and `PROJECT_STATE.md` (status/gotchas).
>
> **Created:** 2026-08-22 · **Branch:** `UAT-testing`
>
> **Decisions locked in (from planning):**
> - **Forget-password / email OTP → dropped.** True recovery is impossible (the master password *is* the encryption key). We build **change-password** only. Recovery-phrase revisited later.
> - **Email capture → not done** (was only needed for recovery).
> - **Username → shown at the unlock screen too.** Because the username lives inside the encrypted DB (unreadable before unlock), a plaintext copy is mirrored to `settings.json` at creation time and used purely as a greeting on the unlock screen. The password still does the actual unlocking (single-user vault).

**Hard rules to uphold in every step** (from `Claude.md`): every DB query includes `WHERE user_id = ?`; no network calls with user data; keep SQLCipher encryption intact; run `tsc` + `vitest` green after each item before moving on.

---

## Build order at a glance

| # | Item | Type | Depends on | Status |
|---|------|------|-----------|--------|
| 1 | Username (schema + onboarding + settings + unlock greeting) | Feature | — | ✅ done |
| 2 | Password error-message UX | Bug | — | ✅ done |
| 3 | MF onboarding: multi-file + multi-provider | Feature | shared import (6) helps | ✅ done |
| 4 | Stocks onboarding: multi-file + provider-neutral | Feature | shared import (6) helps | ✅ done |
| 5 | Transactions screen (replace "later phase" stub) | Feature | — | ✅ done |
| 6 | Ongoing statement upload (shared import flow) | Feature | 5 (hosts it) | ✅ done |
| 7 | Settings statement upload (accounts + MF/stocks/cash) | Feature | 6 (reuses component) | ✅ done |
| 8 | Change password (Settings → Security) | Feature | — | ✅ done |

**All items complete.** Verified: `tsc` clean, **147 tests pass** (was 141; +6 new). See "Discovered during the work" below for two follow-ups surfaced along the way.

### Discovered during the work — now fixed
- ✅ **`StatementImport` suppressed auto-mapping** (found during live testing). The first CSV preview passed an empty mapping `{}`, which the main process treats as "mapped to nothing" → 0 rows. Fixed to omit the mapping on the first pass so columns auto-map (`src/components/StatementImport.tsx`). Verified live: card CSV then read "4 rows ready" with Txn Date/Withdrawal/Deposit/Narration auto-mapped.
- ✅ **Card-statement import** — `CommitParams` now takes `accountId` *or* `cardId`; `commitTransactionImport` scopes the EMI baseline and writes `account_id`/`card_id` accordingly, rejecting a commit with no target. `StatementImport` gained a `card` target; wired into Settings → Credit Cards (per-card) and the Transactions import selector. (`electron/services/import-service.ts`, `electron/ipc/import.ts`, `src/lib/ipc.ts`, `src/components/StatementImport.tsx`, `CardsSettings.tsx`, `TransactionsPage.tsx`; +2 tests.)
- ✅ **Onboarding attachments now import.** `SummaryStep` imports the queued `pendingFiles` on confirm (best-effort: CSV auto-map, PDF via bank/issuer→sidecar detection), to the right account/card, then shows a summary before entering the dashboard. Files it can't auto-import are counted and the user is pointed to the Transactions screen. (`src/pages/onboarding/steps/SummaryStep.tsx`.)

### Still open (optional)
- **Test flakiness under load.** The default 5s per-test timeout flakes for the real-Python sidecar and scrypt-rekey tests when the machine is busy (they pass with `--test-timeout=30000`). Consider bumping `testTimeout` in the vitest config.
- **PDF auto-import in onboarding** covers only sidecar-supported banks (ICICI/HDFC/SBI); other PDFs fall through to manual import on the Transactions screen.

> Practical note: build the **shared import component/flow once** (item 6) and reuse it in 3, 4, and 7. So the real coding order is: 1 → 2 → 6 (shared flow) → 5 (Transactions screen hosting it) → 3 & 4 (onboarding) → 7 (settings) → 8.

---

## Item 1 — Username

**Goal:** capture a username; edit it in Settings; greet the user by name on the unlock screen.

**Steps**
1. **DB migration `005_user_username.sql`** — `ALTER TABLE user ADD COLUMN username TEXT;` (nullable — existing vaults have none until set). Register in `migrations/index.ts`.
2. **Row types & queries** — add `username` to the `UserRow` type; ensure `user:get` / `user:update` pass it through (`db/queries/users.ts`, `buildSetClause` already generic).
3. **Onboarding Profile step** (`ProfileStep.tsx`) — add a required "Username" field above/next to Name. Save via `user:update`.
4. **Mirror to plaintext settings** — on profile save during onboarding (and on change in settings), write `{ username }` into `settings.json` via `app-settings.ts` (new `getPublicProfile`/`setPublicProfile` helpers + a `settings:getPublicProfile` IPC, or fold into existing settings IPC). This copy is readable *before* unlock.
5. **Unlock screen greeting** (`Splash.tsx`) — on mount, read the mirrored username (via `auth:status` extended, or a new `settings:getPublicProfile`) and show "Welcome back, `<username>`" above the password field on the returning-user path. First-run path unchanged.
6. **Settings → Profile** (`ProfileSettings.tsx`) — add the username field; on save, update both the DB and the mirrored copy.
7. **Sidebar** — the "Signed in as …" line can prefer username over name.

**Acceptance**
- Fresh onboarding asks for a username; it persists and shows in the sidebar.
- Relaunch → unlock screen greets by username *before* entering the password.
- Editing username in Settings updates both the sidebar and the next unlock greeting.

**Tests:** migration applies cleanly; `user:update`/`user:get` round-trip `username`; `app-settings` public-profile read/write.

---

## Item 2 — Password error-message UX

**Goal:** once an error is shown, it clears the moment the user edits the field; it only reappears on the next submit if the problem persists.

**Steps**
1. In `Splash.tsx`, clear `error` inside the password (and confirm) `onChange` handlers: `setError(null)` on keystroke.
2. Keep validation only in `handleSubmit` (unchanged) so a stale message never lingers while typing.
3. Confirm the busy/disabled state still behaves (error path already resets `busy`).

**Acceptance**
- Wrong password → error shows → user types a character → error disappears → clicking Unlock re-checks and re-shows only if still wrong.

**Tests:** extend `Splash.test.tsx` — after an error, typing clears it; submitting re-validates.

---

## Item 3 — Mutual-fund onboarding: multi-file + multi-provider

**Goal:** upload one *or more* CAS PDFs from any provider (CAMS / KFintech-KFinKart / MFCentral), like the bank-accounts step.

**Steps**
1. Replace the single "Choose CAS PDF" button in `InvestmentsStep.tsx` with a **repeatable list**: add-a-statement row (per-file password field + file pick), a list of queued/imported files with status and a remove control.
2. Loop imports through the existing `import:cas` IPC per file; aggregate results (schemes/transactions created, "already imported" skips).
3. Relabel copy to be provider-neutral ("CAS statement — CAMS / KFintech / MFCentral"). No parser change needed (`casparser` already handles CAMS + KFintech; MFCentral CAS is the same format).
4. Per-file error handling (one bad/locked file doesn't abort the rest).

**Acceptance**
- User can add several CAS PDFs in one session, each with its own password; each imports independently; duplicates are reported, not double-counted.

**Tests:** import-service/investment-import already covered; add a UI test for the multi-row add/remove if practical.

---

## Item 4 — Stocks onboarding: multi-file + provider-neutral

**Goal:** upload one or more broker trade files; stop hard-coding "Groww."

**Steps**
1. In `InvestmentsStep.tsx`, rename the stocks card "Broker trade file(s)" and allow multiple CSVs (same repeatable pattern as item 3), importing each via `import:groww`.
2. **Widen the parser** (`parsers/groww.ts`) header aliases to cover Zerodha / Upstox / generic exports where columns differ. Verify against a real sample when available; keep Groww working.
3. Aggregate per-file results; per-file error isolation.

**Acceptance**
- User can add multiple broker CSVs from different apps; recognized columns import correctly; unrecognized ones give a clear per-file message.

**Tests:** add `groww.test.ts` cases for the new header variants (Zerodha/Upstox column names).

---

## Item 6 — Ongoing statement upload (shared import flow) *(built before 5)*

**Goal:** a single reusable "Import statement" flow usable anywhere after onboarding.

**Steps**
1. Extract a reusable **`ImportStatementDialog`/component** (`src/components/`) that wraps the existing pipeline: pick file → (bank PDF/CSV) preview + column-map → dedup/new-account prompts → commit. Reuses `import:preview` / `import:commit` / `import:commitCash` / `import:cas` / `import:groww`.
2. Parameterize it by **target** (a specific account, card, cash, MF, or stocks) so callers can pre-select context.
3. Surface progress + result summary (imported / skipped duplicates / new-account detected).

**Acceptance**
- The same component can import a bank statement into a chosen account and report results, outside onboarding.

**Tests:** the underlying services are covered; add a light render/interaction test for the component's happy path.

---

## Item 5 — Transactions screen

**Goal:** replace the `Dashboard.tsx` "arrives in a later phase" stub with a real screen.

**Steps**
1. Remove the placeholder branch in `Dashboard.tsx`; render a new `pages/transactions/TransactionsPage.tsx` for `section === 'transactions'`.
2. **Table** with filters: account/card scope, date range, category, free-text search over narration/remarks; pagination (reuse `transactions:list` / analytics queries).
3. **Inline actions:** re-categorize (`transactions:recategorize`), edit remarks (`transactions:update`).
4. **Host the import entry point** — an "Import statement" button here opens the shared component from item 6.
5. (Optional) show transfer/excluded badges so users see why a row isn't in spend.

**Acceptance**
- Transactions nav opens a working, filterable, paginated list; re-categorize + remarks persist; an import button adds new statements.

**Tests:** render + filter/search interaction; recategorize updates a row.

---

## Item 7 — Settings statement upload

**Goal:** let users attach statements when managing accounts/cards, and import MF/stocks/cash from Settings.

**Steps**
1. **AccountsSettings.tsx / CardsSettings.tsx** — add the shared import component (item 6) to the add/edit flow (currently missing), pre-targeted to that account/card.
2. **New Settings → Investments/Import section** — reuse the item-3/4 multi-file importers for MF (CAS) and stocks (broker), plus a cash-CSV importer.
3. Keep everything routed through existing IPC; no new persistence.

**Acceptance**
- Adding a bank account in Settings offers a statement upload; MF/stocks/cash can be imported from Settings post-onboarding.

**Tests:** covered by shared-component + service tests.

---

## Item 8 — Change password

**Goal:** let a logged-in user change the master password.

**Steps**
1. **IPC `auth:changePassword`** (`ipc/auth.ts`) — takes `{ currentPassword, newPassword }`. Verify the current password (attempt key / compare derived key), then **re-key** the DB with SQLCipher `PRAGMA rekey = "x'<newKey>'"` and rewrite the salt (`db/connection.ts` + `crypto.ts`).
2. Validate new password (min length, matches confirm) in the handler and UI.
3. **Settings → Security** section (new `SecuritySettings.tsx`) — current / new / confirm fields; success + error states.
4. On success, update the mirrored public username copy is unaffected; nothing else to migrate (key change is transparent to data).

**Acceptance**
- With the correct current password, the user sets a new one; the app unlocks with the new password on next launch and rejects the old one. Wrong current password is rejected without changing anything.

**Tests:** node test — create vault, `changePassword`, reopen with new (succeeds) and old (fails); wrong-current-password rejected.

---

## Cross-cutting checklist (per item, before moving on)

- [ ] Every new/changed DB query includes `WHERE user_id = ?` (except `mf_nav` / `stock_price`).
- [ ] No user data sent over the network; only mfapi.in / Yahoo reads remain.
- [ ] `npx tsc --build --noEmit --force` clean.
- [ ] `FINPILOT_PYTHON=python npx vitest run` green (new tests added for the item).
- [ ] `TECHNICAL_DESIGN.md` updated where behaviour/schema/IPC changed (esp. §5 data model, §6 IPC, §14 settings, §16 limitations).
- [ ] Commit on `UAT-testing` with a descriptive message.

---

## UAT bug round 2 (import/sidecar) — done

Verified: `tsc` clean, **149 tests pass**.

1. ✅ **Sidecar used the wrong Python** (`casparser is not installed` / `Could not parse PDF`). Root cause: the app spawned bare `python`, which on this machine resolves to the Microsoft Store stub (no packages), while `py -3` / `C:\Python314` have casparser + pypdfium2. Fix: `electron/parsers/sidecar.ts` now **auto-detects** an interpreter that can `import casparser, pypdfium2` (probing `FINPILOT_PYTHON` → `py -3` → `python` → `python3`, cached), and emits an actionable `pip install casparser` message if none qualify. Proven: CAS via `py -3` now gets past the import to a real parse step.
2. ✅ **Password for bank/card PDFs.** `python/parse_bank.py` gained `--password` (pdfium decrypt); threaded through `parseBankPdf` → `import:preview` (new `password` param). Password fields added to the `StatementImport` PDF flow and the onboarding Bank/Card steps (stored in `onboardingStore.pendingPasswords`, used by `SummaryStep`).
3. ✅ **Redundant "Statement Bank" prompt removed.** `StatementImport` takes a `bankHint` (the target account's bank / card's issuer); when it maps to a supported sidecar bank the prompt is skipped (shown read-only "from account"), and only asked when it can't be derived (e.g. cash).
4. ✅ **Remove/replace a file before parsing.** Every importer now has a select → review → parse/import flow: `StatementImport` shows the chosen file with Remove (before parse) / Change file (before commit); `CasImporter` and `BrokerImporter` show the selected file(s) with Remove before the Import button.

## UAT bug round 3 (error handling) — done

Verified: `tsc` clean, **154 tests pass** (+5).

- ✅ **Raw server/sidecar/SQL errors no longer leak to the UI.** A single IPC error boundary (`electron/ipc/errors.ts` → `sanitizeIpcError`) wraps **every** handler (domain handlers via `registerHandlerMap`, plus the auth handlers). On any throw it: logs the full error in the main process; passes **user-facing** validation messages through unchanged (a new `UserFacingError` marks these — e.g. "Current password is incorrect", "A master password is required"); and otherwise returns a friendly, domain-appropriate message.
- ✅ **Developer mode.** New `devMode` setting (persisted in `settings.json`, or forced by `FINPILOT_DEV_MODE=1`). When **on**, the exact error is surfaced as `[dev] <Type>: <message>`; when **off** (default), the customer-friendly message is shown. Read at call time so toggling takes effect immediately. Toggle lives in **Settings → Advanced**.
- ✅ Renderer error display centralized in `src/utils/ipcError.ts` (`ipcErrorMessage`), which strips Electron's `Error invoking remote method '…'` wrapper; the ad-hoc extractors in the importers and Security settings now use it.

## Explicitly out of scope this round

- Forget-password / email OTP / email capture (dropped — see decisions header).
- Recovery-phrase mechanism (planned later).
- Ambiguous-transfer confirmation-queue UI (IPC exists; not this round unless requested).
- Phase 2 items (AI categorization, budgets, goals, net-worth trend, packaging).
