# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Stackd** (branded "Stack'd") — a privacy-first personal finance tracker. All data lives 100% locally in the browser (`localStorage`); there are no accounts, no backend, and no external API calls. The web app is wrapped as a native **Android** app via Capacitor (`appId: com.stackd.finance`).

## Commands

Run from the repo root (the root is the primary/active project):

```bash
npm run dev          # Vite dev server on http://localhost:3000
npm run build        # Production build via build.cjs (see note below) → dist/
npm run lint         # eslint src
npm run test         # Vitest unit tests (run once)
npm run test:watch   # Vitest watch mode
npm run test:e2e     # Playwright e2e (auto-starts dev server on :3000)
```

Run a single unit test:

```bash
npx vitest run tests/unit/store.test.js
```

Run a single e2e spec:

```bash
npx playwright test tests/e2e/debt_simulator.spec.js
```

### The build is not a plain `vite build`

`npm run build` runs `build.cjs`, which temporarily rewrites `index.html`'s `<script defer src=...>` tags to `type="module"`, runs `vite build`, then restores the `defer` version. This dual form exists because `index.html` must remain openable directly over `file://` (Capacitor/native) with `defer`, while Vite's bundler needs `type="module"` to inline everything. **Do not "fix" the `defer` tags in `index.html`** — the build script depends on toggling them. `vite-plugin-singlefile` inlines all JS/CSS into a single output file.

## Architecture — read this before editing `src/`

> ⚠️ `docs/architecture.md` describes an *aspirational* ES-module structure (split `components/` and `views/` folders) that was **never built**. Ignore its file layout. The real code is described below.

The app is **vanilla JS using global objects, not ES modules**. Each `src/*.js` file attaches a singleton to `window` and is loaded via ordered `<script defer>` tags in `index.html`. Dependency order matters and is fixed by that tag order:

```
db.js → utils/scroll.js → utils/keyboard.js → loan-engine.js → store.js → components.js → widgets.js → views.js → router.js → export.js → import.js → main.js
```

The core globals and their roles:

| Global | File | Role |
|---|---|---|
| `window.StackdDB` | `db.js` | localStorage wrapper. Keys are namespaced with prefix `stackd_v1_`. `load()`, `save()`, `remove()`, `generateId()`. **v0.97:** on native builds every `stackd_v1_*` key is mirrored to real files (Capacitor Filesystem, `stackd_db/` in Directory `DATA`) because iOS can evict WKWebView localStorage; `main.js` awaits `StackdDB.initNative()` before `Store.init()` so an evicted store is restored from the mirror first. Never write or delete `stackd_v1_*` keys via raw `localStorage` — it bypasses the mirror (deletes would resurrect at next boot). **1.0.2 (BUG-34):** every change is journaled (`begin`/`end`/`abort`, all or nothing); on native a change is committed to the mirror as one unit (`<key>.json.<rev>.tmp` → `_rev.json` → promotion) with the revision in `stackd_mirror_rev`, and boot restores a newer committed mirror. A raw `localStorage` write also bypasses the journal and the revision. |
| `window.LoanEngine` | `loan-engine.js` | Pure amortization engine (integer cents, `'YYYY-MM-DD'` string date math). `simulate(config)` → schedule + totals. Zero deps on other globals. |
| `window.Store` | `store.js` | Single source of truth. Holds `state`, a pub/sub `subscribe()`/`emit()`, and one large `dispatch(action, payload)` switch. Persists each slice to `StackdDB` on mutation. **1.0.2 (BUG-34):** `dispatch` returns `false` when a change was not saved — it is rolled back (`_reloadSlice` reloads every touched key from disk) and one deferred "Storage is full" / "Couldn't save" sheet explains it. `Store.batch(fn)` makes a multi-dispatch flow atomic (the boot runs inside one; check its result before acting on ids it created); `takeSaveFailure()` lets a flow report the failure itself instead of the sheet. `_reloadSlice` must list every persisted key (`storageFull.test.js` scans for it) and re-applies the in-memory icon/colour sanitizer (`_sanitizeMarkupFields`), so a rolled-back boot never brings back unsafe stored values. |
| `window.Router` | `router.js` | Hash-based SPA router. Maps `#route` → `viewId`, parses `?account=` query params, dispatches `SET_VIEW`, and drives scroll reset. |
| `window.Components` | `components.js` | Reusable UI pieces (BottomNav, modals, FAB, etc.) — large file (~150KB). |
| `window.Widgets` | `widgets.js` | Home dashboard widget registry + section renderer (v0.72). `registry[type]` declares `render(instance, state)`/`attach`; `renderSection`/`attachSection` are called by `DashboardView`. |
| `window.Views` | `views.js` | The screens (~200KB). Each view is an object with `render(state) → htmlString`, optional `attachEvents(root, state)`, and optional `destroy()`. |
| `main.js` | — | Entry point. Wires init, subscribes to the store, and on every state change renders the view matching `state.activeView` into `#router-view`, then re-hydrates icons. |

### Rendering model

There is **no virtual DOM and no framework**. The render loop lives in `main.js`: `Store.subscribe` fires on emit, a `switch(state.activeView)` picks the view module, and it does `routerView.innerHTML = viewModule.render(state)` followed by `viewModule.attachEvents(...)`. Views are re-rendered wholesale on state change. If a view sets up listeners/timers, clean them up in its `destroy()` (called on view transition).

**Emits coalesce (v0.93):** `Store.emit()` batches to ONE listener pass per microtask tick — state still mutates synchronously with each `dispatch`, but N dispatches in one tick render once (a navigation that sets filters then `SET_VIEW` no longer re-renders the outgoing view per dispatch). Never dispatch and then synchronously read the freshly rendered DOM in the same tick. Boot is the one sync exception: `main.js` calls `Store.emit({ sync: true })` because splash dismissal relies on the first render having happened. `render()` and `attachEvents()` still run back-to-back in one synchronous pass, so a view may stash data computed in `render` for reuse in `attachEvents` (DashboardView `_passGraph`, AnalyticsView `_pass`, `Widgets._passMemo`) — compute heavy aggregations once per pass, not once per method.

### State & data model

- The store's `state` object holds `accounts`, `categories`, `transactions`, `budgets`, `loans`, plus UI state (active view, per-page filters for history/analytics, theme, selection mode, etc.).
- **Account balances are computed from transactions, never stored.** Use `Store.getAccountBalance(id)`.
- Transactions have a `type` of `income`, `expense`, or `opening_balance`. Creating an account auto-inserts an `opening_balance` transaction (category `cat_balance`).
- Default categories are seeded from the `DEFAULT_CATEGORIES` constant at the top of `store.js` (stable ids like `cat_salary`, `cat_groceries`).
- All mutations go through `Store.dispatch(ACTION, payload)`. To add behavior, add a `case` to the dispatch switch, mutate `this.state`, call `StackdDB.save(...)` for the affected slice, set `changed = true`, and let `emit()` re-render (coalesced — see Rendering model). The store also handles **cross-tab sync** via storage events.
- The store keeps lazy per-dispatch indexes for hot lookups — `_openingIdx` (account opening dates) and `_budgetSpendIdx` (category×month expense sums) — both nulled at the top of `dispatch` and in `_sortData`, rebuilt in one O(T) pass on next use. If you add a mutation path that bypasses `dispatch`, invalidate them there too.
- **Unpaid rows (`isPaid === false`) and rows dated before an account's opening date are excluded from every aggregate** — balances, forecasts, budgets, analytics and History START/END (1.0.1 BUG-05 routed History through `getBalanceAtDate`). New aggregates must follow the same rule.
- Every account carries an explicit `currency`; accounts whose currency differs from the base are excluded from totals (v1.02: exclude, never convert). `SET_CURRENCY` takes a code string or `{code, relabel}` (1.0.1 BUG-01: relabel moves every old-base account to the new code, label only). The Settings picker and onboarding switch only through `Components.CurrencySwitchConfirm` after `Store.currencySwitchImpact(code)`.
- `DELETE_ACCOUNT` turns each surviving transfer counterpart into a plain Uncategorized income/expense with a localized "Transfer to/from deleted account" note and hands the series generator over to it (1.0.1 BUG-14); `_healOrphanTransferLegs()` unlinks any unpaired `transferRef` at boot, before `_healRecurrenceGenerators()`.
- **1.0.2 boot heals** (`_healConvertedOpeningBalances`, `_pruneAccountRefs`, `_healSeriesSchedules`, `_healRestoredImportKeys`, `_healMultilineNotes`) are idempotent, save only the slices they changed, and their `Store.init` calls go after `_healRecurrenceGenerators()` and before `_processRecurringTransactions()`. (`_healMarkupFields` runs earlier, next to the account colour migration.)
- **Account references (1.0.2 BUG-29):** `DELETE_ACCOUNT` prunes every slice that names accounts by id through `Store._pruneAccountRefs`; it also runs as a boot heal (skipped when there are transactions but no accounts) and cross-tab for the session-only History/Analytics filters. A deleted default promotes the first primary-currency account by name. `UPDATE_FILTERS` drops unknown account ids. Account names are unique via `Store.findAccountByName` (UI-only; the store stays ungated). `RESET_APP` also resets `expandedGraphFilters` and `defaultAccountId`, and writes transactions first and growing slices last. A new id-holding slice must be added to `_pruneAccountRefs`.
- **Opening balances (1.0.2 BUG-25):** an opening balance is owned by its account — `UPDATE_TRANSACTION` pins its type, account, category and sign, and the transaction form shows a read-only panel for it (Edit Account link, no Delete). Edit Account sends an opening balance only when it is touched; an empty date means the prefilled one. `_healConvertedOpeningBalances` repairs the 1.0.1 "Adjustment" conversions it can prove. `Store.parseAmount` (BUG-50) is the reader for typed money — never `type="number"` for money inputs. A new log preselects the Default Wallet, falling back to the first account by name.
- **Currency in aggregates (1.0.2 BUG-36):** exclude-never-convert also covers explicit account selections. `Store.aggregateSelection` resolves a selection (the base currency wins; a selection with no base account uses its largest same-currency group) and new aggregates filter with `Store.aggregatePredicate`. Never feed `aggregateSelection().ids` back into an aggregate — there `[]` means every base-currency account. Lists keep every row; only sums exclude. An exactly-base expanded-graph selection is saved as `[]`.
- **Transfers across currencies (1.0.2 BUG-35):** each leg is stored in its own account's currency; `ADD_TRANSFER`/`UPDATE_TRANSFER` take an optional `receivedAmount` for the income leg across currencies. Same-currency legs mirror on an amount or account change and otherwise keep their own received side. `UPDATE_TRANSACTION`, `UPDATE_TRANSFER` and the loan re-price never copy a figure into a leg of another currency.
- **Budget spend (1.0.2 BUG-55):** `Store._categoryMonthSpend` follows the aggregate rule (no unpaid rows, no rows before the account opened, primary currency only) and also skips transfer legs; the Goals editor hint and the budget figure share these row rules.
- **Dates (1.0.2 BUG-38/BUG-69):** `Store._localYMD(x)` and `Store._todayYMD()` are the only local `'YYYY-MM-DD'` formatters (eslint's `no-restricted-syntax` rejects `toISOString().split/slice`); `_calculateNextRecurrenceDate` shifts dates (negative steps allowed). History/Analytics periods that contain today follow the calendar via `_rollLivePeriods`: on `SET_VIEW`, `ROLL_PERIODS` (resume, History's Today), before every filter action, and at the end of any other action taken on those screens. A page re-renders only when its own period rolled (`Store._livePageOf`); `FilterModal` never sends the period; the Custom Range sheet always applies the two picked days in order.
- **Backups / restore (1.0.2 BUG-30–33, BUG-78):**
  - Backups carry `AccountId` and `Id`, trusted only in a Stack'd export (D10) and read through `Store.fileId`; a restore keeps account and transaction ids.
  - Restore dedup order: id → a series held here → the rebased `ImportKey` → a multiset fingerprint (an opening balance is also listed under its 1.0.1 "Adjustment" form; a BUG-14 leftover leg is matched by shape, note ignored). A series or transfer already here is owned here (D11). Loans are skipped by kind + name + terms.
  - ImportKeys are mapped on restore (`_restoredKey`) and healed at boot (`_healRestoredImportKeys`).
  - Every CSV reader is RFC 4180 through `_readRecords`, which falls back to the 1.0.1 line-by-line reading for stray quotes (D8).
  - Every restore amount goes through `_parseRestoreAmount`, with one decimal convention per file.
  - Notes are one line (`_oneLine`, `_healMultilineNotes`).
  - An opening-balance row never creates a second account for a name the install already has (D13).

### Loans / debt (v0.71 rebuild)

The whole feature was rebuilt in five phases; **`docs/debt-rebuild-plan.md` is the
reference — read it before touching loan code.** In short: a loan record stores a
**LoanEngine config** as its single source of truth (`{id, name, kind: 'sim'|'active',
config, linkedSeriesId, createdAt, updatedAt}` under `stackd_v1_loans`, with an
idempotent boot migration for pre-v0.71 records). Every figure — payment, totals,
schedule, progress — is derived by `LoanEngine.simulate`, never stored. Routes:
`#debt` (hub), `#debt-sim` (simulator form), `#debt-results` (summary + schedule).
`Store.getLoanProgress` gives schedule-derived paid/remaining/next-payment;
`Store.getLoanLinkedTransactions` reads through to the linked recurring series so a
deleted series un-tracks the loan. Loans are included in CSV export/import via a
JSON `Config` column plus a `LinkedSeriesId` column (1.0.1 BUG-02): import keeps a
CSV series id unless it collides with one already in the store, and
`RELINK_LOAN_SERIES` re-links after a loans/transactions import (old backups
without the column fall back to the localized `debt.paymentNote`, all 5 languages).
Linked-series lifecycle (1.0.1): `DELETE_LOAN {deleteFuturePayments}` removes
members dated after today; after an edit to an active loan's terms the results
view offers `SYNC_LOAN_SERIES {id, prevConfig}` (amount/end date, or deleting
the future members if the loan now ends earlier); `_applyLoanFinalInstalment`
stamps the schedule's rounding-adjusted final amount on an uncapped, uniform
series tail; `nextRegularPayment` is the first instalment dated today or later.
1.0.2 (BUG-74): `amountEdited` marks an "Only this" amount change on a
loan-linked payment (the expense leg for a transfer). SYNC keeps it through
`plan.customIds`/`customCount`/`customDate`/`customC`, and the sheet names it
(`debt.sync.customKept`). Clones, scoped amount edits and a re-price drop it —
any new copy or re-price path must too. It is not exported, so a CSV restore
loses it.

### Home dashboard widgets (v0.72)

The dashboard's old static "Financial Milestone" card AND its Recent Activities
section are gone, replaced by a user-configurable widget area (8 widget types).
**`docs/home-widgets-plan.md` is the reference — read its §8a–§8e "as built"
subsections before touching widget code.** A widget instance is
`{id, type, size: 'small'|'large', config, createdAt}` under `stackd_v1_homeWidgets`;
array order is display order. All rendering is driven by `window.Widgets.registry[type]`,
so adding a widget means adding a registry entry, not editing `DashboardView`.
An ABSENT `stackd_v1_homeWidgets` key (fresh install / pre-widget upgrade) seeds
one large `latest` widget on boot — the successor of Recent Activities; a
present-but-empty `[]` is a deliberate user choice and is respected. Widget
test boots pre-seed `'[]'` to opt out of the seed.
`Widgets._renderCard`/`attachSection` wrap each widget's `render`/`attach` in
try/catch and render a placeholder for unregistered types — keep that containment.
Edit mode (`state.widgetEditMode`) is transient and cleared by `SET_VIEW`.
The slice is deliberately **not** in the CSV backup (house convention for prefs).

Two rules that are easy to get wrong:
- **Know a widget's side of the MTD/EOM split (v0.94).** Month-to-date
  ("spent so far"): `categories`, `fiftyThirtyTwenty`, `latest`, Smart
  Insights — use `Widgets._monthToDateFilters` for anything built on
  `getFilteredTransactions`, or future-dated recurring members count as spent.
  Whole-calendar-month / EOM ("how the month ends up"): `incomeExpense`,
  `savings` (since v0.94), `budgets` — these use `_monthFilters` unclamped and
  carry an "End of month" caption on the large card (`def.caption`).
  `computeNetFlowData` clamps only via its explicit `clampEnd` arg.
- **Chart instances are tracked by widget id** in `Widgets._charts`, because the
  dashboard replaces every canvas on each render so `Chart.getChart(canvas)`
  can't find the old instance. Mount via `Widgets._mountChart`, never `new Chart`.

### Recurring transactions (v0.67 semantics)

- A recurrent series is **fully materialized up-front**: `_processRecurringTransactions` creates every occurrence out to `recurrence.endDate` (capped at 60 months from `startDate`) as a chain. Every member carries `recurrence: {seriesId, interval, frequency, startDate, endDate}`; exactly **one member — the chain tail — additionally holds `recurrence.nextDate`** (the live "generator"). For recurring transfers only the **expense leg** is ever armed.
- `UPDATE_TRANSACTION`/`UPDATE_TRANSFER` **merge** the payload's recurrence and preserve the member's own `nextDate` state — never accept a re-armed `nextDate` from the form for an existing series member, or you resurrect the duplicate-chain bug. Scope flags: no flags = only this member (literal date applies to it alone); `updateFuture` = propagate non-date fields to members with `date >= original date`, and if the date/schedule changed, delete those members and regenerate the chain from the edited one; `updateAll` = same, plus non-date fields to past members. **Past members' dates are never modified by any scope.** `recurrence: null` means detach (no flags), stop the series here (`updateFuture` deletes future members), or unlink every member (`updateAll`).
- Any edit-save of a series member in the transaction form must go through `Components.RecurringUpdateModal` (3 scope options, same layout family as `RecurringDeleteModal`); it accepts `onSelection(scope)` with `'single'|'future'|'all'` or the `onlyThis/thisAndFuture/allTransactions` callback shape.
- `_calculateNextRecurrenceDate` is deliberately local-time, noon-anchored string math — do not reintroduce `new Date('YYYY-MM-DD')`/`toISOString()` round-trips, they drift a day at DST boundaries.
- **v0.98 duplicate-chain hardening:** a date/schedule change with `updateFuture`/`updateAll` regenerates from the EARLIER of the old and new date (moving the 7th → 5th consumes any same-series member sitting between them, so interleaved chains can't survive a repair edit), and after regeneration every series member except the edited one is force-disarmed (a stray armed past member — old duplicate-chain / pre-v0.68 import poison — used to resurrect the old chain in the very next processing pass). `Store._healRecurrenceGenerators()` additionally enforces the one-armed-tail invariant at boot (latest-dated armed member wins, tie → expense leg, mirroring `import.js _relinkSeries`) BEFORE `_processRecurringTransactions` runs. Both `UPDATE_TRANSACTION` and `UPDATE_TRANSFER` carry the same logic — keep them in sync.
- **1.0.2 series rules (BUG-26/27):**
  1. `endDate`, `interval` and `frequency` are series-level: the armed member is the authority, and a stopped series ends on its last payment (`Store.getSeriesSchedule`). Never write `recurrence.endDate` on a single member.
  2. `_syncSeriesSchedule` runs after every `UPDATE_TRANSACTION`, `UPDATE_TRANSFER`, `DELETE_TRANSACTION` and `DELETE_BULK_TRANSACTIONS` of a member, and after SYNC `'update'` — a new delete/edit path must call it too. A deleteFuture cut also disarms the series (`_disarmSeries`).
  3. `_healSeriesSchedules` runs at boot and inside `BATCH_IMPORT_TRANSACTIONS`.
  4. The form pre-fills from `getSeriesSchedule`.
  5. "Only this" never changes the schedule (`_resolveSeriesRec`), and an untouched End Date never blocks a series edit.
  6. A regenerated member never ends before its own date; a stopped series ends at the largest `min(date, the member's own endDate copy)`.
  7. A later `future`/`all` move shifts the end by the same days (counted from the series end), except at the 60-month cap (D-U3-5a).
  8. Paid state is per occurrence and never spread by a scope (this reverses v0.82); rebuilt payments start paid, and the sheet says so (`recUpdate.rebuildPaidNote` / `paidNote`).

### i18n (Phase 8, v0.86–v0.92)

The app ships in **en / fr / it / es / pt**. `window.I18n` (`src/i18n.js`,
loaded after `db.js` and **before** `store.js`) holds `t()`, `locale()`,
`setLang()` and five flat dictionaries in `src/i18n/<lang>.js` — about 1,250 keys
each. **`docs/i18n-plan.md` is the reference.** Live switching is free:
`SET_LANGUAGE` sets `I18n.lang` and the emit re-renders the view.

Rules that are easy to get wrong:

- **Every new user-facing string needs a key in all five dictionaries.**
  `tests/unit/i18n.test.js` fails on a missing key, a placeholder mismatch or
  a half-defined plural, so this is enforced, not merely encouraged.
- Write `window.I18n.t('key')` in full. There is deliberately **no bare `t`
  alias** — `t` is already a common callback parameter in views/components.
- Anything varying by count gets a **whole-sentence key per plural variant**
  (`.one` / `.other`, plus an explicit `.zero` where wanted), never
  `"{n} " + noun`. French treats 0 as singular, so suffix hacks are wrong.
- **Never translate stored data.** Category names, account `type` values and
  CSV headers stay English on disk; only their *labels* are localized, by
  stable id (`Store.accountTypeLabel`, `_DebtShared.TYPES[x].label`, which
  holds a KEY not text). Translating stored values breaks CSV round-trips.
- Month/weekday names come from `I18n.monthNames()` / `weekdayInitials()`
  (Intl-derived, cached) — never dictionary keys.
- All date/number/currency formatting goes through `Store.getLocale()`.
  Percentages go through `Store.formatPercent(pct, {digits, maxDigits, signed})`
  (1.0.1 BUG-09: Intl percent, ASCII `-`, `—` for no value), never `toFixed`
  + `'%'`. `tests/unit/widgetsI18nGuard.test.js` renders every widget under a
  pseudo-locale and fails on any bare English literal in `widgets.js`.
- A structure that feeds `t()` at render time (widget registry, FAQ, manual,
  terms) must expose a **getter**, or it freezes in the boot language. Same
  reason `main.js` rebuilds the bottom nav when `state.language` changes: the
  nav is mounted once, outside the render loop.
- Unit-test `executeFile` chains must load `i18n.js` + `i18n/en.js` right
  after `db.js`.

### Sheets, dialogs and Android Back (1.0.1)

- `Components.Modal.show` options `showCancel` (default `!showDelete` — in a
  delete confirmation `saveText` IS the safe action), `saveClass` and
  `deleteText`; footer order is delete → save → cancel. Never rely on
  `#modal-cancel-btn` existing. 1.0.2 (BUG-40): `dismissible: false` makes a
  mandatory sheet (no backdrop or swipe close, an invisible handle spacer,
  `data-back-swallow` on `#active-modal`).
- Android Back (key and gesture) runs `Router.handleBack()`: top sheet → FAB
  menu → selection mode → widget edit mode → "discard changes?" on a dirty
  add/edit/edit-account/edit-category form → back; on a bare Home it
  minimizes the app. **Every new sheet needs a dismiss control —
  `#modal-cancel-btn`, `.modal-btn-close`, `[data-back-dismiss]` — or a
  backdrop-tap close**; a sheet that must ignore Back carries
  `[data-back-swallow]`. Views must not call Router's Back helpers (unit tests
  stub `Router` wholesale).
- 1.0.2 (BUG-86/87): the Goals limit editor is a step in the Back chain
  (sheet → menu → selection mode → widget edit mode → Goals limit editor →
  dirty form → back). It returns `'step'` with a view-owned dirty check
  (`BudgetView.isEditorDirty`/`closeEditor`); a changed editor gets the same
  "Discard changes?" sheet through `Router._confirmDiscard`.
- Forms and dead-end pages leave through `leaveTo(path)` (views.js) /
  `Router.leave` or `a[data-router-leave]` after save, delete or close — never
  `Router.navigate`, which pushes an entry that Back reopens. `Router.leave`
  rewrites the entry in place and routes synchronously, stepping back when
  the entry underneath already is the landing screen. Every history entry
  carries `history.state = {stackdNav, from[, left]}`; nothing but Router may
  read or write `history.state`.
- No `alert()` for validation or import results: field errors use the
  `showFieldError`/`clearFieldError(s)` helpers at the top of `views.js`;
  one-button results use `Components.NoticeSheet`. (Bank Connect, purchases
  and export still use `alert()` — tests assert it; migrate together.)

### Icons

Icons are Lucide. `main.js` calls `window.lucide.createIcons()` and also carries a large inline `EMERGENCY_ICONS` fallback map + `window.StackdHydrateIcons` so icons still render on `file://`/native where the CDN script may be unavailable. When adding a new icon name, it may need an entry in that fallback map. `StackdHydrateIcons(root)` takes an optional scope root (v0.93): the render loop passes `#router-view` and the nav rebuild passes the nav container, so anything rendering icons **outside** those subtrees (modals) must keep calling it on its own root — the existing modal call sites already do.

## Testing model

- **Unit tests** (`tests/unit/`, Vitest + jsdom): because `src/` files are plain globals (not importable modules), tests load them by reading the file and executing it with `new Function('window', 'localStorage', 'crypto', content)` against a fresh mock `global.window`. See `tests/unit/store.test.js` for the `executeFile` helper pattern — replicate it and load dependencies in the same order as `index.html`.
- **E2E** (`tests/e2e/`, Playwright): runs against `http://localhost:3000` (Chromium only), auto-starting the dev server via `npm.cmd run dev`.

## Second project: `mobile_apple/`

A separate Expo / React Native (expo-router) scaffold for a future iOS app. It is essentially an empty starter (`app/` is unpopulated) and shares no code with the root web app. Its own commands (`expo start`, etc.) run from inside `mobile_apple/`. The root web app is the one in active development.

## Third project: `broker/` (v1.05+, Bank Connect)

The Bank Connect broker — a TypeScript Cloudflare Worker with Durable Objects
that sits between the app and GoCardless (`docs/bank-connect-plan.md`,
`docs/bank-connect-ux-plan.md`). Own `package.json`/`tsconfig`/`vitest`/
`wrangler.toml`; run its commands from inside `broker/` (`npm run check` =
typecheck + tests + dry-run build). Nothing under `broker/` is loaded by
`index.html`, and the root `npm run lint/test` never touch it. Secrets are
wrangler secrets only — never a committed `.dev.vars`. The app side talks to
it through `window.BankConnect` (`src/bank-connect.js`), and only while the
user's Online banking toggle is on. Native devices hold a bearer token; the
web build (v1.11 B7, UX plan §16) has no token at all — it pairs with the
phone through a code and rides an HttpOnly cookie + `X-Stackd-CSRF`, and
`BankConnect.isWebSession()` / `hasWebSession()` decide between the pairing
screen and the list. `broker/README.md` is the reference.
Native wiring (v1.12 B8, UX plan §16.7): `@capacitor/browser` (the bank's
SCA page), `@aparajita/capacitor-secure-storage` (the device token — called
through its NATIVE methods `internalGetItem`/`internalSetItem`, since no
plugin JS wrapper is ever bundled) and `cordova-plugin-purchase`; the App
Links + `stackd://` intent filters are in `android/.../AndroidManifest.xml`,
the Universal Links entitlement in `ios/App/App/App.entitlements`. After
`npm install`, `npx cap sync android` regenerates the gitignored
`android/capacitor-cordova-android-plugins/` and `assets/public`.

## Stack'd Pro — one-time unlock (v1.13)

`window.Pro` (`src/pro.js`, loaded after `bank-connect.js`) owns the free
plan and the €4.99 non-consumable `stackd_pro`. **`docs/pro-unlock.md` is the
reference.** Free plan = up to `Pro.FREE_ACCOUNT_LIMIT` (2) accounts and the
default categories; Pro lifts both. Gating is **UI-only** — `ADD_ACCOUNT` /
`ADD_CATEGORY` stay ungated in the store so imports and tests keep working;
`EditAccountView`/`EditCategoryView` render `Views._proLockedPage` in new
mode, and the transaction form's "New category" shows
`Components.ProLockModal`. Existing data is never hidden (grandfathering).
The entitlement is **local** (`state.pro` under `stackd_v1_pro`, `SET_PRO`,
kept on `RESET_APP`) — no broker: the product rides Bank Connect's
cordova-plugin-purchase session (`BankConnect.initStore` registers it and
routes its `approved` transactions to `Pro`, never to the broker). The
purchases screen is `#purchases` → `Views.PurchasesView` (one-time tab +
subscriptions tab; the subscription purchase itself stays in
`PaywallModal`). E2E stub: `window.__STACKD_PRO_STUB__`.

## Store launch (v1.14)

`docs/launch-plan.md` is the reference for the first Play/App Store release
(blockers, owner vs assistant tasks, decisions); `docs/release-checklist.md`
is the mechanical build-and-ship list for every release. Three things that
bite if forgotten:

- **`package.json` `version` is the single source of the version number.**
  `npm run version:sync` rewrites the `<title>`, the Android
  `versionName`/`versionCode` and both Xcode versions;
  `tests/unit/versionSync.test.js` fails if they drift. `versionCode` =
  `major*10000 + minor*100 + patch`, and neither store accepts a build number
  twice — a replaced upload needs a PATCH bump.
- **Any new purchase surface needs `Components._legalLinks(prefix)` +
  `_bindLegalLinks`** — both stores want *Terms of Use* and *Privacy Policy*
  reachable by those names next to a price, and a price must always name its
  period (`bank.pricePerMonth` / `bank.pricePerYear`).
- **`BankConnect.brokerUrl()` defaults to PRODUCTION.** Only a browser dev
  server on localhost falls back to staging; `window.__STACKD_BROKER_URL__` is
  the explicit override. The Capacitor WebView origins (`https://localhost`,
  `capacitor://localhost`) must stay in the broker's `ALLOWED_ORIGINS` or every
  native request fails CORS preflight.

## Working conventions in this repo

- **Markup safety (1.0.2 BUG-24).** Every stored or imported text placed in markup goes through `I18n.esc` (aliases: views.js `esc`/`escapeAttr`, `Components.esc`, `Widgets._esc`, `Insights._esc`). Escape `t()` params, never `t()` output. Account colours (palette, `Store.normalizeAccountColor`) and icons (`Store.isSafeIcon`) are validated on write; icons are also healed at boot and re-sanitized in memory whenever accounts/categories are reloaded from disk. Every id read from a file goes through `Store.fileId`; `ADD_ACCOUNT`, `ADD_CATEGORY` and `BATCH_IMPORT_TRANSACTIONS` never keep an unsafe id. **Never add a top-level `esc`/`escapeAttr` binding to another src file** — the scripts share one global scope, so it throws a redeclaration SyntaxError only in the `defer` build, which unit tests cannot see. `tests/unit/markupSafety.test.js` and `escapeGuard.test.js` fail on any raw sink.
- The app version is tracked in the `<title>` of `index.html` (e.g. `Stack'd v0.60`) and referenced in comments as `v0.xx`. Feature history is threaded through inline `// vX.xx` comments — grep these to understand when/why a behavior was added. Bump it via `npm run version:sync`, not by hand.
- Post-launch changes are tagged with the public version, e.g. `// 1.0.1 (BUG-14)` (bug ids from the 2026-10-01 deep testing report, `docs/deep-test-fixes-plan.md`). Never tag new work `v1.0x`/`v1.1x`.
- 1.0.2 work is tagged `// 1.0.2 (BUG-NN)` with ids from the 2026-10-04 deep testing report of 1.0.1; `docs/deep-test-fixes-1.0.2-plan.md` is the reference (decisions D1–D16, boot heals, accepted limits) and `docs/deep-test-fixes-1.0.2-designs.md` holds the per-unit designs.
- **Native CSV export (1.0.2 BUG-37)** writes the file (with BOM) to the Filesystem cache and opens the share sheet through `@capacitor/share` (a native plugin: `npx cap sync` after `npm install`); a sheet appears only on failure. The web build still downloads through a Blob link.
- **Public version numbering restarted at 1.0 for the store launch (2026-09-27).** Every `// vX.xx` comment up to `v1.19` is an internal pre-launch iteration; the `v1.19` work is what shipped as public **1.0**. The stores show the public version with a zero patch dropped (`1.0.0` → `1.0`, `1.0.1` stays `1.0.1`) — `tools/version.cjs` owns that rule. Beware the grep collision this creates: a future public `v1.1` is not the historical `v1.10`–`v1.19`.
- `src/store.js`, `src/views.js`, and `src/components.js` are large monolithic files; new logic is added inline to the relevant global rather than split into new files, to preserve the no-bundler / global-load model.
- The `agents/` and `.agents/` folders document a Product Analyst → Architect → Vibe Engineer → QA workflow used to produce the code; they are process docs, not runtime code.
