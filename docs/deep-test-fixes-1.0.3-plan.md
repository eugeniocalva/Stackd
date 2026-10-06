# Deep Testing Report fixes — Plan (1.0.2 → 1.0.3)

**Status: APPROVED 2026-10-06 — the owner chose every recommended default (D1–D8). Building on the local branch `fixes-1.0.3`.**

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
