# Deep Testing Report fixes — Plan (1.0.2 → 1.0.3)

**Status: BUILT 2026-10-06 on the local branch `fixes-1.0.3` (owner chose every recommended default, D1–D8), verified on web and the Android emulator; see "As built" at the end. iOS device check pending.**

**Source:** *Stack'd 1.0.2 Testing Report* (2026-10-06; private artifact
claude.ai/artifact/WRZYLxyUubW61oCDPB3Q9z, Markdown copy on the owner's Desktop). It covers 52 criteria
and lists 119 open bugs: 41 new (BUG-135..175: 2 high, 16 medium, 23 low) and 78 still open from the
1.0.1 report. All 29 1.0.2 fixes hold. The release gate is the report's **"Fix before public release
(1.0.3)"** bucket of 12 bugs. This plan covers those 12, plus **riders**: later-bucket bugs in the same
code that cost little extra.

**Method.** Four read-only investigators each took one code region, confirmed every root cause at
`865da04` (`git diff v1.0.2 HEAD -- src` is empty, so the report's lines hold, ± a few in views.js), and
designed the fix, tests, i18n keys and any repair of data already on devices. The key root causes were
re-checked by hand: `store.js:2031` `delete tUpdate.type`, `store.js:2079–2085` drop filter,
`store.js:802–810` stepper, `views.js:4583` paste listener, `store.js:2852` ROLL_PERIODS,
`import.js:1985/2005/2135` `readAsText`, `views.js:4890` `buildConfig`, `store.js:4149` `baseAmount`.

Comment tag: `// 1.0.3 (BUG-NN)`. Never `v1.0x`.

---

## Item map — the 12 gate bugs

| Bug | Sev | Root cause (confirmed at 865da04) | Fix | Unit | Effort |
|---|---|---|---|---|---|
| 135 | High | `propagate()` does `delete tUpdate.type` for every member (`store.js:2031`). The v0.67 guard was meant for transfer legs; `categoryId` still spreads, so later payments stay expenses under the Salary category. | Delete `type` only for transfer legs or a non income/expense type: `if (t.transferRef \|\| !['income','expense'].includes(tUpdate.type)) delete tUpdate.type;`. Conversions from a transfer already set the kept legs' type before `propagate()`. No heal: a mixed series can't be told from a deliberate "Only this" change. | U1 | S |
| 136 | High | Recurrent off forces `regenerate` (`store.js:2021`). Members dated ≥ the edited payment are neither propagated (2058–2069) nor kept: the drop filter (2079–2085) removes them whatever today is. `UPDATE_TRANSFER` mirrors it (2313–2319, 2347–2352). | Split at the later of the edited date and **today** (a payment dated today counts as booked, as in `getLoanFuturePayments`). Members in [edited … today] get the propagated edit, i.e. `recurrence: null`, so they are unlinked. Only members after today are dropped. Same term in `UPDATE_TRANSFER`. Reword `recUpdate.futureSubStop` (5 languages). | U1 | S |
| 137 | Med | Edit Account save (`views.js:4597–4639`) dispatches `UPDATE_ACCOUNT`, which re-dates the opening row (`store.js:1707–1713`) with no check. `_isTxBeforeOpeningDate` (`store.js:3663`) then drops earlier rows from every aggregate and from History. | Shared rule `Store.openingDateImpact(accountId, newDate)` → `{count, net, earliest}` (only rows newly excluded; unpaid rows counted but not in `net`). When the opening date is touched and `count > 0`, a new `Components.OpeningDateSheet` offers **Open on {earliest} instead** / **Change anyway** / Cancel. | U2 | M |
| 138 | Med | A tapped income leg prefills `initialAccount = counterpart.accountId` and the sent amount (`views.js:1646–1660`); the type toggles only restyle (2105–2107, 1940–1983). The store already keeps the tapped role's leg (`store.js:1987–2007`) but takes `accountId`/`amount` from the payload. | Form only, when editing an existing pair: a `setType(next)` with a snapshot of the pair. → Income: account = To, amount = received (same currency: mirrored; cross-currency: `#tx-received-amount` or the stored income leg). → Expense: From and the sent amount. → Transfer: restore all, then `updateUIVisibility()`. No synthetic `change` (BUG-21 swap). No store change. | U2 | M |
| 139 | Med | The regenerate branches (`store.js:2071–2093`, `2344–2374`) drop every later member and rebuild the full chain from the edited one. Nothing remembers a slot deleted with "Only this" (or unlinked with "Only this"). | **Gap preservation, no stored state (D1).** Before dropping, if interval and frequency are unchanged, `_seriesGaps()` maps the old chain's slots (nearest-slot match, old anchor) and records the empty indices; it bails out with `[]` on any ambiguity. After the rebuild, the members on those indices are removed with `_removeSeriesMembers` (never the armed tail), then `_syncSeriesSchedule`. A frequency/interval change cannot map gaps, so the scope sheet shows `recUpdate.gapNote` when `Store.seriesGapCount()` > 0. | U1 | M |
| 140 | Med | `SAVE_BUDGET` overwrites `amount` (`store.js:2905–2915`); `getBudgetForMonth` uses one `baseAmount` (`store.js:4149`) for the month and for every past month in the carry loop (4156–4172). Non-cumulative budgets' past months change too. | **Limit history (D3).** Optional `limits: [{from:'', amount}, {from:'YYYY-MM', amount}…]` (stored only with ≥2 entries; first `from` is always `''`); `amount` stays "the newest limit". `_budgetAmountFor(b, ym)` is read for the month and in the carry loop. `SAVE_BUDGET` takes `effectiveFrom` = the month viewed in Goals: a changed amount applies from there on and replaces later entries; an unchanged amount (only months/rollover edited) keeps the history. Editor prefills the viewed month's amount and captions `budget.appliesFrom`. CSV: a 6th `Limits` JSON column; old files restore flat. No migration, no boot write. | U3 | M |
| 142 | Med | `ROLL_PERIODS` re-renders only when `_livePageOf(activeView)` rolled (`store.js:2852–2859`); that is null for `dashboard`, so the resume handler (`main.js:620–635`) never redraws Home. | `emit` records `_renderedDay = _todayYMD()`. `ROLL_PERIODS` also sets `changed` when the view is `dashboard` and the day moved (Home has no form state; sheets live outside `#router-view`). Plus a midnight timer in `main.js` (next local midnight + 5 s, DST-safe, runs only while visible, re-arms) (D7). Nothing else is date-dependent: series are materialized ahead. | U3 | S |
| 145 | Med | Simulator money fields are `type="number"` (`views.js:5049, 5056`; rate 5074; sheets 5260, 5287, 5321) read with `parseFloat` (`buildConfig` 4891, `updateDownPct` 5163). | Principal, down payment, early-repayment and extra-cost amounts become `type="text" inputmode="decimal"` read by `Store.parseAmount`; NaN → `form.amountInvalid {example}` on the right field through the existing `#dsim-error` channel (prelude in `engineError` before the E_DOWNPAYMENT remap). Rate fields become text read by a new `parseRate` (decimal comma or point, no grouping). Values escaped in attributes (they were raw). Prefill `String(Math.round(x*100)/100)`. | U4 | M |
| 152 | Med | The three `reader.readAsText(file)` calls (`import.js:1985, 2005, 2135`) decode as UTF-8. Only `importCSV` is live; bank CSV, camt and MT940 all flow through its text. | `StackdImport._readFileText(file, onText, onError)`: `readAsArrayBuffer` → `_decodeBytes`: UTF-16 BOMs honoured, then `TextDecoder('utf-8', {fatal:true})`, on failure the XML-declared encoding or `windows-1252`. Falls back to `readAsText` where `readAsArrayBuffer`/`TextDecoder` are missing (keeps the ~15 test mocks synchronous and green). Category matching then finds "Caffè & Bar" unchanged. Silent fallback (D8). | U4 | S |
| 41 | Med | The log form save (`views.js:2385–2716`) never checks opening dates; new accounts default to today (4311–4315); `getFilteredTransactions` (`store.js:1403`) hides pre-opening rows from History; a transfer into a later-opened account keeps only the From leg. | Same rule as BUG-137: `Store.openingDateConflicts(legs)` checked after the To check (2501) and **before** the recurring scope sheet. Sheet: **Move opening date to {date}** (re-dates the opening row in the same `Store.batch`) / **Save anyway** / Cancel. Skipped on an edit that changes neither date nor account. **History shows pre-opening rows dimmed** with `history.beforeOpening` and excludes them from day sums (D2) via an opt-in `keepBeforeOpening` flag; aggregates unchanged. | U2 | M |
| 42 | Med | The paste listener (`views.js:4583–4592`) appends the pasted digits to the current ones and ignores the selection. | Selection-aware paste: a whole-field paste (all selected, or field is 0.00) is read by `Store.parseAmount` ("1.234,56" → 1234.56, "1500" → 1500.00, "99.9" → 99.90; a negative sets the Negative toggle); a partial paste splices digits into the selection then runs the usual decimal shift. Also routed from `beforeinput` `insertFromPaste` (Gboard clipboard chip). Same listener serves New Account. | U2 | S |
| 51 | Med | `_calculateNextRecurrenceDate` (`store.js:802–809`) clamps against the base date's own day and `_processRecurringTransactions` (1090) feeds it the previous member, so a clamped day is lost. | Optional `anchorDay` parameter: months/years use `min(anchorDay, daysInMonth)` (inline, mirrors `LoanEngine.addMonthsClamped`, parity test; the store must load without loan-engine.js). New `recurrence.anchorDay` written by ADD_TRANSACTION/ADD_TRANSFER, on enabling recurrence, and by a "This and future" date move; legacy reader `_anchorDayOf(rec, date)`. All chain callers pass it (processing, regenerate, `_moveSeriesEnd`, loan sync plan, the form's slot counter). **Boot heal `_healSeriesAnchors` (D4):** proof-based (series replays exactly from `startDate` with the old stepper), re-dates only members **after today**, stamps `anchorDay` (idempotent); also inside `BATCH_IMPORT_TRANSACTIONS`. | U1 | M |

## Riders (recommended)

| Bug | Sev | What | Unit | Effort |
|---|---|---|---|---|
| 159 | Low | Yearly series from 29 Feb moves to 1 Mar for good. Free with BUG-51: the years branch clamps and the anchor returns it to 29 Feb in leap years. Also fix `_clampRecurrenceEndDate`'s `setMonth(+60)` overflow on 29 Feb. | U1 | S |
| 99 | Low | Editing a transfer's time is ignored: carry `time` in both leg branches and the scoped loop of `UPDATE_TRANSFER`, and in `UPDATE_TRANSACTION`'s counterpart sync. | U1 | S |
| 103 | Low | Swipe-delete on a recurring item uses an inline two-option sheet: switch it to `Components.RecurringDeleteModal` (adds "All"); retire `history.recurringDelete.*` from the 5 dictionaries. Bulk delete unchanged. | U1 | S |
| 153 | Low | Duplicate-name check misses inner double / no-break spaces: shared `_nameKey` (NFKC, collapse whitespace, trim, lower-case) in `findAccountByName`/`findCategoryByName` and the `nameChanged` comparisons; the collapsed name is saved. | U2 | S |
| 154 | Low | Saving an account in an unlisted currency turns it into USD: render the unlisted code as a selected option, and send `currency` only when it changed. | U2 | S |
| 46 (part) | Med | ¥150,000 opens at ¥1,500: `Store.currencyDigits(code)` (Intl) drives the Opening Balance field's decimal shift, prefill, placeholder, paste and currency switch. CNY display and other money fields stay for BUG-46 proper. | U2 | S |
| 58 | Med | Cumulative rollover without a start month does nothing: switching it on prefills Start Month with the viewed month, the save applies the same default, and a CSV row with `Cumulative=true` and no start defaults to the current month. No heal. | U3 | S |
| 104 | Low | Budget editor accepts end < start and the end month can't be cleared: `budget.endBeforeStart` field error; `MonthPicker` gets a clear option labelled with the existing `budget.noEndDate`. | U3 | S |
| 105 | Low | "Remove Budget Limit" has no confirmation: a delete-style `Modal.show` (`budget.removeConfirm.*`). | U3 | S |
| 160 | Low | Spending exactly the limit shows OVERSPENT €0.00: decide in cents, kill `-0`. Also align the Goals ring with the summary card (it sums all categories, incl. unbudgeted spend and the other tab). | U3 | S |
| 164 | Low | Rollover limit ≤ €0: bar at 100% when over, widget shows `budget.overBy` instead of "—". | U3 | S |
| 115 | Low | History's Today button stays on a past period: when today is outside the period, set the same period type to today's (anchored like `_rollLivePeriods`) then scroll. | U3 | S |
| 71 | Med | Blank Annual Rate → 0% loan; decimal duration truncated: `buildConfig` sends NaN / the decimal so the engine's E_RATE / E_DURATION fire. Same lines as BUG-145. | U4 | S |
| 118 | Low | Loan sheets reject input silently: `showFieldError` on the first faulty field (rate, amount, date, cost name, loan name). 3 new keys. | U4 | S |
| 147 | Med | A `"` inside an unquoted bank CSV field (TV 55" SAMSUNG) swallows the amount: `_parseRow` opens quote mode only at the start of a field. Stack'd exports always start quoted fields with `"`, so backups parse the same. | U4 | S |

**Not in 1.0.3** (assessed, deferred): BUG-53 (5-year cap notice — changes cap semantics, entangles with
the anchor work), BUG-61 (History summary math, other code), BUG-167 (50/30/20 widget money field — needs
a `Views.showFieldError` export; small standalone unit for 1.0.4), BUG-124 (CSV formula injection —
separate security unit touching every restore reader), BUG-173 (import result counts). Everything else
stays in the report's 1.0.4 / later buckets.

**Noted for verification, not a gate item:** converting the *income* leg of a recurring transfer to
Income with "This and future" keeps the unarmed income legs and drops the armed expense legs, so the
series may lose its generator (`store.js:1987` + the "only the expense leg is armed" rule). U1 checks it
while in that code and reports; it is fixed only if trivially safe.

---

## Units

| Unit | Bugs | Owns |
|---|---|---|
| **U1 Recurrence** | 135, 136, 139, 51 + 159, 99, 103 | `store.js` stepper (792–812), `_processRecurringTransactions`, `UPDATE_TRANSACTION` (1857–2116), `UPDATE_TRANSFER` (2199–2385), `_moveSeriesEnd`, loan sync plan, new heal in `Store.init`; `views.js` seriesRec (2538–2550), scope sheet (2684–2712), swipe delete (1288–1313); `components.js` RecurringUpdateModal/RecurringDeleteModal |
| **U2 Opening date & forms** | 137, 41, 138, 42 + 153, 154, 46-part | `store.js` findAccountByName (717–735), getFilteredTransactions (1359–1404), opening-date helpers (3643–3668); `views.js` AddTransactionView toggles/save (1569–2501 excluding U1's scope-sheet lines), TransactionsView rows (843–1036, 1173), EditAccountView (4293–4694); `components.js` new OpeningDateSheet, TransactionItem dim option |
| **U3 Budgets & Home** | 140, 142 + 58, 104, 105, 160, 164, 115 | `store.js` SAVE_BUDGET, getBudgetForMonth, ROLL_PERIODS, emit; `views.js` BudgetView (3064–3566); `widgets.js` budgets; `main.js` resume/timer; `export.js`/`import.js` budget columns; `components.js` MonthPicker, Today button |
| **U4 Loan input & CSV** | 145, 152 + 71, 118, 147 | `views.js` `_DebtShared` + simulator + sheets (4745–5339, 5746); `import.js` `_parseRow`, readers |

Shared files: every unit adds keys to the five `src/i18n/*.js` dictionaries (union merge, each unit in
its own block). `views.js` 2385–2716 is shared between U1 (scope sheet) and U2 (opening check before
the scope gate): U2 wraps the tail as `proceed(moveOpening)`, U1 touches only the sheet notes inside it —
implement U1 first, or merge by hand.

## New i18n keys (all five dictionaries; whole-sentence plurals)

- **U1:** `recUpdate.gapNote`; reworded `recUpdate.futureSubStop` ("Stop the series: payments after
  today are removed; earlier ones stay"); retire `history.recurringDelete.{title,body,onlyThis,withFuture}`.
- **U2:** `openingDate.txTitle`, `.txBody`, `.move`, `.saveAnyway`, `.accountTitle`,
  `.accountBody.one/.other`, `.useEarliest`, `.changeAnyway`, `history.beforeOpening`.
- **U3:** `budget.appliesFrom`, `budget.endBeforeStart`, `budget.removeConfirm.title`, `.body`.
- **U4:** `debt.err.costName`, `debt.err.costAmount`, `debt.err.loanName`.

Account and category names are escaped before they become `t()` params (BUG-24 rule).

## Tests

- **U1:** `recurrenceEditing.test.js` (type flip future/all/income→expense and with a date move;
  the Gym stop case with a pinned clock; the Rent gap case, 'all', end extension, backward move,
  unlinked slot, frequency change refill), `recurringTransfers.test.js` (stop and gap for pairs, time
  edit), new `recurrenceMonthEnd.test.js` (31st and 29 Feb sequences, anchor on add and on a future move,
  heal proven/skipped/idempotent, parity with `addMonthsClamped`), `recurringSeriesForm.test.js`,
  `transactionSwipeActions.test.js`; pin the clock (`vi.setSystemTime`) in every existing
  stop-recurrence test.
- **U2:** new `openingDateConflicts.test.js` (helper, both sheets, all three buttons, batch, scope-sheet
  ordering, Back → Cancel); update `openingBalanceForm.test.js:385` (now clicks "Change anyway");
  `historySummary.test.js` (dimmed rows, sums), `transferEditCounterpart.test.js` +
  `crossCurrencyTransferForm.test.js` (both legs, both currency cases, the D-U8-4 legacy pair),
  `openingBalanceDecimalShift.test.js` (paste cases, JPY), `findAccountByName.test.js`,
  `accountCurrency.test.js`. E2E: BUG-138 in `cross_currency_transfer.spec.js`, BUG-137 + 42 paste,
  BUG-41 back-fill transfer.
- **U3:** new `budgetLimitHistory.test.js` (the report's 300→400 / 300→200 figures, non-cumulative,
  legacy record identical, edit at start month, unchanged amount keeps history, remove clears),
  `budgetCsvRoundTrip.test.js` (Limits column, old files), `periodRollover.test.js` (Home re-renders
  once across midnight, not on the same day, not on forms/Goals, no save; Today button),
  `budgetOverspendDisplay.test.js`, `budgetEditorBack.test.js`, `homeWidgetsGoals.test.js`.
- **U4:** `debtView.test.js` (it 250.000 / 50.000, en 1,234.56, rate 3,2 and 4.125, blank rate → E_RATE,
  2.5 years → E_DURATION, prefill rounding, escaped value), `debtEngineErrors.test.js` (NaN fields;
  drop the `min="0"` assertion; sheet errors), new `csvEncoding.test.js` (decode matrix, ANSI backup
  restore, ANSI bank CSV, camt ISO-8859-15, MT940 Latin-1), `csvRecords.test.js` + `bankImport.test.js`
  (inch-mark rows). E2E `debt_simulator.spec.js`: an Italian case and a rate-sheet error.

Every new test must fail on `865da04`.

---

## Decisions for the owner (recommended default first)

| # | Decision | Recommended | Alternative |
|---|---|---|---|
| D1 | BUG-139: how deleted payments survive a rebuild | **Gap preservation** for date/end moves, warning note when the frequency changes | Note only (deleted payment still comes back, lower risk); or stored per-series exclusions (new data + CSV column; rejected) |
| D2 | BUG-41: show pre-opening rows in History | **Yes, dimmed, "not counted"** — also covers rows already in that state on devices and from imports | Warning sheets only; History keeps hiding them |
| D3 | BUG-140: which months a new limit covers | **From the month viewed in Goals onward**, with a caption; edit at the start month to rewrite all | Ask "from this month / from the start?" each time |
| D4 | BUG-51: repair series already drifted to the 28th | **Yes, proof-based heal of future payments only**; past dates never move | No heal (only new series fixed) |
| D5 | BUG-136: payments between the tapped one and today on a "This and future" stop | **Unlink them** (they stay in History as plain entries) | Keep them in the stopped series |
| D6 | BUG-142: midnight timer while the app stays open | **Include** | Resume only |
| D7 | BUG-152: non-UTF-8 file | **Decode silently as Windows-1252** | Show a notice before importing |
| D8 | Riders | **All 15 listed above** | Gate only (12) |

## Procedure

1. Branch `fixes-1.0.3` from main.
2. Implement U1 → U2 → U3 → U4 (U1 before U2 because of the shared save handler). Each unit: tests first
   (must fail on 865da04), then code, then `npm run lint` + `npm run test`.
3. Bump `?v=` for every edited `src/*.js` in `index.html` together.
4. `npm version 1.0.3 --no-git-tag-version` + `npm run version:sync` (versionCode 10003).
5. Full `npm run test`, `npm run test:e2e`, `npm run build`; live check in the preview of the report's
   repro steps for each gate bug.
6. Android: `npm run build` → `npx cap sync android` → emulator check of BUG-142 (resume across midnight),
   BUG-42 (paste, incl. Gboard), BUG-152 (an ANSI file through the picker).
7. Owner approves landing on main; store builds and release notes follow `docs/release-checklist.md`.
   Release notes must mention re-entering past payments that BUG-136 deleted (no automatic repair).

## Outside the code (owner, from report §6)

- Rewrite the Testers Community production-access answers 8–10 so they describe what the build contains
  (no Share App, no ASO change yet).
- Paste the §1b listing copy in all five languages in Play Console; keep the Play name "Stack'd Finance".
- iOS TestFlight check of the share-sheet export and file-mirror commit (still pending from 1.0.2).

---

## As built (2026-10-06)

Built on the local branch `fixes-1.0.3`: four parallel worktree units (U1–U4, merged without a conflict),
then two adversarial review passes whose findings were all fixed. Version 1.0.3 (10003); every script
in `index.html` is at `?v=75` (the five dictionaries too; `i18n.js`, `loan-engine.js` and `utils/*`
unchanged).

**Verification**
- Unit: 1,775 tests in 151 files, all green (1,584 at 1.0.2). Every unit's new tests were run against
  `865da04` first: 41/51 (U1), 36/54 (U2), 38 (U3) and 31/39 (U4) fail there. The rest are guards of
  behaviour that must not change.
- E2E: 96/96 (89 at 1.0.2; new `opening_date_conflicts.spec.js`, a BUG-138 case in
  `cross_currency_transfer.spec.js`, two `debt_simulator.spec.js` cases). Lint clean; `npm run build` OK.
- Live (preview, today 2026-10-06), the report's repro for each store-level gate bug:
  - **BUG-135:** the salary series flips to income on every payment; 31 Mar 2027 reads €13,300.00.
  - **BUG-136:** stopping the weekly Gym series from 10 Aug keeps the 10 past payments (unlinked); September keeps its 4.
  - **BUG-139:** the deleted January Rent stays deleted after the 1 → 2 Nov move; April 2 is kept.
  - **BUG-51 / BUG-159:** a 31 Oct salary falls on 30 Nov, 31 Dec, 31 Jan, 28 Feb, 31 Mar, and on 29 Feb 2028. A 29 Feb insurance falls on 28 Feb and on 29 Feb in leap years.
  - **BUG-140:** raising Groceries to €400 or lowering it to €200 from October keeps October's rollover at +€4.65; July stays at €300.
  - **BUG-145:** Italian "250.000 / 50.000 / 3,2" builds 250,000 / 50,000 / 3.2 %.
  - **BUG-152:** Windows-1252 bytes decode to "Caffè €".
- Android emulator (API 36.1, debug build of this bundle):
  - **BUG-152:** the WebView decodes windows-1252, `fatal` UTF-8 throws, and `_readFileText` on a Blob gives "CAFFÈ CITTÀ".
  - **BUG-142:** a real background and relaunch (Home key, launcher) with the store's day moved forward re-renders Home, and `_renderedDay` advances. The device clock could not be moved (no root), so the figure change itself rests on the unit tests.
  - **BUG-42:** a native long-press → Paste of "1.234,56" over the selected 3000.00 gives 1234.56 (one `paste` event).
  - **Not exercised:** the Gboard clipboard-chip path (`beforeinput insertFromPaste`), covered by a unit test only.

**Departures from the designs (all kept)**
- **U1:**
  - `anchorDay` is set on the rebuilt member inside the rebuild block (not via the payload), and is also reset on an interval/frequency change.
  - The anchor heal never moves a payment to today or earlier, nor past its series end.
  - The suspected income-leg bug was real (converting the received leg of a recurring transfer to Income with "This and future" dropped the generator). It is fixed: the dropped leg's `nextDate` moves to the kept leg.
- **U2:**
  - `OpeningDateSheet` takes pre-escaped markup (`bodyHtml`, `primaryHtml`, `anywayHtml`).
  - Dimmed rows dim the icon and text, not the whole swipe row.
  - `currencyDigits` is capped at 2 (amounts are stored in cents).
  - E2E seeds that relied on a same-day opening date now pin `openingDate`.
- **U3:**
  - An unchanged amount keeps both `limits` and `amount`.
  - A total limit ≤ €0 with spending over it reads "Overspent" (same rule as a row).
  - The Goals ring now uses the summary's totals.
  - The `appliesFrom` caption hides at or before the start month.
  - A History BUG-69 test now uses a range that holds today, because BUG-115 moves ranges that don't.
- **U4:**
  - An extra stray-quote guard, `_quoteClosesMidField`, keeps 1.0.2's broken-file fallback working with literal mid-field quotes.
  - `TextDecoder` is added to the ESLint browser globals.
  - An XML file that declares UTF-8 but isn't falls back to Windows-1252.

**Review findings fixed after integration** (each has a test that fails without the fix):
1. **BUG-138:** after changing To to an account in a third currency, Income carried the received $117 as £117. Now a received figure counts only in To's own currency, and the stored income leg only while To is still its account; otherwise the amount is empty and the form asks.
2. **BUG-46:** a rename re-saved a stored ¥123.45 as ¥123, and a EUR→JPY→EUR flip lost the cents. The field now keeps the unrounded figure while untouched.
3. **BUG-51:** `anchorDay` is not in the CSV, and the `startDate` fallback guessed wrong after a restore (a re-anchored chain decayed to the 28th; a 30th chain hopped to the 31st). The new boot/restore heal `_healInferSeriesAnchors` stamps the day each chain shows. A payment before its month's last day is exact; a run of month-end payments takes its largest day. It runs right after `_healSeriesAnchors`, never moves a date, and is idempotent.
4. **BUG-139:** a gap on the last slot held the armed tail, so the deleted payment came back. The tail's `nextDate` now moves to the latest surviving member before it is dropped.
5. **BUG-159:** a 1.0.2 end stored past the cap for a 29 Feb start (1 Mar) now clamps to 28 Feb, which made an untouched End Date a "schedule change" (full rebuild; per-payment paid state lost). The series' own end now goes through the same clamp before the comparison.
6. **BUG-51:** converting a series member to a transfer on its own day keeps the old chain's anchor.

## Accepted limits

- BUG-136 cannot bring back payments 1.0.0–1.0.2 already deleted.
- A series with mixed types (BUG-135) is not repaired automatically: re-save it with "All".
- BUG-139 keeps gaps across date and end moves only. An interval or frequency change refills them, and the scope sheet says so (`recUpdate.gapNote`).
- Imports, bank fetches and recurring generation can still create rows before an opening date without a warning. History now shows them dimmed.
- Budgets restored from a pre-1.0.3 CSV are flat (one limit for every month), as before.
- The month picker's "Selected:" label is still English (pre-existing; for 1.0.4).

## Release notes (draft for the owner)

**Store "What's new"** (under Play's 500 characters):

- **en:** Fixes for recurring payments: changing a series to income now changes every payment in scope, stopping a series keeps payments that already happened, deleted payments stay deleted, and month-end dates (31st, 29 Feb) stay put. Entries dated before an account's opening date are flagged instead of vanishing. Budget limits apply from the month you change them. Loan amounts accept 250.000 and 1,234.56. Bank files with accented letters import correctly. Home updates after midnight.
- **fr :** Corrections des paiements récurrents : passer une série en revenu modifie chaque paiement concerné, arrêter une série garde les paiements passés, les paiements supprimés le restent et les fins de mois (31, 29 février) sont respectées. Les écritures antérieures à l'ouverture d'un compte sont signalées. Une nouvelle limite de budget s'applique dès le mois choisi. Les prêts acceptent 250.000. Les fichiers bancaires accentués s'importent bien. L'accueil se met à jour après minuit.
- **it:** Correzioni ai pagamenti ricorrenti: trasformare una serie in entrata cambia ogni pagamento interessato, interrompere una serie mantiene i pagamenti già avvenuti, i pagamenti eliminati restano eliminati e le date di fine mese (31, 29 febbraio) sono rispettate. Le voci precedenti all'apertura di un conto vengono segnalate. Un nuovo limite di budget vale dal mese in cui lo cambi. I prestiti accettano 250.000. I file bancari accentati si importano bene. La Home si aggiorna dopo mezzanotte.
- **es:** Correcciones en pagos recurrentes: cambiar una serie a ingreso cambia cada pago afectado, detener una serie conserva los pagos ya realizados, los pagos eliminados siguen eliminados y las fechas de fin de mes (31, 29 de febrero) se mantienen. Las entradas anteriores a la apertura de una cuenta se señalan. Un nuevo límite de presupuesto se aplica desde el mes en que lo cambias. Los préstamos aceptan 250.000. Los archivos bancarios con tildes se importan bien. Inicio se actualiza a medianoche.
- **pt:** Correções nos pagamentos recorrentes: mudar uma série para receita altera cada pagamento abrangido, parar uma série mantém os pagamentos já feitos, os pagamentos eliminados continuam eliminados e as datas de fim de mês (31, 29 de fevereiro) mantêm-se. Registos anteriores à abertura de uma conta são assinalados. Um novo limite de orçamento vale a partir do mês em que o altera. Os empréstimos aceitam 250.000. Os ficheiros bancários com acentos importam-se bem. O Início atualiza-se à meia-noite.

**Longer notes (site / support, English master).** 1.0.3 repairs month-end recurring dates on its first
launch (future payments only). Two things it cannot repair:
- Payments that an earlier version deleted when you turned Recurrent off on an older payment ("This and
  future" or "All"). Re-enter them from your bank statement.
- A recurring series where only the first payment changed to Income (or to Expense): open any payment of
  it, set the type again and choose "All transactions in the series".
