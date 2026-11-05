# iPhone review round — Plan (1.2.0)

**Status: IN PROGRESS — F0 groundwork landed on `feature/ux-review-1.2` (5c4faa4); units A–E running in worktrees.**
Source: the owner's iPhone review of the 1.1 build (2026-11-04, iOS, 20 screenshots), with
Trade Republic (vivid line chart) and MoneyStats (account table, net bars, glossy rings,
category-scoped hashtags, attachment sheet) as the reference apps.
Method: eleven read-only code maps at `07102f4` (one per code area; copies in the session
scratchpad `maps/*.md`), every claim below verified against the real code.
Comment tag: `// 1.2.0 (UX-N)` with N = the item number below. Never `v1.2x`.
Public version **1.2.0** (code 10200, stores show "1.2"); the 2026-10-25 unified-release rule
still applies (nothing uploaded to Play until Apple clears the app; TestFlight builds 10201+).

---

## Item map

| # | Symptom (iPhone review) | Today (verified) | Fix | Unit |
|---|---|---|---|---|
| UX-1 | Home balance graph is a flat grey line with dashed lines; wants a Trade Republic look | `DashboardView` line, `tension 0`, 5–8 % flat fill, per-account dashed lines (`views.js:681-728`), no range control (`computeGraphBalances` knows 12 months only) | Trend-coloured smooth line, gradient fill, dotted baseline, end dot, range chips 1W/1M/6M/YTD/1Y/Max on a new `Store.computeBalanceSeries`; per-account lines stay in the expanded sheet only | A |
| UX-2 | A widget listing every account with its balance, no scrolling | No such widget; cards are fixed height (`--widget-h-*`), rail shows balances per tile | New `accountBalances` registry entry (large, auto-height, grouped by type, subtotals, Total) | B |
| UX-3 | Swipe the Home graph to a 12-month net-balance bar view | Only the expanded sheet exists; `computeNetFlowData` already yields 12 EOM buckets | Two-pane scroll-snap pager (curve / monthly net bars) with dots | A |
| UX-4 | Card-shaped backing behind the History swipe buttons | `.swipe-container { background: var(--bg-surface-sunken) }` (`components.css:601`) | Transparent container, surface-filled pencil button | A |
| UX-5 | iOS-style long-press wiggle, x badge, drag to reorder | Edit pill + up/down arrows + red minus; no drag code anywhere | Long-press → wiggle (rotate keyframes), top-right x with confirm, press-and-drag with FLIP reflow, tap outside to exit | B |
| UX-6 | Add-widget size preview swaps instead of sliding | `renderPreviewOnly` swaps `#awm-preview` innerHTML; dots animate | Real scroll-snap rail with both sizes pre-rendered, small card centred | B |
| UX-7 | Rings look flat; want MoneyStats thick glossy rings with icon badges and a sweep | Four Chart.js doughnuts (Goals, categories widget, budgets widget, Analytics) with `animation:false` since v0.93 | Shared `Components.RingChart` plugin (gradient arcs, glow, canvas icon badges), entry-only sweep via `isEntry`, per-row rings on Goals | B |
| UX-8 | Amount caret drifts below the digits | `.amount-input` inherits `line-height: 1.5` through `font: inherit` and `-webkit-user-select: none` from body | Keep the caret, fix its box (line-height 1.15, user-select text, autofocus after the view transition) | A |
| UX-9 | Tag field commits on space; wants MoneyStats category-scoped picker | Free-text chips, `Enter`/`,`/space commit, global `getAllUniqueTags`, no tag ↔ category relation | Persisted `tagLinks` + derived links, `Components.TagPickerSheet`, categories CSV `tags` column | C |
| UX-10 | Attachments (camera / library / PDF) on a transaction; receipts export as one PDF | Nothing exists; bytes cannot live in localStorage (BUG-34) | `window.Attachments` (Filesystem on native, IndexedDB on web), file-input sheet, metadata on the row, `pdf-lib` receipts export | D |
| UX-11 | Backup page: daily toggle, back up now, restore, log; iCloud on iPhone | `#backup` has six CSV buttons + a restore input; Android Auto Backup already includes app data | JSON bundle, `window.StackdBackup` (daily on open, log), iCloud Drive via a local `stackd-cloud` plugin, Documents fallback | E |

---

## F0 — shared groundwork (landed, 5c4faa4)

- `package.json` 1.2.0 + `npm run version:sync` (title, Android 10200/"1.2", Xcode).
- `main.js`: `EMERGENCY_ICONS` += paperclip, image, images, file-text, file-plus, folder-open,
  cloud-upload, cloud-download, upload, download, grip-vertical, x-circle; `window.StackdIconSvg(name)`.
- `store.js`: `state.tagLinks {}`, `state.backupPrefs null`, `state.backupLog []` — loaded in
  `_initState`, cross-tab, `_reloadSlice`, reset in `RESET_APP`; `Store.normalizeTag`,
  `_loadTagLinks`, `_loadBackupLog`.
- `views.js`: `DashboardView.attachEvents(container, state, isEntry)` forwards
  `{ isEntry }` to `Widgets.attachSection`.
- `src/attachments.js` (`window.Attachments`) and `src/backup.js` (`window.StackdBackup`) shells
  with script tags; `src/libs/pdf-lib.min.js` (pdf-lib 1.17.1 UMD, 525 KB, loaded last).
- `variables.css` tokens (`--trend-*`, `--ring-*`, `--shadow-lift`, `--dur-wiggle`, `--wiggle-deg`)
  and four marked append-only sections at the end of `components.css`.
- iOS `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription`; Playwright `reducedMotion: 'reduce'`.

## Unit rules (every unit)

1. Work only in your worktree, only in your owned regions (below). Commit WIP checkpoints on
   your branch; never touch `main` or the integration branch.
2. No `?v=` bumps, no CLAUDE.md or docs edits (the integrator does both).
3. i18n: every new string in all five dictionaries, appended at the END of each file under a
   `// 1.2.0 (UX-N) …` header (merge=union on integration). Whole-sentence plurals. Escape params,
   never `t()` output. `window.I18n.t(...)` in full.
4. Markup safety: every stored/imported text through `esc`/`escapeAttr` (views), `Components.esc`,
   `Widgets._esc`. Never add a top-level `esc` binding in another src file.
5. Every new sheet has a dismiss control (`[data-back-dismiss]`, `#modal-cancel-btn`,
   `.modal-btn-close`) or a backdrop-tap close. No `alert()`.
6. Dates through `Store._localYMD`/`_todayYMD`; money through `Store.formatCurrency`;
   percentages through `Store.formatPercent`.
7. Gates inside the unit: `npm run lint` (zero warnings) and targeted vitest files
   (run with the main checkout's node_modules:
   `node "<main>/node_modules/vitest/vitest.mjs" run <files> --maxWorkers=1`). Write e2e specs but
   do NOT run them (port 3000 is shared) — the integrator runs the suite once.
8. New tests go in NEW files unless a pinned contract changes; every new test must fail on the
   F0 commit (5c4faa4) without your change.
9. CSS rules go inside your marked section at the end of `components.css` (plus the named
   existing rules you own). Chart.js colours stay hex literals mirrored from the tokens.
10. Finish with a short `UNIT-NOTES.md` in the worktree root: what landed, deviations, tests, open points.

---

## Unit A — Home graph, pager, swipe tray, amount caret (UX-1, UX-3, UX-4, UX-8)

**Owned regions.** `views.js`: `Views.DashboardView` (429–826) only, plus the autofocus
`setTimeout(() => amountInput.focus(), 100)` in `AddTransactionView` (~2030). `store.js`: a new
`computeBalanceSeries` inserted right after `computeGraphBalances` (before `computeBalanceForecast`).
`components.js`: `NetFlowChart._themeColors` (2321–2334) and the dataset/colour block of
`ExpandedGraphModal.initExpandedChart` (3793–3816). `components.css`: the swipe block (595–695),
the `.amount-input` rule (279–290) and the `UX-1 / UX-3 / UX-4 / UX-8` section. `global.css`: one
`input, textarea { user-select: text }` rule next to `body`. i18n block `// 1.2.0 (UX-1/UX-3)`.
Tests: new `tests/unit/balanceSeries.test.js`, `tests/unit/homeGraphPager.test.js`,
`tests/unit/swipeTrayCss.test.js`; adjust `expandedGraphModal.test.js`,
`absoluteVarianceDisplay.test.js`, `graphXAxisScaling.test.js` only where the pinned string moves;
e2e `tests/e2e/home_graph.spec.js` (new); keep `accounts_lifecycle`/`mixed_currency_totals` green.

### A.1 Data — `Store.computeBalanceSeries({ range, accountIds = [], categoryIds = [] })`
- `range` ∈ `'1w' | '1m' | '6m' | 'ytd' | '1y' | 'max'`. Returns
  `{ range, points: [{ x, y, label, fullLabel, balance }], tickLabels: string[], baseline, start, end }`.
- `'1y'` delegates to `computeGraphBalances({ interval: 'monthly', … })` (same 12 points, parity with
  the tests that pin it); `tickLabels = monthLabels`.
- `'1w'`: 7 daily points ending today (labels `toLocaleDateString(getLocale(), { weekday: 'short' })`,
  fullLabel `{ month: 'short', day: 'numeric' }`). `'1m'`: 30 daily points, tick label every 7th day
  (`day: 'numeric'`), fullLabel as above. `'6m'`: weekly points over 26 weeks, tick label at the first
  point of each month (`{ month: 'short' }`). `'ytd'`: weekly points from Jan 1 of this year (minimum
  2 points; a January run shows daily points). `'max'`: monthly points from the earliest month among
  eligible rows (or 12 months back when there are none) to this month, ticks thinned so at most 12
  labels remain (`{ month: 'short', year: '2-digit' }`).
- ONE pass, never a `getBalanceAtDate` per point: select rows once with the aggregate rule
  (`isPaid !== false`, `aggregatePredicate(accountIds)`, category filter where rows without a
  categoryId pass, not before the account opening date — copy the predicate order of
  `getBalanceAtDate`), sort ascending by date, then walk the ascending cutoffs with a running sum
  (`_isPositiveTx` sign). Cutoffs are `'YYYY-MM-DD'` strings clamped to today
  (`Store._localYMD`). `baseline = points[0].balance`.
- Unit test: shapes per range, clamping to today, parity of `'1y'` with `computeGraphBalances`,
  a row before the opening date excluded, foreign-currency account excluded under `[]`,
  the running sum equals `getBalanceAtDate` at three random cutoffs.

### A.2 Palette — `Components.NetFlowChart._themeColors()`
Add `trendUp` (`#10b981` / dark `#34d399`), `trendDown` (`#ef4444` / `#f87171`), `trendUpRgb`
(`'16,185,129'` / `'52,211,153'`), `trendDownRgb` (`'239,68,68'` / `'248,113,113'`),
`baseline` (`#94a3b8` / `#64748b`), `surface` (`#ffffff` / `#161e2e`). Keep every existing key.

### A.3 Home markup (replace `views.js:575-577`; keep the header 540–573 intact)
```
<div class="home-pager" id="home-pager" data-horizontal-scroll>
  <section class="home-pane" data-pane="0">
    <div class="home-range-chips chart-toggle-group" role="group" aria-label="${t('dash.rangeAria')}">
      <button type="button" class="chart-toggle-btn hit-target [active]" data-range="1w" aria-pressed="…">1W</button> … 1m 6m ytd 1y max
    </div>
    <div id="chart-card-container" style="height: 160px; position: relative; cursor: pointer;" title="${t('dash.expandGraphTitle')}" role="button" aria-label="${t('dash.expandGraphAria')}"><canvas id="balanceChart"></canvas></div>
  </section>
  <section class="home-pane" data-pane="1" id="netflow-pane" role="button" aria-label="${t('dash.paneNetAria')}">
    <div class="home-pane-head"><span class="section-title">${t('dash.monthlyNet')}</span><span class="widget-card-caption">${t('widget.eomCaption')}</span></div>
    <div class="home-netflow-wrap" style="height: 160px; position: relative;"><canvas id="netflowChart"></canvas></div>
  </section>
</div>
<div class="home-pager-dots" role="group" aria-label="${t('dash.pagerAria')}">
  <button type="button" class="home-pager-dot is-active" data-pane="0" aria-pressed="true" aria-label="${t('dash.paneBalanceAria')}"></button>
  <button type="button" class="home-pager-dot" data-pane="1" aria-pressed="false" aria-label="${t('dash.paneNetAria')}"></button>
</div>
```
- `#chart-card-container` keeps its id, the inline `cursor: pointer` text and the title/aria
  (`expandedGraphModal.test.js:73-75`, e2e clicks). The `.filtered view / Reset` strip now appears
  only for an account/category subset — the saved interval is the expanded sheet's business.
- CSS (your section): `.home-pager { display:flex; scroll-snap-type:x mandatory; scrollbar-width:none;
  margin-inline: calc(-1*var(--container-pad-left,var(--space-4))) calc(-1*var(--container-pad-right,var(--space-4))); margin-bottom: var(--space-2) }`,
  `::-webkit-scrollbar { display:none }`, `.home-pane { flex:0 0 100%; width:100%; min-width:0;
  box-sizing:border-box; scroll-snap-align:start; scroll-snap-stop:always; padding-inline: var(--container-pad-left,var(--space-4)) var(--container-pad-right,var(--space-4)) }`;
  dots copy the `.widget-size-dot` geometry (8 px → 22 px pill, 40×32 hit halo). The
  `[data-horizontal-scroll]` attribute already grants `overflow-x:auto; touch-action: pan-x pan-y;
  overscroll-behavior-x: contain` (`components.css:2086-2093`) — do not loosen the global lock.
  Chips reuse `.chart-toggle-group/.chart-toggle-btn` (`1654-1683`); add `margin-bottom: var(--space-3)`.

### A.4 Balance chart (attachEvents)
- Range lives on the view object: `DashboardView._range` (default `'1y'`, session-only, survives
  re-renders, reset in `destroy()`? — NO, keep it for the session; reset only on app restart).
  Chip tap: set `_range`, toggle `.active`/`aria-pressed`, rebuild ONLY the balance chart (destroy +
  create, no dispatch). `render()` reads `_range` too so a later re-render agrees.
- Per pass compute once in `render()` and stash on `this._passGraph = { key, series, netBuckets }`
  (key includes range + saved accounts/categories); `attachEvents` reuses it.
- Dataset 0: `data: series.points`, `cubicInterpolationMode: 'monotone'`, `borderWidth: 2.5`,
  `borderColor: trend`, `fill: true`, scriptable `backgroundColor`:
  `(c) => { const { ctx, chartArea } = c.chart; if (!chartArea || !ctx || !ctx.createLinearGradient) return 'rgba(' + rgb + ',0.12)'; const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom); g.addColorStop(0, 'rgba(' + rgb + ',0.28)'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); return g; }`
  (cache by chartArea height on the chart object); `pointRadius: (c) => c.dataIndex === last ? 4 : 0`,
  `pointBackgroundColor: trend`, `pointBorderColor: pal.surface`, `pointBorderWidth: 2.5`,
  `pointHoverRadius: 6`. `trend = series.points[last].balance >= series.baseline ? trendUp : trendDown`.
- Dataset 1 (baseline): `data: [{x:0, y: baseline}, {x: last, y: baseline}]`, `borderColor: pal.baseline`,
  `borderWidth: 1`, `borderDash: [2, 4]`, `pointRadius: 0`, `fill: false`, `order: 1`,
  `_baseline: true`; `options.plugins.tooltip.filter = (item) => !item.dataset._baseline`.
- No per-account dashed datasets on Home (saves 12 scans per account per render; the expanded
  sheet keeps them).
- Options: `animation: { duration: 0 }`, `layout.padding { top: 8, right: 10, left: 2 }`, x linear
  `min 0, max last`, ticks callback → `series.tickLabels[idx] || ''`, and KEEP the literals
  `autoSkip: true`, `autoSkipPadding: 6`, `maxRotation: 45`, `minRotation: 0`, `width < 360 ? 9 : 10`
  (graphXAxisScaling.test.js greps views.js for them); y hidden; themed tooltip (title `fullLabel`,
  label `formatCurrency(y, currency)`).
- Lifecycle: `this._balanceChart` and `this._netflowChart` destroyed before create and in
  `destroy()` (e2e `home_widgets.spec.js:184-208` counts `Chart.instances`).
- Expanded sheet: same trend colour + gradient on its dataset 0 (per-account lines, legend and
  y axis unchanged).

### A.5 Net-flow pane
- `netBuckets = Store.computeNetFlowData({ period: { type: 'month', value: Store._todayYMD(), start: '', end: '' }, types: [], accounts: savedAccounts, categories: savedCategories, sortOrder: 'desc' })`
  — the SAVED `expandedGraphFilters.accounts` (`[]` = every base account), EOM semantics (no
  `clampEnd`), caption `widget.eomCaption`.
- `type: 'bar'`, labels = bucket labels, one dataset `net`, per-bar colour `rgba(trendUpRgb, 0.9)` /
  `rgba(trendDownRgb, 0.9)` for the current month and alpha 0.55 for earlier months,
  `borderRadius: 6`, `borderSkipped: false`, `barPercentage: 0.72`, `categoryPercentage: 0.8`,
  `animation: { duration: 0 }`, legend off, tooltip label `formatCurrency(y, currency)`, x ticks with
  the same font rule, y `display: true, ticks: { display: false }, border: { display: false },
  grid: { color: (c) => c.tick.value === 0 ? pal.baseline : 'transparent', drawTicks: false }`.
- Tap on `#netflow-pane` → `window.Router.navigate('#analytics')`.

### A.6 Pager behaviour
- `DashboardView._pane` (0/1). In `attachEvents`, BEFORE mounting charts:
  `if (this._pane) pager.scrollLeft = this._pane * pager.clientWidth` (synchronous, no smooth).
- `pager.addEventListener('scroll', …, { passive: true })` debounced 80 ms →
  `Math.round(scrollLeft / clientWidth)` → `_pane` + dot classes/aria. Dot tap →
  `pager.scrollTo({ left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })`
  (guard `matchMedia` for the unit mocks). Never dispatch for a pane change.
- The expand click handler stays on `#chart-card-container` (pane 1 only).

### A.7 UX-4 swipe tray (`components.css`)
`.swipe-container { background: transparent }` (keep `position: relative; overflow: hidden;
margin-bottom; border-radius`), `.swipe-action-btn.edit { background: var(--bg-surface) }` (keep its
border), keep the per-button shadow. Add `tests/unit/swipeTrayCss.test.js` (regex over the file, like
`touchTargets.test.js`'s `ruleFor`).

### A.8 UX-8 amount caret
`.amount-input { line-height: 1.15; padding: 0; height: auto; caret-color: currentColor; }`;
`global.css`: `input, textarea { -webkit-user-select: text; user-select: text; }` right after the
`body` rule; `views.js` autofocus delay 100 → 320 ms (past `--dur-view`). Pin the three rules in
`swipeTrayCss.test.js` (rename the file `homeCssFixes.test.js` if you prefer). Record in
UNIT-NOTES that the device check remains owner-only.

### A.9 i18n keys (×5)
`dash.rangeAria`, `dash.range.1w` (en `1W`, fr/it/es/pt `1S`), `dash.range.1m` `1M`,
`dash.range.6m` `6M`, `dash.range.ytd` `YTD`, `dash.range.1y` (en `1Y`, fr/it/es/pt `1A`),
`dash.range.max` (en/fr/it `Max`, es/pt `Máx`), `dash.monthlyNet` ("Monthly net"),
`dash.pagerAria`, `dash.paneBalanceAria`, `dash.paneNetAria`.

---

## Unit B — Widgets: accounts widget, drag & drop, size carousel, rings (UX-2, UX-5, UX-6, UX-7)

**Owned regions.** `widgets.js` (whole file). `components.js`: `AddWidgetModal` (3940–4217),
`CategoryDonutChart` (2511–2872) and a NEW `Components.RingChart` object inserted immediately
before `CategoryDonutChart`. `views.js`: `BudgetView` (3192–3722) and `AnalyticsView.attachEvents`/
`destroy` (378–423) — never `DashboardView`. `components.css`: the widget blocks (2268–2905) and the
`UX-2 / UX-5 / UX-6 / UX-7` section. i18n block `// 1.2.0 (UX-2/5/6/7)`. Tests: new
`homeWidgetsBalances.test.js`, `widgetDrag.test.js`, `ringChart.test.js`; update
`homeWidgets.test.js`, `homeWidgetsCharts.test.js` (cutout), `homeWidgetsTrends.test.js` (preview ids),
`homeWidgetsGoals.test.js`, `budgetEditor103.test.js`, `budgetOverspendDisplay.test.js` only where the
pinned contract moves; `widgetsI18nGuard.test.js` CONFIGS entry for the new type; e2e
`home_widgets.spec.js` rewrite of the size-carousel, swipe and edit-mode blocks + a drag test with
`page.mouse`.

### B.1 UX-2 `accountBalances` widget
- Registry entry right after `latest`: title/description getters (`widget.balances.title/desc`),
  `icon: 'landmark'`, `sizes: ['large']`, `hasConfig: true`, `defaultConfig: { accountIds: [] }`,
  `autoHeight: true`, `caption: () => t('widget.balances.caption')` ("Today").
- `_renderCard`: `if (def && def.autoHeight) classes.push('widget-card--auto')`; CSS
  `.widget-card--auto { height: auto; min-height: var(--widget-h-large) } .widget-card--auto .widget-card-body { overflow: visible }`.
- Data (memoised): accounts filtered by `cfg.accountIds` (empty = all), `balance = Store.getAccountBalance(id)`,
  grouped by `acc.type || 'Account'` in `Store.ACCOUNT_TYPES` order (unknown types appended),
  accounts alphabetical (state is already sorted). `inScope = Store.aggregatePredicate(cfg.accountIds)`;
  `sel = Store.aggregateSelection(cfg.accountIds)`; Total and subtotals sum only in-scope rows in
  `sel.currency`; foreign rows are listed in their own currency and `common.otherCurrencyExcluded`
  shows the count. Group label `Store.accountTypeLabel(type)` through `W._esc`.
- Markup: `.widget-balances` → `.widget-balances-total` (label `widget.balances.total` + value, sign
  colour) → per group `.widget-balances-group` (`.widget-balances-group-head` label + subtotal) →
  rows `.widget-balances-row[data-account-id]` (26 px icon circle in `acc.color`, name, value
  `text-income`/`text-expense`) → optional note. Rows 36 px, 12 px floor.
- `attach`: delegated row tap → `Router.navigate('#transactions?account=' + id)` unless
  `widgetEditMode`. `renderConfig`/`attachConfig` copy `incomeExpense` (multi-chips).
- Keys: `widget.balances.title/desc/caption/total/empty`.

### B.2 UX-5 long-press wiggle + drag reorder
- **Controller** `Widgets._attachDrag(grid, root, state)` called at the end of `attachSection`.
  Touch (`touchstart/touchmove/touchend/touchcancel`, `touchmove` registered `{ passive: false }` and
  `preventDefault()`ed only while a drag is active) and mouse (`mousedown` on the grid,
  `mousemove/mouseup` on `document`, removed on end). Ignore presses on `[data-widget-action]`.
- **Not in edit mode:** 450 ms hold (cancel on move > 8 px, on end, on `touchcancel`) →
  `navigator.vibrate(40)` (try/catch) → *pseudo edit*: add `is-editing` to the grid and to every card
  and inject `W._renderEditChrome(instance, i, total, isLarge)` into each card
  (`insertAdjacentHTML('afterbegin')`, then `StackdHydrateIcons(grid)`). No dispatch yet — a dispatch
  would replace the pressed node mid-gesture. The same gesture continues as a drag if the finger
  moves; on release dispatch `TOGGLE_WIDGET_EDIT_MODE` `true` (and `REORDER_HOME_WIDGETS` first when
  the order changed). The coalesced re-render reproduces the DOM you built, so nothing jumps.
- **In edit mode:** 150 ms hold then drag (a move before the hold is a scroll — let it go).
- **Drag:** ghost = `card.cloneNode(true)` → `.widget-drag-ghost` appended to `#app`
  (`position: fixed`, rect copied, `pointer-events: none`, `z-index: calc(var(--z-nav) + 1)`,
  `scale: 1.05`, `box-shadow: var(--shadow-lift)`), moved with `style.translate`; the original gets
  `.is-dragging` (`opacity: .35`, wiggle paused). On move: hit-test the other cards' rects
  (`Widgets._dropIndexFor(rects, x, y, fromIdx)` — a pure, unit-tested helper: nearest card by centre
  distance, insert before/after by the pointer's position relative to that card's centre on the axis
  the two share; large cards span the row). When the index changes, reorder the DOM with FLIP
  (First rects → move node → Last rects → inverse `translate` with `transition: none` →
  `void grid.offsetWidth` → transition `translate var(--dur-view) var(--ease-spring)` to `0px 0px`,
  clear on `transitionend`). Auto-scroll `#router-view` (`root`) when the pointer is within 56 px of
  the viewport top/bottom. On release: remove the ghost, release listeners, then dispatch
  `REORDER_HOME_WIDGETS { orderedIds: [...grid.querySelectorAll('.widget-card')].map(c => c.dataset.widgetId) }`
  when changed. `touchcancel`/Escape restores the original order.
- **Chrome** (`_renderEditChrome`): `.widget-remove-btn[data-widget-action="remove"]` becomes the x
  badge — top: 6px, right: 6px, 24 px circle, `background: var(--bg-surface-dim)`,
  `color: var(--text-primary)`, `box-shadow: 0 0 0 2px var(--bg-surface)`, icon `x`; keep the
  `.widget-edit-bar` (36 px) with the size pill and the gear; the move-up/move-down buttons STAY in the
  DOM with their `data-widget-action` and disabled logic (keyboard reorder; `homeWidgets.test.js:314-333`)
  but become `.visually-hidden`-style (1 px, clipped, focusable).
- **Remove confirm:** the x badge opens `Components.Modal.show({ title: t('widget.removeTitle'),
  content: <p>t('widget.removeBody')</p>, showDelete: true, deleteText: t('widget.removeConfirm'),
  saveText: t('common.cancel'), onDelete: close → REMOVE_HOME_WIDGET })`.
- **Wiggle (CSS):**
  ```
  @media (prefers-reduced-motion: no-preference) {
    .widgets-grid.is-editing .widget-card { animation: widget-wiggle var(--dur-wiggle) ease-in-out infinite alternate; transform-origin: 50% 50%; }
    .widgets-grid.is-editing .widget-card:nth-child(2n) { animation-direction: alternate-reverse; animation-delay: calc(-0.5 * var(--dur-wiggle)); }
    .widgets-grid.is-editing .widget-card.is-dragging { animation-play-state: paused; }
  }
  @keyframes widget-wiggle { from { rotate: calc(-1 * var(--wiggle-deg)); } to { rotate: var(--wiggle-deg); } }
  ```
  (`rotate`, not `transform`, so the FLIP `translate` is independent). Drop the static ring rule or
  keep it as the reduced-motion fallback.
- **Exit:** the Done pill and Android Back stay; add ONE `pointerdown`/`touchstart` listener on
  `root` in `attachSection` when `editMode` that dispatches `TOGGLE_WIDGET_EDIT_MODE` `false` when the
  target is outside `#widgets-section` and not inside `#modal-container`.
- Keys: `widget.removeTitle/removeBody/removeConfirm`, `widget.dragAria`, `widget.removeAria`.

### B.3 UX-6 size carousel (`AddWidgetModal.renderDetailStep` + `Widgets` preview)
- `#awm-preview` becomes `.awm-size-rail[data-horizontal-scroll]` (flex, `scroll-snap-type: x
  mandatory`, hidden scrollbar) with one `.awm-size-slide[data-size]` per size (`flex: 0 0 100%;
  scroll-snap-align: center; scroll-snap-stop: always`), each holding `W.renderPreview(type, size, …)`.
  Small slide: `.widgets-grid--preview.is-small { grid-template-columns: minmax(0, calc(50% - var(--space-3) / 2)); justify-content: center; }`.
- Preview ids: `W._previewId(size)` = `'__preview__'` for the first size, `'__preview__:' + size`
  otherwise (`homeWidgetsTrends.test.js` keeps `__preview__`); `attachPreview(backdrop, type, size, …)`
  selects by that id; `destroyPreview()` destroys every `_charts` key starting with `__preview__`.
- After the detail step renders, `attachPreview` for EACH size (two animation-free rAF mounts).
- Active slide: `scroll` listener (passive, 80 ms debounce) → `selectedSize`, `.awm-size-slide.is-active`,
  dots `.is-active`/`aria-pressed`, caption text (keep `syncSizeUi(size)` from `renderPreviewOnly`'s
  dot/caption part; the innerHTML swap and the `touchstart/touchend` swipe are deleted).
  Dot tap → `rail.scrollTo({ left: idx * rail.clientWidth, behavior })`. `scrollLeft` is restored on
  a config re-render.
- e2e: replace `home_widgets.spec.js:112-182` — click the large dot, assert the caption and
  `.awm-size-slide.is-active[data-size="large"]`; scroll the rail (`rail.scrollLeft = rail.clientWidth`
  + dispatch `scroll`) and assert the same; vertical drags irrelevant now.

### B.4 UX-7 rings — `Components.RingChart`
- `RingChart = { plugin: { id: 'stackdRing', afterDatasetsDraw(chart, args, opts) }, config(base, opts), _iconCache: {}, _iconImage(name, color) }`.
- `config(base, { animate, delay, badges, thick })`: `cutout` `'62%'` (`--ring-cutout`), dataset
  `borderWidth: 0`, `spacing: 2`, `borderRadius: 8`; `plugins: [RingChart.plugin]` at the config ROOT;
  `options.plugins.stackdRing = { badges, glow: true, theme }`; `options.animation = (animate && !reduced)
  ? { animateRotate: true, animateScale: false, duration: 700, easing: 'easeOutQuart', delay: delay || 0,
  onProgress: () => chart.$ringAnimating = true, onComplete: () => { chart.$ringAnimating = false; chart.draw(); } }
  : false`. `datasets[0].backgroundColor` STAYS the hex array (tests read `backgroundColor[0]`).
- Plugin: for each arc `getProps(['x','y','startAngle','endAngle','innerRadius','outerRadius'], true)`:
  (1) re-fill the arc path with a radial gradient (inner stop = base lightened 18 %, mid = base, outer
  = base darkened 14 %; small hex→hsl helper), (2) when `!chart.$ringAnimating` a glow pass:
  `globalCompositeOperation = 'destination-over'`, `shadowBlur = 14`, `shadowColor = rgba(base, glowAlpha)`
  (0.35 light / 0.5 dark), fill the same path; (3) badges when `opts.badges` and the ring radius
  ≥ 70 px: for arcs whose span × midRadius ≥ 22 px draw a 20 px circle in the base colour with a 2 px
  surface ring at the mid-angle on `(inner+outer)/2` and `drawImage` the cached white icon (16 px).
  Icon source: `window.lucide.createElement(window.lucide.icons[Pascal])` → `outerHTML` with
  `stroke="#fff"`, else `window.StackdIconSvg(name)`, else `'help-circle'`; SVG → data URL → `Image`;
  on load `chart.draw()`. Track-only arcs (`_track: true` on the dataset or index) get no gradient/glow/badge.
- Entry gating: `attachSection(root, state, opts)` stores `W._entryPass = !!(opts && opts.isEntry)`
  for the attach loop (F0 already passes it); `_mountChart(id, canvas, config, mountOpts)` keeps forcing
  `animation = false` UNLESS `mountOpts && mountOpts.animate`; `categories.attach` and `budgets.attach`
  pass `{ animate: W._entryPass }` (preview never animates). `BudgetView.attachEvents(container, state,
  isEntry)` and `AnalyticsView.attachEvents(container, state, isEntry)` pass `animate: !!isEntry`;
  `CategoryDonutChart.attachEvents(container, filters, currency, { animate })` threads `animate: false`
  through its toggle recursion. Entry mounts use `delay: 250` (the view-transition snapshot).
  `config()` forces `animate = false` under `matchMedia('(prefers-reduced-motion: reduce)')` (guarded).
- Sites: categories widget (badges in the large size only; cutout test → `'62%'`), budgets small ring
  (no badges), Analytics donut (badges), Goals ring: `renderList` collects `segments = [{ cat, spent }]`
  of budgeted rows; `chartData = overspent ? [1, 0] : [...segments.map(s => s.spent), remaining]`,
  colours per segment via `CategoryDonutChart._assignColors` + the track; keep `backgroundColor[0] === '#ef4444'`
  when overspent. Update `budgetEditor103.test.js`/`homeWidgetsGoals.test.js` fixtures deliberately.
- Goals rows: the `.budget-used-pct` text moves inside a 36 px inline SVG ring
  (`<svg class="budget-row-ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="budget-row-ring-track"/><circle class="budget-row-ring-fill" style="stroke: ${barColor}; stroke-dasharray: C; stroke-dashoffset: C*(1-pct/100)"/></svg><div class="budget-used-pct">195%</div>` — keep the
  `'>195%</div>'` substring and the bar below it with its `width: N%` strings). Sweep:
  `@keyframes budgetRingIn { from { stroke-dashoffset: var(--ring-c) } }` applied by
  `.budget-list.is-entering .budget-row-ring-fill` under `prefers-reduced-motion: no-preference`;
  `BudgetView.attachEvents` adds `is-entering` only when `isEntry`.
- CSS: `.widget-donut`/`.donut-chart-container` get `filter: drop-shadow` only if the canvas glow is
  dropped for performance — default is the canvas pass.
- Tests: `ringChart.test.js` (config shape, animation false when not entering / object when entering /
  false under reduced motion, plugin registered at root, hex array untouched), lifecycle tests stay green.

---

## Unit C — Category-scoped tags (UX-9)

**Owned regions.** `store.js`: `getAllUniqueTags` (and new helpers right after it), new reducer
cases inserted right after `DELETE_CATEGORY` (3291) plus a hook inside `DELETE_CATEGORY`, the lazy
index nulls (`_reduce` head 1989–1992, `_sortData` 636–639, `dryRun` 1870–1873), `_healTagLinks`
defined next to `_healMultilineNotes` (4276–4285) and called after it at boot (576).
`components.js`: replace `Components.TagsModal` (2874–3067) with `Components.TagPickerSheet`.
`views.js`: `AddTransactionView` tags markup (1778–1785), tag handlers (2329–2403), pending-text
commit (2462–2465); `TagsView` (3769–3846) only if you add link info. `export.js`:
`exportCategories` (243–249). `import.js`: `isCategoryRows`/`buildCategories` (2207–2277).
i18n block `// 1.2.0 (UX-9)` + the manual/FAQ copy (`faq.tags.a`, `manual.addTx.tags.d`,
`manual.tags.add.d`, `manual.tags.lifecycle.d`) ×5. Tests: new `tagLinks.test.js`,
`tagPickerSheet.test.js`; delete `tagInputFormatting.test.js`; update `markupSafety.test.js:207-218`
(open the sheet, type into `#tps-search`), `escapeGuard.test.js` sheets map (TagsModal →
TagPickerSheet), `csvRoundTrip.test.js`/`categoryDuplicateImport.test.js` for the new column; e2e
`tests/e2e/tag_picker.spec.js` (new).

### C.1 Model
- `state.tagLinks = { [tag]: categoryId[] }` (F0). Keys are `Store.normalizeTag` output. A key with
  `[]` is an explicitly created, unlinked tag. Links a saved transaction implies are derived.
- Lazy index `_ensureTagCatIdx()` → `{ byCat: Map<categoryId, Set<tag>>, byTag: Map<tag, Set<categoryId>> }`
  over `state.transactions` (rows with a non-empty `categoryId` and tags; every saved row, no
  aggregate rule). Nulled wherever `_importKeyIdx` is nulled.
- Getters: `getAllUniqueTags(query)` = transaction tags ∪ `Object.keys(tagLinks)`, sorted with
  `compareAlpha`; `getTagsForCategory(categoryId)` → `{ linked: [], others: [] }` (linked = explicit ∪
  derived, alphabetical; others = all − linked; `''` → `{ linked: [], others: all }`);
  `getTagLinks(tag)` → explicit ∪ derived ids.
- Actions (braced cases): `LINK_TAG { tag, categoryId|null, silent }` (normalise; create the key;
  push an existing category id; save only on change; `changed = !silent`), `UNLINK_TAG { tag, categoryId }`,
  `DELETE_TAG { tag }`, `SET_TAG_LINKS { links, merge }` (restore path; silent by default).
  `DELETE_CATEGORY`: strip the id from every link in the same change. Boot heal `_healTagLinks`:
  normalise keys, drop unknown category ids and sentinels, save only when changed, skip entirely when
  any transaction names an unknown category (unreadable-categories guard, `store.js:567` spirit).

### C.2 Picker — `Components.TagPickerSheet.show({ selectedTags, categoryId, typeHint, onApply })`
- Full-screen sheet `#tag-picker-sheet` on the `CategorySelectionModal` shell: `.modal-top-bar
  .modal-top-bar--safe` with `#tps-close` (`.modal-btn-top.modal-btn-close`, ✕), `#tps-title`
  (`tagPicker.title`), `#tps-add` (`.modal-btn-top`, +, `tagPicker.addAria`), `#tps-apply`
  (`.modal-btn-top.tps-apply`, ✓ primary, `tagPicker.applyAria`).
- Body: `#tps-search` (`.form-control`, placeholder `tagPicker.search`, `autocomplete="off"`) filtering
  both lists (lowercase substring); selected chips strip `#tps-selected` (removable, `tagChip`
  look); section `tagPicker.inCategory {category}` with `getTagsForCategory(categoryId).linked`
  (hidden when no category / transfer); section `tagPicker.allTags` with `others`; rows
  `.list-item.touch-target.tps-row[data-tag]` showing `#tag` + a check when selected; tap toggles;
  empty state `tagPicker.none`. "+" (or Enter in the search box): `Store.normalizeTag(search)`; empty →
  ignore; existing → select; new → add to `selected` and `created`, clear the search.
- ✓ → `onApply(selected)` then, silently, `LINK_TAG { tag, categoryId, silent: true }` for every
  selected tag not yet linked to `categoryId` (when set) and `LINK_TAG { tag, categoryId: null,
  silent: true }` for created tags without a category. ✕ / Back / backdrop → nothing.
- Escape every tag and category name with `window.Components.esc`.

### C.3 Form
- The tags group keeps `<label for="tx-tags-input">`, `#tx-tags-container.form-control` (chips via
  `tagChipHtml`, removable inline) and a readonly `<input id="tx-tags-input" inputmode="none"
  placeholder="form.addTagPlaceholder">` as the trigger (markupSafety and the label contract), plus a
  trailing chevron. `pointerdown`/`click` (preventDefault + blur) and Enter/Space open the sheet with
  `categoryId: categorySelect.value`, `typeHint: typeInput.value`, `selectedTags: currentTags`;
  `onApply` sets `currentTags` and `renderTags()`. Delete the keydown commit, the debounce/autocomplete,
  the `#tx-tags-autocomplete` div, the document click listener and the pending-text commit on save.
  `captureDraftTxFormState` needs no change (chips carry `data-tag`).
- Transfers: the sheet opens with no category (all tags).

### C.4 Backup
`exportCategories` header `id,name,icon,type_hint,tags` with the explicitly linked tags of that
category pipe-joined; `buildCategories` reads `row['tags']` through `_parseTags` and, after the
category exists, dispatches `SET_TAG_LINKS { links: { [tag]: [categoryId] }, merge: true }` (silent).
Older 4-column files restore as before. Accepted limit: an explicitly created tag with no category and
no transaction is not in the backup.

### C.5 Keys
`tagPicker.title/closeAria/addAria/applyAria/search/inCategory {category}/allTags/none/created`,
`form.tagsNone` ("No tags"); revise the four manual/FAQ strings.

---

## Unit D — Attachments and receipts PDF (UX-10)

**Owned regions.** `src/attachments.js` (whole). `components.js`: `TransactionItem.render` date
cell (949) for the badge; new `Components.AttachmentSheet` + `Components.AttachmentViewer` inserted
right after `ImportExportSheet` (4998). `views.js`: `captureDraftTxFormState` (126–168), the draft
restore (1666–1686), a new `#group-attachments` card right after the Recurrent card (after 1824), a new
attachments block in `attachEvents` placed after the note autocomplete listener (~2456), the four
dispatch payloads (2673–2787), `ExportView` row + handler (5031–5038, 5042–5087). `store.js`:
`_processRecurringTransactions` (strip at 1413), `propagate()` (strip at 2427), `ADD_TRANSFER`
(2562–2603, expense leg), `UPDATE_TRANSFER` (2704–2729), id collection in `DELETE_TRANSACTION`
(2881–2916), `DELETE_BULK_TRANSACTIONS` (2999), `DELETE_ACCOUNT` (2096), `RESET_APP` (3477),
`_settleChange` (1881–1896) and the boot sweep after `_processRecurringTransactions()` (577).
`export.js`: `_shareNative` (34–71) binary support, `TX_HEADERS` + row (352–364, 401),
`buildReceiptsPdf`/`exportReceiptsPdf` appended at the end of the object. `import.js`:
`buildTransactions` attachments column (604–605 region). `router.js`: `_formSnapshot` (88).
i18n block `// 1.2.0 (UX-10)`. Tests: new `attachments.test.js` (fake-indexeddb + a Filesystem mock
like `db-native.test.js`), `attachmentSheet.test.js`, `exportReceipts.test.js` (PDFLib stub),
`txAttachmentsStore.test.js`; update `draftTxPreservation.test.js`, `androidBack.test.js`,
`csvRoundTrip.test.js`, `escapeGuard.test.js` sheets map; e2e `tests/e2e/attachments.spec.js`.

### D.1 `window.Attachments`
- `isNative()`, `add(txId, { blob|bytes, name, mime }) → meta`, `read(meta) → Uint8Array`,
  `displayUrl(meta) → string` (native `Capacitor.convertFileSrc(getUri)`, web `URL.createObjectURL`),
  `revoke(url)`, `remove(meta)`, `removeAll(metas)`, `sweep(liveTxIds)`, `usage()`. Promise-only,
  never throws (resolve `null`/`false` and `console.error`).
- Native: `Filesystem.writeFile({ path: 'stackd_attachments/<txId>/<id>.<ext>', data: base64,
  directory: 'DATA', recursive: true })` (no `encoding` → binary), `readFile` without encoding,
  `deleteFile`/`rmdir`. Access idiom copied from `db.js:198-202`. Web: IndexedDB `stackd_attachments`
  v1, store `files` keyPath `id`, index `txId`, records `{ id, txId, blob, name, mime, size, createdAt }`.
- Images are ALWAYS re-encoded before storage: `createImageBitmap` → canvas (max 1600 px) →
  `toBlob('image/jpeg', 0.82)` (normalises HEIC/PNG/orientation, bounds size). PDFs stored as-is,
  ≤ 10 MB. Max 8 attachments per transaction. Over a limit → `Components.NoticeSheet`.
- Metadata on the row: `attachments: [{ id, kind: 'image'|'pdf', name, ext, mime, size, addedAt }]`.
  `id = StackdDB.generateId()`.

### D.2 Form
- Card `#group-attachments` (same shell as `#group-paid`): `<strong>form.attachments</strong>` +
  `#tx-attachments-text` (`form.attachments.count.zero/one/other`), chevron; the whole row
  `role="button" tabindex="0" class="touch-target"` opens `AttachmentSheet`; below it a thumbnail
  strip `.tx-attachment[data-attachment="<id>"]` (image `<img src=displayUrl>`, PDF `file-text` tile,
  name ellipsised) with a labelled remove button; tap → `AttachmentViewer`.
- `AttachmentSheet.show({ onCamera, onLibrary, onPdf })` = `_bankSheet('attachment-sheet', …)`: title
  `attach.title`, body `attach.body`, buttons `#att-sheet-camera` (camera), `#att-sheet-library`
  (image), `#att-sheet-pdf` (file-text), `#att-sheet-cancel[data-back-dismiss]`; backdrop closes.
  The three hidden inputs live in the form: `accept="image/*" capture="environment"`,
  `accept="image/*"`, `accept="application/pdf,.pdf"` (zero plugins; iOS shows its own
  Camera/Library sheet, Android launches the camera intent because no CAMERA permission is declared).
- View-local `currentAttachments` (metas) mirrors `currentTags`: new files are written to storage
  immediately (so a thumbnail can show); files added then removed before save are deleted; on
  Cancel/close of a NEW log the added files are deleted (`destroy()` + the ✕ link); on save the
  payloads carry `attachments: currentAttachments`. Draft capture/restore includes `attachments`.
- `AttachmentViewer.show({ meta, txId })`: full-screen `_bankSheet` with the image (object-fit
  contain), a Share button (native `Share.share({ files: [uri] })` from a CACHE copy, web
  `window.open(objectUrl)`), a Delete button and `.modal-btn-close`. PDFs open the share/open path
  directly.
- `TransactionItem`: a `paperclip` + count badge next to the date (`tx.attachmentsCount.one/other`
  as aria-label), `.tx-attach-badge`.

### D.3 Store
- Keep `attachments` out of generated series members (`delete gen.attachments` next to `isPaid`) and
  out of `propagate()`; transfers store it on the EXPENSE leg only (`ADD_TRANSFER`/`UPDATE_TRANSFER`
  patch field by field). Deletions collect metas into `this._attachmentsToDrop`; `_settleChange`
  hands them to `Attachments.removeAll` only when the change landed and not inside `dryRun`
  (`window.StackdDB._dry`). Boot sweep: `Attachments.sweep(new Set(ids))` fire-and-forget after the
  heals. `RESET_APP` wipes the folder/store.
- CSV: `TX_HEADERS` += `Attachments` (JSON array of metas, ids through `Store.fileId` on restore,
  bytes never exported) — a same-device restore re-links files; new device → dangling metas render
  as "file missing" in the viewer (accepted limit, documented in the CLAUDE.md update by the integrator).

### D.4 Receipts PDF
- `StackdExport.buildReceiptsPdf(state, { period, includePlanned }) → Promise<Uint8Array|null>` with
  `window.PDFLib`: rows with attachments in the Export period (same filter as `buildLedger`), ordered by
  date; one A4 page per image (`embedJpg`/`embedPng`, scaled to fit, caption line: date · account ·
  category · amount · note, Helvetica, WinAnsi-sanitised), PDFs appended with `copyPages` after a
  caption page. `exportReceiptsPdf(state, opts)`: native → `Filesystem.writeFile({ path: 'exports/<name>',
  data: base64, directory: 'CACHE', recursive: true })` + `Share.share` (extend `_shareNative` with
  `{ base64 }`), web → Blob download; no attachments → `NoticeSheet` info. File
  `Stackd_receipts_<stamp>.pdf`.
- `ExportView`: fourth row `#export-receipts` (`paperclip`, `export.receipts`, subtitle
  `export.receiptsCount.zero/one/other` for the period) → runs the export; web success → NoticeSheet.

### D.5 Keys
`form.attachments`, `form.attachments.count.zero/one/other`, `attach.title/body/camera/library/pdf/
remove {name}/tooMany/tooLarge/failed/missing/share/delete/deleteConfirm`, `tx.attachmentsCount.one/other`,
`export.receipts`, `export.receiptsCount.zero/one/other`, `export.receiptsNone`, `export.receiptsDoneBody`.

---

## Unit E — Backup page (UX-11)

**Owned regions.** `src/backup.js` (whole). `export.js`: `_download` (5–27) gains a sink
(`StackdExport._sink`: when set, `_download` calls `_sink(filename, content)` and returns `true`
instead of downloading/sharing). `import.js`: `analyzeText` kinds (3224–3249) and `importText`
routing (3329–3364) for the JSON bundle (before the camt/MT940 sniff). `views.js`: `BackupView`
(4355–4516) only. `store.js`: `SET_BACKUP_PREFS` / `APPEND_BACKUP_LOG` cases right after
`SET_EXPORT_PREFS` (3731) and `normalizeBackupPrefs`/`getBackupPrefs` after `getExportPrefs` (4473).
`main.js`: schedule `StackdBackup.maybeDaily()` next to `BankConnect.refreshOnOpen` (665–669) and in
the visibility/resume handlers (641–647). Native: `plugins/stackd-cloud/` (new local Capacitor plugin),
`package.json` dependency `"stackd-cloud": "file:plugins/stackd-cloud"`, `npx cap sync android`
output (settings.gradle, capacitor.build.gradle, capacitor.plugins.json), hand-edited
`ios/App/Podfile` + `ios/App/App/capacitor.config.json` `packageClassList`, `App.entitlements`
(iCloud container `iCloud.com.stackd.finance`), `Info.plist` `NSUbiquitousContainers`.
i18n block `// 1.2.0 (UX-11)` + `manual.others.backup.*` copy. Tests: new `backup.test.js`,
`backupView.test.js`, `nativeWiring.test.js` additions; e2e `tests/e2e/backup_page.spec.js` (web).

### E.1 Bundle
`{ format: 'stackd-backup', version: 1, createdAt, app: 'Stack\'d 1.2.0', language, files: {
accounts, categories, transactions, loans, budgets, importRules } }` where each value is the exact
text the six backup exporters produce (collect them through `_sink`). Restore: `analyzeText` →
`{ kind: 'bundle' }`; `importText(text, { mode: 'restore' })` parses, verifies `format`, then runs
the six texts through the existing restore routes in ONE `Store.batch` in the order accounts →
categories → transactions → loans → budgets → rules, returning a combined result for one NoticeSheet
(counts per file). `checkText` on a bundle returns the same figures under `dryRun`.

### E.2 `window.StackdBackup`
- `target()` → `'icloud' | 'documents' | 'download'` (`Capacitor.Plugins.StackdCloud` available →
  icloud; native else documents; web → download). `list()`, `write(name, text)`, `read(name)`,
  `remove(name)` per target. iOS documents = app `DATA` folder `Stackd Backups/` (private, listed by
  the page; "Share" hands a copy to the system sheet); Android = `Directory.DOCUMENTS`
  `Stackd Backups/` (visible in Files; on failure (API ≤ 29 permission) fall back to `DATA`).
- `backupNow({ kind: 'manual'|'auto' })` → builds the bundle, writes `Stackd_backup_<stamp>.json`
  (auto: `Stackd_auto_<stamp>.json`), prunes auto files beyond the 10 newest, dispatches
  `APPEND_BACKUP_LOG` (entry `{ id, at, kind, target, name, bytes, ok, error }`, capped at 20) and
  `SET_BACKUP_PREFS { lastAutoAt }` for auto runs. Manual on web = download.
- `maybeDaily()`: `prefs.daily && (now − lastAutoAt) ≥ 24 h`, never while `StackdExport._busy`,
  `StackdDB._dry`, a pending save failure, or within 3 s of boot; silent; one failure NoticeSheet per day.
- `restoreFrom(name)` (native list) and the file picker path both end in `importText(…, { mode: 'restore' })`.

### E.3 Page (`Views.BackupView`)
Cards in order: (1) **Automatic backup** — toggle `#toggle-backup-daily` (`backup.auto`,
subtitle = destination + last backup time via `backup.lastAt {when}` / `backup.never`), primary
`#btn-backup-now` (`backup.now`); hidden on the web build (download only); (2) **Recent backups**
(`backup.logTitle`): rows from `state.backupLog` newest first (`Views._fmtDay`-style date, kind,
name, size, ok/error), native rows get a `backup.restoreThis` action with a confirm
(`Components.Modal.show`), empty state `backup.logEmpty`; (3) **Restore** — the existing card
(`#import-csv-file` accept += `.json,application/json`, `#btn-import-csv` text `backup.restoreBtn`)
routed through `_bindRestoreFile` (bundles → the combined NoticeSheet); (4) **Export individual
files** — the existing six buttons (ids unchanged) under `backup.filesTitle`. Keep
`#btn-open-backup` on Settings; Settings subtitle `others.backupDesc` mentions automatic backups.

### E.4 `stackd-cloud` plugin (iOS Swift, Android no-op)
`plugins/stackd-cloud/package.json` (capacitor plugin layout, `"capacitor": { "ios": { "src": "ios" }, "android": { "src": "android" } }`),
`StackdCloud.podspec`, `ios/Sources/StackdCloudPlugin/StackdCloudPlugin.swift`
(`CAPPlugin, CAPBridgedPlugin`; `jsName: "StackdCloud"`; methods `available()`, `write({ name,
data })`, `read({ name })`, `list()`, `remove({ name })` using
`FileManager.default.url(forUbiquityContainerIdentifier: nil)?.appendingPathComponent("Documents/Stackd Backups")`,
`startDownloadingUbiquitousItem` before a read, UTF-8 text), Android `StackdCloudPlugin.java`
(`available` → false, others reject). No web implementation (the JS side feature-detects).
Mark in UNIT-NOTES: the Swift side cannot be compiled on this machine; the owner's Mac build must
enable the iCloud capability on the App ID.

### E.5 Keys
`backup.auto/autoDesc/now/lastAt {when}/never/target.icloud/target.documents/target.download/
logTitle/logEmpty/kind.auto/kind.manual/kind.restore/restoreThis/restoreConfirmBody/doneTitle/doneBody/
failedTitle/failedBody/filesTitle/restoredBody {counts}`; `others.backupDesc` revised.

---

## Integration (the integrator, after units)

1. Review each branch (adversarial read of the diff against this doc), fix in the branch.
2. `git merge` A → B → C → D → E into `feature/ux-review-1.2` with
   `src/i18n/*.js merge=union`, `src/styles/components.css merge=union`, `src/styles/variables.css merge=union`
   in `.git/info/attributes` (removed afterwards); resolve the rest by hand.
3. Bump `?v=` of every touched `src/*.js` to **82** (i18n ×5, store, components, widgets, views,
   router, export, import, main, attachments, backup, insights if touched); CSS has none.
4. `npm run lint` → `npm test` → `npm run test:e2e` → `npm run version:check`; preview verification
   (Home pager/chips, widget drag with the mouse, add-widget rail, rings, tag picker, attachments on
   the web build, backup download/restore); fix forward.
5. CLAUDE.md (new sections: tag links, attachments, backup bundle, ring charts, drag reorder,
   `?v=`), `docs/home-widgets-plan.md` §8f, this doc's "As built", release notes.
6. Ask the owner before landing on `main` (squash merge, one commit).

## Decisions (recommended default first)

| # | Decision | Recommended | Alternative |
|---|---|---|---|
| 1 | Version | 1.2.0 (10200) | 1.1.1 — unsafe, TestFlight may have used 10101+ |
| 2 | Per-account dashed lines on Home | Dropped (sheet keeps them) | Keep faint behind the vivid line |
| 3 | Range chips | Session-only, default 1Y; the saved interval only drives the sheet | Persist in expandedGraphFilters |
| 4 | Pane 2 current month | End of month (header/widgets parity, caption) | Month-to-date |
| 5 | Balances widget | Large-only, auto height | Small + auto height (stretches its row partner) |
| 6 | Delete badge | Top-right x with "Remove widget?" confirm | Immediate removal |
| 7 | Arrows | Kept visually hidden for keyboard/tests | Removed |
| 8 | Wiggle | On (rotate ≤ 1.2°, off under reduced motion) | Static ring only |
| 9 | Ring thickness / badges | cutout 62 %, badges when radius ≥ 70 px | Badges everywhere |
| 10 | Sweep | Entry only (+250 ms after a navigation), never on dispatch | Also on in-view toggles |
| 11 | Amount caret | Keep and fix the box; autofocus after the transition | Hide (`caret-color: transparent`) |
| 12 | Tag model | Persisted explicit links + derived links; categories CSV `tags` column | Derived only |
| 13 | Tag normaliser | `Store.normalizeTag` (unicode + spaces kept, `|`/`,` dropped) | Form's ASCII regex |
| 14 | Attachment capture | File inputs, no plugin, web parity | `@capacitor/camera` |
| 15 | Attachments in backups | Metadata column only; bytes never exported | zip bundle |
| 16 | Backup format | JSON bundle of the six CSV texts | zip |
| 17 | iOS destination | iCloud Drive via local plugin; app Documents fallback | Files-visible Documents (exposes stackd_db) |
| 18 | Android destination | Public Documents (+ the OS Auto Backup already on) | Google Drive API — contradicts the no-network posture |
| 19 | Daily | Opportunistic on open/resume ≥ 24 h | Background task — none exists |

## Accepted limits / owner items
- The iCloud plugin ships as source; it needs the Mac build (pod install), the iCloud capability on the
  App ID and a device check. Without it the page falls back to the app's Documents folder.
- Attachment bytes are not in any backup; a restore on a new device shows "file missing".
- Explicit tags with no category and no transaction do not survive a CSV restore.
- Store listing / privacy: camera and photo-library usage strings, review notes ("no user-generated
  content" is no longer true), and the "no cloud" sentences must be reviewed by the owner (the app
  still sends nothing anywhere; iCloud Drive is the user's own account).
- Android API ≤ 29: public Documents may be refused; the backup then lands in the app folder.

## As built
Units A–E were implemented in worktrees, adversarially reviewed and fixed, then merged
into `feature/ux-review-1.2` (merge commits b0c24ae…9900bb4). Every touched script is at
`?v=82` (router.js and insights.js were not touched). Deviations worth knowing:

- **A (UX-1/3/4/8).** `'1y'` builds its own 12 cutoffs (parity with `computeGraphBalances`
  pinned to the cent) to keep the one-pass rule; balances round to cents so a flat line is
  never "down"; the baseline has one point per curve point (tooltips never show it); fill to
  the plot bottom; only labelled positions become ticks. The pane resets to the curve when
  Home is left, the chip survives for the session. `mixedCurrencyViews.test.js` now checks
  the € figures on both charts (Decision 2 removed the per-account lines on Home). The
  `.amount-input` box fix also tightens the loan simulator's principal field.
- **B (UX-2/5/6/7).** Hit test: the card under the pointer before nearest-centre; layout
  offsets, not `getBoundingClientRect`. Single-size types (`accountBalances`,
  `fiftyThirtyTwenty`) show no size pill. Goals ring: no arc for categories with no spending,
  full track when nothing is budgeted. Row rings are 40 px. `RingChart` pads 6 px for the glow.
- **C (UX-9).** Apply links a tag only when it is not already linked (explicit ∪ derived).
  A tag created and deselected in the sheet is never saved. Tags screen gained ✕ for unused
  explicit tags. Prototype-named tags are plain tags; `__proto__` is rejected. `tagsModal.*`
  keys are unused (left in place).
- **D (UX-10).** Flat layout `stackd_attachments/<id>.<ext>`; cleanup by diff at settle;
  IndexedDB records hold an ArrayBuffer; ADD sends `attachments` only when there are some;
  a PDF tapped in the form goes to Share; HEIC the WebView cannot decode is refused
  (`attach.unreadable`); originals stored only when there is no canvas at all.
- **E (UX-11).** The web keeps "Back up now" (download); only the daily toggle is native.
  The page lists saved files (`#backup-files`, "Saved backups") besides the log. iOS
  fallback target is the app's private Documents (`DATA`). Prefs also carry `lastFailDay`
  (one failure sheet a day). No `Package.swift` (CocoaPods).

Integration fixes: the escapeGuard REACHED list (C + D seeds), the per-unit UNIT-NOTES
dropped from the tree, and the open minor review findings:
- the Home charts' fonts fall back to `system-ui, sans-serif` (the canvas painted before
  Manrope loaded and drew serif labels);
- edit mode ends on a **click** outside the widgets (capture phase, swallowed), not on
  `pointerdown`, so a scroll that starts outside keeps edit mode;
- the x badge sits 10 px in, so its 44 px halo is not clipped by the card;
- `.home-pane` gets 6 px top padding for the range chips' 48 px halo inside the scroller;
- the ring's entry delay and the "animating" glow skip apply to the first sweep only.
- `home_widgets.spec.js` waits for the splash before raw mouse gestures and scrolls the
  widgets back into view before the second long press.

**UX-8 after the device check (2026-11-05).** The tight line box did not cure the caret on
the owner's iPhone. First fix (2d120c6): `KeyboardManager` no longer smooth-scrolls a focused
field or re-scrolls on every visualViewport event. It still drifted after the owner scrolled
the form with the keyboard open (WebKit does not move the system caret with a scrolled
container), so Decision 11 became "draw our own caret": `Components.AmountCaret` on
`#tx-amount` and `#dsim-principal` (system caret hidden, a blinking bar in an invisible copy of
the text, split at the selection). Confirmed on the owner's iPhone in Safari.

Verified: lint clean; 169 unit files / 2,203 tests; e2e 121/121 (the one failure was the
spec timing above); `version:check`; browser preview (mobile, dark): pager both panes, chips,
account balances widget, glossy rings (Home + Goals), tag picker create/apply, attachment
sheet, backup page; no console errors. Known flaky under full-suite load: `debtView.test.js` "Storage is full
sheet survives the closing name prompt's teardown" (passes alone and on the base).

## Release notes (draft)
**Stack'd 1.2**
- A new Home chart: your balance as a clean trend line (green when it rises, red when it
  falls) with 1W · 1M · 6M · YTD · 1Y · Max. Swipe it to see each month's net in bars.
- New widget: Account balances — every account and its balance at a glance, no scrolling.
- Rearrange widgets like on your home screen: press and hold, then drag. Tap the ✕ to remove one.
- Choosing a widget size now slides between small and wide.
- Rounder, bolder charts for categories and budgets, with icons and a short sweep when you open a page.
- Tags belong to categories: pick from the category's tags first, or create one with +.
  No more tags committed by an accidental space.
- Attach receipts to a transaction: take a photo, pick one from your library, or add a PDF.
  Export all your receipts as one PDF.
- New Backup page: back up everything into one file, restore it in one tap, see your recent
  backups, and turn on a daily backup (iCloud Drive on iPhone, the device's Documents folder on Android).
- Smoother History swipe buttons and a steadier cursor in the amount field.

