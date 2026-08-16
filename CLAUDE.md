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
| `window.StackdDB` | `db.js` | localStorage wrapper. Keys are namespaced with prefix `stackd_v1_`. `load()`, `save()`, `generateId()`. |
| `window.LoanEngine` | `loan-engine.js` | Pure amortization engine (integer cents, `'YYYY-MM-DD'` string date math). `simulate(config)` → schedule + totals. Zero deps on other globals. |
| `window.Store` | `store.js` | Single source of truth. Holds `state`, a pub/sub `subscribe()`/`emit()`, and one large `dispatch(action, payload)` switch. Persists each slice to `StackdDB` on mutation. |
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
JSON `Config` column.

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

### i18n (Phase 8, v0.86–v0.92)

The app ships in **en / fr / it / es / pt**. `window.I18n` (`src/i18n.js`,
loaded after `db.js` and **before** `store.js`) holds `t()`, `locale()`,
`setLang()` and five flat dictionaries in `src/i18n/<lang>.js` — 816 keys
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
- A structure that feeds `t()` at render time (widget registry, FAQ, manual,
  terms) must expose a **getter**, or it freezes in the boot language. Same
  reason `main.js` rebuilds the bottom nav when `state.language` changes: the
  nav is mounted once, outside the render loop.
- Unit-test `executeFile` chains must load `i18n.js` + `i18n/en.js` right
  after `db.js`.

### Icons

Icons are Lucide. `main.js` calls `window.lucide.createIcons()` and also carries a large inline `EMERGENCY_ICONS` fallback map + `window.StackdHydrateIcons` so icons still render on `file://`/native where the CDN script may be unavailable. When adding a new icon name, it may need an entry in that fallback map. `StackdHydrateIcons(root)` takes an optional scope root (v0.93): the render loop passes `#router-view` and the nav rebuild passes the nav container, so anything rendering icons **outside** those subtrees (modals) must keep calling it on its own root — the existing modal call sites already do.

## Testing model

- **Unit tests** (`tests/unit/`, Vitest + jsdom): because `src/` files are plain globals (not importable modules), tests load them by reading the file and executing it with `new Function('window', 'localStorage', 'crypto', content)` against a fresh mock `global.window`. See `tests/unit/store.test.js` for the `executeFile` helper pattern — replicate it and load dependencies in the same order as `index.html`.
- **E2E** (`tests/e2e/`, Playwright): runs against `http://localhost:3000` (Chromium only), auto-starting the dev server via `npm.cmd run dev`.

## Second project: `mobile_apple/`

A separate Expo / React Native (expo-router) scaffold for a future iOS app. It is essentially an empty starter (`app/` is unpopulated) and shares no code with the root web app. Its own commands (`expo start`, etc.) run from inside `mobile_apple/`. The root web app is the one in active development.

## Working conventions in this repo

- The app version is tracked in the `<title>` of `index.html` (e.g. `Stack'd v0.60`) and referenced in comments as `v0.xx`. Feature history is threaded through inline `// vX.xx` comments — grep these to understand when/why a behavior was added.
- `src/store.js`, `src/views.js`, and `src/components.js` are large monolithic files; new logic is added inline to the relevant global rather than split into new files, to preserve the no-bundler / global-load model.
- The `agents/` and `.agents/` folders document a Product Analyst → Architect → Vibe Engineer → QA workflow used to produce the code; they are process docs, not runtime code.
