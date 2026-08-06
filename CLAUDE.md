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
db.js → utils/scroll.js → utils/keyboard.js → store.js → components.js → views.js → router.js → export.js → import.js → main.js
```

The core globals and their roles:

| Global | File | Role |
|---|---|---|
| `window.StackdDB` | `db.js` | localStorage wrapper. Keys are namespaced with prefix `stackd_v1_`. `load()`, `save()`, `generateId()`. |
| `window.Store` | `store.js` | Single source of truth. Holds `state`, a pub/sub `subscribe()`/`emit()`, and one large `dispatch(action, payload)` switch. Persists each slice to `StackdDB` on mutation. |
| `window.Router` | `router.js` | Hash-based SPA router. Maps `#route` → `viewId`, parses `?account=` query params, dispatches `SET_VIEW`, and drives scroll reset. |
| `window.Components` | `components.js` | Reusable UI pieces (BottomNav, modals, FAB, etc.) — large file (~150KB). |
| `window.Views` | `views.js` | The screens (~200KB). Each view is an object with `render(state) → htmlString`, optional `attachEvents(root, state)`, and optional `destroy()`. |
| `main.js` | — | Entry point. Wires init, subscribes to the store, and on every state change renders the view matching `state.activeView` into `#router-view`, then re-hydrates icons. |

### Rendering model

There is **no virtual DOM and no framework**. The render loop lives in `main.js`: `Store.subscribe` fires on every dispatch, a `switch(state.activeView)` picks the view module, and it does `routerView.innerHTML = viewModule.render(state)` followed by `viewModule.attachEvents(...)`. Views are re-rendered wholesale on state change. If a view sets up listeners/timers, clean them up in its `destroy()` (called on view transition).

### State & data model

- The store's `state` object holds `accounts`, `categories`, `transactions`, `budgets`, `loans`, plus UI state (active view, per-page filters for history/analytics, theme, selection mode, etc.).
- **Account balances are computed from transactions, never stored.** Use `Store.getAccountBalance(id)`.
- Transactions have a `type` of `income`, `expense`, or `opening_balance`. Creating an account auto-inserts an `opening_balance` transaction (category `cat_balance`).
- Default categories are seeded from the `DEFAULT_CATEGORIES` constant at the top of `store.js` (stable ids like `cat_salary`, `cat_groceries`).
- All mutations go through `Store.dispatch(ACTION, payload)`. To add behavior, add a `case` to the dispatch switch, mutate `this.state`, call `StackdDB.save(...)` for the affected slice, set `changed = true`, and let `emit()` re-render. The store also handles **cross-tab sync** via storage events.

### Recurring transactions (v0.67 semantics)

- A recurrent series is **fully materialized up-front**: `_processRecurringTransactions` creates every occurrence out to `recurrence.endDate` (capped at 60 months from `startDate`) as a chain. Every member carries `recurrence: {seriesId, interval, frequency, startDate, endDate}`; exactly **one member — the chain tail — additionally holds `recurrence.nextDate`** (the live "generator"). For recurring transfers only the **expense leg** is ever armed.
- `UPDATE_TRANSACTION`/`UPDATE_TRANSFER` **merge** the payload's recurrence and preserve the member's own `nextDate` state — never accept a re-armed `nextDate` from the form for an existing series member, or you resurrect the duplicate-chain bug. Scope flags: no flags = only this member (literal date applies to it alone); `updateFuture` = propagate non-date fields to members with `date >= original date`, and if the date/schedule changed, delete those members and regenerate the chain from the edited one; `updateAll` = same, plus non-date fields to past members. **Past members' dates are never modified by any scope.** `recurrence: null` means detach (no flags), stop the series here (`updateFuture` deletes future members), or unlink every member (`updateAll`).
- Any edit-save of a series member in the transaction form must go through `Components.RecurringUpdateModal` (3 scope options, same layout family as `RecurringDeleteModal`); it accepts `onSelection(scope)` with `'single'|'future'|'all'` or the `onlyThis/thisAndFuture/allTransactions` callback shape.
- `_calculateNextRecurrenceDate` is deliberately local-time, noon-anchored string math — do not reintroduce `new Date('YYYY-MM-DD')`/`toISOString()` round-trips, they drift a day at DST boundaries.

### Icons

Icons are Lucide. `main.js` calls `window.lucide.createIcons()` and also carries a large inline `EMERGENCY_ICONS` fallback map + `window.StackdHydrateIcons` so icons still render on `file://`/native where the CDN script may be unavailable. When adding a new icon name, it may need an entry in that fallback map.

## Testing model

- **Unit tests** (`tests/unit/`, Vitest + jsdom): because `src/` files are plain globals (not importable modules), tests load them by reading the file and executing it with `new Function('window', 'localStorage', 'crypto', content)` against a fresh mock `global.window`. See `tests/unit/store.test.js` for the `executeFile` helper pattern — replicate it and load dependencies in the same order as `index.html`.
- **E2E** (`tests/e2e/`, Playwright): runs against `http://localhost:3000` (Chromium only), auto-starting the dev server via `npm.cmd run dev`.

## Second project: `mobile_apple/`

A separate Expo / React Native (expo-router) scaffold for a future iOS app. It is essentially an empty starter (`app/` is unpopulated) and shares no code with the root web app. Its own commands (`expo start`, etc.) run from inside `mobile_apple/`. The root web app is the one in active development.

## Working conventions in this repo

- The app version is tracked in the `<title>` of `index.html` (e.g. `Stack'd v0.60`) and referenced in comments as `v0.xx`. Feature history is threaded through inline `// vX.xx` comments — grep these to understand when/why a behavior was added.
- `src/store.js`, `src/views.js`, and `src/components.js` are large monolithic files; new logic is added inline to the relevant global rather than split into new files, to preserve the no-bundler / global-load model.
- The `agents/` and `.agents/` folders document a Product Analyst → Architect → Vibe Engineer → QA workflow used to produce the code; they are process docs, not runtime code.
