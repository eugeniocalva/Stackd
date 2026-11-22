# Analytics breakdown — every category, tags and transactions in place

**Status: decisions taken 2026-11-22 (owner). Not built yet.**
Comment tag: `// 1.3.2 (AB-N)` (a working tag; the version is decided at release).

## Why

On Analytics the donut folds every category past the fifth into **Others**,
and Others has no breakdown at all. A real category opens an accordion of its
tags, but every tag (and "All N transactions") jumps to History with filters
set, so reading where the money went means leaving Analytics each time.

MoneyStats (the owner's screenshots, 2026-11-22) does it in place: every
category is on the ring and in the list, slices that are wide enough carry
their %, a row slides to show **Tags** and **List**, tags open under their
category with a count ring, and a tag or the list opens a sheet of
transactions with a Σ total that pulls down to close.

## Decisions

| # | Topic | Decision |
|---|---|---|
| D1 | Row tap | A tap **or** a sideways swipe slides the row left and shows two round buttons, **Tags** and **List**. A second tap, a scroll or a tap elsewhere closes it; one row open at a time. |
| D2 | Tags | **Inline under the row.** Each tag row: a ring filled by the tag's share with the count inside, `#tag`, the share and the amount. "No tag" last. Tags again closes. |
| D3 | Transaction sheet rows | **A tap opens the transaction** in the edit form; saving, deleting or closing it comes back to Analytics. |
| D4 | Slice tap | **Focus + mark the row**: today's focus (bigger slice, centre readout) without the badge, and the category's row is scrolled into view and highlighted briefly. |
| D5 | Colours | The palette grows to **12 colours** (3:1 on both themes, no red). Past 12 a colour may repeat, never on neighbouring slices. |
| D6 | % on slices | Shown **only where the text fits** inside its arc (whole numbers); the Analytics ring grows to the card width (about 280 px) with a thicker band. |
| D7 | Income | Expenses and Income behave the same. |
| D8 | Home tile | The Home categories widget, Goals and the Smart Insights split bar **keep the fold** (5 + Others). Only Analytics lists everything. |

## Units

### AB-1 — Every category on the Analytics ring (M)

- `CategoryDonutChart.render` stops calling `_capData` for Analytics; it takes
  every category with a value, biggest first. `_capData` stays for the Home
  widget (`widgets.js:636`) and Insights (`insights.js:258`) — D8.
- The legend lists every category; `__others__` disappears from Analytics.
- `CategoryRing.layout` / `hitZones` / `overlayHtml` already take any number of
  slices. With many tiny slices the 24° halo (MIN_ZONE) of neighbours can
  overlap: a drawn slice always answers for itself (existing rule); halos only
  fill the track. Check: 20 categories, five under 1 %.
- The accessible `.ring-arc-btn` buttons: one per category (fine for a screen
  reader; they are in ring order).

### AB-2 — Percentages on the slices (M)

- A small Chart.js plugin for the Analytics ring only (`CategoryRing.labelPlugin()`):
  after the arcs draw, for each slice whose text fits — chord at the band's
  middle radius ≥ text width + 6 px, and band thickness ≥ text height + 4 px —
  write `Store.formatPercent(share, { digits: 0 })` at the arc's middle, in
  white or near-black by the slice colour's contrast. Masked balances do not
  hide percentages (HG-4 rule: percentages stay).
- This is a deliberate exception to HG-5's "nothing painted over Chart.js";
  Goals and Home stay plain. The focus plugin moves radii while drawing — the
  label plugin reads the same radii so a focused slice's label moves with it.
- The ring box grows from 220 px to `min(card width − 2·padding, 300 px)`
  (about 280 px on a phone) and the cutout from 66 % to about 58 % on Analytics
  only, so the band is ~45 px. The centre keeps "Total" + amount.
- With focus on a slice the other labels stay; the badge (icon + share) is
  dropped on Analytics (D4) since the slice already shows its %.
- Large text (root ≥ 20 px): labels are drawn at the same size as today's
  readout rule allows; if none fit, the ring has none — the list carries it.

### AB-3 — Twelve colours (S)

- `CategoryPalette.SLOTS` grows from 8 to 12; the four new hues are picked and
  checked ≥ 3:1 against both card backgrounds (a unit test computes it), none
  red, none too close to an existing slot (ΔE floor in the test).
- `assign()` stays unique per ring up to 12; past 12 it reuses the slot of the
  category farthest away on the ring, never a neighbour (and never the first
  slice's colour for the last slice, since they touch).
- Default categories keep their slots. **Custom categories are hashed over 12
  instead of 8, so their colour changes once on every ring** (Home, Goals,
  Analytics, Insights) — accepted; noted in release notes.

### AB-4 — Row actions: Tags and List (M)

- Each legend row becomes a swipe row in the History style (`.swipe-container`,
  `touch-action: pan-y`, the same open width as History's two actions):
  **Tags** (`tag` icon) and **List** (`list` icon) behind it on the right.
- A tap on the row opens it (D1); a sideways drag opens or closes it; a tap on
  the open row, a scroll of the page or a tap outside closes it. One open row.
  The gesture code is History's `_wireRows` logic — lifted into a small shared
  helper rather than copied, and History moves onto it.
- Keyboard and screen readers: the row is a button that opens the actions;
  Tags and List are real buttons with labels ("Tags of Housing",
  "Transactions of Housing"), reachable by Tab once open; Escape closes.
- The old accordion (`_expandedCatId`, `fillPanel`, `openInHistory`) is
  removed, with its hard-coded English "All N transactions".

### AB-5 — Tags under the category (M)

- **Tags** closes the row's actions and opens `.donut-tag-panel` under it
  (the existing panel slot), filled from `Store.computeCategoryTagBreakdown`.
- Tag row: a 36 px count ring (`Components.CountRing`, SVG, no Chart.js) filled
  by the share in the category's colour, the count inside; `#tag`; share
  (`formatPercent`, one decimal); amount. "No tag" last, with the same ring.
- A row tagged twice counts under both tags, so the shares may add up to more
  than 100 % — this is how the breakdown already works; the rings show each
  tag's share of the category, not a split.
- Tapping Tags on an open panel closes it; the open panel survives a
  re-render (like `_expandedCatId` today) and closes on the type switch.
- Tapping a tag row opens the transaction sheet for that category + tag
  (AB-6); "No tag" opens the untagged rows.

### AB-6 — The transaction sheet (M)

- `Components.TransactionListSheet.show({ title, subtitle, rows, total, currency })`:
  a bottom sheet (handle, title = category name or `#tag`, subtitle = the
  category + the period label), the rows as `TransactionItem` (no swipe,
  dates shown, grouped by nothing — newest first), and a Σ line with the total.
- **Pull down to close**: the drag-to-close of `Modal.show` (components.js
  ~285) lifted into a helper `_sheetSwipeClose(backdrop)` and used here (and
  available to other `_bankSheet` sheets later). Also the handle, a backdrop
  tap, a Done button (`data-back-dismiss`), Escape and Android Back.
- Rows come from the same filter as the ring (`getFilteredTransactions
  ('analytics')` + type + category [+ tag]), so the Σ equals the slice /
  tag amount. Unpaid and pre-opening rows are not in the ring, so they are not
  in the sheet either (the aggregate rule).
- Long lists: the sheet body scrolls; it renders all rows (a month rarely has
  more than a few hundred; a year view of a big category is checked with
  2,000 rows for scroll smoothness on the emulator).
- **List** opens the same sheet for the whole category.

### AB-7 — Opening a transaction from the sheet (S)

- A tap on a sheet row closes the sheet and opens `#edit?id=…&from=analytics`.
- The transaction form reads `from` (whitelist: `analytics`) and its save,
  delete and close leave to `#analytics` instead of `#transactions`
  (`leaveTo`). Back from the form also lands on Analytics (the entry
  underneath). The sheet is not reopened; the row the user came from stays
  open with its tag panel (singleton state, like the accordion today).

### AB-8 — Slice tap marks the row (S)

- `CategoryRing.wire`'s host gets an `onSelect(id)` hook; Analytics uses it to
  scroll the row into view (`block: 'nearest'`, no smooth scroll under reduced
  motion) and add `.is-marked` for 1.2 s (a soft background pulse).
- Clearing the focus (tap on the centre or the same slice) does nothing to the list.

## i18n (×5)

New keys: `charts.tagsAction`, `charts.listAction`, `charts.tagsAria`,
`charts.listAria`, `charts.sheetSubtitle` ({category} · {period}),
`charts.sheetCount.one/.other`, `charts.sheetTotal`, `charts.tagRowAria`
({tag}, {count}, {pct}, {amount}). Removed: none (the hard-coded English
"All N transactions" goes with the accordion).

## Tests

- Unit: `CategoryRing` with 20 slices (layout, hit test, labels that fit),
  palette 12 slots (contrast, ΔE, no neighbour repeat past 12), the sheet
  (rows, Σ, escape, swipe close), the form's `from=analytics` return.
- E2E `analytics_breakdown.spec.js` (real touch, clock pinned): every
  category listed, no Others; % only on wide slices; tap row → Tags / List;
  tags inline with counts; tag → sheet with the right rows and Σ; pull down
  closes; a row opens the form and saving returns to Analytics; slice tap
  marks the row; Income the same. Existing `ring_focus.spec.js` and the
  Analytics drilldown spec (`category_tag_drilldown.spec.js`) are updated.
- Home widget, Goals and Insights specs must stay unchanged (D8).

## Order and size

AB-3 → AB-1 → AB-2 → AB-4 → AB-5 → AB-6 → AB-7 → AB-8. About two days of
work; AB-2 (labels) and AB-4 (shared swipe helper) are the risky parts.
Phone check: iPhone and Android, light and dark, large text, one month and one
year with 15+ categories.

## Not in this plan

Changing the Home tile, Goals or the Insights split bar; a bar-chart view per
category (MoneyStats' third button); editing from the sheet with swipe actions.

## As built (2026-11-22)

All eight units are built on the branch `analytics-breakdown`.

- **AB-1/AB-2.** `CategoryDonutChart.render` lists every category with a value (no
  `_capData`); `_capData` stays for the Home widget and Insights. The box is
  `_boxSize()` = `min(280, viewport − 80)`, at least 200 px, cutout 58 %
  (`RingChart.config(…, { cutout })`, `CategoryRing.layout(…, { cutout })`).
  A resize that changes the size redraws the card in place (`_refit`).
  `CategoryRing.labelPlugin(labels)` + `labelFit` + `labelInk`: the share
  (whole %) is written where the chord at the band's middle takes the text +
  8 px and the band its height + 6 px; nothing while the sweep is still growing
  a slice. White text on every palette slot. The labels are handed to the
  plugin at construction (a chart without the sweep draws in its constructor).
- **AB-3.** Twelve slots: the eight, then teal `#0f766e`, olive `#4d7c0f`, sky
  `#0284c7`, purple `#9333ea` (all ≥ 3:1 on both cards and both icon discs).
  `assign(ids)` takes ring order: the first 12 unique as before, then each
  later one avoids both ring neighbours. The wine and deep blue first picked
  failed 3:1 on the dark card.
- **AB-4.** `Components.SwipeRows.wire(list, { scroller, openWidth })` — its own
  small controller, **not** shared with History (a deliberate change from the
  plan: History's `_wireRows` carries long-press selection and the Paid side,
  and moving it was risk without benefit). A real scroll (> 24 px) or a tap
  outside closes the open row; Escape too. Buttons are icon-only with labels
  ("Tags of Rent", "Transactions of Rent").
- **AB-5.** `_tagPanelHtml` + `Components.CountRing.html(count, pct, colour)`.
- **AB-6.** `Components.TransactionListSheet` on `_bankSheet`, with
  `Components._sheetSwipeClose` (drag down from the top of the sheet; 120 px or
  a flick). Rows come from `Store.categoryTransactions(filters, type, catId,
  tag)`, the same filter as the ring. The subtitle names the page's period.
- **AB-7.** `#edit?id=…&from=analytics`; `AddTransactionView._exitRoute()`
  sends save, delete and the close link back to `#analytics`.
- **AB-8.** `CategoryRing.select` calls `host.onSelect(id, viaPointer)`;
  Analytics scrolls the row to the centre and pulses it (`.is-marked`, 1.3 s).
  No badges on the Analytics ring (`overlayHtml(…, { badges: false })`).

Tests: unit `categoryRing.test.js` (the Analytics ring rewritten; a new
"Analytics breakdown" block), e2e `analytics_breakdown.spec.js` (new),
`category_tag_drilldown.spec.js`, `ring_focus.spec.js` and `journey_daily.spec.js`
updated. Not checked on a phone yet.
