# Home Dashboard Widgets — Master Plan

> **Status: PLANNED — targeted at v0.72.** Written 2026-08-07 from a 6-agent codebase recon.
> §2 (current state) and §7 (integration conventions) are descriptive; §4–§6 are the
> normative spec; §8 is the phase breakdown we implement against; §9 lists decisions
> with recommendations (confirmed choices get folded back into the spec).

## Phase checklist

- [x] **Phase 1 — Milestone removal + widget framework** (slice, registry, grid, edit mode, add-sheet v1, Latest-transactions widget) — done 2026-08-07; see §8a for what shipped
- [x] **Phase 2 — Chart widgets** (Income vs Expenses, Categories donut + config step) — done 2026-08-07; see §8b
- [x] **Phase 3 — Trend widgets + add-flow polish** (Net worth, Personal savings, detail/preview step with size carousel) — done 2026-08-07; see §8c
- [ ] **Phase 4 — Upcoming transactions + Budget goals widgets**
- [ ] **Phase 5 — 50/30/20 budget widget + final polish**

---

## 1. Goal

Replace the static "Financial Milestone — Coming Soon" card on the dashboard with a
**user-configurable widget area**: a 2-column grid of self-contained cards the user
adds from a gallery, optionally configures (filters, sizes), reorders, and removes.
Modeled on the reference app screenshots (2026-08-07): gallery → detail w/ live
preview in two sizes → optional config → add; plus an Edit mode on the dashboard.

Constraints inherited from the app: 100% local (`localStorage`), no framework, views
re-render wholesale via `innerHTML` on every dispatch, Chart.js v4.4.2 vendored
(`src/libs/chart.js`, loaded `index.html:56`).

## 2. Current dashboard state (pre-change)

`Views.DashboardView` (`src/views.js:269–635`; `render` :272–443, `attachEvents`
:444–634, no `destroy`). Ordered sections:

1. Header — total balance + MoM variation (`views.js:387–403`)
2. Filtered-view banner + Reset (conditional, `views.js:405–415`)
3. Balance chart card (Chart.js line, `views.js:417–419`, setup :503–633)
4. Wallets carousel + Add Wallet tile (`views.js:289–335`, injected :421–426)
5. Recent Activities (today/yesterday, max 5, `views.js:360–378`)
6. **Financial Milestone** — static Coming-Soon card (`views.js:433–440`)

**Milestone deletion list (verified exhaustive):** the block at `views.js:433–440` is
the *only* code — no event handlers, no Store state, no DB keys, no dedicated CSS.
Do NOT touch the shared hits: `'trophy'`/`'goal'` in `EMERGENCY_ICONS`
(`main.js:100,206`), the icon-picker "Savings & Goals" group (`components.js:298`),
the `aria-label="Goals"` on the budget nav item (`components.js:76`).

## 3. Data model

### 3.1 Widget instance (persisted slice)

```js
// state.homeWidgets — DB key 'homeWidgets' (full key stackd_v1_homeWidgets)
[
  {
    id: StackdDB.generateId(),
    type: 'latest' | 'incomeExpense' | 'categories' | 'netWorth'
        | 'savings' | 'upcoming' | 'budgets' | 'fiftyThirtyTwenty',
    size: 'small' | 'large',      // small = half-width cell, large = full row
    config: { ... },              // per-type, see §5; {} when none
    createdAt: 'YYYY-MM-DDTHH:mm'
  }, ...
]
```

Array order **is** display order. Default on first run: `[]` (empty state renders an
"Add widget" CTA card — see §9.2).

### 3.2 Store wiring (pattern: `SAVE_BUDGET`, `store.js:1636–1646`)

- Default `homeWidgets: []` in `state` (~`store.js:54`), loaded in `init()`
  (~`store.js:129`).
- Dispatch cases (each mutates, `StackdDB.save('homeWidgets', ...)`, `changed = true`):
  - `ADD_HOME_WIDGET {type, size, config}` → append with generated id.
  - `UPDATE_HOME_WIDGET {id, size?, config?}` → shallow-merge.
  - `REMOVE_HOME_WIDGET {id}`.
  - `REORDER_HOME_WIDGETS {orderedIds}` → reject unless same id set.
- `TOGGLE_WIDGET_EDIT_MODE` → transient `state.widgetEditMode` (not persisted —
  precedent: `isSelectionMode`, `store.js:68`).
- `RESET_APP`: add `StackdDB.save('homeWidgets', [])` (`store.js:1650–1661` — slices
  omitted there survive reset).
- Cross-tab sync: add `stackd_v1_homeWidgets` reload in the storage listener
  (`store.js:349–376` — the key list is manual, not automatic).
- **CSV backup: excluded.** House convention: settings/preferences (theme, currency)
  are not exported (`export.js` covers accounts/categories/loans/transactions only).
  Widget layout is cheap to rebuild; revisit only if users ask (§9.4).

## 4. Widget catalog (normative)

All money formatting via `Store.formatCurrency` (`store.js:1916`). All period math
month-anchored on local-time date strings (repo rule: never `new Date('YYYY-MM-DD')`
round-trips). Every widget has an empty state (pattern: `components.js:1776–1782`).
Loan amounts are integer **cents** (`amountC`); transactions are floats — convert at
the widget boundary.

| # | Type | Chart | Data source (existing unless noted) | Sizes |
|---|------|-------|-------------------------------------|-------|
| 1 | `latest` — Latest transactions | none (list) | `state.transactions` sorted desc, `date <= today`, skip `opening_balance` | small: 3 rows · large: 5 rows |
| 2 | `incomeExpense` — Income vs Expenses | bar | `computeNetFlowData` (`store.js:2257`) / new thin helper if filter shape doesn't fit (§8 P2) | small: current-month 2-bar + net · large: 6-month grouped bars |
| 3 | `categories` — Categories donut | doughnut | `computeCategoryDistribution` (`store.js:2375`) | small: donut + total · large: donut + legend w/ % |
| 4 | `netWorth` — Net worth trend | line | `computeGraphBalances` monthly (`store.js:1989`) + `computeBalanceForecast` for the % badge (`store.js:2064`) | small: headline + % + sparkline · large: full line chart w/ month labels |
| 5 | `savings` — Personal savings | line/bar | monthly `income − expense` from `computeNetFlowData` buckets | small: current-month net + % vs prev · large: per-month net trend |
| 6 | `upcoming` — Upcoming transactions | none (list) | recipe §4.1 | small: next 3 · large: next 5 + total impact |
| 7 | `budgets` — Budget goals | doughnut/bars | `getBudgetForMonth` (`store.js:2174`) for current `YYYY-MM` | small: aggregate gauge · large: per-category progress bars (pattern `views.js:2500–2502`) |
| 8 | `fiftyThirtyTwenty` — 50/30/20 | tiles | derived, config-driven (§5.3) | large only |

**Scope note (user-confirmed):** goals/budgets are **expense-only** in Stack'd. The
reference app's "income goals" and "savings goals" variants are out of scope; the
`savings` widget tracks *actual* net savings (no target), and `budgets` tracks
expense budgets. If savings targets ever become a feature, they get their own slice
first — the widget only ever *reads* existing data.

### 4.1 Upcoming-transactions recipe (verified against the recurrence model)

Future occurrences already exist as materialized series members (`store.js:526–627`),
and today's balances already exclude them (`getBalanceAtDate` filters `date <= today`,
`store.js:1961–1970`), so this is a pure read:

1. `state.transactions.filter(t => t.recurrence && t.date > today && t.date <= horizon && t.isPaid !== false && !Store._isTxBeforeOpeningDate(t))` — mirror of `computeUpcomingImpact`'s predicate (`store.js:1974–1987`).
2. **Dedupe transfer legs** by `transferRef`, keep the expense leg (both legs are series members; only the expense leg carries the armed `nextDate`, `store.js:1179–1185`).
3. Append `getLoanProgress(loan).nextPayment` (`{date, amountC}`, `store.js:2465–2467`) for each `kind === 'active'` loan **where `getLoanLinkedTransactions(loan) === null`** — tracked loans' payments are already in the series members; adding both double-counts.
4. Sort by date asc, cap by size. Default horizon 30 days (config).

## 5. Per-type config (normative)

Only these types have a config step; all others add directly.

### 5.1 `categories`
```js
{ direction: 'expense' | 'income',       // default 'expense'
  mode: 'top' | 'selected',              // default 'top' (top 5 + Others, cap: components.js:2045)
  categoryIds: [],                       // when mode 'selected'
  accountIds: [] }                       // [] = all accounts
```
This one config covers all four reference-app variants (top spending / top income /
selected expense / selected income).

### 5.2 `incomeExpense`, `netWorth`, `savings`, `upcoming`, `budgets`
```js
{ accountIds: [] }                                    // incomeExpense, netWorth, savings
{ accountIds: [], horizonDays: 30 }                   // upcoming
{ mode: 'all' | 'selected', categoryIds: [] }         // budgets
```

### 5.3 `fiftyThirtyTwenty`
```js
{ plannedIncome: null,        // null = auto (current month's actual income)
  pctNeeds: 50, pctWants: 30, pctSavings: 20,   // must sum to 100
  needsCategoryIds: [] }      // expense categories counted as Needs; rest = Wants
```
Computation for the current month: `needsSpent` = expenses in `needsCategoryIds`;
`wantsSpent` = all other expenses; `savingsActual` = income − total expenses. Four
tiles (Needs / Wants / Savings / headline), each `actual vs target` with over/under
coloring. The Needs/Wants mapping lives **inside the widget config** — no new field
on the category model, no migration, self-contained.

## 6. UI spec

### 6.1 Dashboard section

Replaces the milestone slot (after Recent Activities — movable later, §9.1):

```
WIDGETS                       [Edit] [+ Add]
┌──────────────┐ ┌──────────────┐
│ small widget │ │ small widget │
└──────────────┘ └──────────────┘
┌───────────────────────────────┐
│ large widget                  │
└───────────────────────────────┘
```

- New CSS in `src/styles/components.css`: `.widgets-grid { display:grid;
  grid-template-columns: 1fr 1fr; gap: var(--space-3); }`, `.widget-card` (base on
  `.card.card-elevated`, `components.css:67–83`), `.widget-card--large
  { grid-column: 1 / -1; }`. Theme via existing variables only (`variables.css`).
- Empty state: dashed CTA card (pattern: `.btn-add-wallet-card`,
  `components.css:1034–1052`) — "Add your first widget".
- Section header row uses the `.section-title` convention + two pill buttons.

### 6.2 Widget registry & render pipeline (new file `src/widgets.js`)

New global `window.Widgets`, loaded **between `components.js` and `views.js`**
(precedent for a new file+tag: `loan-engine.js`, `docs/debt-rebuild-plan.md:353`):

```js
Widgets.registry = {
  latest: {
    title, description, icon,          // icon must exist in EMERGENCY_ICONS (main.js:7)
    sizes: ['small','large'], hasConfig: false, defaultConfig: {},
    render(instance, state) => html,   // string, like every view
    attach(instance, root, state) {},  // optional: Chart.js mount, row clicks
  }, ...
};
Widgets.renderSection(state)  => html   // header + grid + edit-mode chrome
Widgets.attachSection(root, state)      // delegates to per-instance attach()
```

`DashboardView.render` embeds `Widgets.renderSection(state)`;
`DashboardView.attachEvents` calls `Widgets.attachSection(...)`. Chart lifecycle:
canvas id `widget-canvas-<instance.id>`, and every `attach` guards with
`window.Chart.getChart(canvas)?.destroy()` (stale-instance pattern,
`components.js:1815–1818`) — mandatory because views re-render wholesale.
After any dynamic HTML injection call `window.StackdHydrateIcons()`
(pattern `components.js:200`).

### 6.3 Add-widget flow (`Components.AddWidgetModal`)

Built in three increments (see phases):

1. **Gallery sheet** (Phase 1): full-screen sheet (template:
   `CategorySelectionModal`, `components.js:2700–2802`) with a 2-column grid of
   widget-type cards (grid pattern: `IconPicker`, `components.js:316–341`). Types
   without config add immediately (`ADD_HOME_WIDGET` size `small` default) and close.
2. **Config step** (Phase 2): for `hasConfig` types, gallery → config panel inside
   the same sheet (multi-panel closure pattern: `ExpandedGraphModal`,
   `components.js:2804+`; controls: `.multi-select-chip` `components.js:962–1037`,
   checkbox grid `components.js:2879–2909`).
3. **Detail/preview step** (Phase 3): gallery → detail page (title, description,
   **live preview rendered by the real `render()` with real state**, size carousel
   small/large with dots) → config → add. Matches the reference-app flow.

### 6.4 Edit mode

`[Edit]` toggles `state.widgetEditMode`. In edit mode each card shows: **remove**
(−, top-left, `REMOVE_HOME_WIDGET`), **reorder** up/down arrows
(`REORDER_HOME_WIDGETS`), and **gear** on configurable widgets (reopens the config
panel, saves via `UPDATE_HOME_WIDGET`). No drag-and-drop in v0.72 — none exists in
the repo and arrows are reliable on mobile; long-press drag is a candidate later
(§9.3). Edit mode auto-exits on navigation (transient state).

## 7. Integration conventions (must-follow)

- **Cache busting**: bump `?v=` in `index.html:90–100` for every touched file;
  co-dependent files bump together. Current: db 13 / scroll 13 / keyboard 13 /
  loan-engine 1 / store 23 / components 21 / views 31 / router 14 / export 15 /
  import 15 / main 17. New tag: `src/widgets.js?v=1` between components and views.
  Check whether the four stylesheet links (`index.html:14–17`) carry `?v=`; if so,
  bump `components.css` too.
- **Version**: `<title>` → `Stack'd v0.72` (`index.html:6`); new code carries
  `// v0.72` rationale comments.
- **Icons**: prefer names already in `EMERGENCY_ICONS`; any new name needs a
  regenerated entry there or it silently breaks on `file://`/native.
- **Strings**: English inline, matching the existing dashboard copy convention.
- **Tests**: unit tests use the `executeFile` harness
  (`tests/unit/store.test.js:6–29`) loading globals in index.html order — new tests
  that exercise widgets load `db → loan-engine → store → widgets`. E2E specs are
  snake_case in `tests/e2e/`.

## 8. Phases

### Phase 1 — Milestone removal + widget framework
- Delete the milestone block (`src/views.js:433–440`). Nothing else.
- New `src/widgets.js` (`window.Widgets`): registry, `renderSection`,
  `attachSection`, empty-state CTA, edit-mode chrome. First registered widget:
  **`latest`** (list-only — proves the pipeline with no chart, no config).
- Store slice per §3.2 (all five actions + RESET_APP + cross-tab sync).
- `Components.AddWidgetModal` v1: gallery grid, direct add, close.
- Dashboard integration (section header + grid where the milestone was).
- CSS: `.widgets-grid`, `.widget-card`, edit-mode chrome.
- `index.html`: new script tag; bump store/components/views `?v=`; title → v0.72.
- Unit tests: `tests/unit/homeWidgets.test.js` — add/update/remove/reorder
  (incl. reorder rejection on id-set mismatch), persistence keys, RESET_APP wipe,
  cross-tab reload, section render with 0/1/n widgets, edit-mode markup.
- **Acceptance:** `npm run lint` + `npm run test` green, existing tests untouched
  and green; browser preview proof (add → reorder → remove → reload persists;
  dark + light).

### 8a. Phase 1 — as built (2026-08-07, v0.72)

Shipped as specified, plus these decisions made during implementation:

- **Size toggle landed early.** Edit mode carries a `Small`/`Wide` pill per card
  (`UPDATE_HOME_WIDGET`), not just remove + arrows. Without it `size` would have
  been dead state until Phase 3's carousel, and `latest` genuinely reads better wide.
- **Failure containment.** `_renderCard` wraps `def.render` in try/catch and
  `attachSection` wraps `def.attach`; an unregistered `type` renders an
  "Unavailable" placeholder. One bad widget can never blank the dashboard —
  it stays removable in edit mode. Covered by two unit tests.
- **HTML escaping.** `Widgets._esc` escapes all user-supplied text (category and
  account names). The rest of the app interpolates raw; new widget code does not.
- **`latest` clamps to today.** Recurring series are materialised ahead, so an
  unclamped "latest" list would show scheduled rows as if they had happened.
- **Edit mode clears on navigation** via `SET_VIEW` (`store.js`), not a
  `destroy()` hook — dispatching inside `destroy()` would re-enter the render loop.
- **`_todayStr` is local-time**, not `toISOString()`, per the repo's date rule.

Files: `src/widgets.js` (new, `window.Widgets`), `src/store.js` (slice + 5 actions
+ `SET_VIEW` clear + RESET_APP + cross-tab sync), `src/components.js`
(`AddWidgetModal`), `src/views.js` (milestone deleted, section mounted),
`src/styles/components.css` (+333 lines), `index.html` (script tag, `?v=` bumps
store 24 / components 22 / widgets 1 / views 32, title → v0.72),
`tests/unit/homeWidgets.test.js` (34 tests).

Verified: 327/327 unit tests green, lint 0 errors (15 pre-existing warnings, none
in new code), and in-browser — add from empty CTA and from the Add pill, reorder,
resize, remove, reload persistence, edit mode clearing on navigation, icons
hydrated, no console errors, no horizontal overflow, light and dark themes.
Screenshots were not capturable (browser pane hidden in that session); verification
was done through the live DOM and computed styles instead.

### Phase 2 — Chart widgets: `incomeExpense`, `categories`
- Register both types, both sizes; parameterize/reuse the `NetFlowChart`
  (`components.js:1764–1974`) and `CategoryDonutChart` (`components.js:1978–2236`)
  drawing logic rather than duplicating it (extract shared draw helpers if needed).
- If `computeNetFlowData`'s filter shape doesn't fit a plain "last 6 months by
  month for accounts X" call, add a thin store helper with unit tests — never
  aggregate inside the widget.
- AddWidgetModal config step (§6.3.2) + gear-edit on existing widgets.
- Unit tests: config defaulting/merging, top-5+Others capping, empty-data states,
  Chart instance destroy-on-rerender guard.
- E2E: `tests/e2e/home_widgets.spec.js` — add configured widget, reload, persists.
- **Acceptance:** lint/tests green; preview proof of both widgets both sizes,
  both themes, with data and empty.

### 8b. Phase 2 — as built (2026-08-07, v0.72)

Both widgets shipped in both sizes, plus the config step. Notable decisions and
two defects caught during verification:

- **Month-to-date clamp (defect, found in browser).** `computeNetFlowData` takes
  a `clampEnd` and was clamped to today, but `computeCategoryDistribution` goes
  through `getFilteredTransactions`, which honours the whole calendar month. The
  donut therefore counted future-dated members of recurring series as already
  spent, and the two widgets disagreed about the same month ($1,365 vs $1,035 on
  the test data). Fixed with `Widgets._monthToDateFilters` — a `custom` period
  from the 1st to today — used by every `getFilteredTransactions`-based widget.
  **Phases 3–5 must use `_monthToDateFilters`, not `_monthFilters`, for anything
  built on `getFilteredTransactions`.** Two regression tests pin it, one of which
  asserts the two widgets report the same figure.
- **Edit-mode jiggle removed (defect, found by e2e).** Phase 1's iOS-style
  infinite jiggle made every 28px chrome button perpetually unstable — Playwright
  could not click them, and the same instability hurts real tap accuracy,
  especially with motor impairments. Replaced by a static accent ring.
- **Shared, not duplicated.** `NetFlowChart._computeYScale` and a new
  `NetFlowChart._themeColors()` were extracted from that component's closure so
  the widgets reuse the exact axis rounding and theme palette. The donut reuses
  `CategoryDonutChart._capData` / `._assignColors` (top-5 + Others).
  `netFlowChartYScale.test.js` asserts on source text, so the extracted body was
  kept verbatim.
- **Chart lifecycle.** Chart.js indexes instances *by canvas element*, but the
  dashboard replaces every canvas on each `innerHTML` render, so `getChart()`
  can never find the old one. `Widgets._charts` tracks instances **by widget id**;
  `attachSection` destroys all of them before remounting, and
  `DashboardView.destroy()` releases them when leaving the dashboard.
- **Config architecture.** Registry entries own their config UI via
  `renderConfig(config, state)` / `attachConfig(root, ctx)`; the modal owns the
  draft, the panel chrome and the confirm button. Shared controls
  (`_segmented`, `_multiChips`, `attachSharedConfig`) live on `Widgets`.
  `attachSharedConfig`'s `onChange` hook lets a widget invalidate dependent
  fields in the same click — `categories` uses it to clear picked category ids
  when the direction flips, avoiding a double render.
- **Empty multi-select means "All"**, matching the store's filter convention, so
  deselecting everything never renders an empty widget.
- The small `incomeExpense` variant uses CSS bars, not Chart.js: a half-width
  canvas with axis labels is unreadable at that size.

Files: `src/widgets.js` (2 registry entries, chart lifecycle, config helpers),
`src/components.js` (`_computeYScale`/`_themeColors` extraction, two-step
`AddWidgetModal`), `src/views.js` (`DashboardView.destroy`),
`src/styles/components.css`, `index.html` (components 23 / widgets 3 / views 33),
`tests/unit/homeWidgetsCharts.test.js` (28 tests),
`tests/e2e/home_widgets.spec.js` (6 specs).

Verified: 355 unit tests and 16 e2e green, lint 0 errors. In-browser: both
widgets in both sizes with six months of seeded data, top-5+Others capping,
gear-to-config round trip, direction flip clearing stale picks, dark and light
themes (chart tick/grid colours confirmed switching), no console errors in a
fresh tab, no horizontal overflow.

### Phase 3 — Trend widgets + add-flow polish: `netWorth`, `savings`
- Register both types per §4 rows 4–5.
- AddWidgetModal detail/preview step (§6.3.3): live preview, size carousel.
- Unit tests: savings month-bucket math (incl. months with no transactions),
  netWorth series delegation, preview renders with empty state.
- **Acceptance:** lint/tests green; preview proof of full add flow
  (gallery → detail → size toggle → config → add).

### 8c. Phase 3 — as built (2026-08-07, v0.72)

Both trend widgets plus the detail/preview step shipped as specified.

- **The add flow is now gallery → detail → [config] → add**, for *every* type,
  not just configurable ones. The detail step shows title, description, a live
  preview and the size carousel; its button reads "Add widget" when there is
  nothing to configure and "Next" when there is. Back walks
  config → detail → gallery → close. The gear entry point still jumps straight
  to config and shows ✕ (there is no earlier step to return to).
- **The preview is the real thing.** `Widgets.renderPreview` builds a synthetic
  instance (`id: '__preview__'`) and runs it through the same `_renderCard` the
  dashboard uses, inside a real `.widgets-grid`, so a "small" preview occupies
  exactly one of two columns at true width. `attachPreview` mounts the real
  chart; the stage is `pointer-events: none` so it cannot be interacted with,
  and `destroyPreview()` runs on every re-render and on close. Verified in the
  browser that flipping the size dot destroys the old chart and mounts a new one.
- **Size chosen in the carousel is the size that gets added** — previously add
  always used `sizes[0]`.
- **netWorth** delegates to `computeGraphBalances({interval:'monthly'})` (already
  clamped to today) and takes the last 6 points; the badge comes from
  `computeBalanceForecast().todayVariation`, which returns `null` when there is
  no baseline — rendered as an em dash by the shared `_deltaBadge`, never 0% or NaN.
- **savings** is net saved per month from the same `computeNetFlowData` buckets
  `incomeExpense` uses, so the two can never disagree (a test pins this).
  Per-bar colouring marks months that lost money. The percentage baseline is the
  previous month's net; a zero baseline shows a dash rather than Infinity.
- Small sizes render a sparkline: axes hidden, tooltip disabled (there is
  nothing to read a value against), 54px tall.

Files: `src/widgets.js` (2 registry entries, `_deltaBadge`, preview helpers),
`src/components.js` (detail step, step routing, size dots),
`src/styles/components.css`, `index.html` (components 24 / widgets 4),
`tests/unit/homeWidgetsTrends.test.js` (26 tests), updated
`tests/e2e/home_widgets.spec.js` (7 specs, incl. a size-carousel spec).

Verified: 381 unit tests and 7 e2e green, lint 0 errors. In-browser: full
gallery → detail → size flip → Next → config → add flow, preview chart mounted
and released, savings agreeing with incomeExpense ($1,565.00), dark and light
themes (line colour and grid confirmed switching), clean console in a fresh tab,
no horizontal overflow.

One test premise was wrong and was corrected rather than the code: an account
opened in 2020 with a $1,000 opening balance *does* have a start-of-month
baseline, so 0.0% is right — the dash case needed an account with no opening
balance at all.

### Phase 4 — `upcoming` + `budgets`
- `upcoming` per recipe §4.1 — unit tests MUST cover: transfer-leg dedupe
  (expense leg kept), tracked-loan exclusion (linked series present → loan's
  nextPayment skipped), untracked active loan inclusion with cents→float
  conversion, horizon boundary, `isPaid === false` exclusion.
- `budgets` per §4 row 7 + §5.2 config; reuse `getBudgetForMonth` including
  cumulative carryover semantics — never recompute.
- **Acceptance:** lint/tests green; preview proof incl. a recurring transfer and
  a tracked + an untracked loan in the upcoming list.

### Phase 5 — `fiftyThirtyTwenty` + polish
- Register per §5.3 (large only); config panel with planned-income input,
  three percent fields (validated to 100), Needs-category multi-select.
- Polish pass: empty states, transitions, `fitNumericFontSize` on headline numbers
  (`components.js:27`), a11y labels on edit-mode buttons.
- Update this doc to "as built" + amend `CLAUDE.md` architecture section
  (new `widgets.js` global) + memory notes.
- **Acceptance:** lint/tests/e2e green; full-dashboard preview proof with 6+
  widgets mixed sizes, both themes; doc updated.

## 9. Open decisions (recommendation first — confirm or override)

1. **Section placement** — *Recommended:* bottom slot where the milestone was
   (least disruptive; wallets/recent stay muscle-memory-stable). Alternative:
   between Wallets and Recent Activities, closer to the reference app.
2. **First-run default** — *Recommended:* empty + CTA card (privacy-first,
   no presumption). Alternative: seed `incomeExpense` + `categories` small.
3. **Reordering UX** — *Recommended:* arrows in edit mode now; long-press drag
   (extending the `views.js:1175–1220` long-press idiom) as a later enhancement.
4. **CSV backup** — *Recommended:* exclude `homeWidgets` (house convention for
   preferences). Revisit only on demand; loans' JSON `Config` column
   (`export.js:49–83`) is the precedent if ever needed.
5. **Balance-chart overlap** — the dashboard already has a balance line chart
   (section 3) that duplicates what a `netWorth` large widget shows. Out of scope
   for v0.72; a future step could fold it into the widget system as a default
   pinned widget.
