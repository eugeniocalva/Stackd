# Refactor Round 2 — Plan (v0.93 → v0.96)

**Status: PLANNED — no phase started.**
Source: 10-item screenshot review of 2026-08-16 (iPhone build, iOS 18). Every item below
was root-caused against the real code (four parallel code investigations) and the
performance items were **measured live** on a seeded 3,002-transaction dataset in
desktop Chrome (method + numbers in Appendix A). This doc is the cold-start reference
for the whole round, same role `docs/refactor-plan.md` played for v0.79–v0.86.

---

## Item map

| # | Symptom (screenshot review) | Root cause | Fix | Phase |
|---|---|---|---|---|
| 1 | Wallet tile tap should open History with that account as the **only** filter | Feature already exists (`views.js:443-454` → `#transactions?account=`), but `?account=` **merges** into whatever filters are lying around (`router.js:50-58` + shallow-merge `UPDATE_FILTERS`, `store.js:2010`), fires a dead `SET_PERIOD_TYPE` (`views.js:449-450`), silently filters **Analytics** too (`router.js:55`) and sets a legacy `activeAccountFilter` nobody reads (`router.js:57`, zero consumers) | Replace-not-merge deep-link, History only; delete the three stray dispatches | P2 |
| 2 | Date field overflows the form card (fix-fail; iOS) | Previous fix (commit `3976fb1`) styled the **desktop** WebKit shadow tree (`::-webkit-datetime-edit*`) which doesn't exist on iOS; iOS renders through `::-webkit-date-and-time-value` and sizes the control to intrinsic UA width unless `appearance:none` is set. Guard test only asserts the ineffective declarations | Real iOS-side CSS fix + containment backstop + rewrite the guard test | P3 |
| 3 | Scroll-to-top button at the bottom of History | New feature. Scroller is `#router-view` (`global.css:47-59`); a boot-time scroll listener already exists to piggyback on (`main.js:385-389`) | Fixed circular button, CSS-driven visibility | P2 |
| 4 | Budget form: average-spend insight between Monthly Limit and Start/End Month | New feature. Insertion point `views.js:2650`; expense/income distinction is `category.typeHint` + `BudgetView.currentBudgetFilter` for `'both'` | New `Store.getCategoryMonthlyAverage` + insight card + plural i18n keys ×5 | P3 |
| 5 | Opening the app: Stack'd logo not appearing | iPhone runs the **Capacitor template splash** (blue Capacitor mark — the Stack'd mark in `assets/icon.png` is black). `npx cap add ios` ran fresh on the Mac and was never committed; `capacitor-assets` never generated iOS assets (commit `b7afd6e`'s message documents exactly this) | Scaffold + brand + commit the `ios/` platform | P4 |
| 6 | Home-screen app icon missing after rebuild | Same root cause — template `AppIcon.appiconset` | Same | P4 |
| 7 | Widgets: incomeExpense needs an "EOM" caption; savings must switch to EOM + caption | incomeExpense is **already EOM-valued** since v0.82 (`widgets.js:270-274`, no clamp) — caption only. Savings clamps to today via one argument: `computeNetFlowData(filters, W._todayStr())` at `widgets.js:674` | Drop the clamp arg; add a shared right-aligned caption to `_renderCard`; i18n ×5; invert the tests that pin the old behavior | P2 |
| 8 | Navigation between pages takes seconds (worst → Home) | Measured: Dashboard nav = **1,050ms single long task** desktop @3k tx (≈3-6s on device); wallet-tap = **5 sequential full renders ≈ 4.5s** desktop. Causes: accidental **O(T²)** in `getAccountOpeningDate`, ~140 `getBalanceAtDate` calls per dashboard render, every widget computing its data **twice** (render + attach), per-transaction `Date`/`Intl` allocation, all charts mounting synchronously **inside** the `startViewTransition` freeze with 600ms animations | Phase 1 — seven-fix program, ranked by leverage | P1 |
| 9 | Add-widget small/large swipe freezes for seconds | `touchend` → `renderAll()` rebuilds the **entire modal** `innerHTML`, recomputes live widget data twice through the O(T²) paths, re-attaches everything, re-hydrates icons document-wide, and synchronously constructs a Chart with a 600ms animation (`components.js:3770-3799` → `3682-3722`). **Not** a store dispatch — the modal lives outside `#router-view` | Targeted preview-only swap + rAF-deferred, animation-free preview chart | P1 |

Not re-diagnosed (verified clean by the investigation, don't spend time here):
view transitions render exactly once (`main.js:513-531`, no double render, no cloned DOM);
no unconditional dispatch cascades in any `attachEvents`; localStorage is touched only at
boot + mutations + cross-tab events; the v0.79 chart-leak fix held (all six creation
sites have matching destroys); bottom-nav rebuild correctly gated on language change.

---

## Phase 1 — Performance core (v0.93) — ✅ SHIPPED 2026-08-16

**Results (same rig/dataset as baseline, desktop Chrome, 3,002 tx):** zero long
tasks (>50ms) across Home/History/Analytics navigations — dashboard nav was a
single 1,052–1,270ms task before; wallet-tap now runs 2 render passes (was 5);
`computeNetFlowData` 2 calls/dashboard render (was 4/485ms); add-widget size
swap handler ≈4ms with the modal shell kept alive (was a full-modal rebuild).
523 unit + 31 e2e green.

**As-built deviations from the plan below:**
- 1.5: `_mountChart` defers via rAF **raced against a 48ms timer** — rAF is
  suspended in hidden documents (background tab/covered WebView), so the timer
  guarantees mounting; whichever fires first wins, detached canvases are
  skipped. `_suppressChartAnimation` is retired (mounts are always
  animation-free). The three singleton charts (analytics bar/donut, budget
  donut) got `animation: false` but stay synchronous — they were not the
  bottleneck.
- 1.7 icons: per-view `StackdHydrateIcons()` calls were KEPT (cheap once lucide
  is loaded; removing 12 call sites wasn't worth the blank-icon risk); the
  render-loop pass is scoped to `#router-view` and the nav rebuild hydrates its
  own subtree. `StackdHydrateIcons(root)` now takes an optional scope root.
- 1.7 donut: Analytics reuses `ctx` + bar-chart data across render/attach, but
  the donut deliberately still recomputes in its component — its expense/income
  toggle (`_currentType`) owns that data and precomputing would couple them.
- 1.7 `_fmtDate` (row dates) also fixes a latent day-drift: the old
  `new Date('YYYY-MM-DD').toLocaleDateString` parsed as UTC midnight and showed
  the previous day in negative-UTC timezones; now noon-anchored.
- e2e `history_scroll.spec.js`: added a 150ms settle after the spec's manual
  `scrollTop = 120` — the list's scroll-snap nudges an arbitrary offset onto a
  row edge a few ms later, and with faster renders the `before` capture started
  racing that nudge (the guarded behavior — no movement during selection — was
  verified intact via a scroll-event trace).
- New tests: `tests/unit/emitCoalescing.test.js` (coalescing semantics + index
  invalidation); `i18n.test.js` SET_LANGUAGE spec updated to the async contract.
- Bumps: title v0.93; `scroll.js?v=14`, `store.js?v=32`, `components.js?v=41`,
  `widgets.js?v=17`, `views.js?v=49`, `main.js?v=27`. CLAUDE.md updated
  (render model, store indexes, icon scoping).

Goal: page-to-page navigation and the add-widget swipe feel instant. Everything else in
this round benefits, and the P2 wallet-tap fix depends on 1.3 landing first.

Baseline → target (desktop Chrome, seeded 3,002 tx / 6 widgets / 2 accounts, Appendix A):

| Metric | Baseline | Target |
|---|---|---|
| Dashboard navigation (long task) | 1,050–1,270 ms | ≤ 250 ms |
| Analytics navigation | ~290 ms | ≤ 150 ms |
| History navigation | ~70 ms | ≤ 70 ms (don't regress) |
| Wallet-tap → History (cumulative) | ~4,565 ms, 5 renders | ≤ 300 ms, 1–2 renders |
| `computeNetFlowData` per dashboard render | 4 calls, 485 ms | ≤ 2 calls, ≤ 30 ms |
| Add-widget swipe handler | full-modal rebuild | ≤ 50 ms + rAF chart |

### 1.1 Kill the O(T²): memoize opening dates + reorder predicates

`getAccountOpeningDate` (`store.js:2105-2111`) does a full-array `.find` — and it is
called from `_isTxBeforeOpeningDate` **per transaction** inside `getFilteredTransactions`
(`store.js:782`), `computeNetFlowData` (`store.js:2502`), `getBalanceAtDate`
(`store.js:2134`), `computeUpcomingImpact` (`store.js:2150`) and the upcoming widget
(`widgets.js:814`). Transactions are sorted desc, opening balances are the oldest rows,
so the `.find` scans ~all of T every time → each `getBalanceAtDate` is O(T²).

- Build `this._openingDateByAccount` once in `_sortData()` (`store.js:427-428` choke
  point covers every mutation path); `getAccountOpeningDate` reads the map.
- Reorder predicates so cheap `'YYYY-MM-DD'` string compares run **before**
  `_isTxBeforeOpeningDate` at `store.js:782`, `store.js:2502`, `store.js:2134`.
- Unit test: map invalidated by ADD/DELETE_TRANSACTION, ADD/DELETE_ACCOUNT, import.

### 1.2 Hoist `_getPeriodBounds` out of the per-transaction loop

`store.js:791` runs `isDateInPeriod` per row; via `store.js:767` that re-derives the
same bounds with 3 `new Date` + 2 template strings **per transaction**
(`store.js:681-718`). Compute bounds once before the `.filter()`, compare strings
inline. Optional: memoize `_getPeriodBounds` by `type + '|' + anchor` (pure function;
other call sites `views.js:82,123,135,673`, `components.js:862` benefit for free).

### 1.3 Coalesce emits (one render per tick) — **changes the documented render model**

`emit()` is synchronous per dispatch (`store.js:876`, `store.js:2067`) and the sole
subscriber re-renders unconditionally (`main.js:404` → `:478`). Wallet-tap today =
5 dispatches = 4 full renders of the **outgoing** dashboard + 1 of History (measured
~4.5s). Budget nav = 2 renders (`router.js:64` then `:69`).

- Microtask batch in `Store.emit`: `_emitScheduled` flag + `queueMicrotask(flush)`.
- Boot needs a synchronous escape hatch — `main.js:549` (`Store.emit()` initial render)
  and the splash-dismissal comment right below rely on the first render being sync:
  add `Store.emit({ sync: true })` / `_flush()` for that one site.
- Route the direct emits through the batcher too: `store.js:2053`, `:2060`, and the
  storage-event handlers (`store.js:416`, `:423`, `:473`).
- Invariant to preserve: no code dispatches then reads the new DOM in the same tick
  (investigation found none — keep it that way).
- **CLAUDE.md updates**: "Rendering model" + the dispatch contract ("let `emit()`
  re-render") must say emits coalesce to one render per microtask tick.

### 1.4 Compute once per render pass (render ↔ attach share their data)

`render` and `attachEvents` run back-to-back in one synchronous pass
(`main.js:478-481`) — there is no staleness window, so a per-pass memo is safe.

- Dashboard: `computeGraphBalances` called identically in render (`views.js:297-301`)
  and attach (`views.js:506-510`), plus once **per account** (`views.js:537-542`) —
  stash on `this._lastGraphResult`. Wallet rail calls `getAccountBalance` inside the
  sort comparator *and* the map (`views.js:309-317`) — precompute an `{id: balance}`
  map first.
- Widgets: every chart widget's `attach` re-runs the builder its `render` just ran
  (`widgets.js:571`↔`596`, `432`↔`472`, `674`↔`714`, `1064`) — add a per-pass memo
  keyed by `instance.id`, cleared at the top of `Widgets.renderSection`/`attachSection`.
- Analytics: `_getBalanceModeContext` ×2 (`views.js:101`, `:245`), `computeNetFlowData`
  ×2 (`views.js:148`, `:247`), donut recomputed in `components.js:2554` — same memo
  pattern on the view object.

### 1.5 Charts: animations off by default, mount one frame later

Every widget chart animates 600ms on navigation (`widgets.js:353,493,621,735,1092`;
analytics `components.js:2171` 800ms; donut `components.js:2591`; budget
`views.js:2868`; only `views.js:571` is already 0) and all constructions run
synchronously inside the `startViewTransition` callback — the compositor is frozen on
the old-view snapshot the whole time (`main.js:513-522`), which is the "frozen then
sudden fade" feel on device.

- `Chart.defaults.animation = false` at boot; opt back in only where entry motion is
  wanted (the add-widget preview keeps its animation per `widgets.js:1490-1492` — see
  1.6 for why it should lose it anyway).
- Defer `new Chart(...)` one frame (`requestAnimationFrame`) in `Widgets.attachSection`
  (`widgets.js:1478`) and the per-view chart blocks (`views.js:565`, `views.js:2847`,
  `components.js:2155`, `:2571`), guarded with `document.contains(canvas)` against
  rapid double-navigation. Keeps the existing per-id destroy tracking intact.

### 1.6 Add-widget carousel: swap the preview, not the modal

`components.js:3770-3799` (swipe) → `renderAll()` (`components.js:3682-3722`): full
modal `innerHTML` rebuild + live `def.render` **and** `def.attach` data passes + 
document-wide icon hydration + synchronous animated Chart, per swipe, no debounce.

- Swipe path replaces only `#awm-preview`'s innerHTML + size-dot classes + caption
  (`components.js:3671-3678`), leaving shell/topbar/footer/handlers alone.
- Preview chart: `animation: false` + rAF mount (drop the `widgets.js:1492` reset for
  the swipe path). Icon hydration scoped to the preview node.
- Size dots (`components.js:3763+`) take the same targeted path.

### 1.7 Cleanup batch (measurable, low risk, do in one sweep)

- **`formatCurrency`** builds a fresh `Intl.NumberFormat` per call (`store.js:2087-2099`)
  — cache keyed by locale+currency, invalidate in `SET_CURRENCY` (`store.js:1915`) and
  `SET_LANGUAGE` (`store.js:1922`). Same for `i18n.js:70`/`:83` `DateTimeFormat`s
  (`i18n.js:41` already caches `PluralRules` — copy that pattern). Also
  `components.js:741` builds a `DateTimeFormat` per transaction row via
  `toLocaleDateString`.
- **Icon hydration** runs twice per render and scans the whole document both times
  (`main.js:255`, `:313` + per-view calls at `views.js:434, 887, 264, …` — 44 sites).
  Give `StackdHydrateIcons(root = document)` a root, pass `routerView` from
  `main.js:504`, drop the per-view duplicates. **Keep** the self-calls in modals — they
  render outside `#router-view` (`components.js:2000, 2515, 3179, 3408, 3577, 3717,
  3839`). CLAUDE.md icons note gets one line about scoping.
- **`applyTagOverflow`** interleaves style writes with `scrollWidth` reads in a loop
  (`components.js:823-838`) — batch reads then writes, and short-circuit when the view
  has no `.tx-tags-inline`.
- **`ScrollUtils.universalSmoothScrollToTop`** sweeps `querySelectorAll('*')` reading
  `scrollTop` on every node (`scroll.js:25-26`) and holds the app's only two remaining
  `console.log`s (`scroll.js:41,45`) — scroll the four known targets (or just
  `#router-view`) natively, delete the interval loop.
- **`getBudgetForMonth`** rescans all transactions per month in its cumulative loop
  (`store.js:2357-2380`) — one-pass `categoryId|YYYY-MM → spent` map cached on the
  store, invalidated on transaction mutation.

### Phase 1 verification

- Re-run the Appendix A rig; all targets in the table above met.
- `npm run test` green (plus the new memo-invalidation + coalescing unit tests:
  3 dispatches in one tick → 1 listener call; `{sync:true}` flushes immediately).
- Manual on device: Home ↔ History ↔ Analytics feel instant; add-widget swipe tracks
  the finger.
- Cache-busting: bump `?v=` for `store.js`, `main.js`, `views.js`, `widgets.js`,
  `components.js`, `i18n.js`, `utils/scroll.js` in `index.html` (co-dependent set —
  bump together).
- Deliberately deferred (only if device still lags after 1.1–1.7): History list
  virtualization (`views.js:798-802` renders every filtered row); per-view DOM
  keep-alive. Both are architecture changes — measure first.

---

## Phase 2 — Home & History UX (v0.94) — ✅ SHIPPED 2026-08-16

**As-built notes:** all three items landed as specced, plus: the History
account indicator became a tap-to-clear chip naming the filtered account(s)
(`#history-account-filter-chip`, mirroring the tag chip; Analytics' plain
indicator untouched); `UPDATE_FILTERS` gained the `replace: true` flag;
`SET_ACCOUNT_FILTER` + `state.activeAccountFilter` deleted outright (zero
readers); the dead `SET_PERIOD_TYPE` dispatch removed from the wallet handler.
Back-to-top visibility is pure CSS off a `.is-deep-scrolled` class the existing
boot scroll listener toggles at 400px — zero per-view listeners. Widget
captions render right-aligned in the head row via optional `def.caption`
(large-size gated in the widgets themselves); the small incomeExpense card's
hardcoded `EOM` literal moved to i18n (`widget.eomShort`); the small savings
line was deliberately left alone (the caption covers the ask; suffixing the
shared head line would double-label the large card). New keys ×5:
`history.clearAccountTitle`, `history.backToTop`, `widget.eomCaption`,
`widget.eomShort`. Tests: trends divergence spec inverted to pin agreement
(now date-independent too); new e2e `wallet_account_filter.spec.js` (2 specs)
+ back-to-top spec in `history_scroll.spec.js` — 523 unit / 34 e2e green.
Docs: home-widgets-plan §8b/§8c amended, CLAUDE.md widget split updated.
Bumps: title v0.94; `store.js?v=33`, `main.js?v=28`, `views.js?v=50`,
`widgets.js?v=18`, `router.js?v=17`, five dicts `?v=9`.

### 2.1 Wallet tile → History with the account as the ONLY filter (item 1)

Live-verified defect: tapping a tile with a year-period + type + tag filter active
lands on History with **all of them still applied** plus the account; Analytics gets
account-filtered as a side effect; `activeAccountFilter` (zero readers) gets set.

- `store.js:2007-2017` — teach `UPDATE_FILTERS` a `replace: true` payload flag: build a
  fresh default filter object (same shape `CLEAR_ALL_FILTERS` builds, `store.js:2019-2038`
  — period `{type:'month', value: today}`, empty arrays, `sortOrder:'asc'`) and apply
  the partial on top. One dispatch, order-independent of 1.3.
- `router.js:50-58` — the `?account=` branch becomes exactly one dispatch:
  `UPDATE_FILTERS { page:'history', filters:{ accounts:[id] }, replace: true }`.
  Delete the analytics dispatch (`:55`) and `SET_ACCOUNT_FILTER` (`:57`); also remove
  the dead reducer case (`store.js:1909-1911`) and state field (`store.js:69`).
- `views.js:449-450` — delete the dead `SET_PERIOD_TYPE` dispatch (writes
  `activePeriod`, which History never reads).
- Keep the ordering contract: filter dispatch **before** `SET_VIEW` (`router.js:48-49`).
- Optional polish: make the account indicator (`views.js:817-820`) a tap-to-clear chip
  mirroring the tag chip (`views.js:825-830` markup, `:892-897` handler).
- e2e: seed two accounts, set stray filters, tap tile, assert History shows only that
  account's rows, current month, and Analytics filters untouched.

### 2.2 History scroll-to-top button (item 3)

- Markup: circular button as last child of `.container` in `TransactionsView.render`
  (after `views.js:881`): `<button id="btn-history-to-top" class="history-to-top"
  aria-label="${I18n.t('history.backToTop')}"><i data-lucide="chevron-up"></i></button>`.
  `chevron-up` already exists in `EMERGENCY_ICONS` (`main.js:59`) — no fallback work.
- Visibility: extend the existing boot-time scroll listener (`main.js:385-389`,
  passive, mounted once) to also toggle `.is-deep-scrolled` on `#app` at
  `scrollTop > 400`; CSS hides the button otherwise. Zero per-view listeners, zero
  cleanup, survives re-renders.
- Click: `routerView.scrollTo({ top: 0, behavior: 'smooth' })` — **not**
  `ScrollUtils.universalSmoothScrollToTop` (see 1.7).
- CSS `.history-to-top` next to `.nav-fab` (`components.css:357-384`), reusing the
  glass tokens: 48×48, `position: fixed; bottom: calc(88px + var(--safe-bottom));
  right: max(var(--space-4), var(--safe-right)); z-index: calc(var(--z-nav) - 1)`;
  explicit `transition: opacity/transform` (no `transition: all`); plus a
  `body.keyboard-active` hide twin (`components.css:293-297`).
- i18n: `history.backToTop` in all five dictionaries (aria-label only).

### 2.3 Widget EOM switch + captions (item 7)

- **Behavior** — `widgets.js:674`: `computeNetFlowData(W._monthFilters(W._cfg(instance)))`
  (drop the `W._todayStr()` clamp arg). That is the entire savings change: past buckets
  were already full months; only the current month gains its future-dated materialized
  members. Do **not** touch `store.js:2500` (clamp line) — Analytics' user-toggled
  clamp (`views.js:96,148,247`) must keep working.
- **Captions** — `Widgets._renderCard` (`widgets.js:1331-1338`) gets optional
  `def.caption`; `.widget-card-head` becomes a flex row (space-between) so the caption
  sits right-aligned beside the title — the card is a fixed `--widget-h-large: 288px`
  (`variables.css:107`), so the caption must not steal a vertical line from the chart.
  New `.widget-card-caption` style next to `.widget-card-title`
  (`components.css:2234-2248`). Gate on `instance.size === 'large'`.
- **i18n** — new keys in all five dicts (anchor ~`en.js:609`, `widget.*` block):
  `widget.eomCaption` ("End of month" / existing precedent wording in
  `dash.projectedEom`), and i18n-ify the hardcoded small-card literal
  `net · ${label} · EOM` (`widgets.js:296`) as `widget.netflow.smallLabel`
  (`'net · {month} · EOM'`). Give the small savings line (`widgets.js:694`) the same
  `· EOM` suffix for symmetry.
- **Comments/docs that become false** — rewrite `widgets.js:668-671` (says savings
  deliberately stays MTD) and `widgets.js:82-85`; amend `docs/home-widgets-plan.md`
  §8b (`:332-339`) and §8c (`:411-414`); CLAUDE.md widget rules: the MTD/EOM split is
  now "categories + 50/30/20 + latest + insights = MTD; incomeExpense + savings +
  budgets = whole month".
- **Tests** — invert `tests/unit/homeWidgetsTrends.test.js:237-252` (it pins the
  savings-MTD vs incomeExpense-EOM divergence); `homeWidgetsCharts.test.js:164,299`
  assert the literal `· EOM` (survives if English keeps that string); i18n parity
  suite forces the ×5 keys. Savings pct specs (`homeWidgetsTrends.test.js:195-215`)
  use past-dated rows only — verify they stay green.
- Preview/config: previews reuse the real render path (`widgets.js:1375-1400`), so
  captions appear there automatically; no config/modal changes.

Cache-busting P2: `views.js`, `router.js`, `store.js`, `widgets.js`, `components.js`,
five dicts (`i18n/*.js`), `components.css` (styles are `<link>`s — bump if versioned).

---

## Phase 3 — Forms (v0.95) — ✅ SHIPPED 2026-08-16

**As-built notes:** CSS landed as specced (appearance:none + display:block on
the date/time controls, new `::-webkit-date-and-time-value` block, `.card`
min-width:0 + overflow-x:clip backstop, `.form-group` min-width:0 for the
budget month grid; desktop shadow-tree + indicator rules kept).
`dateInputFraming.test.js` rewritten to pin the load-bearing declarations —
including a negative assertion that the counterproductive `display:flex` host
never comes back. Insight shipped with `Store.getCategoryMonthlyAverage`
(trailing 6 full months, current month excluded, averaged over months WITH
spend, isPaid-gated — deliberately stricter than getBudgetForMonth's spent
figure); plural keys `budget.avgSpendHint.one/.other` ×5 (the `.one` variant
drops `{count}` and reads "Recently you spent…" — "over the last 1 month" was
wrong whenever the single active month wasn't last month). New unit suite
`categoryMonthlyAverage.test.js` (6 specs: averaging, windowing, exclusions,
pre-opening, nulls, plural render). Verified live: insight on Groceries,
absent on Salary; date input contained at desktop too. 533 unit / 34 e2e
green. Bumps: title v0.95; `store.js?v=34`, `views.js?v=51`, dicts `?v=10`.
**Device check still owed (no iOS here):** Expense form + Recurrent end date +
edit-account date at 320px, it/fr locales, light+dark — expected fixed by
appearance:none; if anything still bleeds, the `.card` clip now contains it.

### 3.1 Date field overflow — the iOS-real fix (item 2)

Root cause recap: `components.css:188-233` (from commit `3976fb1`) clamps
`::-webkit-datetime-edit*` — the **desktop** shadow tree. iOS renders
`input[type=date]` as a single control whose text lives in
`::-webkit-date-and-time-value`, and with native appearance on, iOS sizes the control
from the widest localized date string and **ignores** `width:100%`. `display:flex` on
the input host makes it worse; `min-width:0` is inert (block parent). Three affected
inputs in the tx form (`views.js:1447`, `:1452`, `:1497`) plus the same pattern at
`views.js:3525`, debt-sim (`views.js:4163-4365`), `components.js:1734,1738` — one
selector pair covers all.

- `input[type="date"].form-control, input[type="time"].form-control`:
  add `-webkit-appearance: none; appearance: none; display: block;` (replaces
  `display:flex`), keep `width/max-width/min-width/box-sizing`, add
  `overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: normal`.
- New iOS value rules: `input[type="date"]::-webkit-date-and-time-value,
  input[type="time"]::-webkit-date-and-time-value { text-align: left; margin: 0;
  min-width: 0; width: 100%; display: block; overflow: hidden; }`.
- Containment backstop on `.card` (`components.css:72`): `min-width: 0;
  overflow-x: clip` (clip, not hidden — same sticky-header rationale as
  `.container:17`).
- Keep the desktop `::-webkit-datetime-edit*` rules and the calendar indicator rule
  (indicator disappearing on iOS under `appearance:none` is expected — iOS opens its
  wheel picker on tap regardless).
- Harden the two-column month grid in the budget form while here: `min-width: 0` on
  `.form-group` (`components.css:158`) — its grid items default to `min-width:auto`.
- **Rewrite `tests/unit/dateInputFraming.test.js`** — today it string-matches the
  ineffective declarations and passed while the bug shipped. Assert the load-bearing
  ones: `appearance: none` present for the date/time selector pair and the
  `::-webkit-date-and-time-value` block exists.
- Device verification: Expense form + Recurrent end-date + edit-account date at
  320px-wide viewport, long-date locales (it/fr), light+dark.

### 3.2 Budget average-spend insight (item 4)

- **Helper** — `Store.getCategoryMonthlyAverage(categoryId, months = 6)` next to
  `getBudgetForMonth` (~`store.js:2390`): trailing `months` **full** calendar months
  (current month excluded — partial would drag the average down); include only
  `type === 'expense'` rows matching `categoryId` (transfer legs carry
  `categoryId: ''` + `transferRef` guard — `store.js:1258-1292`; `opening_balance`
  excluded by type), `isPaid !== false` (`store.js:1528-1539` lean flag), not before
  the account opening date (`store.js:2113`). Average over **months that had spend**
  (matches the copy "on average you spent X/month"); return
  `{ average, months } | null`; `null` → no insight rendered. Skip `cat_balance`.
- **Render** — `BudgetView.renderEdit`, insert at `views.js:2650` (between the
  Monthly Limit `.form-group` and the month grid). Gate:
  `cat.typeHint === 'expense' || (cat.typeHint === 'both' &&
  this.currentBudgetFilter === 'expense')` — income categories never show it (the
  user explicitly doesn't want "reduce your salary" advice). One insertion covers
  create and edit (single flow — `budget` is `{}` when new, `views.js:2627`).
  Icons already hydrate via `views.js:2691`.
- **i18n** — plural keys ×5 with identical placeholders (parity + plural tests
  enforce): `budget.avgSpendHint.one` / `.other` =
  `'On average you spent <strong>{amount}</strong>/month on this category over the
  past {count} month(s) — set a lower limit to bring it down.'` Amount pre-formatted
  via `Store.formatCurrency` and passed as `{amount}` (`views.js:2518-2519` pattern);
  `{count}` drives plural selection (`i18n.js:50-59`).
- **Tests** — unit: exclusions (transfer legs, opening balance, unpaid, other
  categories), 6-month windowing, months-with-spend averaging, `null` cases (no
  history, income category); i18n parity ×5.

Cache-busting P3: `store.js`, `views.js`, five dicts; `components.css`.

---

## Phase 4 — iOS native identity: icon + splash (v0.96) — ✅ SHIPPED 2026-08-16 (Mac handoff pending)

**As-built notes:** `npx cap add ios` ran fine on Windows (template copied;
pod install correctly skipped); `npx capacitor-assets generate --ios` produced
the branded `AppIcon-512@2x.png` (Stack'd mark, verified visually) and six
`Default@{1,2,3}x~universal~anyany(-dark).png` splashes (full lockup: mark +
wordmark; dark variants included — parity with android's drawable-night);
the three orphaned template `splash-2732x2732*.png` were deleted (the
regenerated Contents.json no longer references them). `npm run build` +
`npx cap sync ios` completed: Podfile lists `@capacitor/app` +
`@capacitor/splash-screen`, `CFBundleDisplayName` = "Stack'd". Capacitor's own
`ios/.gitignore` already excludes `App/App/public` (the dist copy) and the
generated `capacitor.config.json` — consistent with the b7afd6e convention,
so the committed `ios/` stays clean of build output. New npm script:
`npm run assets:gen` regenerates both platforms from `assets/`.

**Mac handoff (the one-time steps still owed on the Mac):**
1. Move aside the Mac's local untracked `ios/` folder BEFORE `git pull`
   (it will collide with the now-tracked one).
2. `npm install && npm run build && npx cap sync ios` (this runs pod install).
3. Open `ios/App` in Xcode, re-select the signing team (one-time — the old
   local project's signing isn't carried over).
4. **Delete the old app from the iPhone** (iOS caches home-screen icons),
   then build & run.
5. Verify: branded icon on the home screen; branded splash held until first
   paint (no blue Capacitor mark anywhere); dark-mode launch uses the dark
   splash variant.

Diagnosis: the device currently shows Capacitor **template** assets — the blue
Capacitor mark on the splash and a template/placeholder home-screen icon. The Stack'd
mark (`assets/icon.png` + `icon-foreground/background/splash.png` — the same sources
that produced Android's committed `ic_stackd*`/`splash.png` res tree) never reached an
iOS project: `ios/` is not in the repo, and commit `b7afd6e` (2026-08-13) already
states the intent: *"`npx cap add ios` still has to run on a Mac … that should be
committed alongside android/."* The web-side splash pipeline is healthy and needs no
change: native boot holds the native splash (`capacitor.config.json` SplashScreen
`launchAutoHide:false`), `main.js:569-583` hides it when ready, `index.html:34-39`
force-hides after 8s as a failsafe, and the web splash never paints on native
(`html.native-boot`, `index.html:87`).

Steps (this repo, Windows — no Mac needed until the final build):

1. `npx cap add ios` — scaffolds `ios/` from the template (CocoaPods install is
   skipped on Windows with a warning; that's fine). If the CLI refuses on this
   machine, run the same step on the Mac first and commit from there.
2. `npx @capacitor/assets generate --ios` — fills `AppIcon.appiconset` +
   `Splash.imageset` (+ dark variants) from `assets/`. Android res parity already
   exists (including `drawable-night` splashes).
3. `npm run build && npx cap sync ios` — copies `dist/` + config, writes the Podfile
   with `@capacitor/app` + `@capacitor/splash-screen`.
4. Commit `ios/` (per `b7afd6e` intent). Consider an npm script
   `"assets:gen": "capacitor-assets generate"` so future icon changes regenerate both
   platforms.
5. **Mac handoff (one-time)**: the Mac's existing untracked `ios/` must be moved aside
   before `git pull` (it will collide with the now-tracked folder). Then
   `npx cap sync ios` (runs pod install), open Xcode, re-select the signing team
   (one-time — the old local project's signing config is not carried over), **delete
   the old app from the phone** (iOS caches home-screen icons), build.
6. Verify on device: branded icon on the home screen; launch shows the branded splash,
   held until first paint, no blue Capacitor mark anywhere; dark-mode launch uses the
   dark splash variant.

Risks: appId must stay `com.stackd.finance` (it will — template is generated from
`capacitor.config.json`); CocoaPods/Xcode versions are Mac-side concerns outside this
repo; if the Mac's local `ios/` had manual tweaks beyond signing, they're lost — none
are known to exist.

---

## Cross-cutting rules for the whole round

- **Script cache-busting**: every touched `src/*.js` needs its `?v=` bumped in
  `index.html`; co-dependent files bump together (house memory rule).
- **i18n**: every new user-facing string → keys in all five dicts;
  `tests/unit/i18n.test.js` enforces parity, placeholders, plurals. New keys this
  round: `widget.eomCaption`, `widget.netflow.smallLabel` (small-card line),
  `history.backToTop`, `budget.avgSpendHint.one/.other`.
- **CLAUDE.md updates**: render model + dispatch contract (emit coalescing, 1.3);
  icons note (scoped hydration, 1.7); widget MTD/EOM split (2.3).
- **Version/title**: one version bump per phase in `index.html` `<title>`
  (v0.93 → v0.96), `// vX.xx` comments on new behavior per house convention.
- **Landing**: one commit per phase; ask before commit/push (house rule).

---

## Appendix A — measurement rig (reproducible)

Baseline numbers in this doc were taken 2026-08-16, desktop Chrome via the dev server,
after seeding localStorage with a deterministic dataset: **3,002 transactions over 16
months (453 future-dated, mimicking materialized recurrences), 2 accounts, 6 dashboard
widgets** (`savings`, `incomeExpense`, `categories`, `latest` large; `netWorth`,
`budgets` small). Seed + instrumentation snippets live in the session that produced
this plan; the rig is ~40 lines of console JS:

1. Seed: write `stackd_v1_accounts`, `stackd_v1_transactions`, `stackd_v1_homeWidgets`
   (LCG-deterministic rows: monthly salary + rent + utilities + 4-8 expense rows/day),
   reload.
2. Instrument: wrap `Store.emit` (count + duration), each `Views.*.render/attachEvents`,
   `Widgets.renderSection/attachSection`, `lucide.createIcons`; add a
   `PerformanceObserver({entryTypes:['longtask']})`.
3. Drive `location.hash` through `#transactions → #dashboard → #analytics →
   #transactions`, 2-3s apart; for item 1, `document.querySelector('.wallet-card').click()`.

Baseline (all numbers ms, desktop Chrome — expect 3-6× on an iPhone WKWebView):

| Measurement | Value |
|---|---|
| Long task on `#dashboard` nav | 1,052 (second run 1,270) |
| `DashboardView.render` / `attachEvents` | 577-676 / 512-584 |
| `Widgets.renderSection` / `attachSection` | 361-406 / 325-369 |
| `AnalyticsView.render` / `attach` | 195-541 / 153-184 |
| `TransactionsView.render` / `attach` | 23-25 / 10-11 |
| `computeNetFlowData` per dashboard render | 4 calls / 485 total |
| `getFilteredTransactions` per dashboard render | 5 calls / 54 total |
| `getAccountBalance` per dashboard render | 6 calls / 46 total |
| Wallet-tap emit chain | 1,068 + 1,089 + 1,138 + 1,270 + deferred History = **4,565 before History renders** |

Re-run this rig after each Phase 1 fix lands; the Phase 1 table's targets are the
acceptance gate.
