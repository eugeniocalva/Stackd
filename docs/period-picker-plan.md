# Period picker for History and Analytics — plan (1.2.2, HG-10)

Status: **BUILT 2026-11-07 — P1–P5 on main (§0 "as built"). Device check on the phone still to do.**
Comment tag `// 1.2.2 (HG-10)`. Research: a workflow of two code readers,
four industry researchers (budgeting apps, banks, expense trackers, design
guidance), three independent designs (minimal, fast switching,
platform-native) and a judge. Part 3 is the judge's winner with the best ideas
of the other two grafted in; every default in it is the recommended answer to
a question in §D, marked (Qn).

The ask (2026-11-07, with a phone screenshot of History): "the date picker of
the History page and of Analytics is not intuitive, it's very confusing and
it's full of things. We need to be more minimalistic and have a better
solution. Look at best industry practice and other apps, draw a plan, ask me a
lot of questions, then implementation."

## §0 — Final design (after the owner's answers)

Part 3 is the proposal as written before the answers; where it differs from
this section, **this section wins**. Two answers differ from the
recommendations: the units are **Month · Year** only (Q2), and there are **no
quick ranges** — any other span is picked in the calendar (Q3).

- **One control (Q1):** `‹ November 2026 ▾ ›` centred under the title on History
  and Analytics, Goals' pill style. Tap the name → the Period sheet; tap an
  arrow → step one period. Absolute names (Q12): "November 2026", "2026",
  "Oct 9 – 23, 2026".
- **The Period sheet:** a Month · Year switch over a grid that opens where you
  are (months of the year, or years), and a "Custom range…" row that opens
  the one-month range calendar in the same sheet (tap start, tap end, Done —
  mockup panel 5). A tap on a cell applies and closes. **No Week, no Day, no
  rolling ranges, no All time** (Q2, Q3).
- **Arrows (Q11):** never greyed out, like Goals; a month steps by a month, a
  year by a year, a custom range by its own length (whole months by whole
  months) (custom ‹ › answer).
- **Back to now (Q6):** a "↺ This month" / "↺ This year" chip under the pill,
  only when the period shown does not contain today. Re-tapping the History
  tab still scrolls to today. Analytics' hero "Today | Nov 30" toggle stays
  the only other "Today".
- **Pages (Q4, Q5):** each page keeps its own period for the session and opens
  on This month at every launch; drill-downs hand the period over.
- **Filters (Q7):** a Filter icon with a count badge in the title row; one
  removable chip per active filter kind under the pill, "Clear all" at 2+;
  clearing never touches the period or the sort.
- **Select (Q8):** stays in History's title row.
- **Sort (Q9):** the top of History's "Filter and sort" sheet, saved, default
  Oldest first; the "Sorted:" line and the Settings toggle are removed.
- **No swipe (Q15).**
- **Analytics:** the % badge names the compared dates (Q13: "vs Oct 1 – 7",
  "vs September 2026", "vs Sep 24 – Oct 8"); a custom range draws automatic
  bars — daily ≤ 31 days, weekly ≤ 3 months, monthly ≤ 3 years, yearly
  beyond (Q14); a bar tap opens History on that bar's month or year (a
  custom bucket: its own range), copying accounts/types/categories, clearing
  tags, leaving the sort alone (Q16).
- **Model fixes kept:** month/year anchors (BUG-64), `CLEAR_ALL_FILTERS` limited
  to filters, `?account=` and the bar tap keep the saved sort, donut and Tags
  hand-offs through `UPDATE_FILTERS`, selection pruned to the listed rows.
- **Dropped from Part 3 by the answers:** the Week panel, `resolvePreset` and
  the preset roll in `_rollLivePeriods`, `preset`/`fromPreset`, the `all`
  type and its sentinel, the range caption under the pill, the
  `period.range.*` keys. The store still reads legacy `week` / `today`
  periods (stray payloads, tests): label as a range or a day, arrows ±7 days /
  ±1 day, and the sheet opens on Month.

### Phases (revised)

1. **P1 · Model, no visible change:** `_anchorPeriod` (BUG-64), `stepPeriod`
   (custom ranges step by length), `CLEAR_ALL_FILTERS` filters-only, the sort
   kept by `?account=` and the bar tap, the bar tap opening the bar's real
   period, donut/Tags hand-offs via `UPDATE_FILTERS`, selection pruning,
   `Store.periodLabel` (absolute) and `currentPeriodLike`.
2. **P2 · Analytics:** automatic bars for custom ranges, the bar tap per
   bucket, the "vs {dates}" badge.
3. **P3 · The pill, the Period sheet (Month · Year + calendar step) and both
   headers;** focus restore; announcements; i18n ×5.
4. **P4 · Filter and sort sheet** (Order on History, Reset, Accounts, dialog
   semantics, backdrop/swipe close), the Settings sort row removed.
5. **P5 · Verification:** `period_picker.spec.js` (month-end, back chip, the
   sheet's Back chain, keyboard, French at 360 px, 200 % text, a one-day
   custom range, Analytics bars for a range, selection pruning), light/dark
   renders, a device pass; retire the old keys; CLAUDE.md section.

### P1 as built (2026-11-07)

- `Store._anchorPeriod`: month → `YYYY-MM-01`, year → `YYYY-01-01` in
  `UPDATE_FILTERS` (every period, and the replace default), `CLEAR_ALL_FILTERS`
  and `stepPeriod` (BUG-64).
- `Store.stepPeriod(period, dir)`: a new object; month/year ±1, legacy
  day/week ±1/7 days, a custom range by its length (back through
  `_getPreviousPeriod`), a range of whole months by whole months.
  `NAVIGATE_PERIOD` on a page uses it (the global legacy `activePeriod` path is
  unchanged). The bar still greys ‹ › on a custom range until P3.
- The `?account=` replace keeps the saved sort.
- The Analytics bar tap opens History on the bar's own month or year
  (buckets carry `kind`; a day/week bar keeps its fixed range), copies
  types/accounts/categories, clears tags, never sends a sort.
- The donut category/tag tap and the Tags screen row go through
  `UPDATE_FILTERS` (they wrote the state and emitted).
- `Store._pruneHistorySelection`: History's period/filter changes drop
  selected rows it no longer lists.
- `Store.periodLabel` (absolute: "November 2026", "2026", "Oct 9 – 23, 2026",
  "Nov 7, 2026") and `Store.currentPeriodLike` (the back chip's target, null
  on the current period) — used from P3.
- `CLEAR_ALL_FILTERS` still resets the period and the sort: it goes with the
  funnel in P3.
- Tests: `periodModelHg10.test.js` (14); `netFlowLocalDates` now expects the
  real month.

### P2 as built (2026-11-07)

- `Store._customNetFlowBuckets(start, end)`: a custom range gets bars — a day
  each up to 31 days, Monday–Sunday weeks up to 93 days (end weeks clipped),
  calendar months up to 36 months, years beyond. Buckets carry `kind`
  ('day' / 'range' / 'month' / 'year'); the same aggregate rules and the
  today clamp as the unit bars. `computeNetFlowData` returns null only for
  an empty or reversed range.
- `NetFlowChart.render` no longer has the "Chart not available" branch (its
  `isCustom` argument is ignored), and `AnalyticsView.attachEvents` mounts
  the chart whenever there are bars (it skipped custom ranges).
- The bar tap: a whole month/year bucket opens that month/year; any other
  bucket its own dates (P1's rule, now for range buckets too).
- The % badge: `analytics.vsPeriod` "vs {label}" with
  `Store.comparisonLabel(window)` — "vs Oct 1 – Oct 7" (this month so far),
  "vs September 2026" (a whole month), "vs Sep 24 – Oct 8" (the window before
  a custom range); the label is escaped (`I18n.esc`). The old
  `analytics.vsLast.*` / `vsLastToDate.*` and `charts.customRange*` keys are
  unused; they are deleted in P5.
- Tests: `analyticsRangesHg10.test.js` (11).

### P3 as built (2026-11-07)

- `Components.PeriodBar` (History and Analytics): `render(page, filters, state)`
  draws the pill — `#period-prev-<page>` / `#period-label-<page>` /
  `#period-next-<page>`, 44 px, never disabled, arrows named by their
  destination ("Previous: August 2026"), the name `aria-haspopup="dialog"` —
  and a context row only when needed: `#period-now-<page>` ("↺ This month" /
  "↺ This year", from `Store.currentPeriodLike`), one chip per active filter
  kind (`[data-filter-kind]`: accounts, types, categories, tags; ✕ clears that
  kind) and `#period-clear-<page>` "Clear all" at 2+ (filters only, never the
  period or the sort). `filterButton()` is the title-row `#btn-filter-<page>`
  (sliders icon, a badge counting the kinds). `goNow()` keeps History's
  BUG-115 roll → move → scroll sequence; `announce()` reads "October 2026. 23
  transactions" (History) / the name (Analytics) through
  `Components.Announcer`.
- `Components.PeriodSheet.show(page)`: one `#period-sheet` dialog. Grid step: a
  Month · Year radiogroup (arrow keys) over a 4×3 month grid (‹ year ›) or a
  12-year page; the shown period `aria-pressed` and filled, the current one
  `aria-current="date"` and ringed; a tap applies and closes; "Custom range…"
  opens the calendar step — Monday-first, 44 px day buttons named with the
  full date (+ start / end), pre-selected on the shown period, first tap
  starts a range, Done (a start alone = one day), the dates put in order.
  ✕ / Back / Escape / backdrop close the grid; on the calendar, "‹ Period"
  carries `[data-back-dismiss]` so Back and Escape step back to the grid
  first. Focus moves into the sheet, Tab is trapped, and focus returns to the
  name.
- Headers: History = title + `[Select] [Filter]`, then the pill; Analytics =
  title + `[Filter]`, then the pill. Removed from the headers: the period
  text, the "Sorted:" line, the old account/tag chips and the red "Partial
  accounts shown" (now the accounts chip). The other-currency caption heads
  Analytics' hero card. Both title rows keep the shared 32 px title line (the
  44 px buttons hang 8 px above it).
- `main.js` restores focus by `[data-focus-key]` across the wholesale
  re-render (a vanished period control falls back to the name).
- CSS: the HG-10 block at the end of `components.css`. i18n: `period.*` and
  `filters.*` keys in 5 languages.
- Not yet removed (P5, with their unit tests): `AdvancedFilterBar`,
  `CustomRangeModal`, `PeriodPicker` — nothing renders them now.
- Tests: `period_picker.spec.js` (7: the month-end ‹, the back chip, the sheet
  month/year/custom and its Escape chain, a one-day range stepped by ›, chips
  and Clear all, focus kept on ‹, Analytics bars and comparison, French at
  360 px); `local_dates`, `i18n_core`, `category_tag_drilldown`,
  `wallet_account_filter`, `accounts_lifecycle` and `page_titles` moved to
  the new controls; `accountFilterIndicator` / `mixedCurrencyViews` check the
  accounts chip; `escapeGuard` covers PeriodBar and PeriodSheet.

### P4 as built (2026-11-07)

- `Components.FilterModal`: History's sheet is "Filter and sort" with **Order**
  at the top (Oldest first · Newest first, saved as before); Analytics' sheet
  is "Filters" with no Order, and its Apply sends no `sortOrder` (nor the
  period, as before). "Reset" (was "SHOW ALL") clears types, accounts,
  categories and tags and keeps the order. "Wallets" became "Accounts".
- The sheet is a dialog (`role="dialog"`, `aria-modal`, `aria-labelledby`),
  its chips carry `aria-pressed`, focus starts on Cancel and returns to
  `#btn-filter-<page>`; a backdrop tap and Escape close it without a change.
- Settings → Data visualization lost the History sort row (`#btn-sort-desc` /
  `#btn-sort-asc`): it wrote `historySortOrder`, which History never read.
  The key and `SET_HISTORY_SORT_ORDER` stay internal (P5 may retire them).
- Keys `filterModal.reset` / `accounts` / `order` in 5 languages.
- Tests: `filterSheetHg10.test.js` (5); `touchTargets` no longer expects the
  Settings toggle.

### P5 as built (2026-11-07)

- Deleted from `components.js`: `AdvancedFilterBar`, `CustomRangeModal` and the
  long-dead `PeriodPicker` (≈ 470 lines).
- Their unit tests moved to the new controls:
  `customRangePresets.test.js` → `periodSheetCalendar.test.js` (the local-day
  guarantees in Rome and Martinique, 30 days across the 25 Oct DST change,
  BUG-68's browse arrows and in-order picks; the preset cases went with the
  presets); `homeResume103` / `periodRollover` / `todayNavigation` drive
  `PeriodBar.goNow` (the back chip's handler; a year returns to this year, a
  legacy day/week to this month); `liveCheckFixes` checks the calendar's
  start/end day names; `escapeGuard` drops the old entries.
- 39 keys nothing reads any more were removed from all five dictionaries
  (`filter.day/week/prevPeriod/nextPeriod/clearAll/calendarRange`,
  `range.*` except `startDate` / `apply`, `analytics.vsLast.*`,
  `analytics.vsLastToDate.*`, `charts.customRange*`,
  `history.sortedBy/partialAccounts*/clearAccountTitle/clearTagTitle`,
  `others.sortOrder*`, `filterModal.showAll/sortOrder`).
- Checked: lint; 2,382 unit; 168 e2e; light and dark renders of History, the
  Period sheet and Analytics in WebKit at 390 px.
- **Left (owner):** a pass on the phone. Accepted: `historySortOrder` /
  `SET_HISTORY_SORT_ORDER` and the legacy `activePeriod` actions stay internal
  (no UI).

## Part 1 — What is wrong today

Both pages share one scrolling row, `Components.AdvancedFilterBar`
(`src/components.js` ~1040–1190): ‹ · Today · › | funnel · Day · Week · Month ·
Year · calendar · sliders. History's header adds Select, a period label and a
"Sorted: …" line.

1. **You can't see which period is on.** At 390 px the selected "Month" chip
   is off-screen (41 % of the row is hidden in English, 47 % in French); a
   newcomer sees Day and Week.
2. **Too many controls, no hierarchy.** History's header holds 11 buttons, 3
   status lines and a divider (19–22 % of the screen). One row mixes stepping,
   granularity, filters/reset and custom dates; the answer ("which dates?") is
   a non-tappable text at the top right.
3. **The period name isn't tappable** (Goals' "‹ November 2026 ›" pill is).
4. **"Today" means three things**: History scrolls to today; Analytics
   switches to Day; Analytics' hero has a second "Today | Nov 30" toggle.
5. **The funnel is ambiguous**: it clears filters *and* resets the period and
   the sort, sits among the date controls, and lights up just from picking
   Week.
6. **Disabled controls look broken**: ‹ › Today and the funnel drop to 30 %
   opacity with no reason given; › is off on the current month unless planned
   rows exist (a recurring series lets you step five years ahead).
7. **The Custom Range sheet is heavy**: near full-screen, two calendars (End
   below the fold), opens on today–today, six presets frozen on the day you
   pick them, Apply needed even for a preset.
8. **A custom range breaks Analytics** ("Chart not available", arrows off).
9. **Changing granularity loses your place** (every chip jumps to today).
10. **Month-end bug (BUG-64)**: on the 29th–31st ‹ stalls, › can skip
    February, and "vs last month" can compare a month with itself.
11. **Sort has three sources of truth**: a non-tappable "Sorted:" line, the
    Filter sheet, and a Settings toggle that doesn't drive History; an
    Analytics bar tap silently flips History to Newest first.
12. **Accessibility gaps**: no pressed/radio state on the chips, no
    announcement of a period change, ‹ › don't name the unit, the custom sheet
    has no dialog role and its day cells aren't focusable, 36 px pills and
    21 px chips.

## Part 2 — What the best finance apps do

Claims marked (unverified) come from general knowledge and could not be confirmed online.

### Patterns that recur in the best apps

1. **The period is the title, and it is the one control.** A month label, or one pill, is both the heading and the button.
   - YNAB Plan header with ‹ › and a month grid: https://support.ynab.com/en_us/the-plan-header-BkmiuJ_C9.md
   - PocketGuard: tap the month, with a Reset back to now: https://pocketguard.com/help/review-last-months-budget/
   - Monzo Trends "This Month" button: https://monzo.com/help/budgeting-overdrafts-savings/trends-months-years-web
   - Starling: date range at the top left: https://www.starlingbank.com/features/spending-insights/
   - Spending Tracker: arrows around a date button: https://www.mhriley.com/spendingtracker/manual.html
   - Cashew: app-bar ‹ range ›, from its source: https://github.com/jameskokoska/Cashew
2. **The calendar month is the default, and the app opens on the current period.** YNAB, Copilot, PocketGuard, Monzo, Starling, Apple Card, Spendee. Monarch defaulting Reports to All time drew complaints: https://www.monarch.com/blog/august-product-update
3. **Pick a unit, then step through it.**
   - Apple Card Week/Month/Year with a swipe: https://support.apple.com/en-us/HT209489
   - Up: tap the header to change granularity, swipe between periods: https://up.com.au/blog/custom-spending-insights/
   - Monzo Months/Years; Realbyte "M" menu plus ‹ ›: https://help.realbyteapps.com/hc/en-us/articles/360042842734-Stats-tab
4. **Back to now in one tap, shown only when you are away.**
   - Cashew's return button, with › disabled at the current period.
   - PocketGuard Reset.
   - A Monzo community request for a "jump to current month".
5. **A short, honest preset list with Custom last.**
   - YNAB Reflect offers 6 presets: https://support.ynab.com/en_us/spending-breakdown-H1H7YxmD0.md
   - Copilot Cash Flow offers 5: https://help.copilot.money/en/articles/9682232-cash-flow-tab-overview
   - Revolut offers 4: https://help.revolut.com/help/accounts/budget-and-analytics/how-can-i-see-my-spending-and-income-analytics/
   - Guidance: about 5 presets plus Custom; rolling presets keep rolling and say "days": https://www.saasui.design/blog/saas-date-time-picker-ux-patterns , https://screensdesign.com/articles/mobile-progress-chart-time-range-ux/
6. **A custom range is one linked calendar in a sheet.** A single month panel on phones, tap start then end, the span highlighted, 44 px cells, the range announced: https://uxpatterns.dev/patterns/forms/date-range . Material makes the range picker full-screen: https://github.com/material-components/material-components-android/blob/master/docs/components/DatePicker.md
7. **Filters stay separate from the period and show as removable chips.** Cashew's filter sheet with chips; Monarch keeps date as one filter among many, and its users ask for prev/next stepping: https://help.monarch.com/hc/en-us/articles/21846787088916-Using-Reports
8. **The comparison is built in.**
   - Copilot compares month to date with the same days of the previous month.
   - Apple Card shows "spent more/less than last period".
   - Revolut compares with the previous cycle.
   - No separate compare picker.
9. **Charts drill into the list.** Copilot (tap or double-tap a bar), Money Lover reports (https://moneylover.zendesk.com/hc/en-us/articles/34533897137177), Starling bars, N26 and Wise categories.
10. **Payday or month start is a Setting, not a picker option.** Monzo Resets (https://monzo.com/help/budgeting-overdrafts-savings/how-to-set-payday), Revolut cycles, Starling, bunq, PocketSmith (https://www.pocketsmith.com/news/2024-11-18-custom-start-dates-for-month-and-year-date-ranges/).

### Platform and accessibility guidance applied

- **Apple HIG, pop-up buttons:** show the current choice, offer a useful default, put "Custom…" (with an ellipsis) last. https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons
- **Apple HIG, segmented controls:** 5 segments or fewer. https://developer.apple.com/design/human-interface-guidelines/segmented-controls
- **Apple HIG, gestures:** custom gestures are shortcuts only, never the sole path. https://developer.apple.com/design/human-interface-guidelines/gestures
- **NN/g:**
  - instant apply suits instant results: https://www.nngroup.com/articles/applying-filters/
  - sheets need a visible Close and must not be stacked: https://www.nngroup.com/articles/bottom-sheet/
  - swipe has no signifier: https://www.nngroup.com/articles/contextual-swipe/
- **WCAG 2.2:**
  - 2.5.1: a swipe needs a single-tap alternative.
  - 2.5.8: targets of at least 24 px (aim for 44/48).
  - 2.4.11: sticky headers must not hide focus.
  - 4.1.3: announce period changes.
  - APG date picker dialog: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/

### Anti-patterns

- **Long or hidden preset lists.** Lunch Money's scrolling dropdown hid "Last month": https://feedback.lunchmoney.app/query-tool/p/add-last-month-auto-filter
- **Too many controls at rest.** Revolut has a cycle pill plus 1W/1M/6M/1Y tabs plus a swipe. Realbyte has 5 Home tabs plus a 5-mode Stats menu.
- **The period buried in a generic filter sheet with no prev/next.** The Monarch Reports complaint.
- **Unpredictable memory.**
  - Simplifi resets the range on navigation: https://community.simplifimoney.com/discussion/comment/54825
  - Lunch Money reopens on the last range.
  - Monzo's Targets tab reverts to the current month.
- **Rolling and calendar meanings mixed under one label.** Simplifi's "Recent 6 months" against "Last month" (https://community.simplifimoney.com/discussion/comment/60956); Wallet's rolling 30 days around monthly bills.
- **Gesture-only controls.** Emma's swipe-only graphs; Monzo's press-and-hold to read values.
- **A label that changes without the data.** Lunch Money's arrows bug.
- **Range-picking hazards.** Stacked sheets, Apply buttons for single taps, two unlinked date fields, two-month calendars on phones, and state shown by colour alone.
- **Silent future rows in "This year".** Monefy review.
- **Scales that change between periods.** Apple Card's y-axis complaint.

### What this means for Stack'd

- Use one named pill with ‹ › on both pages, opening one sheet that holds the units, about 4 rolling ranges and Custom last.
- Show a back-to-now chip only when away from the current period.
- Keep filters out of the period row, as removable chips.
- Do not use swipe: History rows already swipe, the charts scrub and the ring has tap-to-focus.
- Name the compared dates.
- Keep payday for Settings later.

### How the three designs scored

Scale 1 to 5, where 5 is best. For effort/risk, 5 means the least effort and risk. Clarity and minimalism count double, because the owner's complaint was "not intuitive, confusing, full of things".

| Criterion (weight) | Minimal: One Pill, One Sheet | Fast: Stepper + W·M·Y switch | Native: Period Stepper + status line |
|---|---|---|---|
| Clarity for a first-time user (x2) | **4**. One named pill that looks like Goals, with absolute names. Minus: Select is hidden in the Filter sheet, and the presets are buried in the custom step. | **3**. Single letters W·M·Y (S·M·A in fr/it/es/pt) are cryptic, and "M" sits close to Home's rolling "1M". The return chip is in the title row, away from the stepper. Select and sort are hidden behind ⋯. | **5**. The period button carries its own name, the resolved dates are always shown, Select stays visible, and the sheet uses full words. |
| Speed for a frequent user (x1) | **3**. Step 1 tap, back to now 1, change unit 3 (label → Week → cell), presets 3. The optional swipe helps. | **5**. Change unit 1 tap, step 1, back to now 1, presets 2. The unit is remembered. | **4**. Step 1, back to now 1 (also when scrolled away from today), unit and ranges 2 to 3. |
| Minimalism (x2) | **5**. 4 controls at rest, a header of about 128 px (158 today), and a context row only when needed. | **3**. 8 controls always visible, plus a fourth row for filters. | **3**. 5 controls plus a status line that is always on. The header stays about 160 px, and the sheet is fuller (4 units, panel, 5 range rows). |
| Accessibility (x1) | **4**. 44 px targets, radiogroup, announcer, dialog semantics. The swipe adds a gesture path. No focus restore after the wholesale re-render. | **4**. 44 px, radiogroup, focus trap, announcer. Visible single letters weaken label-in-name (2.5.3) and speech control. | **5**. No gesture-only path, focus restored after each re-render, native date pickers, 2.4.11 handled. |
| Fit with codebase and model (x1) | **4**. Reuses Goals' pill and MonthPicker's grid. The new `all` type touches every period switch (it does have a custom fallback). | **3**. Storing presets as custom + id fits well. Minus: a new persisted slice, and a tight label budget in 5 languages at 360 px. | **3**. New `last` and `all` types go through every `period.type` switch. Minus: unbounded arrows, a background re-render while the sheet is open, and native date fields that follow the phone's language. |
| Effort / risk (x1) | **3**. It claims about 3 days; about 5 is realistic. The swipe needs real-touch e2e. | **3**. About 6 days. | **2**. About 7.5 days, and the most new plumbing. |
| **Weighted total (of 40)** | **32** | **27** | **30** |

Reading the table:
- **Native** is the most accessible and the clearest. Its always-on status line and unchanged header height go against "more minimal".
- **Fast** is the quickest for power users. It brings back a busy row, and its letter labels get worse in four of the five languages.
- **Minimal** has the best resting state, so it is the base. Its two clarity holes (Select inside a filter sheet, presets two steps deep) are fixed with Native's answers.

## Part 3 — The proposed design

- Comment tag: `// 1.2.2 (HG-10)`, continuing the 1.2.2 round (HG-9 is the last one used).
- CSS: a block appended at the end of `src/styles/components.css`.
- Base design: "One Pill, One Sheet", with ideas grafted from "Native Period Stepper" and "One-row period bar".

### 3.1 Summary

Both pages lose the 10-control scrolling `AdvancedFilterBar`. In its place each gets the pill Goals already uses, `‹ November 2026 ▾ ›`, centred under the title.
- Tap the name to open one **Period sheet**.
- Tap an arrow to step one period.
- Everything that is not a date leaves the period row:
  - **Filter** is one icon with a count badge in the title row.
  - **Select** stays in the title row on History.
  - **Sort** moves into History's Filter and sort sheet.
- A **context row** appears under the pill only when there is something to say: a "This month" chip when you are away from now, the resolved dates of a named range, and one removable chip per active filter kind.

The Period sheet holds:
- a Week · Month · Year switch over a grid that opens where you are;
- four rolling ranges;
- "Custom range…", which opens a one-month range calendar inside the same sheet.

Taps apply at once. The custom range has a Done button.

The model work fixes:
- the month-end stall (BUG-64);
- the three meanings of "Today";
- presets that freeze on the day they were picked;
- greyed-out arrows that nothing explains;
- the Analytics chart that disappears on a custom range;
- the Analytics bar tap that overwrites History's saved sort.

Resting header: **History 11 buttons + 3 status lines → 4 controls** (Select, Filter, ‹, label, ›).

### 3.2 How the conflicts between the three designs were resolved

| Topic | Minimal | Fast | Native | This plan | Why |
|---|---|---|---|---|---|
| Primary control | Pill under the title | Capsule + inline W·M·Y | Full-width stepper | **Pill under the title, Goals style** (Q1) | Fewest controls; one date look across the app |
| Units | W·M·Y in the sheet, Day dropped | Inline W·M·Y, Day dropped | D·W·M·Y in the sheet | **W·M·Y in the sheet** (Q2) | History already groups by day; Day caused the Today confusion |
| Unit switch in the sheet | Changes only the grid | n/a | Applies at once, sheet stays open | **Changes only the grid; a cell tap applies** | One rule ("tap a period to show it"), no chart re-mount behind the sheet |
| Presets | 3 quick fills inside the custom step, fixed | 6 rolling | 4 rolling, new types | **4 rolling in step 1, stored as `custom` + `preset`** (Q3) | Visible, and a `custom` type keeps every consumer working |
| Custom UI | One-month calendar + Done | One-month calendar + Apply | Native date fields | **One-month calendar + Done** (Q10) | App language, highlighted span, opens on the period shown |
| Arrows on custom | Hidden | Step by length | Step by length | **Step by length (whole months by months)** | Nothing sits disabled; a drill-down can be browsed |
| Bounds | From data | From data (keeps today's › rule) | Never disabled | **Never disabled, like Goals** (Q11) | No unexplained grey arrows; future months have a projected balance |
| Back to now | Chip in the context row | Chip in the title row | Chip on a fixed status line, also when scrolled | **Chip in the context row, only when away** (Q6) | The pill never moves; no header jump while scrolling |
| Select | Into the Filter sheet | Into ⋯ | Stays visible | **Stays in the title row** (Q8) | Same control count as a ⋯; discoverable |
| Sort | Filter sheet | ⋯ sheet | Filter sheet | **Top of History's Filter and sort sheet** (Q9) | One home; the Settings duplicate goes |
| Swipe | On the pill | None | None | **None** (Q15) | Rows swipe, charts scrub, ring focus, Android edge Back |
| Label | Absolute | Relative | Relative + dates line | **Absolute** (Q12) | Matches Goals; never needs today's date to read |
| Remembered | Nothing | Unit per page | Nothing | **Nothing; both open on This month** (Q5) | Today's rule, and the research default |
| Filter chips | One per value, +N | One per value + Clear all | One per value + Clear all | **One per filter kind (max 4) + Clear all** | Bounded row, never more than one wrap |
| Focus after a re-render | — | — | Restore by id | **Restore by `data-focus-key`, scoped** | Repeated ‹ presses keep focus; other views untouched |

### 3.3 Layout (390 px, light; HG-3 title line unchanged)

#### 3.3.1 History

At rest (current month, no filters):
```
┌──────────────────────────────────────────┐
│                                          │ 32 px: HG-3 title line
│ History                 [Select]  [⚲]    │ h1 · Select 44 tall · Filter 44x44
│                                          │
│          ‹   November 2026 ▾   ›         │ pill: arrows 44x44, label >=44 tall
└──────────────────────────────────────────┘ sticky ~136 px (158 today)
  START · END · NET CHANGE card (unchanged)
  SUN, NOV 1 …
```

Away from now:
```
│ History                 [Select]  [⚲]    │
│          ‹   October 2026 ▾    ›         │ pill does not move
│ [↺ This month]                           │ context row ~40 px, only when needed
```

Filtered (one chip per kind: accounts, types, categories, tags):
```
│ History                 [Select] [⚲ 2]   │ badge = number of active kinds
│          ‹   October 2026 ▾    ›         │
│ [↺ This month] [Cash, Main ✕]            │ wraps at most once
│ [Groceries ✕] [Clear all]                │ Clear all only at 2+ kinds
```

Rolling range:
```
│          ‹   Last 30 days ▾    ›         │ › on a range steps to the next window
│ Oct 9 – Nov 7                            │ resolved dates caption (no chip: contains today)
```

All time (no arrows):
```
│               All time ▾                 │
│ Mar 3, 2024 – Nov 7, 2026                │ first data day → today
```

Hand-picked custom range, or a range you stepped:
```
│     ‹   Sep 9 – Oct 8, 2026 ▾   ›        │ arrows step by its length
│ [↺ Last 30 days]                         │ the chip names where it returns
```

Selection mode: the title row becomes the existing Cancel · "N selected" · Select all · Delete bar. The pill and the context row stay, so you can see which period you are selecting in.

#### 3.3.2 Analytics
```
│ Analytics                         [⚲]    │ no Select, no sort
│          ‹   November 2026 ▾   ›         │
│ [2 of 4 accounts ✕]                      │ replaces the red "Partial accounts shown"
├──────────────────────────────────────────┤
│        TOTAL NET BALANCE · TODAY         │
│              €6,582.60                   │
│          ↘ −3.7%  vs Oct 1 – 7           │ comparison names the dates (Q13)
│          ( Today | Nov 30 )              │ balance basis, unchanged
│ 1 account in another currency excluded   │ moved here from the header
```
- The hero's "Today | Nov 30" becomes the only "Today" on the screen; the back chip says "This month".
- On a rolling or custom range the Net Flow card draws automatic bars instead of "Chart not available" (Q14).

#### 3.3.3 Sizes
- Title row: 44 px.
- Pill: 44 px. The arrows are 44x44 buttons, which also fixes Goals' smaller arrows if Goals adopts the component later.
- Context row: about 40 px. Its chips are 32 px tall visually, with a 44 px hit halo through the `.btn-month-pill-arrow::after` technique.
- Sticky header: about 136 px on both pages (today History is 158 and Analytics 125), and about 176 px with a context row.
- Height changes happen only after a deliberate step or apply, never while scrolling, and the pill itself never moves.
- History's tall right column goes away. History can then use the same `.history-header-sticky > .page-header` title offset as Analytics, as long as `page_titles.spec.js` passes.

### 3.4 Interactions

#### 3.4.1 The pill
**‹ and ›** call `NAVIGATE_PERIOD {offset, page}`:
- Week: ±7 days.
- Month: anchored on the 1st, then ±1 month.
- Year: ±1.
- A custom range moves by its own length: Oct 1–15 becomes Sep 16–30. A range of whole months (1st to last day) moves by whole months.
- A rolling range turns into the fixed window before or after it. The preset is dropped and kept as `fromPreset`, so the back chip can return to it.
- All time hides the arrows.
- The arrows are never disabled (Q11). An empty period shows the existing empty state, and future months show planned rows and Analytics' projected balance.

**Tapping the label** opens the Period sheet. There is no long-press and no swipe (Q15).

**Every change** is announced through `Components.Announcer.say()`, which already delays 60 ms so it lands after the coalesced render. History says "October 2026. 23 transactions"; Analytics says "October 2026".

**Focus.** ‹, ›, the label, the back chip and the filter chips carry `data-focus-key`. The `main.js` render loop records the key of the focused element inside `#router-view` before it swaps `innerHTML`, then refocuses the element with the same key with `{preventScroll: true}`. If that element is gone, focus falls back to the label. Only keyed elements are affected.

#### 3.4.2 Context row
**Back chip.** It shows only when `!isDateInPeriod(today, period)` (Q6), and its label names where it goes:
- "This week", "This month" or "This year" for unit periods;
- the range's name for a stepped rolling range;
- "This month" for a hand-picked custom range (BUG-115).

On History the chip keeps today's sequence (invariant 8):
1. `ROLL_PERIODS`.
2. Move with `UPDATE_FILTERS` to the target (anchored).
3. Scroll to today. If the filters object changed, wait 100 ms and fire `scroll-history-to-today`; otherwise scroll at once.

On Analytics it moves to the same target. It no longer switches to Day.

Re-tapping the History tab still only scrolls to today.

**Range caption.** For a rolling range or All time, the row shows the resolved dates through `formatRange`.

**Filter chips.** There is one chip per kind:
- Accounts: "Cash, Main", or "2 of 4 accounts" when more than two are picked.
- Types: "Expenses".
- Categories: names, or "3 categories".
- Tags: "#trip", or "No tag".

✕ clears that kind (`UPDATE_FILTERS`; accounts → `[]`). "Clear all" (2+ kinds) clears types, accounts, categories and tags. It never touches the period or the sort. Chips are real `<button>`s, so Enter and Space work.

#### 3.4.3 Title row
- **Select** (History only): unchanged, `TOGGLE_SELECTION_MODE {active:true}`. Long-press on a row still works.
- **Filter** opens the Filter sheet:
  - History: "Filter and sort", with Order at the top.
  - Analytics: "Filters", with no Order section.
  - It keeps Cancel / Apply, and Apply never sends the period.
  - "Reset" replaces "SHOW ALL" and clears filters only.
  - "Wallets" becomes "Accounts".

#### 3.4.4 Drill-downs and hand-offs
- **Analytics bar tap → History** (Q16): a month bar opens `{type:'month', value:'YYYY-MM-01'}`; a week bar its week; a year bar its year; an automatic bucket its custom range. It copies types, accounts and categories, sets `tags: []`, and **never copies or saves `sortOrder`**.
- **Donut category/tag tap and Tags screen row:** they go through `UPDATE_FILTERS` instead of mutating state and calling `emit()`, so they get the roll and the account-id check. Payloads stay as they are, and D-U4-8 stays an accepted limit.
- **Smart Insights:** payloads are unchanged. Their `replace` hand-offs now store `-01` anchors (BUG-64 fixed for free), and their custom ranges show as range labels with a back chip.
- **`?account=` deep link:** keeps the "only this account" replace, but no longer resets the sort in memory, so the saved sort wins.

### 3.5 The Period sheet (`Components.PeriodSheet`)

One bottom sheet, about 470 px tall, opened from the label.
- Grabber, h2 "Period", and ✕ (`.modal-btn-close`).
- Backdrop tap, swipe down, Escape and Android Back all close it.
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
- Focus moves to the selected cell, Tab is trapped, and on close focus returns to the label.

#### 3.5.1 Step 1
```
┌──────────────────────────────────────────┐
│                   ───                    │
│ Period                               ✕   │
│  ┌──────────┬────────────┬──────────┐    │
│  │   Week   │ ● Month    │   Year   │    │ radiogroup: changes the grid only
│  └──────────┴────────────┴──────────┘    │
│     ‹             2026             ›     │ moves the grid only
│    Jan    Feb    Mar    Apr              │ 4x3, cells >=48x44
│    May    Jun    Jul    Aug              │
│    Sep   [Oct]  (Nov)   Dec              │ [ ] shown (filled + ✓)  ( ) current (ring + dot)
│ ──────────────────────────────────────── │
│  [ Last 30 days  ]  [ Last 3 months ]    │ 2x2, ✓ on the active one
│  [ Last 12 months]  [ All time      ]    │
│ ──────────────────────────────────────── │
│  Custom range…                       ›   │
└──────────────────────────────────────────┘
```

**Where it opens.** The sheet opens on the unit and place of the period shown. The anchor is today if the shown period contains today, otherwise the shown period's start. Switching unit keeps that place. For example, browsing September and tapping Week shows September's weeks, with the week holding the anchor pre-highlighted but not applied. This fixes "changing granularity loses your place".

**The three panels:**
- **Month:** `‹ year ›` over a 4x3 month grid, reusing `MonthPicker`'s grid markup.
- **Week:** `‹ November 2026 ›` over 4–6 rows such as "Oct 26 – Nov 1" and "Nov 2 – 8 · This week". Weeks run Monday to Sunday.
- **Year:** a 3-column grid from the first data year to the later of this year and the last data year, paged with ‹ › beyond 12 years.

**Applying:**
- A tap on a cell or a range applies it (`UPDATE_FILTERS {period}`), closes the sheet and announces the new period.
- ✕, Back, a backdrop tap or a swipe close without any change. A unit switch on its own changes nothing.

#### 3.5.2 Step 2: custom range, in the same sheet (never stacked)
```
│ ‹ Period        Custom range         ✕   │ "‹ Period" carries [data-back-dismiss]
│ Start  Oct 9, 2026   ·   End  Nov 7      │
│        ‹      October 2026      ›        │ ONE month panel, Monday first
│   M   T   W   T   F   S   S              │ day buttons 44x44
│               1   2   3   4   5          │
│   6   7   8  (9)━━━━━━━━━━━━━━━━━━       │ filled ends, tinted span
│   …                                       │
│ Oct 9 – Nov 7, 2026 · 30 days            │ role=status
│ [                Done                ]   │
```
- It opens pre-selected on the shown period (today's sheet opens on today–today).
- The first tap starts a new range, and the status says "Now pick the end date".
- The second tap sets the end; the two are put in order (BUG-68). A third tap starts over.
- Done is enabled once a start exists. A start alone gives a one-day range, which replaces the old Day unit.
- Done dispatches `{type:'custom', start, end}`.
- Android Back and "‹ Period" return to step 1, because the custom step's only `[data-back-dismiss]` is that link. A second Back closes the sheet.
- Picking logic is reused from `CustomRangeModal`. Its `div` day cells become buttons named like "Saturday 7 November 2026", with "start" or "end" added when they apply. The month arrows get labels.

### 3.6 Ranges (Q3)

| id | Label | Window (both ends included) |
|---|---|---|
| `d30` | Last 30 days | today−29 → today |
| `m3` | Last 3 months | the day after the same date 3 months ago (clamped) → today (the D-U4-1 rule) |
| `m12` | Last 12 months | the same rule, 12 months |
| `all` | All time | `1900-01-01` sentinel → today; the caption shows the first data day → today |

- Ranges roll: "Last 30 days" tomorrow is still the last 30 days.
- They end today, so planned future rows are not included. That is the honest "until today" rule (Toshl, Copilot).
- Ranges are named; calendar periods (This year) live in the grid, so nothing is called "This year to date".

### 3.7 Period model

#### 3.7.1 Types and anchors
The period shape is `{type:'week'|'month'|'year'|'custom'|'today'(legacy), value, start, end, preset?, fromPreset?}`.

**`Store._anchorPeriod(type, ymd)`:**
- month → `YYYY-MM-01`;
- year → `YYYY-01-01`;
- week stays any day (its bounds snap to Monday, invariant 4).

It is used by `UPDATE_FILTERS` (every sent period, and the `replace` defaults), `CLEAR_ALL_FILTERS`, `NAVIGATE_PERIOD` (`setDate(1)` before `setMonth`), the back chip and the drill-downs. This fixes BUG-64:
- ‹ no longer stalls on the 29th–31st;
- › no longer skips February;
- "vs last month" no longer compares a month with itself.

`periodLogic.test.js:73-75` ("keeps the day") flips.

**Legacy `today`.** The store keeps supporting it for tests and stray payloads: the label is the date, the arrows step ±1 day, and the sheet opens on Week.

#### 3.7.2 Rolling ranges
They are `custom` periods with a `preset` id, resolved by `Store.resolvePreset(id, today)`. Every consumer that already handles `custom` (`isDateInPeriod`, `getFilteredTransactions`, `_getPreviousPeriod`, History Start/End) works unchanged.

In `_rollLivePeriods`, a period with a `preset` is re-resolved when the day moves (`keepPage` is still skipped). A custom range without a preset still never rolls (invariant 3).

`all` uses a fixed sentinel start, so rows added before the first row still show:
- History Start = €0, which is correct: everything is in range.
- The bars clip to the first data day.
- The comparison shows "—" (BUG-12).

#### 3.7.3 Stepping
`Store.stepPeriod(period, dir)` returns a new object, never an in-place mutation. That keeps the History Today timing check (`filters !== before`) meaningful.
- The same-length window reuses `_getPreviousPeriod`'s DST-safe math.
- The mirror window forward is new code with the same rules.
- Whole-month ranges move by months.

#### 3.7.4 Defaults and persistence (Q4, Q5)
- At each launch both pages open on This month (`value: YYYY-MM-01`), as today.
- Each page keeps its own period for the session, and drill-downs hand it over.
- Nothing new is persisted. If Q5 is "remember the unit", see §3.11.

#### 3.7.5 Analytics with ranges (Q13, Q14)
**`computeNetFlowData` for `custom`** buckets by span:

| Span | Buckets |
|---|---|
| ≤ 31 days | daily |
| ≤ 93 days | Monday–Sunday weeks, edges clipped |
| ≤ 36 months | calendar months, edges clipped |
| longer | years, clipped |

- The start is clipped to the first data day.
- The buckets use the same per-bucket sum as the unit buckets: no unpaid rows, no rows before an account's opening, base currency only, no transfer legs, local dates.
- Unit periods keep their context bars: 5 weeks, 12 months, previous year against this year.

**The comparison badge** uses one key, `analytics.vsPeriod` "vs {label}":
- the "to date" clamp gives the compared days ("vs Oct 1 – 7");
- a full past period gives its name ("vs September 2026");
- a range gives the previous window ("vs Sep 9 – Oct 8");
- All time shows no comparison text.

This replaces `analytics.vsLast.*` and `vsLastToDate.*`.

#### 3.7.6 Invariants kept
Local dates only. `_rollLivePeriods(page)` runs before every period write; no sheet resends a period it captured when it opened. Monday weeks. The aggregate rules. Account-id pruning. The Analytics "to date" clamp. History's Today sequence. Coalesced emits: never read the DOM in the dispatch tick. Five dictionaries. Every sheet has a dismiss control. Markup escaping (no new top-level `esc`). The HG-3 line. `?v=` bumps together.

#### 3.7.7 Selection safety (found while checking the code)
`selectedTransactionIds` is cleared only when selection mode is left (`store.js:3070-3077`). Stepping the period therefore keeps hidden rows selected, and Delete (N) would delete them.

The plan prunes the selection to the newly listed rows on every History period or filter change. To verify in e2e.

### 3.8 Relocated controls

| Today | Goes to |
|---|---|
| ‹ › pills (48x36, 0.3 when disabled) | The pill's 44x44 arrows, never disabled, named by destination |
| "Today" pill (three meanings) | The conditional back chip, which means only "go to now"; History tab re-tap still scrolls |
| Day / Week / Month / Year chips | The Week · Month · Year switch in the sheet; Day dropped (Q2) |
| Calendar icon + `CustomRangeModal` | "Custom range…" → step 2 of the sheet |
| Custom presets (frozen) | Four rolling ranges in step 1 |
| Funnel "Clear all filters" (also reset period and sort) | Chip ✕, the "Clear all" chip, and Reset in the Filter sheet; none touches the period or the sort |
| Sliders "Filter and Sort" (off-screen) | Filter icon with a badge in the title row |
| Period label (text, not tappable) | The pill's label button |
| "Sorted: Oldest First" line | Removed; Order sits at the top of History's Filter and sort sheet (Q9) |
| Settings "History Sort Order" DESC/ASC (hard-coded English; writes `historySortOrder`, which History never reads; `store.js:813` only orders the internal array) | UI row removed (`views.js:5085-5088`, handlers 5452-5462); the key stays internal |
| Select pill | Stays in the title row (Q8) |
| Account and tag chips (21 px, click only) | The context row's kind chips (real buttons) |
| Analytics "Partial accounts shown" (red) | The accounts chip ("2 of 4 accounts ✕") |
| Analytics other-currency caption | Footnote of the hero card |
| `Components.PeriodPicker` (dead) | Deleted |
| `AdvancedFilterBar` | Replaced by `Components.PeriodBar` |
| `MonthPicker` (Goals, Export, budget editor) | Untouched; its grid markup is shared with the sheet |

### 3.9 Accessibility (WCAG 2.2 AA)

**Targets**
- Arrows, the label, Select, Filter, segments, cells and range buttons are all at least 44 px. Chips are 32 px visually with a 44 px halo.
- Nothing is under 24 px; today's 36 px pills and 21 px chips are gone.

**Names**
- Arrows say where they go: "Previous month: October 2026" (`period.prev.month`, colon form so no preposition elides).
- Label: "November 2026. Change period", visible text first (2.5.3), with `aria-haspopup="dialog"` and `aria-expanded`.
- Filter: "Filter and sort, 2 active".
- Chips: "Remove filter: Cash".
- Back chip: "Go to this month".

**State is never shown by colour alone**
- Unit switch: `role="radiogroup"` / `radio` with `aria-checked`, a roving tabindex and arrow keys.
- Cells: `aria-pressed` on the shown period, `aria-current="date"` and a ring and dot on the current one.
- Ranges: `aria-pressed` and a ✓.
- Range days: filled ends plus "start" or "end" in the name.

**Announcements:** the period changes and "Now pick the end date" (4.1.3).

**Focus**
- Restored after each re-render (§3.4.1).
- The sheet traps focus and returns it to the label.
- The page scroller gets `scroll-padding-top` equal to the measured sticky height (2.4.11).

**Gestures:** none are needed. Swipe-to-close has ✕, Escape and Back; long-press-to-select has the Select button.

**Reflow:** at 200 % text, the label wraps to two lines with the arrows kept at 44 px, the title row's buttons drop under the title, the context row wraps, the sheet's segments become a 2x2 grid, the month grid becomes 3 columns, and the sheet scrolls.

**Reduced motion:** no slide or cross-fade.

### 3.10 i18n

Every key goes into all five dictionaries (`i18n.test.js` enforces it). Plurals use whole-sentence keys, with an explicit `.zero` where French needs it. Escape the `t()` params, never the `t()` output. There is no bare `t`. Structures read at render time are getters.

**New keys (English examples)**
- Sheet: `period.sheetTitle` "Period"; `period.unitAria` "Period unit".
- Label: `period.change` "{label}. Change period".
- Arrows: `period.prev.week|month|year|range|day` "Previous month: {label}", and the same set for `period.next.*`.
- Back chip: `period.goNow.week|month|year` "Go to this month"; `period.returnTo` "Return: {name}" (colon form, because "à {name}" would need "aux").
- Ranges: `period.range.d30|m3|m12|all`.
- Custom step: `period.customRange` "Custom range…" (ellipsis per HIG); `period.custom.title|back|start|end|done|pickEnd`; `period.custom.days.one|other` "{range} · {count} days".
- Announcements: `period.announce.zero|one|other` "{label}. No transactions / 1 transaction / {count} transactions".
- Filters: `filters.badgeAria.one|other` and `filters.badgeAriaAnalytics.one|other`; `filters.remove` "Remove filter: {name}"; `filters.clearAll` "Clear all".
- Filter chips: `filters.accountsShown` "{shown} of {total} accounts" (total is always 2 or more); `filters.categoriesCount.other`; `filters.tagsCount.other`.
- Filter sheet: `filterModal.reset` "Reset", `filterModal.accounts` "Accounts", `filterModal.order` "Order", `filterModal.titleAnalytics` "Filters".
- Analytics: `analytics.vsPeriod` "vs {label}".

**Reused keys:** `period.thisWeek|thisMonth|thisYear` (chip text and the "This week" row tag), `filter.week|month|year` (segments), `history.newestFirst|oldestFirst`, and `filter.today` (the hero toggle only).

**Retired keys** (deleted in P5, once the tests stop using them):
- `filter.day`, `filter.prevPeriod`, `filter.nextPeriod`, `filter.clearAll`, `filter.calendarRange`, `filter.filterAndSort`;
- `range.quickPresets`, `range.last*`, `range.months` (which never had plural forms), `range.years.*`, `range.summary`;
- `filterModal.showAll`, `history.sortedBy`, `analytics.vsLast.*`, `analytics.vsLastToDate.*`, `charts.customRange*`.

Keep `range.startDate`; `components.js:1974` still uses it.

**Formats**
- Week rows and captions use `Intl.DateTimeFormat.prototype.formatRange` through `Store.getLocale()` ("2–8 nov."), with `_formatRangeLabel` as the fallback.
- Month and weekday names come from Intl / `I18n.monthNames()` / `weekdayInitials()`.
- Every range uses an en dash, which fixes today's hyphen.
- There is no "Since {date}" (French would need "Depuis le"); All time shows the range.

**French at 360 px**
- "septembre 2026 ▾" between two arrows is about 250 of 328 px.
- "Historique [Sélectionner] [⚲]" is about 292 px.
- "9 oct. 2025 – 7 nov. 2026" wraps to two lines inside the pill.

### 3.11 Migrating saved filters and state

- **Periods have never been persisted**, so there is nothing to migrate. The session shape gains optional `preset` and `fromPreset`. Every reader that spreads `period` keeps them, and `FilterModal` already strips the period.
- **`stackd_v1_historyFilterSortOrder`** (the real History sort) is kept as is. It is no longer overwritten by `CLEAR_ALL_FILTERS` (which now clears filters only and saves nothing), by the `?account=` replace, or by the Analytics bar tap.
- **`stackd_v1_historySortOrder`** (the Settings toggle) loses its UI. The key stays internal and is still read by `_sortTransactions`, `_reloadSlice` and RESET_APP. It is not adopted into the History sort: it never drove History, and adopting it would silently flip some users' list.
- **Unchanged:** `analyticsFilters.sortOrder` (kept in the shape, unused), `analyticsBalanceMode`, `expandedGraphFilters`, and the legacy `activePeriod` / `SET_PERIOD_*` / `RESET_PERIOD` actions (cleaned up later).
- **Only if Q5 is "remember the unit":** a new `stackd_v1_periodPrefs = {history, analytics}` holding a unit or range id.
  - Written only on a sheet pick.
  - Wired into `_reloadSlice` (the storageFull scan), reset by `RESET_APP`, kept out of the backup.
  - A missing key means month.
- **Cross-tab:** `_pruneAccountRefs` is unchanged and covers both pages.

### 3.12 Phases, files and tests

Each phase can land on its own and bumps `?v=` for every touched file together (store.js, components.js, views.js, router.js, main.js, insights.js, components.css). Realistic total: **about 6 days**.

**P1. Model, with no visible UI change (about 1.5 days)**
- Files: `store.js`; `components.js` (drill-down handlers); `views.js` (TagsView hand-off); `router.js` (`?account=`).
- Work:
  - `_anchorPeriod` (BUG-64);
  - `resolvePreset` and the preset roll in `_rollLivePeriods`;
  - `stepPeriod` and `NAVIGATE_PERIOD` for custom ranges;
  - `CLEAR_ALL_FILTERS` limited to filters;
  - `replace` keeps the saved sort;
  - bar drill-down to the unit period with `tags: []` and no sort;
  - donut and Tags hand-offs via `UPDATE_FILTERS`;
  - selection pruning;
  - `Store.periodLabel(period, {absolute})`, `periodCaption`, `currentPeriodLike`.
- Tests updated: `periodLogic` (73-75), `periodRollover`, `clearFilters`, `netFlowLocalDates` (169-187), `categoryTagDrilldown`, `historySummary`, `insights` (exact payloads: 438, 549, 644, 693-750, 968), `store.test` 436-443, `accountDeleteRefs`.
- New tests:
  - `periodAnchor.test.js` (pinned 31 Oct, 31 Dec, 31 Jan; "vs last month" never compares a month with itself);
  - `periodPresets.test.js` (resolve, roll across midnight, a step drops the preset);
  - `periodStep.test.js` (by length, whole months, DST);
  - `selectionPrune.test.js`.

**P2. Analytics charts for ranges (about 1 day; works with today's custom range too)**
- Files: `store.js` (`computeNetFlowData`); `components.js` (NetFlowChart bar tap per bucket kind; "Chart not available" removed); `views.js` (the `analytics.vsPeriod` badge).
- Tests: `netFlowLocalDates`, `analyticsDeltaBadgeSign`, `mixedCurrencyViews`; new `netFlowCustomBuckets.test.js`. E2E: `category_tag_drilldown` 100-120.

**P3. PeriodBar, PeriodSheet and the two headers (about 2 days)**
- Files: `components.js` (`PeriodBar`, `PeriodSheet`; delete `AdvancedFilterBar`, `CustomRangeModal`, `PeriodPicker`); `views.js` (History header 1645-1710, Analytics header 311-350; the currency caption into the hero); `main.js` (the `data-focus-key` restore); `components.css` (HG-10 block); i18n x5.
- Unit tests:
  - `customRangePresets` becomes `periodSheet.test.js`;
  - `liveCheckFixes` 202-205; `periodRollover` 305-380; `homeResume103` 155-220 (new id `#period-now-history`); `todayNavigation`;
  - `escapeGuard` 398-420 and `markupSafety` 156 (register `PeriodBar` and `PeriodSheet`);
  - the stubs in `accountFilterIndicator` 24, `dailySummaryString` 37, `periodFiltering` 27;
  - `mixedCurrencySelection`; `i18n`.
- E2E: `local_dates` 83-158, `i18n_core` 106-121, `page_titles`, `hidden_balances` 54, `wallet_account_filter`, `accounts_lifecycle` 122, `mixed_currency_totals` 58, `import_matching` 108, `insights_destinations` 69-128, `insights.spec` 80-155.

**P4. Filter sheet, sort and Settings (about 0.5 day)**
- Files: `components.js` (`FilterModal`: Order on History only, Reset, Accounts, dialog role, `aria-pressed`, backdrop and swipe close, focus); `views.js` (Settings row removed).
- Tests: `periodRollover` (`#afm-apply` kept); `i18n_core`.

**P5. Verification and cleanup (about 1 day)**
- New `tests/e2e/period_picker.spec.js`:
  - pinned 31 Oct, ‹ goes to September;
  - the back chip appears, disappears, scrolls History, and restores a stepped range;
  - the sheet's Back chain (custom → step 1 → closed) and focus return;
  - a keyboard-only path with focus kept on ‹;
  - French at 360 px with no overflow; 200 % reflow;
  - a one-day custom range; All time;
  - an Analytics range draws bars;
  - pruning the selection while stepping.
- Light and dark screenshots; one Android emulator and one iOS device pass.
- Retire the old keys.
- Replace CLAUDE.md's AdvancedFilterBar notes with a "Period picker (HG-10)" section, and add an "As built" section to this doc.

### 3.13 Risks and checks

1. **A unit switch takes 3 taps** (label → Week → row). The mitigation is Q5's "remember the unit".
2. **A new derived-live case** (rolling presets) sits in `_rollLivePeriods`. "A custom range without a preset never rolls" must hold; test across midnight.
3. **The All-time sentinel.** Grep for loops that iterate days from `period.start` (Insights facts, widgets). If one exists, resolve the start from the data instead.
4. **Bar buckets for ranges** must follow every aggregate rule, or the bars disagree with the hero. Known and out of scope: the bars ignore the type and tag filters.
5. **The focus-restore hook** in `main.js` is limited to `[data-focus-key]`.
6. **Stepping custom ranges reverses BUG-115-era expectations** (‹ › were disabled on custom ranges); several tests change.
7. **Coalesced emits:** the back chip keeps "dispatch, then scroll after the re-render", and the sheet never reads the DOM in the dispatch tick.
8. **Test churn** is about 20 unit files and about 11 e2e specs.
9. **Cache busting** must cover every touched file together.
10. **Markup safety:** escape chip names, and add no top-level `esc`.

### 3.14 Out of scope (later)

- Goals adopting `PeriodBar` (month only; it already has the same look).
- A payday or custom month start in Settings.
- Week start by locale (Monday stays everywhere).
- History search.
- Bars that honour type and tag filters.
- Renaming Home's 1W…Max chips.
- Removing the legacy `activePeriod`.

## §D — Decisions

Answered by the owner on 2026-11-07 (§0 applies them). One extra question was asked: **on a custom range, ‹ › step by its length** (rather than hiding the arrows).

**Q1 · Control.** What is the one period control on History and Analytics? — It replaces today's 10-button scrolling row and sets the look of both headers; Goals already uses a ‹ November 2026 › pill.
- **Pill under title (recommended)**: ‹ November 2026 ▾ › centred on its own row under the title, in Goals' pill style; tap the name to open the Period sheet.
- Pill + unit switch: The same pill plus an always-visible W·M·Y switch on the same row: units in one tap, but a busier row with letter labels.
- Title-row button: Only a 'November 2026 ▾' button next to the title; stepping happens inside the sheet. Smallest header, but no one-tap step.

- **Answer:** Pill under title (as recommended).

**Q2 · Units.** Which units does the Period sheet offer? — Units decide what ‹ › step by; Day repeats History's day grouping and caused the three meanings of 'Today'.
- **Week · Month · Year (recommended)**: Day is dropped. A one-day custom range, or Last 30 days (daily bars on Analytics), covers it.
- Day · Week · Month · Year: Keep Day as a fourth unit, as today.
- Month · Year: The simplest set; weeks only through a custom range.

- **Answer:** **Month · Year** — Week and Day are dropped (differs from the recommendation).

**Q3 · Ranges.** Which quick ranges sit under the grid, and do they follow today? — Today's six presets freeze on the day you pick them and are buried in the calendar sheet; the research points to about four rolling ranges.
- **Four, rolling (recommended)**: Last 30 days, Last 3 months, Last 12 months, All time (first transaction to today). They move with the calendar.
- Six, rolling: The four plus Last 7 days and Year to date.
- Four, fixed dates: The same four, frozen on the day you pick them, as today.
- None: Units and Custom range only.

- **Answer:** **None** — "periods are chosen through the calendar picker" (mockup panel 5); no rolling ranges, no All time (differs from the recommendation).

**Q4 · Shared.** Should History and Analytics share one period? — Each page keeps its own today. Sharing would make the two tabs always agree, but every Insights link into History (unpaid, upcoming, uncategorized ranges) would also change Analytics.
- **Separate, handed over (recommended)**: Each page keeps its own period; bar, ring and Insights drill-downs carry the period across.
- One shared period: Stepping on either page moves both.
- Follow on tab switch: Separate, but switching tabs copies the period of the page you leave.

- **Answer:** Separate, handed over (as recommended).

**Q5 · Defaults.** What should each page open on at launch? — Both reset to This month at every launch today; users complain about apps that reopen on the last range, and also about apps that forget their preferred view.
- **This month, both (recommended)**: Both pages open on the current month every launch, and each keeps its period for the session.
- Remember the unit: Each page opens on the current period of the last unit or range you picked there (e.g. This week, Last 12 months).
- Analytics on 12 months: History opens on this month, Analytics on Last 12 months.
- Remember everything: Reopen on the exact period you last viewed.

- **Answer:** This month, both (as recommended).

**Q6 · Back to now.** How do you get back to the current period? — Today's 'Today' pill scrolls on History, switches to Day on Analytics, and sits next to a second 'Today' toggle in the Analytics hero.
- **Chip when away (recommended)**: A 'This month' / 'This week' / 'This year' chip under the pill, shown only when the period doesn't contain today. Re-tapping the History tab still scrolls to today.
- Chip also when scrolled: Also shown on History's current month when today's day is scrolled out of view. This needs a fixed status row, so the header grows about 20 px.
- Always-on Today: A permanent Today button next to the pill.

- **Answer:** Chip when away (as recommended).

**Q7 · Filters.** How are active filters shown and cleared? — The funnel clears filters but also resets the period and the sort, and it lights up just from picking Week; filters other than account and tag are invisible today.
- **Chips + Clear all (recommended)**: A Filter icon with a count badge. One removable chip per filter kind (accounts, types, categories, tags) under the pill, and Clear all at 2+ kinds. Never touches the period or the sort.
- Badge only: A count badge on the Filter icon and no chips. Cleanest, but filters become invisible again.
- Account/tag chips: Keep today's two chips only.

- **Answer:** Chips + Clear all (as recommended).

**Q8 · Select.** Where does History's Select (bulk delete) go? — Moving it saves nothing if another icon takes its place, and long-press alone is hard to discover.
- **Keep in title row (recommended)**: The Select text button stays next to the Filter icon; long-pressing a row still works.
- ⋯ menu: Select and sort order move behind a More menu.
- Long-press + sheet row: No button: long-press a row, or use a 'Select transactions' row in the Filter sheet.

- **Answer:** Keep in title row (as recommended).

**Q9 · Sort.** Where does History's sort order live, and what is its default? — Sort shows as a 'Sorted:' line you can't tap. It is set in the filter sheet, Settings has a duplicate that doesn't work, and an Analytics bar tap overwrites it.
- **Sheet, Oldest first (recommended)**: Order goes at the top of History's Filter and sort sheet and is saved; the default stays Oldest first. The 'Sorted:' line and the Settings row are removed.
- Sheet, Newest first: The same, but new installs default to Newest first (the usual feed order); choices already saved are kept.
- Header toggle: A small sort button you can tap stays in the header.

- **Answer:** Sheet, Oldest first (as recommended).

**Q10 · Custom.** How is a custom range picked? — Today's sheet is almost full-screen, with two calendars (End below the fold), and opens on today–today.
- **One-month calendar (recommended)**: Inside the same sheet: tap the start, tap the end, the span is highlighted, then Done. Opens on the period shown, in the app's language.
- Native date fields: Two system date fields like the transaction form: you can type, and the pickers are accessible, but they use the phone's language and show no highlighted span.
- Month to month: Pick a start month and an end month (YNAB and Export style); no single days.

- **Answer:** One-month calendar (the owner pointed to mockup panel 5).

**Q11 · Future.** How far can ‹ › go, into the past and the future? — › is disabled on the current month unless planned rows exist, yet a recurring series lets you step five years ahead; ‹ has no limit.
- **Free, like Goals (recommended)**: Never disabled. Future months show planned rows and Analytics' projected balance; an empty period shows an empty state.
- Bounded by data: ‹ stops at your first transaction, › at your last planned row (today's rule plus a lower bound).
- Never past now: › stops at the current period; planned rows are visible only inside this month.

- **Answer:** Free, like Goals (as recommended).

**Q12 · Label.** How is the current period named on the pill? — History shows 'This Month' today while Goals shows 'November 2026'; an absolute name can be read without knowing today's date.
- **Absolute (recommended)**: 'November 2026', '2026', 'Nov 2 – 8'. The current one is marked in the sheet, and there is no back chip.
- Relative: 'This month', 'This week', 'This year' for the current period, and names for the others (today's labels).

- **Answer:** Absolute (as recommended).

**Q13 · Compare.** How does Analytics label what the % change is compared with? — Today the badge reads 'vs last month to date', 'vs last day' or 'vs last period' depending on the type, and the new rolling and custom ranges need a label too.
- **Name the dates (recommended)**: '−3.7% vs Oct 1 – 7' (to date), 'vs September 2026' (a whole month), 'vs Sep 9 – Oct 8' (ranges). One key covers every case.
- Keep words: 'vs last month to date', 'vs previous 30 days': one sentence per kind of period.
- Words + dates: Words on the badge, and the compared dates on a second line.

- **Answer:** Name the dates (as recommended).

**Q14 · Charts.** Should Analytics draw bars for custom and rolling ranges? — Today a custom range replaces the Net Flow chart with 'Chart not available', and rolling ranges would show the same card.
- **Automatic bars (recommended)**: Daily up to 31 days, weekly up to 3 months, monthly up to 3 years, yearly beyond. Tapping a bar works.
- Not this round: Keep 'Chart not available'; rolling ranges would then be offered on History only.

- **Answer:** Automatic bars (as recommended).

**Q15 · Swipe.** Should a sideways swipe step the period? — Rows already swipe for Paid/Edit/Delete, the charts scrub, the ring has tap-to-focus, and Android uses the edge swipe for Back.
- **No swipe (recommended)**: Arrows only: one tap, always visible.
- On the pill: Swiping the 44 px period row works as a shortcut for the arrows.
- Pill + hero: Also on the Analytics hero card.

- **Answer:** No swipe (as recommended).

**Q16 · Bar tap.** What does tapping an Analytics bar do? — Today it opens History on a fixed custom range (arrows disabled) and silently saves Analytics' sort into History.
- **History on that month (recommended)**: Opens History on that bar's real month or week, so the arrows work. It copies types, accounts and categories, clears tags, and leaves the sort alone.
- Narrow Analytics first: Analytics itself moves to that bar's period; a 'See transactions' link then opens History.

- **Answer:** History on that month (as recommended).
