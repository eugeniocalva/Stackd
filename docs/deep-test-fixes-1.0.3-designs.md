# Deep Testing Report fixes 1.0.3 — per-unit designs

Companion to `docs/deep-test-fixes-1.0.3-plan.md` (the summary, decisions and procedure). Each section is
the read-only investigator's design at `865da04`, with the owner's decisions (2026-10-06) applied:
D1 gap preservation, D2 dimmed pre-opening rows, D3 limit history from the viewed month, D4 anchor heal of
future payments, D5 unlink on a 'future' stop, D6 midnight timer, D7 silent Windows-1252 fallback,
D8 all riders. Line numbers are at `865da04` (= v1.0.2 for `src/`). Comment tag: `// 1.0.3 (BUG-NN)`.

Bug pages (steps, expected/actual, evidence): the 1.0.2 report, Markdown copy
`C:\Users\ecalvaresi\Desktop\Stack'd 1.0.2 Testing Report.md` (search `#### ` headings / "BUG-NNN").

---

## U1 — Recurrence engine (BUG-135, 136, 139, 51; riders 159, 99, 103)

### BUG-135 (High): type change with 'This and future' / 'All' converts only the tapped payment
- **Root cause.** `store.js:2031` `propagate()` runs `delete tUpdate.type` for every member. The v0.67
  guard was for transfer legs; `categoryId` still propagates.
- **Fix** (one line in `propagate()`):
  ```js
  if (t.transferRef || !['income','expense'].includes(tUpdate.type)) delete tUpdate.type;
  ```
  Never propagate type onto any transfer leg. The `convertingFromTransfer` block (1987–2011) already sets
  `newType` on the kept legs and clears their `transferRef` before `propagate()`. Regenerate: 'future'
  rebuilds from the edited member (already the new type); 'all' reaches past members via propagate.
  `UPDATE_TRANSFER` unchanged. Loan-linked series safe (`getLoanFuturePayments` 4694 filters by
  transferRef/expense leg).
- **Heal:** none.
- **Tests** (`recurrenceEditing.test.js`): expense→income 'future' (later members income, earlier
  expense), 'all' (every member), income→expense, type + date change 'future' (regenerate path).
  `recurrenceTypeConversion.test.js` must stay green unchanged.

### BUG-136 (High): Recurrent off with 'future'/'all' deletes past payments
- **Root cause.** 2021 `recurrenceRemoved` forces `regenerate`; at 2058–2069 members dated ≥ `baseDate`
  are not propagated; at 2079–2085 every in-series member with `date >= dropFrom` is dropped whatever
  today is. `UPDATE_TRANSFER` same at 2313, 2315–2319, 2347–2352.
- **Fix.** Split at the later of the edited date and today (a payment dated today counts as booked).
  Members in [edited date .. today] get the propagated edit (which includes `recurrence: null`), so they
  are unlinked (D5).
  ```js
  const today = this._todayYMD();
  // loop 2058:
  const kept = recurrenceRemoved && t.date <= today;
  if (payload.updateAll && !convertingFromTransfer) { if (!isFuture || !regenerate || kept) propagate(t, i); }
  else if (isFuture && (!regenerate || kept)) propagate(t, i);
  // drop filter 2080: add  && (!recurrenceRemoved || t.date > today)
  ```
  The `t.date > today` term also protects past members between a back-moved new date and `baseDate`.
  `UPDATE_TRANSFER`: same `kept` term in `shouldPropagate` (2318) and same filter term (2349).
  v0.98 disarm sweep unchanged; `_syncSeriesSchedule`: 'future' survivors before the edited payment form
  a stopped series ending on its last payment (rule 6). Transfers: both legs via per-leg loops.
- **Heal:** impossible (rows gone). Release notes mention re-entry.
- **Tests** (pin clock `vi.setSystemTime('2026-10-06T12:00')`): `recurrenceEditing.test.js` weekly Gym
  case: stop at 10 Aug with 'future' and 'all' keeps 17 Aug–5 Oct unlinked, removes only after today, no
  armed member. Pin the clock in the existing "turning recurrence off" tests (≈360–395).
  `recurringTransfers.test.js` (tests ≈211–255) same for pairs, no orphan legs.
  `recurringSeriesSchedule.test.js`: stopped series ends on last kept member.
- **i18n.** Reword `recUpdate.futureSubStop` in all 5 dictionaries, e.g. en "Stop the series: payments
  after today are removed; earlier ones stay". `allSubStop` already accurate.

### BUG-139 (Med): 'Only this' deleted payment comes back after a rebuild — D1: gap preservation
- **Root cause.** Regenerate branches (2071–2093, 2344–2374) drop every later member and re-materialize
  from the edited member; nothing records a deleted slot (also an 'Only this' unlink → duplicate).
- **Fix (no stored state; the chain itself records gaps, so CSV round-trips keep them).**
  - Before dropping (regenerate, not `recurrenceRemoved`), if interval and frequency are unchanged, call
    new `_seriesGaps(seriesId, editedTx, sched)`: step the old slots from `baseDate` up to
    `sched.endDate` using the OLD anchor (BUG-51); take one row per occurrence after `baseDate`, skipping
    the edited pair and counterpart legs (expense leg represents a transfer pair); assign each row to its
    nearest slot (so 'Only this' moves and old 28th-drift dates match); return indices of empty slots;
    bail out with `[]` if any slot holds two members (old behaviour).
  - After the processing pass (call `_processRecurringTransactions()` inside the case), step the new
    slots from the new date with the new anchor; remove members on gap indices with the existing
    `_removeSeriesMembers`, never the armed member; then `_syncSeriesSchedule` and save.
  - Slot k ↔ slot k (the BUG-52 end shift in the view, `views.js:2538`, keeps the slot count).
  - Covers date moves and End Date changes, 'future' and 'all', both `UPDATE_*` handlers via shared helpers.
  - Interval/frequency change: gaps cannot be mapped → the scope sheet warns. The form computes
    `gapNote` from public `Store.seriesGapCount(seriesId, txId)` only when `rebuilds` and
    interval/frequency changed (`views.js:2689–2712`); `RecurringUpdateModal` renders it next to
    `ru-paid-note` (`components.js:3104`).
- **Tests.** `recurrenceEditing.test.js`: Rent case (delete 1 Jan 'Only this', move 1 Nov→2 Nov 'future':
  no 2 Jan); 'all'; End Date extension; backward move; an 'Only this' unlinked slot not duplicated;
  frequency change refills. `recurringTransfers.test.js`: gap kept for pairs (both legs removed).
  `recurringSeriesForm.test.js`: note only on a frequency change with a gap.
- **i18n.** New `recUpdate.gapNote` (en: "Payments you deleted from this series come back with the new
  schedule.").

### BUG-51 (Med): month-end monthly series drift to the 28th; BUG-159 rides along
- **Root cause.** `_calculateNextRecurrenceDate` (802–809) clamps against the base date's own day;
  `_processRecurringTransactions` (1090) feeds it the previous member. Years branch (810) has no clamp
  (29 Feb + 1y → 1 Mar).
- **Fix.**
  - Optional 4th param `anchorDay`. Months and years use integer month arithmetic with
    `day = min(anchorDay || baseDay, daysInMonth)`. Without anchor, months behave as today (existing test
    `recurrenceEditing.test.js:499` passes); years now clamp to 28 Feb. Don't call
    `LoanEngine.addMonthsClamped` (store must load without loan-engine.js, see ≈4575); inline the same
    logic with a "mirrors addMonthsClamped" comment + parity test. Keep local-time, noon-anchored string
    math (no `toISOString`).
  - New `recurrence.anchorDay` (not `startDate`: form never sends it and it drives the 60-month cap).
    Written by ADD_TRANSACTION / ADD_TRANSFER (payload date's day, both legs); UPDATE_TRANSACTION when
    recurrence is newly enabled (≈1942); regenerate branches when `dateChanged` (2092; 2367 both legs)
    → new date's day (a 'future' date edit sets a new anchor).
  - Legacy reader `_anchorDayOf(rec, date)`: `rec.anchorDay`, else `startDate`'s day if `date` is a
    clamped month-end shorter than it, else the date's own day.
  - Callers that pass it: `store.js:1090` (generator's recurrence; clones copy `anchorDay`), 2092, 2367,
    `_moveSeriesEnd` (≈5137/5140), `getLoanSeriesSyncPlan` (≈4967), the form's slot counter
    `views.js:2543` (old anchor for the old chain, new date's day for the shifted one).
    `components.js:1282/1314`, `widgets.js:878` and the 5-year prefill (`views.js:2074/2460`) stay
    without anchor.
  - `anchorDay` is a per-chain copy, NOT a schedule key: don't add to `_stampSchedule`.
  - Rider BUG-159: also fix `_clampRecurrenceEndDate`'s `setMonth(+60)` 29 Feb overflow (≈786) with the
    same stepper.
- **Heal `_healSeriesAnchors` (D4).** In `Store.init` after `_healRecurrenceGenerators` and before
  `_processRecurringTransactions` (with the other 1.0.2 heals), and inside `BATCH_IMPORT_TRANSACTIONS`.
  Only series with no `anchorDay` and start day ≥ 29 (monthly) or 29 Feb start (yearly). Replay the old
  stepper from `startDate`; proceed only if every member date (both legs) is in that legacy sequence
  (gaps allowed). Re-date members dated AFTER today (both legs) to the anchored k-th slot, recompute the
  armed tail's `nextDate`, stamp `anchorDay` on every member (idempotency). Past dates never move. Save
  only changed slices. No `AnchorDay` CSV column (fallback reader is adequate).
- **Tests.** New `tests/unit/recurrenceMonthEnd.test.js`: 31 Oct → 30 Nov, 31 Dec, 31 Jan, 28 Feb, 31 Mar;
  29 Feb 2028 yearly → 28 Feb 2029 … 29 Feb 2032; ADD_TRANSACTION / ADD_TRANSFER chains; 'future' move
  sets anchor (15th → 31st does not decay); heal proven / skipped / idempotent; parity with
  `LoanEngine.addMonthsClamped`. Update `recurringSeriesForm.test.js`, `loanSyncInPlace.test.js`,
  `csvRoundTrip.test.js` as needed.

### Riders
- **BUG-99:** `if (payload.time !== undefined) item.time = payload.time` in both leg branches of
  `UPDATE_TRANSFER` (2273–2290) and its scoped propagate loop (2315–2342); mirror in
  `UPDATE_TRANSACTION`'s counterpart sync (≈1900). Test in `recurringTransfers.test.js` or
  `transferEditCounterpart.test.js`.
- **BUG-103 (swipe only):** replace the inline `Modal.show` at `views.js:1288–1313` with
  `Components.RecurringDeleteModal.show({ onlyThis, thisAndFuture, allTransactions })` dispatching
  `DELETE_TRANSACTION` with `{}` / `{deleteFuture:true}` / `{deleteAll:true}`. Retire
  `history.recurringDelete.{title,body,onlyThis,withFuture}` from all 5 dictionaries if nothing else uses
  them. Bulk unchanged. Test in `transactionSwipeActions.test.js`.
- **Check (not a gate item):** converting the income leg of a recurring transfer to Income with 'future'
  may drop the armed expense legs → series loses its generator (`store.js:1987`). Verify with a test;
  fix only if trivially safe, otherwise report.

---

## U2 — Opening date & transaction form (BUG-137, 41, 138, 42; riders 153, 154, 46-part)

Line refs: the report's views.js lines are ≈350 lines low; use these.

### Shared rule (BUG-137 + BUG-41)
- **Root cause.** `Store._isTxBeforeOpeningDate` (store.js:3663, strict `date < openingDate`, opening
  rows exempt) drives every aggregate and the History list (`getFilteredTransactions` store.js:1403,
  called from views.js:843 and :1173). Edit Account save (views.js:4597–4639) dispatches `UPDATE_ACCOUNT`
  which re-dates the opening row (store.js:1707–1713); the log form save (views.js:2385–2716) never checks;
  new accounts default to today (views.js:4311–4315). A transfer into a later-opened account keeps only
  the From leg.
- **Store helpers:**
  ```js
  // 1.0.3 (BUG-41/137): rows a later opening date would newly leave out.
  openingDateImpact(accountId, newDate) {
    const from = this.getAccountOpeningDate(accountId) || '';   // already-excluded rows don't count again
    let count = 0, net = 0, earliest = null;
    for (const t of this.state.transactions) {
      if (t.accountId !== accountId || t.type === 'opening_balance' || !t.date) continue;
      if (t.date >= newDate || (from && t.date < from)) continue;
      count++; if (!earliest || t.date < earliest) earliest = t.date;
      if (t.isPaid !== false) net += this._isPositiveTx(t) ? Math.abs(t.amount) : -Math.abs(t.amount);
    }
    return { count, net: Math.round(net * 100) / 100, earliest };
  },
  // legs: [{accountId, date}] → [{accountId, openingDate}] (deduped)
  openingDateConflicts(legs) { /* legs where this._isTxBeforeOpeningDate({accountId, date, type:'x'}) */ }
  ```
  (Check the real name of the sign helper; use whatever the store uses for signed amounts.)
- **One sheet `Components.OpeningDateSheet.show({title, body, primaryText, onPrimary, anywayText, onAnyway})`**
  built on `_bankSheet` (components.js ≈4196), id `opening-date-sheet`, ProLockModal/NoticeSheet family.
  Buttons top→bottom: `#opening-date-primary` (btn-primary), `#opening-date-anyway` (btn-secondary),
  `#opening-date-cancel` (btn-secondary, `data-back-dismiss`). Backdrop tap closes. Android Back clicks
  Cancel and leaves the dirty form open. Escape account names before they become t() params; dates via
  `Intl.DateTimeFormat(Store.getLocale(), {dateStyle:'medium'})`. Every dispatching action goes through
  one `Store.batch`. Call `StackdHydrateIcons` on the sheet root if it renders icons.

### BUG-137 (Edit Account)
- Refactor the click body into `save(opts)`. Check only when `account && obTouched` (opening date
  touched): `const imp = Store.openingDateImpact(account.id, obDate)`; if `imp.count > 0 &&
  !opts.skipOpening` show the sheet: **"Open on {date} instead"** (`openingDate.useEarliest`) sets
  `dateEl.value = imp.earliest` then `save({skipOpening:true})`; **"Change anyway"** → `save({skipOpening:true})`;
  Cancel → nothing saved. A rename-only save never re-warns (lower bound is the current opening date).
  New account dated in the future: no check (log form covers back-fills).

### BUG-41 (log form, new and edit) — D2: dimmed rows in History
- Check after the To check (views.js:2501) and BEFORE the scope gate (before `RecurringUpdateModal`).
  Legs: expense/income `[{accountId, date}]`; transfer From and To with `date`. Skip on an edit where
  neither the date nor any leg's account changed. Wrap the scope-gate tail as `proceed(moveOpening)`;
  `doDispatch` becomes:
  ```js
  Store.batch(() => { if (moveOpening) conflicts.forEach(c =>
    Store.dispatch('UPDATE_ACCOUNT', { id: c.accountId, openingDate: date })); applyChange(scope); })
  ```
  (`UPDATE_ACCOUNT` with only `openingDate` re-dates the existing opening row, amount untouched —
  verify at store.js:1697–1713.) Choices: **"Move opening date to {date}"** / **"Save anyway"** /
  Cancel. Body explains both meanings. If both transfer legs conflict, one `txBody` line per account.
- **Dimmed rows:** `getFilteredTransactions(pageKey, overrideFilters, opts)` with
  `opts.keepBeforeOpening` skips the line-1403 test (default unchanged; `accountBalanceRefactor.test.js:97`
  and `openingBalanceForm.test.js` keep passing). Use it only at views.js:843 and :1173 (select-all matches
  the list). `signedRowAmount` (views.js:866): `if (Store._isTxBeforeOpeningDate(tx)) return 0;` so day
  sums and In/Out skip them; START/END already via `getBalanceAtDate`. `TransactionItem.render`
  (components.js:858) option `beforeOpening` → inline `opacity:.55` + subtitle `history.beforeOpening`
  (inline style because stylesheets have no cache-busting).

### BUG-138 (transfer → Income on the wrong account)
- **Root cause.** Render (views.js:1646–1660): a tapped income leg sets `initialAccount =
  counterpart.accountId` (From) and the sent amount; toggles (2105–2107) and `updateUIVisibility`
  (1940–1983) only restyle; save (2630–2647) sends From/sent. `UPDATE_TRANSACTION` keeps the tapped role's
  leg (`keptType`, store.js:1987–2007) but payload `accountId`/`amount` overwrite it (1960–1965). No
  store change.
- **Form fix (only when editing an existing pair: `editedTx && editedTx.transferRef`).**
  - Snapshot seeded at attach from the stored pair `{from, to, amount (sent), received, receivedCcy}`;
    overwritten from the DOM whenever the user leaves Transfer (From, To, `#tx-amount`,
    `#tx-received-amount` + `data-ccy`). Seeding from the store keeps the add-category draft round trip.
  - Replace the three click handlers with `setType(next)`:
    - → income: `accountSelect.value = snap.to`; amount = same currency: the transfer amount; cross
      currency: `receivedInput.value || snap.received` (covers the D-U8-4 1:1 legacy case).
    - → expense: `snap.from`, `snap.amount`.
    - income ↔ expense: re-apply the mapping unless the user changed account or amount since the last
      toggle (`touched` flag from their input/change listeners).
    - → transfer: restore from, to, amount, then received value + `dataset.ccy`, all BEFORE
      `updateUIVisibility()` (so `syncReceived` doesn't park/clear).
    - Set account values directly and call `syncTransferTo(false)` (hoist it above the toggles). No
      synthetic `change` (BUG-21 swap would fire). Always refresh `#currency-symbol`.
  - Works for either tapped leg. New logs: unchanged.

### BUG-42 (Opening Balance paste appends)
- **Root cause.** views.js:4583–4592 `(currentDigits + pastedDigits)`; field is cents-style
  (`processDecimalShift` ≈4547).
- **Fix:**
  ```js
  const onPaste = (text) => { /* shared by 'paste' and beforeinput insertFromPaste */ };
  obInput.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text') || '';
    const v = obInput.value, s = obInput.selectionStart ?? v.length, en = obInput.selectionEnd ?? v.length;
    const whole = (s === 0 && en === v.length) || !/[1-9]/.test(v);   // all selected, or field is 0.00
    if (whole) {
      const n = window.Store.parseAmount(text);
      if (n === null) return;
      if (Number.isNaN(n) || Math.abs(n) >= 1e10) { showFieldError(obInput, I18n.t('form.amountInvalid', {example: Store.amountExample()})); return; }
      if (n < 0) { isNegativeOb = true; updateObSignUI(); }              // positive never flips it back
      clearFieldError(obInput); obInput.value = Math.abs(n).toFixed(dp); return;
    }
    obInput.value = v.slice(0, s) + text.replace(/\D/g, '') + v.slice(en);
    processDecimalShift();
  });
  ```
  Results: '1.234,56' → 1234.56; '1500' → 1500.00; '99.9' → 99.90. Same listener covers New Account.
  Also route `beforeinput` with `inputType === 'insertFromPaste'` (Gboard chip) to the same function
  (prevent default, read `e.data || e.dataTransfer?.getData('text')`). Check the real names of the
  sign-state variables in EditAccountView.

### Riders
- **BUG-46 (Opening Balance only):** `Store.currencyDigits(code)` cached from
  `Intl.NumberFormat('en', {style:'currency', currency: code}).resolvedOptions().maximumFractionDigits`
  (try/catch → 2). Use `dp` in `processDecimalShift` (`10**dp`, `toFixed(dp)`), the render prefill
  (≈4388 hardcoded `toFixed(2)`), placeholder, paste path, and the currency-select listener (≈4482:
  re-format with the new dp). CNY display (`formatCurrency` store.js:3520, pinned by
  `localeFormatting.test.js:83`) and other money fields: out of scope.
- **BUG-153:** shared `_nameKey(s)` = `String(s).normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase()`
  in `findAccountByName` and `findCategoryByName` (store.js:717–735) and the `nameChanged` comparisons
  (views.js:4617 and the category form ≈3024). Save the collapsed name (case kept). Callers import.js:1860
  and bank naming views.js:7205 benefit.
- **BUG-154:** render (≈4361): add a selected `<option>` for an unlisted `currencyValue` (escaped code);
  save (≈4638): send `currency` only when `select.value !== account.currency`.

### Tests
- New `tests/unit/openingDateConflicts.test.js`: helper (newly excluded only; no lower bound without an
  opening row; unpaid in count not net; earlier date → 0; transfer legs per account); Edit Account (later
  date opens sheet and dispatches nothing; each button; rename-only no sheet); log form (expense before
  opening → sheet; Move re-dates the opening row and the row counts, one batch; Save anyway saves and
  excludes; transfer into a later-opened account names that account; unchanged edit no sheet; on a series
  member the opening sheet precedes the scope sheet; Back → Cancel).
- Update `openingBalanceForm.test.js:385` (08-20 → 09-01 now opens the sheet: click `#opening-date-anyway`).
- `historySummary.test.js` (dimmed row + label, day sum/In-Out exclude, START/END unchanged);
  `transferEditCounterpart.test.js` + `crossCurrencyTransferForm.test.js` (both legs; Income → To with
  received; Expense → From with sent; Transfer restored; balances after save same-currency and
  cross-currency; D-U8-4 legacy); `openingBalanceDecimalShift.test.js` (select-all paste 1.234,56 / 1500 /
  99.9; caret paste; paste into 0.00; -450; invalid text; JPY typing 150000 → 150000);
  `findAccountByName.test.js` (double space, NBSP); `accountCurrency.test.js` (CAD account survives a
  rename). Prefer new test files where an existing one is shared with another unit.
- E2E (integrator runs): `cross_currency_transfer.spec.js` BUG-138; BUG-137 + BUG-42 paste; BUG-41
  back-fill transfer.

### i18n keys (en; write fr/it/es/pt equivalents)
| Key | English |
|---|---|
| `openingDate.txTitle` | Before the opening balance |
| `openingDate.txBody` | {account} opens on {date}. Earlier entries are kept but don't count in balances, budgets or charts. |
| `openingDate.move` | Move opening date to {date} |
| `openingDate.saveAnyway` | Save anyway |
| `openingDate.accountTitle` | Entries before this date |
| `openingDate.accountBody.one` | 1 entry ({amount}) is dated before {date}. It will stay in History but no longer count in balances, budgets or charts. |
| `openingDate.accountBody.other` | {count} entries ({amount}) are dated before {date}. They will stay in History but no longer count in balances, budgets or charts. |
| `openingDate.useEarliest` | Open on {date} instead |
| `openingDate.changeAnyway` | Change anyway |
| `history.beforeOpening` | Before opening balance · not counted |

---

## U3 — Budgets & Home resume (BUG-140, 142; riders 58, 104, 105, 160, 164, 115)

### BUG-140 — D3: limit history from the viewed month
- **Root cause.** `SAVE_BUDGET` (store.js:2905–2915) merges payload → `amount` overwritten.
  `getBudgetForMonth` (4140–4183) reads one `baseAmount` (4149) for the month and every past month's
  `remainder` in the carry loop (4156–4172). Non-cumulative past months also change.
- Readers: Goals (views.js 3093/3104/3472), Home budgets widget (widgets.js 1060/1194). 50/30/20 and
  insights don't read budgets. Only the editor prefill and export read `budget.amount` directly.
  `_budgetSpendIdx` is limit-independent: nothing new to invalidate. Cross-tab (591) and `_reloadSlice`
  (1558) reload the whole slice.
- **Shape.** Keep `amount` = the newest limit (keeps the deleted marker 0, export filter, Remove).
  Optional `limits: [{from:'', amount}, {from:'YYYY-MM', amount}, ...]` sorted, first `from:''`, stored
  only with ≥2 entries. No migration, no boot write.
  ```js
  _budgetAmountFor(b, ym) {
    if (!(parseFloat(b.amount) > 0)) return 0;              // deleted-budget marker
    const l = b.limits;
    if (!Array.isArray(l) || !l.length) return parseFloat(b.amount) || 0;
    let a = l[0].amount;
    for (let i = 1; i < l.length && l[i].from <= ym; i++) a = l[i].amount;
    return parseFloat(a) || 0;
  },
  _normalizeBudgetLimits(list) { /* drop bad from (not '' and not YYYY-MM) or amount <= 0 / non-finite;
    same from: last wins; sort; merge neighbours with equal amounts; force out[0].from = '' */ }
  ```
  `getBudgetForMonth`: `baseAmount = this._budgetAmountFor(budget, yearMonth)`; carry loop
  `remainder = this._budgetAmountFor(budget, lookupMonth) - spentPast`.
- **SAVE_BUDGET** (payload gains optional `effectiveFrom`, `limits`):
  - amount ≤ 0 (Remove): delete `limits`.
  - `limits` array (CSV restore): normalize, replace; `amount` = last entry's.
  - `effectiveFrom` given, record has amount > 0, and new amount ≠ `_budgetAmountFor(prev, effectiveFrom)`:
    `from = (!startDate || effectiveFrom > startDate) ? effectiveFrom : ''`; base = `prev.limits` or
    `[{from:'', amount: prev.amount}]`; keep entries with `e.from < from`; push `{from, amount}`;
    normalize; `amount` = last entry's.
  - `effectiveFrom` given, amount unchanged: keep `prev.limits` (toggling rollover must not erase).
  - Neither given (old callers): flat, delete `limits`.
- **Month.** `Store.state.activeMonthFilter` (the month viewed in Goals) read at Save. Goals opens on the
  current month (router.js:277–281). A change applies from that month on and replaces later limits;
  editing at/before the start month rewrites all.
- **Editor.** Prefill `#bdg-amount` with `_budgetAmountFor(budget, viewedMonth)`. For an existing budget
  where viewed month > start month, caption under the field `budget.appliesFrom` ({month} via
  `toLocaleDateString(Store.getLocale(), {month:'long', year:'numeric'})`). BUG-86 dirty baseline
  unchanged.
- **CSV.** 6th column `Limits` in `BUDGET_HEADERS` (export.js:183): `JSON.stringify(b.limits)` or empty.
  `Amount` keeps the newest limit. `buildBudgets` (import.js:1678): a non-empty valid `limits` array →
  dispatch with `limits`; empty/missing → flat as today; unreadable → flat `Amount`. Re-import idempotent.
- **Tests.** New `tests/unit/budgetLimitHistory.test.js`: 300 from 2026-07 cumulative raised to 400 from
  2026-10 → October carry +4.65, limit 404.65, July stays "of 300"; lowering to 200 → 204.65;
  non-cumulative July stays 300; old record identical; edit at start month rewrites all; same amount /
  rollover toggle keeps later limits; Remove clears; bad entries normalized; editor prefills viewed month.
  Extend `budgetCsvRoundTrip.test.js` (header, Limits round trip, old file flat, idempotent);
  widget uses today's month's limit.

### BUG-142 — Home after a resume on a new day (D6: + midnight timer)
- **Root cause.** `ROLL_PERIODS` (store.js:2852–2859) sets `changed` only when
  `_livePageOf(activeView)` rolled; null for `dashboard` (≈1236). Resume handler main.js:620–635.
  `_liveDay` can't be reused (advances on SET_VIEW; `periodRollover.test.js:151` relies on it).
- Nothing else is date-dependent (series materialized ahead; figures computed at render).
- **Fix.**
  ```js
  // Store.emit: in both the sync path and the microtask flush, before listeners run
  this._renderedDay = this._todayYMD();
  // ROLL_PERIODS
  const rolled = this._rollLivePeriods();
  if (rolled.includes(this._livePageOf(this.state.activeView))) changed = true;
  // 1.0.3 (BUG-142) Home shows as-of-today figures and has no form state
  else if (this.state.activeView === 'dashboard' && this._renderedDay
           && this._renderedDay !== this._todayYMD()) changed = true;
  ```
  Dashboard only (forms: BUG-87; Goals editor lives in 'budget'; History Today scroll). Midnight timer in
  `main.js`: `setTimeout` to `new Date(y, m, d+1, 0, 0, 5)` (DST-safe), runs `rollPeriodsOnResume()` only
  when `document.visibilityState === 'visible'`, re-arms.
- **Tests** (`periodRollover.test.js`): boot 31 Oct 23:45 on dashboard, clock → 1 Nov 00:05,
  ROLL_PERIODS → exactly 1 emit, second dispatch none; same day 0; on 'add'/'budget' 0;
  `StackdDB.save` not called. Update any `main.js` regex test if needed.

### Riders
- **BUG-58:** switching Cumulative Rollover on with an empty Start Month prefills `#bdg-start` with the
  viewed month; the save handler applies the same default. `buildBudgets`: `Cumulative=true` with no
  start → current month. No heal.
- **BUG-104:** end < start → `showFieldError(#bdg-end, t('budget.endBeforeStart'))`. `MonthPicker`
  (components.js ≈3126) gets `clearText`/`onClear` options labelled with the existing `budget.noEndDate`,
  used for `#bdg-end`. (Negative limits already fixed in 1.0.2.)
- **BUG-105:** wrap `#btn-bdg-delete` (views.js:3400) in `Modal.show({title, content, saveText:
  common.cancel, showDelete: true, deleteText: budget.removeLimit, onDelete})` (views.js:1196 pattern);
  `editCategoryId = null` and dispatch only inside `onDelete`. Escape `{name}`.
- **BUG-160:** decide in cents: `overC = Math.round((totalSpent - totalAllocated) * 100)`, overspent when
  `overC > 0`; Remaining `remC/100 || 0` (no -0). views.js 3181/3214/3224, ring 3482, widget
  widgets.js ≈1159. Also the Goals ring (3471–3475) sums ALL categories incl. unbudgeted spend and the
  other tab while the summary sums only displayed budgeted rows: stash `this._passTotals` in `renderList`
  and reuse in `attachEvents`.
- **BUG-164:** limit ≤ 0 and over: `pct = isOver ? 100 : 0` (views.js:3117, widgets.js ≈1110); widget
  label `budget.overBy` instead of '—'. Update test (e) in `budgetOverspendDisplay.test.js`.
- **BUG-115:** History branch of `btnToday` (components.js:1121): if `!isDateInPeriod(today, period)`,
  dispatch `UPDATE_FILTERS` with the same period type ('month' for a custom range), anchored like
  `_rollLivePeriods` (month → `YYYY-MM-01`, year → `YYYY-01-01`), then scroll to today after the
  re-render.
- Tests: `budgetEditorBack.test.js` (58, 104, 105 incl. Back on the confirm sheet),
  `budgetOverspendDisplay.test.js` (160, 164), `homeWidgetsGoals.test.js` (widget), `periodRollover.test.js`
  (115). Prefer new test files where possible.

### i18n keys
| Key | en | fr | it | es | pt |
|---|---|---|---|---|---|
| `budget.appliesFrom` | The new limit applies from {month} on. Earlier months keep theirs. | Nouvelle limite dès {month} ; les mois précédents gardent la leur. | Il nuovo limite vale da {month} in poi. I mesi precedenti mantengono il loro. | El nuevo límite se aplica desde {month}. Los meses anteriores conservan el suyo. | O novo limite aplica-se a partir de {month}. Os meses anteriores mantêm o seu. |
| `budget.endBeforeStart` | End month can't be before the start month. | Le mois de fin ne peut pas précéder le mois de début. | Il mese di fine non può precedere il mese di inizio. | El mes final no puede ser anterior al mes de inicio. | O mês final não pode ser anterior ao mês inicial. |
| `budget.removeConfirm.title` | Remove the {name} budget? | Supprimer le budget {name} ? | Rimuovere il budget {name}? | ¿Quitar el presupuesto de {name}? | Remover o orçamento de {name}? |
| `budget.removeConfirm.body` | Its limit, months and rollover setting will be cleared. | Sa limite, ses mois et le report cumulé seront effacés. | Limite, mesi e riporto cumulativo verranno cancellati. | Se borrarán su límite, sus meses y el traspaso acumulado. | O limite, os meses e o transporte acumulado serão apagados. |
(In `removeConfirm.body` use each dictionary's existing wording for `budget.cumulativeRollover`.)

---

## U4 — Loan simulator input & CSV decoding (BUG-145, 152; riders 71, 118, 147)

### BUG-145 (+ BUG-71)
- **Root cause.** `buildConfig` (views.js:4890–4891) `num = parseFloat`, blank → 0. `type="number"`:
  `#dsim-principal` 5049, `#dsim-down` 5056, `#dsim-rate` 5074, `#dsim-duration` 5061. Also
  `updateDownPct` 5163 parseFloat; sheets: rate change `#dsim-rc-rate` 5260, early repayment
  `#dsim-er-amount` 5287, extra cost `#dsim-ex-amount` 5321. Track form already uses `#tx-amount`
  (BUG-50).
- **Pattern to copy:** `#tx-amount` (views.js:1742), `#bdg-amount` (3289): `type="text"
  inputmode="decimal" autocomplete="off"`, escaped value; `Store.parseAmount` (store.js:3556) → null
  empty / NaN unreadable; errors `form.amountInvalid {example: Store.amountExample()}` and
  `form.amountRequired` via `showFieldError` (views.js:52); prefill `String(Math.round(x*100)/100)`.
- **Design.**
  1. Principal, down, `#dsim-er-amount`, `#dsim-ex-amount` → `type="text" inputmode="decimal"
     autocomplete="off"`, drop step/min. Rate fields (`#dsim-rate`, `#dsim-rc-rate`) → text +
     `inputmode="decimal"`. Duration stays `type="number" inputmode="numeric"`. **Escape** values with
     `escapeAttr` (they were raw; text inputs re-render typed drafts into the attribute).
  2. Prefill (`newDraft` 4752–4756): `principal: c.principal != null ? String(Math.round(c.principal*100)/100) : ''`,
     same for downPayment; rate `String(c.annualRate)`.
  3. `parseRate(raw)`: `const s = String(raw ?? '').trim().replace(/\s*%$/, ''); return /^\d+([.,]\d+)?$/.test(s) ? Number(s.replace(',', '.')) : NaN;`
  4. `buildConfig`:
     ```js
     const money = (v) => { const n = window.Store.parseAmount(v); return n === null ? 0 : n; }; // NaN passes through
     principal: money(d.principal),
     downPayment: d.type === 'mortgage' ? money(d.downPayment) : 0,
     duration: String(d.duration).trim() === '' ? 0 : Number(d.duration),   // 2.5 reaches E_DURATION (BUG-71)
     annualRate: this.parseRate(d.annualRate),                               // blank → NaN → E_RATE (BUG-71)
     ```
     Verify LoanEngine rejects NaN rate / non-integer duration with E_RATE / E_DURATION; if not, map in
     `engineError`.
  5. `engineError` (≈5136): prelude BEFORE the E_DOWNPAYMENT remap:
     ```js
     if (config) for (const [k, f] of [['principal','dsim-principal'],['downPayment','dsim-down']])
       if (Number.isNaN(config[k])) return { message: window.I18n.t('form.amountInvalid', { example: window.Store.amountExample() }), field: f, details: false };
     ```
     Keep the existing `#dsim-error` / aria-invalid / focus channel for the main form.
  6. `updateDownPct`: `Store.parseAmount`; show the hint only when both values are finite and > 0.
  7. **Sheets (BUG-118):** each `onSave` starts with `clearFieldErrors(sheetRoot)`, then
     `showFieldError(el, t(key), {focus:true})` on the first faulty field instead of a bare `return`:
     rate change: `parseRate`, NaN or out of [0,100) → `debt.err.rate`; no date → `form.dateRequired`.
     Early repayment: NaN → `form.amountInvalid{example}`, null/≤0 → `form.amountRequired`; no date →
     `form.dateRequired`. Extra cost: no name → `debt.err.costName`; NaN → `form.amountInvalid`; null/<0
     → `debt.err.costAmount` (0 allowed). Loan name prompt (≈5746): empty → `debt.err.loanName`.
- **Tests.** `debtView.test.js`: buildConfig under `I18n.setLang('it')` '250.000' → 250000, '50.000' →
  50000; en '1,234.56' → 1234.56; rate '3,2' → 3.2, '4.125' → 4.125; blank rate → E_RATE; '2.5' years →
  E_DURATION; prefill 1.23456 → '1.23'; a `"` value renders escaped. `debtEngineErrors.test.js`: NaN
  principal/down → `form.amountInvalid` on the right field; remove the `min="0"` assertion (≈208); three
  sheet cases (aria-invalid + message). E2E `debt_simulator.spec.js` (integrator): existing fills keep
  passing; add an 'it' case and a rate-sheet 150 → aria-invalid case.

### BUG-152 — D7: silent windows-1252 fallback
- **Root cause.** `reader.readAsText(file)` at import.js:1985 (`importLoans`), 2005
  (`importTransactions`), 2135 (`importCSV`). Only `importCSV` is live (views.js:4124); bank CSV, camt,
  MT940 all parse its text (2031–2033).
- **Helper on `StackdImport`, next to `_readRecords`:**
  ```js
  // 1.0.3 (BUG-152)
  _decodeBytes(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8.subarray(2));
    if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } // strips a UTF-8 BOM
    catch (e) { return new TextDecoder(this._xmlDeclaredEncoding(u8) || 'windows-1252').decode(u8); }
  },
  _xmlDeclaredEncoding(u8) {
    const head = new TextDecoder('windows-1252').decode(u8.subarray(0, 200));
    const m = /^\s*<\?xml[^>]*\bencoding\s*=\s*["']([\w.:-]+)["']/i.exec(head);
    if (!m) return null;
    try { return new TextDecoder(m[1]).encoding; } catch (e) { return null; }
  },
  _readFileText(file, onText, onError) {
    const reader = new FileReader();
    const bytes = typeof reader.readAsArrayBuffer === 'function' && typeof TextDecoder === 'function';
    reader.onload = (e) => {
      let text;
      try { text = bytes ? this._decodeBytes(e.target.result) : e.target.result; }
      catch (err) { onError(err); return; }
      onText(text);
    };
    reader.onerror = () => onError(new Error('Failed to read file'));
    if (bytes) reader.readAsArrayBuffer(file); else reader.readAsText(file);
  }
  ```
  `importCSV`: the `reader.onload` body (the `Store.batch` block) becomes `onText`; the decode try is
  separate so a batch throw is never double-reported. Route `importLoans`/`importTransactions` through
  the helper too (delete later). U+FFFD guards (import.js:739, :1858) stay. `buildTransactions` category
  path unchanged.
- **Test env:** Node 24 full-ICU TextDecoder (windows-1252 OK, fatal throws, BOM stripped); jsdom 29
  FileReader has async `readAsArrayBuffer`. ~15 unit files mock `global.FileReader` with only
  `readAsText` (sync) → the helper falls back, all stay green.
- **Tests.** New `tests/unit/csvEncoding.test.js`: pure `_decodeBytes` (UTF-8, UTF-8+BOM, cp1252
  "Caffè €", UTF-16LE+BOM, invalid UTF-8 → 1252); a mock with `readAsArrayBuffer(f){ this.onload({target:
  {result: f.bytes}}) }` and a 1252 encoder map: ANSI backup (accounts + categories UTF-8, transactions
  1252) → no new category, both rows in "Caffè & Bar", notes intact; ANSI bank CSV → `result.csvText`
  contains "CAFFÈ" and "José Müller"; camt with `encoding="ISO-8859-15"`; MT940 Latin-1.

### BUG-147 (rider)
- `import.js:18–40 _parseRow`: track `atStart` (only whitespace seen in the field so far); `"` opens quote
  mode only while `atStart`; elsewhere literal; inside quotes `""` is an escaped quote; reset at the
  delimiter. Check the RFC 4180 record reader `_readRecords`/`_splitRecords` for the same rule (a quote
  mid-field must not start a multi-line record). Tests in a new file or `csvRecords.test.js` /
  `bankImport.test.js`: `TV 55" SAMSUNG;-499,00`, two such rows adjacent, `_detectDelimiter` on a header
  with an inch mark; Stack'd exports still round-trip.

### i18n keys
| key | en | fr | it | es | pt |
|---|---|---|---|---|---|
| debt.err.costName | Enter a name for this cost. | Saisissez un nom pour ce coût. | Inserisci un nome per questo costo. | Introduce un nombre para este coste. | Introduza um nome para este custo. |
| debt.err.costAmount | Enter an amount of 0 or more. | Saisissez un montant de 0 ou plus. | Inserisci un importo pari o superiore a 0. | Introduce un importe de 0 o más. | Introduza um montante igual ou superior a 0. |
| debt.err.loanName | Enter a name for this loan. | Saisissez un nom pour ce prêt. | Inserisci un nome per questo prestito. | Introduce un nombre para este préstamo. | Introduza um nome para este empréstimo. |
