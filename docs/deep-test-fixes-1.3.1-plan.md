# Deep Testing Report fixes — Plan (1.3.0 → 1.3.1)

**Status: APPROVED 2026-11-21 (owner chose every recommended default, D1–D6); build in progress on the local branch `fixes-1.3.1`.**

**Source:** *Stack'd 1.3 Testing Report* (2026-11-21; private artifact
claude.ai/artifact/KfNF4r6zbVeEBkduHUZ8C2, Markdown copy in `Desktop\Projects`). It covers 52
criteria and lists 128 open bugs: 46 new (BUG-176..221: 2 high) and 82 carried. The release gate
is the report's **"Fix before release"** bucket of 10 bugs. This plan covers those 10, plus
**riders**: later-bucket bugs in the same lines that cost little extra.

**What was checked for this plan.** The cited lines were read at `7aefea3` for every gate bug.
The findings were each reproduced twice by a tester; there was no second independent replay, so
**each unit starts by reproducing its bugs from the report's steps** (as a failing test where a
unit test can reach it) before changing code.

Working data: `scratch/deeptest-1.3/report/bugs.json` (every bug with steps, cause and fix
direction) and each tester's `notes.md`.

Comment tag: `// 1.3.1 (BUG-NN)`.

---

## Item map — the 10 gate bugs

| Bug | Sev | Root cause (read at 7aefea3) | Fix | Unit | Effort |
|---|---|---|---|---|---|
| 176 | High | `UPDATE_TRANSACTION` `propagate()` builds `tUpdate = { ...updatePayload }` (`store.js:2638`), and the form always sends every field (`views.js:3847`), so amount, account, category, note and tags of the tapped payment land on every payment in scope. `UPDATE_TRANSFER` does the same (`store.js:2990`). The amount warning (`recUpdate.rebuildAmountNote`) shows only when the save rebuilds (`views.js:3919`). | **D1.** Recommended: spread only the fields the user changed. In both actions compare the payload with the tapped payment's stored values and drop unchanged keys from `tUpdate` before the loop (date, type, paid state and attachments keep their existing per-payment rules). | U1 | M |
| 180 | Med | A scoped date/schedule change drops every later payment and rebuilds the chain; `_processRecurringTransactions` deletes `attachments` on each clone (`store.js:1474`), then `_dropDetachedAttachments` removes the files. | Carry receipts across a rebuild by slot, the way `_seriesGaps` / `_dropSeriesGaps` already map slots: before the drop, record `{slot → attachments, amountEdited?}` for dropped payments; after the rebuild, put them on the payment of the same slot. A payment whose slot no longer exists (frequency changed) keeps its receipts on the nearest earlier survivor, and the sheet says so (**D2**). | U1 | M |
| 181 | Med | A series has one interval and frequency, read from the armed tail (`getSeriesSchedule`, `store.js:1181–1213`). After a "This and future" frequency change the earlier payments still belong to the same series, so a later rebuild from one of them steps with the tail's frequency. | A "This and future" change of interval or frequency from a payment that is not the first **splits the series**: the tapped payment and later ones get a new `seriesId`; the old series ends on the payment before it (`_syncSeriesSchedule`, `_disarmSeries`). A loan-linked series keeps its id on the part that holds the armed tail and `linkedSeriesId` follows it (**D3**). | U1 | M |
| 136 (rest) | Med | The form's "payment becomes a transfer" branch dispatches `DELETE_TRANSACTION { deleteFuture: true }` from the tapped date whatever today is (`views.js:3791–3795`), also when Recurrent was switched off. | When Recurrent is off, first dispatch `UPDATE_TRANSACTION { recurrence: null, scope }` (it already keeps and unlinks payments dated today or earlier, 1.0.3 rule 2), then convert the tapped payment alone. With Recurrent on, keep the current path but split at the later of the tapped date and today. | U1 | S |
| 177 | High | The y-axis tick callbacks of the wide Income vs Expenses and Personal savings widgets build the label from `getCurrencySymbol` + `toLocaleString` (`widgets.js:596`, `:985`), never through `formatCurrency`, so they are not masked. | Both callbacks call `Store.formatCurrency(val, ccy, { whole: true })` (masked on Home, and the word-sign spacing comes right: rider BUG-192). Add a guard test: every widget chart rendered with `privacy.hide` on must contain no digit in its tick labels. | U2 | S |
| 185 | Med | `DashboardView.setHidden` cloaks and re-renders `#router-view` only (`views.js:1449–1512`); sheets opened from Home are outside it. | In `setHidden`, after the single `SET_PRIVACY`: re-render `ExpandedGraphModal` if open (`renderModalContent`), and close the add-widget sheet's live previews by re-running their mount (or closing the sheet) (**D4**). Same for `RecurringPaymentsSheet`. | U2 | S |
| 182 | Med | The Goals save handler lets an empty field or 0 through (`views.js:4708`), and `SAVE_BUDGET` with amount 0 drops the budget and its limit history (`store.js:3731`). | On an existing budget, empty or 0 opens the same "Remove budget limit?" sheet as `#btn-bdg-delete`; on a new one it shows the amount error. No store change. | U3 | S |
| 189 | Med | `importText` reads the date-order fallback from raw `Store.state.exportPrefs`, which is null until Export settings are saved once (`import.js:3460`), so `_guessDateOrder` falls back to day-first while the English export writes MM/dd. | Use `Store.getExportPrefs()` (language defaults). And when `_guessDateOrder` answers `ambiguous: true`, Review shows a notice with a Day-first / Month-first choice before Import (**D5**). | U4 | S–M |
| 190 | Med | `ledgerToRows` treats the first balance row as a *closing* row when most entries are dated before it (`import.js:2868`) and skips it. True for a foreign file, wrong for Stack'd's own export, where that row is always the opening balance. | Skip the majority test when the file is a Stack'd export (detect by the app's own header set / balance word, as `_isStackdTxFile` does for backups). | U4 | S |
| 75 | Med | `pendingLoanLink` is consumed only in `ADD_TRANSACTION` (`store.js:2414–2430`); `ADD_TRANSFER` never links, so the loan stays untracked and offers tracking again. The form also links whatever amount and cadence are saved. | `ADD_TRANSFER` consumes the pending link (series id on the expense leg). On save from the Track form, if amount, cadence or type differ from the instalment, a one-line notice says the loan will follow the saved payment (**D6**). "Tracked as…" reads the series' real cadence. | U3 | M |

## Riders (recommended)

| Bug | Sev | What | Unit |
|---|---|---|---|
| 192 | Low | Chart axes glue a word currency sign to the figure ("zł1,000"): fixed by the same two callbacks as 177, plus `NetFlowChart` y ticks (`components.js:2638`). | U2 |
| 219 | Low | Backup file says "Stack'd 1.2.0": `backup.js:13` reads the version from the page title / a constant written by `version:sync`; add it to `versionSync.test.js`. | U4 |
| 217 | Low | Review says planned rows "are imported as unpaid" but they come in paid: correct the sentence in five dictionaries (or import them unpaid; the sentence is the cheap fix). | U4 |
| 216 | Low | Tags with accents or spaces change on the way back in: `_foldTag` (`import.js:2543`) uses `Store.normalizeTag`. | U4 |
| 197 | Low | "140,737,488,355,328,000%" when a rollover deficit cancels the limit: `getBudgetForMonth` rounds `finalLimit` to cents (`store.js:5688`). | U3 |
| 204 | Low | Insights says "over its budget" at exactly the limit: compare in cents (`insights.js:182`). | U3 |
| 196 | Low | ✕ on New Log / Edit Log drops a filled form without asking: the `a[data-router-leave]` click handler runs the same dirty check as Back (`router.js:59–64`). Also covers BUG-178's lost draft (**check** the Pro path separately). | U1 |
| 220 | Low | User Manual and FAQ describe four tabs and removed controls: rewrite the affected `manual.*` keys in five languages; gate the two Bank Connect FAQ entries on `BankConnect.FEATURE_ENABLED`. | U5 |

**Not in 1.3.1** (assessed, deferred): BUG-179 (opening balance deletable from History: an
accepted limit of 1.0.2; revisit with the owner), BUG-188 (restore over edited data: needs a
product decision on "restore replaces" vs "restore merges"), BUG-186 (Analytics NET CHANGE vs
opening balance), BUG-191 (History Year view draws every row: needs list windowing), BUG-187
(200 % text layout), and the carried long tail.

## Decisions for the owner

| # | Question | Recommended | Alternative |
|---|---|---|---|
| D1 | BUG-176: what does a scoped edit spread? | **Only the fields that changed in this edit.** A note-only edit touches notes only. | Keep spreading everything, and show the amount warning whenever a payment in scope has a different amount. |
| D2 | BUG-180: a receipt whose payment disappears in a rebuild (frequency change) | **Move it to the nearest earlier payment that survives, and say so on the sheet** ("1 receipt moves to 1 Nov"). | Block the rebuild until the user confirms the receipts will be removed. |
| D3 | BUG-181: split the series on a "This and future" frequency change | **Yes, two series.** Each keeps its own schedule. | One series with a per-payment frequency (larger change to `getSeriesSchedule`). |
| D4 | BUG-185: a sheet open on Home when balances get hidden | **Re-render it masked** (the user keeps their place). | Close it. |
| D5 | BUG-189: an imported file whose dates are all ambiguous | **Ask on Review** (Day-first / Month-first, preselected from the export settings). | Trust the export settings silently. |
| D6 | BUG-75: Track form saved with a different amount or cadence | **Link it and say what the loan will follow.** | Refuse to link unless it matches the instalment. |

## Units and order

Four units can run in parallel worktrees (region ownership as in the 1.0.3 round); U5 is text only.

| Unit | Region | Bugs | Tests to add |
|---|---|---|---|
| U1 | `store.js` UPDATE_TRANSACTION / UPDATE_TRANSFER / series helpers; `views.js` form save; `router.js` leave | 176, 180, 181, 136 (rest), 196 | `recurrenceEditing.test.js`: note-only "All" keeps hand-set amounts (plain and transfer); receipts survive a date move; a frequency split then a move of an earlier payment; Recurrent off + Transfer around today. E2E: one scoped-edit journey. |
| U2 | `widgets.js` chart callbacks; `views.js` DashboardView.setHidden; `components.js` ExpandedGraphModal / AddWidgetModal | 177, 185, 192 | A masked-render guard over every widget chart; e2e: shake with the Balance Trend sheet open. |
| U3 | `views.js` BudgetView + Debt track form; `store.js` ADD_TRANSFER, getBudgetForMonth; `insights.js` | 182, 75, 197, 204 | `budget*.test.js` empty-limit path; `debtView.test.js` track as transfer links once; cents comparisons. |
| U4 | `import.js`, `backup.js`, five dictionaries (review.planned) | 189, 190, 219, 217, 216 | `ledgerImport.test.js`: English export with days ≤ 12 round-trips on a fresh install; pre-opening entries keep the opening balance; `versionSync.test.js` covers the backup label. |
| U5 | `src/i18n/*.js` manual and FAQ | 220 | `i18n.test.js` already guards key parity. |

1. Branch `fixes-1.3.1` from main. Each unit reproduces its bugs first.
2. Merge U1 → U2 → U3 → U4 → U5; bump `?v=` for every edited script (co-dependent files together).
3. `npm version 1.3.1 --no-git-tag-version` + `npm run version:sync` (versionCode 10301).
4. Gates: lint, unit, e2e, `npm run build` + `node tools/check-bundle.cjs`.
5. Re-test the 10 gate bugs from the report's steps on the web build and, for 177 / 185, on the
   Android emulator. Security review, then the AAB and a TestFlight build (10301 or higher).

## Outside the code

- One proxy check of the Android cold-start traffic (about 7 KB in, 5 KB out per start, destination
  not identified) before repeating "nothing leaves the device" for Android.
- Fix `tools/seed.cjs`: `ADD_TRANSFER` wants `expenseAccountId / incomeAccountId / note`; then
  re-capture the store and website screenshots.
- No boot heal is planned: amounts already overwritten by BUG-176 and receipts already removed by
  BUG-180 cannot be recovered. The release notes should say what was fixed.

---

## As built (2026-11-21, local branch `fixes-1.3.1`, not committed)

Version 1.3.1 (10301); every edited script is at `?v=122`. Gates: lint clean, unit 2,521 / 2,521
(14 new tests in `recurrenceEdits103.test.js`), e2e 219 / 219, `npm run build` + `check-bundle` OK.
Re-tested in the running web build: BUG-177 (both wide chart axes read `€••••`) and BUG-185 (an
open Balance Trend sheet masks when Home hides). The other fixes are covered by unit tests only.

- **U1** `Store._unchangedEditKeys` (BUG-176, both actions; `moved` in UPDATE_TRANSFER);
  `_seriesReceipts` / `_restoreSeriesReceipts` + `recUpdate.receiptNote` (BUG-180);
  `splitSid` / `splitSidT` + `_moveLoanLink` (BUG-181: only "This and future", only when earlier
  payments exist); `DELETE_TRANSACTION { keepHappened }` sent by the form when Recurrent is off
  (BUG-136); the `a[data-router-leave]` click asks on a dirty form (BUG-196).
- **U2** the three chart tick callbacks go through `formatCurrency(val, ccy, { whole: true })`
  (BUG-177, BUG-192); `Components.refreshHomeSheets()` called from `DashboardView.setHidden`
  (BUG-185: Balance Trend sheet and the add-widget sheet).
- **U3** empty / 0 limit → the Remove confirmation, or an error on a new budget (BUG-182);
  `getBudgetForMonth` rounds `finalLimit` and `spent` to cents (BUG-197, BUG-204); `ADD_TRANSFER`
  consumes `pendingLoanLink` (BUG-75).
- **U4** an install's own export header falls back to `getExportPrefs()`; Review asks Day / Month
  when the dates are ambiguous (`review.dateAmbiguous`, `_ImportDraft.dateAsked`) (BUG-189); a row
  with the app's balance word is always an opening (BUG-190); `tools/version.cjs` writes
  `StackdBackup.VERSION` (BUG-219).
- **U5** seven `manual.*` entries rewritten in five languages; the two Bank Connect FAQ answers
  show only when `BankConnect.FEATURE_ENABLED` (BUG-220).

**Not built:** BUG-217 and BUG-216 (riders: unclear which side is wrong for 217); the D6 notice
for a Track form saved with another amount or cadence (BUG-75's second half).
**Tests rewritten to the new rules:** `crossCurrencyTransfers` (the 80/80 "pin"), `amountInput`
(empty limit), `recurringTransfers` (mid-series frequency change), `supportProse` (FAQ count),
`netFlowChartYScale`, `backup` (label).
**Still to do:** re-test the remaining gate bugs by hand, the Android emulator check for 177 / 185,
the security review, the AAB and a TestFlight build (10301+).

### Replay through the UI (2026-11-21, independent tester, 60b6fc7)

All eight remaining gate bugs were replayed from the report's steps in the web build and hold:
BUG-176, 180, 181, 136 (conversion path), 182, 189, 190 and 75 (Transfer path). Regression pass
clean, no console error. Evidence: `scratch/deeptest-1.3/retest131/` (`results.json`, `notes.md`,
marked screenshots).

Leftovers it found, both low, neither built:
- **NEW-1:** in the BUG-136 flow with "All", the payment BEFORE the tapped one keeps its series
  link although the sheet says past transactions are unlinked too (`views.js` sends the same
  delete for "all" as for "future"; seen once, not replayed twice).
- **NEW-2:** a loan tracked through a transfer reads "Tracked as a monthly expense", and still
  says "monthly" after its series is changed to every 2 months (`debt.trackedMonthly`). This is
  the unbuilt half of BUG-75 (D6).

Also noted: with Recurrent left ON in the BUG-136 flow, every payment from the tapped one becomes
a transfer, past ones included (nothing is lost; the plan's "split at today" for that path was
not built). BUG-181 keeps the later part on its own day (D3).

**Both leftovers fixed (2026-11-21):** `DELETE_TRANSACTION { unlinkPast }` is sent with the "All" scope when
Recurrent is off (NEW-1, one unit test); the loan page reads `debt.trackedRecurring` ("Tracked as a
recurring payment", five languages) unless the linked series is a plain monthly expense (NEW-2).
Edited scripts at `?v=123`; unit 2,522 / 2,522, e2e 219 / 219. Neither was replayed by hand.
