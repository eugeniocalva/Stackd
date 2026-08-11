# Stack'd Improvement Plan — August 2026 (v0.79 → v0.86)

Phased plan for the 15-item improvement list (screenshots reviewed 2026-08-11).
Grounded in a 10-agent code recon; every claim below carries file:line evidence.
Each phase is one release (one `<title>` version bump). Bugs first, then features,
i18n last so every new string (insights, paid, drilldown) is born translatable.

House rules that apply to every phase:
- Any `src/*.js` edit bumps its `?v=` in `index.html`; co-dependent files bump together.
  CSS files carry no `?v=` — pure-CSS fixes need no bump (index.html:14-17).
- `npm run test` + relevant e2e before calling a phase done; visual check via dev server.
- Work is committed only after explicit user approval per session convention.

## Item → phase map

| # | User item | Phase |
|---|---|---|
| 1 | Splash "soft glitch" on app open | P3 |
| 2 | Wallet tiles flush against left screen edge | P1 |
| 3 | New "Smart Insights" section (3 local insights) | P6 |
| 4 | Widget text too small / accessibility (WCAG 2.2) | P5 |
| 5 | Add-widget size swipe does nothing | P1 |
| 6 | Categories small preview broken in Add-widget | P1 |
| 7 | Edit mode: widgets render blank when scrolling | P2 |
| 8 | Income vs Expenses widget → whole-month (EOM) | P4 |
| 9 | 50/30/20 widget → simple planned-income splitter | P4 |
| 10 | History long-press jumps back to today | P2 |
| 11 | Paid field in form; orange strip only when unpaid | P4 |
| 12a | Language sheet ✓ too far right | P1 |
| 12b | FR / IT / ES / PT translations | P8 |
| 13 | Theme pills: text touches pill edges | P1 |
| 14 | Analytics category → tag drop-down drilldown | P7 |
| 15 | Align tag drilldown with Settings tags flow | P7 |

---

## Phase 1 — Small UI fixes (v0.79)

All small, low-risk, mostly CSS/inline-style. Items 2, 5, 6, 12a, 13.

### 1.1 Wallets rail left inset (item 2)
Root cause (confirmed): the rail is edge-to-edge via negative margin + re-added
padding (`.wallets-scroll-wrapper`, components.css:884-896), but it declares
`scroll-snap-type: x proximity` with `scroll-snap-align: start` on every card
(components.css:918) and **no `scroll-padding` exists anywhere in src/**. The
snapport ignores the scroller's own padding, so the first tile's snap position is
scrollLeft=16px — flush with the physical screen edge — and Chromium re-snaps
there on every wholesale re-render (main.js:455-461).
- Fix: on `.container` (components.css:2-13) define
  `--container-pad-left: max(var(--space-4), var(--safe-left))` (+ right) and use
  them for its own padding; in `.wallets-scroll-wrapper` mirror them for
  `margin-inline` / `padding-inline` and add
  `scroll-padding-inline: var(--container-pad-left) var(--container-pad-right)`.
  Safe-area adaptive by construction; identical computed values today (insets are 0).
- Drive-by (needs views.js bump, shared with 1.3): views.js:399 uses invalid
  `margin-left: -var(--space-4)` (silently dropped) — replace with
  `calc(-1 * ...)` or the new vars if the chart card should really be full-bleed.
- Deferred: same treatment for `.filter-bar-scrollable` (visual consistency only;
  interacts with the v0.78 frosted header — needs its own visual pass).

### 1.2 Add-widget: size swipe + broken donut preview (items 5, 6)
Root causes (confirmed): **the swipe was never implemented** — the "carousel" is a
static preview + two tap-dots, zero touch/pointer handlers in AddWidgetModal
(components.js:3733-3801), and the preview grid is `pointer-events: none`
(components.css:2542-2546) so gestures fall through to the vertically-scrolling
modal body. The dots do work but are 8×8px targets (components.css:2556-2570) vs
the app's 48px convention. The donut preview breaks because `.widget-donut` is
height-driven (aspect-ratio 1/1, max-height, **no max-width**, components.css:2415-2427):
the fixed 190px card height always yields a 130px donut, and the preview column is
~9px narrower than the dashboard's — under ~400px viewports the donut overflows and
gets clipped by `overflow: hidden`.
- Fix A: in `attachAll()`, when `def.sizes.length > 1`, bind passive
  touchstart/touchend on `.widget-preview-stage` (it IS hit-testable); on release
  with |dx| ≥ 40 and |dx| > |dy|, step `selectedSize` and `renderAll()`.
- Fix B: enlarge dot hit areas via `::after { inset: -14px }` halo +
  `touch-action: manipulation`; widen the gap so halos don't overlap.
- Fix C: `.widget-donut { max-width: 100%; }` — verified live to fix the preview
  and a latent dashboard clip on ≤372px phones; no-op for the large layout.
- Test: e2e swipe via Playwright touchscreen in home_widgets.spec.js.

### 1.3 Settings polish (items 12a, 13)
- Language ✓: the row combines `.list-item` card chrome with inline `padding: 14px 0`
  (views.js:3193) — zero horizontal padding pushes the ✓ into the card border.
  Fix: `padding: 14px var(--space-4)`. Apply the identical fix to the Currency
  picker (views.js:3159) which has the same bug.
- Theme pills: three `.btn` pills hard-code `height: 28px` while two-word labels
  wrap to two lines at line-height 1.5 (~33px of text in a 28px pill,
  views.js:3018-3020). Fix: shorten labels to "Light" / "Dark" / "System" +
  `white-space: nowrap` — the subtitle (views.js:3014) already spells out the full
  state. Verify at 320-360px widths.

### 1.4 Proposed cleanup (not explicitly requested — confirm): single selection bar
History selection mode renders TWO fully-wired bars: sticky top contextual header
(Cancel / count / Select All / Delete, views.js:793-811) and a floating bottom
duplicate (views.js:826-844, injected at :860). Recommend keeping the top bar
(superset) and deleting the bottom one + its CSS (components.css:1888-1905).

Bumps: views.js (?v=38→39), components.js (?v=28→29). CSS: no bump.

---

## Phase 2 — Stability: chart leaks + History scroll (v0.80)

### 2.1 Blank widgets in edit mode (item 7)
Root cause (confirmed, reproduced live): **unbounded Chart.js leak**. The dashboard
balance chart is created with a bare `new window.Chart(ctx, ...)` (views.js:534)
and never destroyed — DashboardView.destroy only releases widget charts
(views.js:604-606). Every dispatch while on the dashboard (i.e. every edit-mode
tap) re-renders wholesale, replaces the canvas, creates a new chart, and leaks the
old instance into Chart.js v4's static `Chart.instances` pinned to its detached
canvas. Measured: +1 instance per tap; after 65 taps, 67 leaked charts holding
~49MB of canvas backing store at dpr=2 (~110MB at phone dpr=3). On Android WebView
this exhausts the canvas memory budget → new widget canvases silently fail to get
a backing store and paint blank (legend/HTML still shows — exactly the screenshot);
a later GC frees memory, which is why retrying worked. Edit-mode rendering itself
is correct (no skip path, no content-visibility CSS; verified).
- Fix: track and destroy the balance chart (`DashboardView._balanceChart`) in both
  attachEvents (destroy-before-create) and destroy().
- Same-signature siblings: NetFlowChart's `getChart(canvas)` guard can never find
  the pre-swap instance (components.js:2247-2254) → use a tracked
  `this._chartInstance` like CategoryDonutChart (components.js:2562-2574);
  BudgetView's budgetChart (views.js:2757) has no destroy at all → track + destroy.
- Regression guard: e2e asserting `Object.keys(Chart.instances).length` stays equal
  to live canvas count across edit-mode taps.
- Optional polish: on REMOVE_HOME_WIDGET, capture/restore clamped scrollTop to
  soften the jump when deleting a tall widget near the bottom.

### 2.2 History long-press scroll jump (item 10)
Root cause (confirmed): TransactionsView.attachEvents ends with an unconditional
`this.scrollToToday(container)` (views.js:1205). Long-press dispatches TWO actions
back-to-back (TOGGLE_SELECTION_MODE + TOGGLE_TRANSACTION_SELECTION,
views.js:1170-1171); each wholesale re-render wipes scrollTop then smooth-scrolls
back to today — and every subsequent checkbox tap does it again.
- Fix: (1) in main.js renderView, for non-navigation re-renders (isNavigation flag
  already exists at main.js:448) capture `routerView.scrollTop` before the
  innerHTML swap and restore it instantly after attachEvents — generic fix, helps
  every view; (2) call scrollToToday only on History ENTRY (pass isNavigation into
  attachEvents or a `_mounted` flag reset in destroy()); (3) keep the Today pill's
  explicit trigger (components.js:1070-1072); (4) optionally collapse the
  long-press double dispatch into one action.
- Cleanups while there: dead `scroll-history-to-today` CustomEvent path
  (router.js:74-80 fires, nobody listens); scrollToToday computes "today" in UTC
  (views.js:1209) while render uses local parts (views.js:634-635) — unify local.

Bumps: main.js, views.js, components.js together.

---

## Phase 3 — Boot & splash smoothing (item 1) (v0.81)

Root causes, ranked (all confirmed in code):
1. **Double-splash with unmanaged handoff**: `@capacitor/splash-screen` is NOT
   installed — the SplashScreen block in capacitor.config.json is dead config —
   so the Android 12 system splash dismisses on the first (blank) WebView frame,
   then a blank-white gap, then the web splash pops in with a different logo
   size/position.
2. Head is parser/render-blocking: Google Fonts CSS + three synchronous CDN
   scripts (unpkg lucide, 2× cdnjs jspdf) delay first paint on-device (index.html:13,50-52).
3. FOUT on the splash wordmark: "Stack'd" first paints in fallback, re-shapes when
   Manrope 800 arrives (index.html:42-48).
4. Icon-hydration pass at DCL+800ms rewrites every [data-lucide] element in the DOM
   exactly when the 800ms splash fade starts (main.js:304-311, 518-522) — the
   passes are non-idempotent when lucide is present (each pass destroys and
   rebuilds every icon).
5. Dark-theme users: theme applied only at DOMContentLoaded (store.js:158), splash
   and native background hardcoded white → luminance snap at fade end.
6. The shipped android bundle is stale (v0.60 assets) — any fix requires
   `npm run build` + `npx cap sync android` to be judged on-device.

Work:
- Add `@capacitor/splash-screen`, `launchAutoHide: false`; hide from main.js after
  first render + `document.fonts.ready` (with ~1.5s timeout) inside rAF, with a
  hard-timeout fallback so a boot JS error can't hang the native splash. Access via
  `window.Capacitor.Plugins.SplashScreen` (matches the existing App-plugin pattern,
  main.js:345-357). Web (non-native) keeps the web splash path.
- Unblock head: swap unpkg lucide for the local `src/libs/lucide.js` snapshot
  (must stay 0.400.0 to match EMERGENCY_ICONS); lazy-inject jspdf/autotable in
  export.js on first PDF export.
- Kill FOUT: outline the wordmark into the splash SVG, or self-host the woff2s
  with preload; at minimum make the fonts stylesheet non-render-blocking.
- Pre-paint theme: tiny inline head script reading `stackd_v1_theme`
  (JSON.parse — StackdDB stringifies) + prefers-color-scheme, setting
  `data-theme`/`.dark` before CSS paints; theme-aware splash colors; new
  `values-night/styles.xml` for the native splash background.
- Idempotent hydration: skip already-generated lucide SVGs; drop the 800/2000ms
  timer passes (modal paths call StackdHydrateIcons explicitly — main.js:605,677 —
  and keep working); gate the fade on readiness + `transitionend`, not setTimeout.
- Rebuild + `npx cap sync android`; verify on device.

---

## Phase 4 — Data semantics: EOM, 50/30/20, Paid (items 8, 9, 11) (v0.82)

### 4.1 Income vs Expenses → whole month
One-argument change: widgets.js:269 drops the `_todayStr()` clampEnd so
computeNetFlowData uses full calendar-month buckets (store.js:2433) — covers both
the small IN/OUT card and the large chart (shared `_buckets`). Future-dated
materialized recurring members then count, which is the point.
Consistency blast radius (must be encoded or a future session will "re-fix" it):
- Only incomeExpense changes. categories (widgets.js:415), fiftyThirtyTwenty,
  latest (widgets.js:212-216), savings (widgets.js:666-670) stay month-to-date.
- Rewrite the now-false comments (widgets.js:264-265, 664-665) and amend the
  bolded MTD rule in docs/home-widgets-plan.md §8b (~line 329).
- Invert tests: homeWidgetsCharts.test.js:150-162 (future expense must now count)
  and :284-294 (pin the intentional categories-MTD vs incomeExpense-EOM divergence);
  extend homeWidgetsTrends.test.js:235-242 with a future-dated row.
- Optional label hint on the small card ("net · Aug 26 · incl. scheduled").

### 4.2 50/30/20 → static planned-income splitter
Why the screenshot was nonsense (confirmed): default `needsCategoryIds: []` means
needsSpent is always €0 and **all** expenses land in Wants (widgets.js:1149-1151);
Savings shows actual MTD income−expenses (−€834.68) juxtaposed with "of €2,000.00
planned income" (widgets.js:1216-1219) — three different bases in one card.
Rework: pure visual guide. Keep `{plannedIncome, pctNeeds, pctWants, pctSavings}`
with existing sum-to-100 validation + fallback (_pcts); DELETE needsCategoryIds,
its chips config section, and all actuals math (computeAnalyticalSummary /
computeCategoryDistribution calls in `_data`). Render: headline = planned income;
three rows "Needs 50% — €1,000.00" with fill width = pct, single neutral color.
Empty state when plannedIncome unset: "Set your planned monthly income in the
widget settings" (no auto-fallback to actual income — it would reintroduce a
shifting number). No migration needed: `_cfg` merge ignores stray keys
(widgets.js:112-115). Update widget description (widgets.js:1118), FAQ copy
(components.js:475,478), rewrite homeWidgetsFifty.test.js (17 tests, bulk of work).

### 4.3 Paid rework
Key recon insight: the data layer ALREADY treats absence as paid (every consumer
checks `isPaid === false` / `!== false`), and CSV export/import already normalize
it. The rework is mostly presentational + form plumbing:
- Form (AddTransactionView, a routed view, not a modal): add a "Paid" row cloning
  the Recurrent card's anatomy (label + subtitle left, `.toggle-switch` right,
  views.js:1429-1447 as template), default ON. Lean storage: write `isPaid: false`
  only when toggled off; never stamp `true` on every save. Edit pre-fill:
  `checked = tx.isPaid !== false`. Wire into captureDraftTxFormState (~views.js:60),
  the re-apply block (~:1338), initial defaults (~:1276), and all four dispatch
  payloads.
- Store: ADD_TRANSACTION/UPDATE_TRANSACTION need zero changes (spread/merge carry
  it; future/all propagation included). ADD_TRANSFER + UPDATE_TRANSFER build legs
  field-by-field and would DROP it — stamp both legs + the propagation loop
  (store.js:1222-1251, 1303-1352). Keep the transfer-pair mirror invariant.
- Recurring containment (critical): `_processRecurringTransactions` spreads the
  generator, so an unpaid seed would poison the whole 60-month materialized chain
  and blank the Upcoming widget / EOM forecast (store.js:594-605, 618-627).
  Strip `isPaid` from generated members — future occurrences stay implicitly paid.
- History visuals: delete the green "✓ Paid" chip (components.js:882-887, :904;
  CSS components.css:599-609); keep `.unpaid-edge-bar` as the sole indicator;
  TOGGLE_TRANSACTION_PAID becomes two-state (`false` ↔ delete-key), preserving
  transfer mirroring; simplify the swipe button styling/aria.
- Tests: extend unpaidTransactionFiltering.test.js + transactionSwipeActions.test.js
  (transfer legs, propagation, generation stripping, omit-key preservation).

Bumps: widgets.js, views.js, components.js, store.js together.

---

## Phase 5 — Widget typography & contrast (item 4) (v0.83)

WCAG 2.2 has no absolute minimum font size; we apply a 12px floor + AA contrast
(4.5:1) + verified 24×24 targets (already all pass 2.5.8).
- Size bumps (components.css): `.widget-stat-label` (2364) and
  `.widget-minibar-label` (2387) 0.68rem→0.75rem; `.widget-row-sub` (2156)
  0.7rem→0.75rem; `.widget-legend-name` (2482) / `.widget-legend-pct` (2493)
  0.72rem→0.75rem; optionally `.widget-minibar-value` (2396) →0.8rem.
  Chart.js canvas fonts in widgets.js: legend 10→11 (356), ticks 9→10
  (375, 384, 638, 748, 758).
  Watch: fixed card heights clip overflow — verify both sizes, both themes.
- Contrast fixes: dark-mode `--text-tertiary` on cards = 3.5:1 FAIL → switch the
  card sublabels (.widget-row-sub, .widget-stat-label, .widget-minibar-label,
  .widget-empty) to `var(--text-secondary)`; light-mode red `#ef4444` = 3.76:1
  FAIL → scope `.widget-card .text-expense { color: var(--color-expense-val) }`
  (#dc2626, 4.83:1); replace inline amber `#f59e0b` literals (widgets.js:1019,1204)
  with `var(--color-warning-text)`; make NetFlowChart tickColor theme-aware
  (components.js:2191 — check netFlowChartYScale.test.js pins source text first).

---

## Phase 6 — Smart Insights section (item 3) (v0.84)

Privacy stance: 100% local, rule-based heuristics — no external calls ever.
- New `src/insights.js` attaching `window.Insights` (exact v0.72 widgets.js
  precedent: loaded between widgets.js and views.js, consumes Store/Widgets,
  consumed by DashboardView). Script tag `?v=1` between index.html lines 96-97;
  build.cjs regex handles it automatically.
- Shape: `rules: [{id, priority, compute(state) → {icon, iconColor, tone, value,
  params} | null}]`; `compute()` drops nulls, sorts, slices to 3; per-card
  try/catch containment copied from Widgets._renderCard. Sentences built ONLY from
  a single `INSIGHT_STRINGS` template table (the future i18n seam); value is a
  separate color-coded field (`tone` → .text-income/.text-expense) so word order
  never traps translation.
- Rule 1 (money placement): concentration = largest positive balance / sum of
  positive balances via getAccountBalance; skip if <2 accounts or sum ≤ 0;
  exclude negative balances from the denominator.
- Rule 2 (spending): top row of
  `computeCategoryDistribution(Widgets._monthToDateFilters({}), 'expense')` —
  MUST be month-to-date or future recurring members count as already spent (the
  recon's #1 correctness trap).
- Rule 3 (saving): `computeBalanceForecast([]).eomAbsDiff` — the exact
  "projected EOM" math the header already shows (store.js:2168-2223); fallback to
  income-source concentration (`'income'` distribution) when the forecast pct is
  null.
- Wiring: `${window.Insights ? window.Insights.renderSection(state) : ''}` between
  the Wallets block close (views.js:408) and the Widgets call (views.js:410);
  attach beside Widgets.attachSection (views.js:418). No destroy hook needed
  (chart-free).
- UI: stacked list of 3 compact cards reusing `.card.card-elevated` + the
  `.widget-row` anatomy (icon box, text, color-coded value). Category icons come
  free (`<i data-lucide>` + existing hydration; all needed icons are already in
  EMERGENCY_ICONS). Do NOT reuse fixed `--widget-h-*` heights. If a horizontal
  rail is preferred instead, it must carry `data-horizontal-scroll` (scroll-lock
  exception list, components.css:1870-1877).
- Tests: new insights.test.js via executeFile pattern (db → store → widgets →
  insights); seed relative to current month.

Bumps: new insights.js ?v=1, views.js bump.

---

## Phase 7 — Analytics category→tag drilldown (items 14, 15) (v0.85)

Facts from recon: the category list lives in Components.CategoryDonutChart
(components.js:2361-2620), not AnalyticsView; a category tap today directly mutates
`Store.state.historyFilters` + emit() + navigate('#transactions') — no URL params.
Tags are lowercase, '#'-less string arrays on tx.tags; NO tag filtering exists in
getFilteredTransactions (only vestiges: CLEAR_ALL_FILTERS resets a tags key,
FilterModal's active-check reads it, state.activeTagFilter is dead).

- Store groundwork: add `tags: []` to historyFilters + analyticsFilters defaults
  (store.js:74-87); guarded additive tags clause in getFilteredTransactions
  (store.js:759-765) with `'__untagged__'` sentinel (empty/missing tags). Unit-test
  hard: this function feeds History, Analytics, widgets, bulk selection.
- New getter `computeCategoryTagBreakdown(filters, type, categoryId)` beside
  computeCategoryDistribution (~store.js:2510): reuse
  getFilteredTransactions('analytics', …) + the same type predicate; returns
  `[{tag, amount, count, percentage}]` desc + trailing untagged bucket (always
  present, mirroring the reference app's "Nessun hashtag" row). Multi-tag txs count
  once per tag (sums can exceed category total — accepted; percentage is of
  category total). Do NOT extend computeCategoryDistribution (shape consumed by
  widgets/_capData/tests).
- Accordion (the key UX decision): NO dispatch on expand — a dispatch would
  wholesale re-render and replay the donut's 700ms animation. Keep
  `_expandedCatId` on the CategoryDonutChart singleton (precedent: _currentType),
  render all sub-lists collapsed at render time, toggle a CSS class locally in
  attachEvents; because render() reads the singleton, unrelated re-renders restore
  the open state. Reset on type toggle / filter change. `__others__` stays
  non-expandable. Must use the same `effectiveFilters` the rows use
  (views.js:149-150, 250 — balance-mode clamp) or numbers disagree.
- Tag-row tap → exactly today's category-tap handoff plus `tags: [tag]`
  (components.js:2532-2551 pattern), navigate '#transactions'.
- Discoverability: FilterModal "Show All" must reset tags (latent bug at
  components.js:1370-1377) + render active-tag chips (removal only); History
  header indicator extends the "Partial accounts shown" pattern (views.js:785-788).
- Optional deep links: `#transactions?category=&tag=` beside the ?account= block
  (router.js:43-59) — mirrors its quirks (sticky until overwritten).
- Item 15 alignment: TagsView/TagDetailView pattern (param-driven, render-time
  filtering) stays the model; fix TagDetailView's latent double-decode
  (views.js:2847 — Router.getParams already decodes; breaks tags containing '%').
- Cleanup: delete or wire the vestiges (activeTagFilter, SET_TAG_FILTER, unused
  tagLabel at views.js:783).
- Accordion CSS next to .donut-legend (components.css:1392-1436):
  grid-template-rows 0fr→1fr, rotated chevron, count ring; respect
  prefers-reduced-motion; check the ≥480px two-column layout (1469-1486).
- Tests: tags clause (+untagged, +undefined guard), breakdown getter, updated
  categoryDonutChart.test.js markup assertions.

Bumps: store.js, components.js, views.js (+router.js if deep links) together.

---

## Phase 8 — i18n: FR / IT / ES / PT (item 12b) (v0.86+)

Current state: zero i18n infrastructure; ~600-700 hardcoded English strings
(~350 app chrome + ~250-300 FAQ/Manual/Terms prose). `state.language` is fully
plumbed dead state (stackd_v1_language, SET_LANGUAGE persists+emits, en-only
pickers). Dates already half-localize: History day headers use device locale
(views.js:737-739 → "MAR 11 AGO" on an Italian phone) while charts/currency are
pinned 'en-US' (~133 locale literals).

Architecture (fits the no-bundler global model):
- `src/i18n.js` → `window.I18n = {lang, dicts, locale(), t(key, params), setLang}`;
  t() does {var} interpolation + plural key variants + en fallback + key fallback.
  Loaded via `<script defer>` after db.js, BEFORE store.js (store period labels &
  formatCurrency need it). Per-language dicts as `src/i18n/{fr,it,es,pt}.js`
  assigning into `I18n.dicts.*` — plain script tags work over file://,
  vite-plugin-singlefile inlines them (~4×15-25KB).
- Wiring is nearly free: SET_LANGUAGE already emits and every dispatch re-renders
  the world — set `I18n.lang` on boot + in the SET_LANGUAGE case.
- Migrate incrementally (t() falls back to English): 8a foundation + Settings/
  Dashboard/History chrome; 8b remaining views/widgets/modals; 8c decision-gated
  prose (FAQ/Manual/Terms can ship English-first).
- Route ALL toLocaleDateString / Intl.NumberFormat sites through I18n.locale()
  (replacing both `undefined` and 'en-US').
- DEFAULT_CATEGORIES names live in stored data — translate at render time by
  stable cat_ id for isDefault categories only; never rewrite stored names.
- Expand both LANGUAGES arrays (views.js:3187, main.js:549); drop the
  "More languages coming soon…" row (main.js:578-584).

High-risk checklist (from recon):
- 8 plural-concatenation sites (`${n} transaction${n !== 1 ? 's' : ''}` —
  views.js:2122, 2222, 2885, 2922, 2944, 3477 + variants) → plural keys (FR
  treats 0 as singular).
- Assembled sentences (import results views.js:3254-3262, loan copy, alerts) →
  full-sentence templates.
- Number localization changes decimal separators (1.234,56 for IT/ES/PT) — audit
  anything parsing formatted output + amount input expectations.
- CSV column headers stay English (import.js matches on them).
- ManualModal search must search the localized corpus (components.js:367+).
- ~80 aria-labels/titles are easy to miss.
- Unit tests: i18n files join the executeFile chain in index.html order.

---

## Open decisions (recommendation first)

1. **History bottom selection bar** (P1.4): remove it (recommended) — it
   duplicates the top bar minus Select All. Not in the original 15; confirm.
2. **50/30/20 empty state** (P4.2): require plannedIncome, show a prompt when
   unset (recommended) vs auto-fallback to actual income.
3. **Expense-red contrast scope** (P5): widget-cards-only override (recommended
   now) vs app-wide switch to the darker red (more consistent, touches every
   screen — could be its own later pass).
4. **Insight 3** (P6): projected-EOM savings primary with income-source fallback
   (recommended) — matches the header the user already sees.
5. **i18n prose scope** (P8): ship FAQ/Manual/Terms English-first (recommended);
   translating them adds ~250-300 heavy-prose entries per language.
6. **Number-format localization** (P8): follow the app language (recommended,
   with an input-parsing audit) vs keep en-US formatting everywhere.
