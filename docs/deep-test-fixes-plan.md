# Deep Testing Report fixes — Plan (1.0 → 1.0.1)

**Status: ✅ DONE on 2026-10-02, as 1.0.1 (versionCode 10001); not yet committed. All 23 bugs and the C-49 test pins are fixed and verified. See §As built below. The owner approved the plan and all recommended defaults (D1–D4) on 2026-10-01.**
**Source:** *Stack'd Deep Testing Report* (Android 1.0 RC, commit f8c0f1a, 2026-10-01):
52 criteria and 23 bugs (3 high, 8 medium, 12 low), plus the date-sensitive test
failures in C-49.

**Method.** Every bug was root-caused against the real code by ten read-only
investigators, one per bug cluster. An adversarial reviewer then tried to refute
each diagnosis and break each fix design. **All 23 bugs are confirmed.** The
reviewer corrected 4 of the fix designs (BUG-01, 02, 07, 22) before they reached
this plan. This document is the cold-start reference for the round, the same role
`docs/refactor-plan-2.md` played for v0.93–v0.96. The full per-bug designs (exact
lines, code sketches, test lists) are in the workflow output and are handed
verbatim to each implementation unit.

Comment tag for this round: `// 1.0.1 (BUG-NN)`. Do **not** use `v1.0x`/`v1.1x`;
those collide with the internal pre-launch history.

---

## Item map

| Bug | Sev | Root cause (confirmed) | Fix | Unit |
|---|---|---|---|---|
| 01 | High | The currency sheet dispatches `SET_CURRENCY` on tap (`views.js:3466`), so Done/Cancel only close an already-applied sheet. Every account carries an explicit `currency` (`store.js:1071`, boot migration `284-289`), so a new base makes them all "foreign", and the v1.02 *exclude, never convert* rule zeroes every total. Onboarding can cause the same state: it preselects EUR whatever the existing accounts use (`main.js:721`). | Two-step picker: select, Done, then a confirm sheet that summarises the impact ("N accounts will be left out of totals") with an *Also relabel my N accounts (no conversion)* checkbox. Cancel applies nothing. `SET_CURRENCY` also accepts `{code, relabel}`. Add `Store.currencySwitchImpact`. Add a shared `Components.CurrencySwitchConfirm`, also used by onboarding. Onboarding preselects the base already in use. | U1 |
| 02 | High | `stackd_loans.csv` has no series link (`export.js:63`), `buildLoans` drops it (`import.js:405`), and `_relinkSeries` always re-keys series ids (`import.js:306`). A restored loan is therefore unlinked and offers *Track* again, which doubles every payment. | Add a `LinkedSeriesId` column. On import, keep the CSV series id unless it collides with one in the store. A new `RELINK_LOAN_SERIES` runs after loans or transactions import and, for pre-fix backups, falls back to matching the payment note in all 5 languages. Works in either file order. | U2 |
| 03 | High | `main.js:388` ignores open sheets: on Home it calls `exitApp()`, elsewhere `history.back()`, which leaves the sheet floating and drops forms. | `Router.handleBack()` priority chain: top sheet → FAB menu → selection mode → widget edit mode → confirm leaving a dirty form (add/edit/edit-account/edit-category) → back. Add `Components.dismissTopSheet()` and `data-back-dismiss` on picker close buttons. Bare Home: see **D1**. | U3 |
| 04 | Med | History START/END/NET read only the account filter (`views.js:735-748`). The tag drill-down range spans all transactions. | When a category, type or tag filter is active, the card switches to **In / Out / Net — Filtered total** of the visible rows, using the same rule as the day footers (transfers and unpaid rows excluded). An account-only filter keeps START/END. The tag drill-down range comes from the tag's own rows. | U4 |
| 05 | Med | The same inline sums skip the `isPaid === false` and before-opening-date exclusions that every other aggregate applies. | START/END via `Store.getBalanceAtDate` (one rule app-wide). | U4 |
| 19 | Low | `_getPeriodLabel` custom and week branches format month+day only. The "Today/Yesterday" check uses `toISOString()` (UTC drift), and so does the boot month in `Store.init` (`store.js:326`). | `_formatRangeLabel`: year on both sides when the years differ, once at the end for a past year, en dash. Local-date formatting for Today/Yesterday and the boot month. | U4 |
| 06 | Med | `DELETE_LOAN` only disarms the pending link. | The delete sheet gets an *Also delete the N future payments* checkbox (**D4**). `DELETE_LOAN {deleteFuturePayments}` uses the existing `DELETE_TRANSACTION deleteFuture` path and then disarms the survivors. Past payments and today's are kept. | U5 |
| 07 | Med | `UPDATE_LOAN` merges the config only. Results actions ignore `kind`. | Add `getLoanSeriesSyncPlan`, which prompts **only when the terms changed**: "Update the N future payments to €X?" (amount and, if it followed the loan, the end date). If the loan now ends before the next payment, it offers to delete them instead. Active loans get *Save changes* and an *Edit Loan* title. | U5 |
| 15 | Low | `getLoanProgress` returns early for `row.date <= today` before picking `nextRegularPayment` (`store.js:3297`). | Pick the first row `>= today` as armable. `trackablePayment` is `null` once paid off. Progress semantics are unchanged. | U5 |
| 16 | Low | The 60-month cap is inclusive (start + 60 months = 61 members), but the copy promises 60. | Copy names the end date ("…only created up to {date}"). The global cap is **not** changed: it would alter every recurring series and break the pinned tests. | U5 |
| 17 | Low | Generated members clone the generator's amount. | `_applyLoanFinalInstalment` stamps the tail with the schedule's final amount, only when the series is uncapped, still at the regular amount, and the schedule is uniform. Re-applied after a sync. | U5 |
| 08 | Med | Save validates the amount only (`views.js:2019`). | Inline "Choose a category." for income and expense (**D4**). A re-typed stored category stays selectable on edit. "Unknown" becomes a localized "Uncategorized". | U6 |
| 18 | Low | Empty name → 1 s background flash on an off-screen field. | Shared `showFieldError`/`clearFieldError(s)` helpers: inline message, scroll into view, focus, `aria-invalid`. Used for account name, category name (both forms) and amount. | U6 |
| 21 | Low | `alert()` for recurrence end before start, same-account transfer and Settings import results. | Inline field errors. Import results go to an in-app `NoticeSheet`. The To list excludes From and swaps on collision. The ~25 bank/purchase/export alerts are a follow-up (their tests assert `alert`). | U6 |
| 11 | Med | No uniqueness check in either category form. `buildCategories` upserts by name, so a duplicate overwrites the original's icon. | UI rejects case-insensitive, trimmed duplicates **across all types** (every by-name path ignores the type) with an inline error. Import keeps one row per name (the one matching an existing id, else the first) and skips the rest. | U6 (UI) + U2 (import) |
| 09 | Med | Hard-coded English in widgets and `toFixed` percentages. | `Store.formatPercent` (Intl percent, ASCII `-`, `—` for no value). Keys ×5 with `.one/.other` where count varies. New pseudo-locale guard test that renders every widget and fails on bare English. | U7 |
| 10 | Med | The simulator prints LoanEngine's developer `e.message` (`views.js:4672`, `4720`). | Map engine error codes to `debt.err.*` keys, mark the offending field `aria-invalid` and focus it. One delegated listener clears the mark. | U7 |
| 12 | Low | The sign is `'+'` or `''` (`views.js:182`); the ±100% fallback applies when the previous net is 0. | Real minus. With no basis (previous net under a cent), a neutral pill with "—". | U7 |
| 13 | Low | The rollover pill uses `Math.abs`; the label is clamped by `Math.min(pct,100)`. | Signed rollover; a deficit gets the expense colour. The real % is in the label (the bar stays clamped), plus "Over by €X". The widget shows the real % only. | U7 |
| 14 | Low | `DELETE_ACCOUNT` filters rows by `accountId` only, so the other leg keeps a dangling `transferRef`. | Surviving legs become plain uncategorized income/expense, with a note *Transfer to deleted account "X"*. The armed generator is handed over. A boot heal repairs orphans already on devices. | U8 |
| 20 | Low | `Modal.show` always renders a footer Cancel, even when `saveText` is the safe action. | Add `showCancel` (default `!showDelete`), `saveClass` and `deleteText` options. Order is destructive first, safe last. Update the ~10 callers and drop the `setTimeout` relabel hacks. | U9 (+U1 for the welcome sheet) |
| 22 | Low | Controls of 21–31 px. | A 48 px vertical `::after` hit area on the listed controls, with visuals unchanged (**D2**). Padding fix for "+ Add custom". | U9 |
| 23 | Low | `.btn {width:100%}` squeezes the title, and the highlight paints over the wheel columns. | Auto-width header buttons and a flexible title; columns above the highlight, with a fade mask. | U9 |
| C-49 | — | Tests depend on the real clock (failing on the 1st of the month). | `vi.useFakeTimers({toFake:['Date']})` pinned at noon local, and `page.clock.install` in e2e. Fix latent pins found by the scan (Bank Connect expiries, `setSystemTime` called after `Store.init`, January month underflow). | U5, U7, U10 |

---

## Implementation units

Ten units run **in parallel, each in its own git worktree** (worktrees live under
`.claude/worktrees/`, so Node resolves the main `node_modules`). Each unit commits to its
own temporary branch. The units are cut along file regions so that most merges are
automatic. Ownership rules:

| Unit | Bugs | Owns |
|---|---|---|
| U1 Currency | 01, 20 (welcome sheet only) | `store.js` SET_CURRENCY + `currencySwitchImpact`; `components.js` new `CurrencySwitchConfirm`; `views.js` currency picker (~3439-3475); `main.js` onboarding (~650-835) |
| U2 Restore | 02, 11 (import side) | `export.js`; `import.js`; `store.js` `RELINK_LOAN_SERIES` + `_relinkLoanSeries`; `fullRestore`/`loanCsvRoundTrip` tests |
| U3 Android Back | 03 | `router.js`; `main.js` backButton (~388); `components.js` `dismissTopSheet` + `data-back-dismiss` attributes |
| U4 History | 04, 05, 19 | `views.js` TransactionsView summary (~717-852) + TagsView range (~3074); `store.js` `_getPeriodLabel` + init today |
| U5 Loans | 06, 07, 15, 16, 17, C-49a/c | `store.js` loan cases/helpers + `getLoanProgress`; `views.js` debt hub/results/sim (~4150-5000, except the BUG-10 catch blocks); `debtView.test.js`, `store.test.js` loan tests, `debt_simulator.spec.js` |
| U6 Forms | 08, 18, 21, 11 (UI side) | `views.js` tx form (~1400-2240), category forms, account form, Settings import (~3548-3598), statement step (5451); `components.js` `NoticeSheet` + TransactionItem label; `store.js` `findCategoryByName` + distribution label |
| U7 L10n & signs | 09, 10, 12, 13, C-49b | `store.js` `formatPercent`; `widgets.js` (all, including the Uncategorized label); `views.js` Analytics (~100-410), BudgetView list (~2600-2640), debt-sim catch blocks (4672/4720); `components.js` percent sites (2488/2697); `components.css` invalid-field styles |
| U8 Account delete | 14 | `store.js` DELETE_ACCOUNT + `_healOrphanTransferLegs` + init call |
| U9 UI polish | 20, 22, 23 | `components.js` Modal.show + FrequencyPicker + `#btn-add-category`; `views.js` Modal callers' options; `components.css` hit areas |
| U10 Test hygiene | C-49d/e/f | Test files only: Bank Connect B3/B4/B5/B7, the 5 post-init `setSystemTime` files, `dynamicBalanceColor`, `dailySummaryString`, `wallet_account_filter.spec` |

**Rules every unit follows**
- Do **not** bump `?v=` in `index.html`, and do not edit `CLAUDE.md` or `docs/`. The
  integrator does all of that once, at the end.
- New i18n keys go **at the end** of each dictionary (before `};`), in all five, as a
  block with a `// 1.0.1 (BUG-NN)` header comment. Plural variants are whole-sentence
  `.one/.other` (plus an explicit `.zero` where 0 reads differently).
- Run only targeted unit tests and lint inside the worktree. **No e2e** (port 3000 is
  shared): e2e spec edits are written blind and verified after integration.
- Keep the store ungated (Pro convention), use `StackdDB` only, never translate
  stored data, and keep `UPDATE_TRANSACTION`/`UPDATE_TRANSFER` in sync.

## Integration and verification

1. Merge the unit branches into a local `deep-test-fixes` branch, with
   `merge=union` on `src/i18n/*.js` (key-append conflicts only). Resolve the rest by hand.
   Expected touch points: `components.js` (U1/U3/U6/U9), `main.js` (U1/U3), and
   `views.js` Modal callers (U5/U6/U9).
2. One `?v=` bump for every touched file, to a single value above the current max
   (co-dependent files move together). Update the key count in `CLAUDE.md` and the
   Back-dismiss rule (every new sheet needs `#modal-cancel-btn`,
   `.modal-btn-close`, `[data-back-dismiss]` or a backdrop close).
3. Run `npm run lint`, then the full `npm test`, then the full `npm run test:e2e`, and
   fix whatever the integration breaks.
4. Adversarial review of the integrated diff, one reviewer per unit: is the bug
   actually fixed, any regressions, any invariant violations? Fix whatever is confirmed.
5. Live check in the browser preview at 412×839 of the reproduction steps for the
   High and Medium bugs. Keep in mind the hidden-pane quirks: no rAF, throttled timers.
6. Squash onto `main` as **uncommitted** changes, report the results, and ask for
   commit and push approval. Delete the temporary branches.
7. Release, which is the owner's call: `npm run version:sync` to 1.0.1 (versionCode
   10001). A replaced Play upload needs a PATCH bump anyway.

## Decisions for the owner (recommended defaults in bold; all bold options approved 2026-10-01)

- **D1 Back on a bare Home screen:** **minimize the app (Android 12+ root
  behaviour, warm resume, no new UI)** · "press back again to exit" toast (needs a new
  toast component + key ×5) · keep `exitApp()`.
- **D2 Touch targets:** **invisible 48 px hit areas, visuals unchanged** (taps work,
  but bounding-box scanners may still report 28–31 px) · visibly taller controls.
- **D3 Version:** **bump to 1.0.1 as part of this work** · leave 1.0.0 for now.
- **D4 Remaining defaults:**
  - **(a)** The "Also relabel my accounts" box is pre-ticked only when no account is
    already in the new currency.
  - **(b)** "Also delete the N future payments" is ticked by default.
  - **(c)** A category is required on every income/expense save, including edits of
    imported uncategorized rows.
  - **(d)** The label is "Uncategorized" (US spelling, matching the stored name import uses).
  - **(e)** Converted transfer legs count as Uncategorized income/expense, with a note
    written in the UI language at deletion time.
  - **(f)** Delete sheets put Delete first and the safe action last.
  - **(g)** Unpaid rows are excluded from History totals silently.
  - **(h)** Back on the mandatory welcome sheet and on the bank-waiting sheet is swallowed.

## As built (2026-10-02)

**Execution.** The ten units ran in parallel worktrees, as planned. All ten merged
with no conflicts, thanks to region ownership and `merge=union` on the
dictionaries. U9 and U10 had to be relaunched because their worktrees failed to
create under load. Integration then added:
- one `?v=73` bump for every changed script;
- `npm run version:sync` to 1.0.1;
- CLAUDE.md updates covering sheets and Back, `formatPercent`, the
  currency/delete/unpaid rules, the loan link lifecycle, `1.0.1` comment tags and
  the key count;
- escaping in the note autocomplete (stored notes now carry account names);
- removal of the unused `common.unknown` key;
- `saveClass: 'btn-danger'` on the discard confirm;
- clock pins for `bank_connect.spec`;
- Playwright reloads instead of in-page reloads for the racy
  `balance_sync`/`welcome_modal` specs;
- one extra fix found during live verification: the budget donut's "Overspent"
  figure showed the allocated total, not the overspend (C-23).

**Adversarial review: 69 agents.** There was one reviewer per bug group plus
i18n-quality and integration lenses, and every finding went to two refuters. 13
findings were confirmed, which deduplicated to 11 fixes, made in three more
worktree units and each re-verified:
- (high) a loans file imported twice, or a backup restored over its own install,
  linked two loans to one series, so deleting the duplicate wiped the original's
  payments. Fixed on both sides: the import releases already-owned ids, and every
  per-loan series action stands down on a shared series;
- (high) the sync proposed a one-off early repayment as the new regular payment;
- (medium) changes starting in a later month never prompted;
- (medium) a capped series end was presented as the loan's end;
- (low) note relinking limited to legacy loans files (`needsNoteRelink`);
- (low) an opening-balance sign flip now counts as an unsaved change;
- (low) the import-failure sheet no longer repeats its title;
- (low) a negative down payment gets its own message;
- (low) the 50/30/20 hint uses the same precision as the check;
- (low) a singular end-date note;
- (low) a destructive style on "Delete Payments".

The verifier of the sync fix then showed that one uniform amount cannot follow a
schedule whose instalment changes more than once. The sync was reworked to
re-price **month by month**, touching only the months the edit changed, and a
second adversarial review covered the rework.

**Verification.**
- Lint is clean. **1,070/1,070 unit tests** (100 files) pass, against 774 in the
  report. **54/54 e2e** pass, including a new `loan_restore.spec.js`.
- Every test that used to depend on the date is now pinned.
- A live Pixel 7 Playwright run passed **17/17 checks** of the report's
  reproduction steps: BUG-01, 03, 04, 05, 08, 09, 12, 13, 14, 18 and 20, with no
  page errors and no native dialogs.
- History NET now equals Home's projected end-of-month change for the report's
  scenario.

**Still to check on a device** (out of reach from here):
- Android Back on an emulator or phone: sheets, the + menu, selection mode, the
  dirty-form confirm, and the warm resume after minimizing.
- The FrequencyPicker fade mask in iOS WKWebView.
- Play's Accessibility Scanner may still report the visual 28–31 px on
  halo-only controls (D2).
- C-50/C-51 from the report: a real Play billing purchase, and data surviving
  storage eviction.

## Loan sync hardening (BUG-07), 2026-10-02

The BUG-07 linked-payment sync went through three more adversarial review
rounds (each with fuzzing, by-construction checks and refuters):

- **Review 2** (8 confirmed): rebuilding the chain wiped customised
  accounts/notes and resurrected deleted payments; series day vs month end;
  interest-only and later-start months; copy for an old final cent adjustment
  and for temporary changes; transfer income legs keeping the old end.
  → The series end now moves **in place** (`_moveSeriesEnd`).
  `_loanMonthRegularC` counts the interest-only row, payments dated before a
  later first instalment are deleted, and the end is placed on the series' own
  day.
- **Review 3** (8 confirmed, 5 distinct):
  - the old window was taken from past members' later end instead of the
    live tail;
  - weekly and every-N-months series were re-priced monthly;
  - prompt counts ignored added months ("Update its 0 upcoming payments");
  - a large final-only change never prompted;
  - a stopped series was restarted by a longer loan.

  → Liveness and the old window are now read before anything is removed.
  Update plans run for monthly interval-1 series only. New plan fields
  `keepCount`/`addCount`/`finalDate`/`finalC` and new keys
  `debt.sync.added`/`replaced`/`finalNote`.
- **Review 4** (4 confirmed): the prompt named the series day or the capped end
  as the loan's end; a final payment created by an extension went unmentioned;
  "Update its 0 upcoming payments" could still appear when nothing remained;
  a weekly series wasn't finished when the loan was already paid off.
  → `plan.loanEnd` is always set, `finalDate`/`finalC` also covers created
  finals, the copy is gated on the payments that remain, and "finish"
  compares by date for non-monthly cadences.
- **Review 5** (5 confirmed + 1 split):
  - a series end below a kept final-month payment on a chain that drifted to
    the 28th;
  - added payments double-counted in the end sentence;
  - a material revert of the old final payment not named;
  - a final-payment change judged only against the new regular payment;
  - no extension offered once the last linked payment is due today;
  - "finish" leaving the old end on the surviving payments.

  → The end is never set before a kept payment. New notes
  `debt.sync.revertNote`/`finalNote`. The plan is now built from all series
  legs. After "finish", the surviving payments carry their real end.
- **Review 6** (6 confirmed, 4 distinct):
  - generated payments inherited a matched row's `importKey`/`bankRef`. This
    was an older generator flaw that extending from a bank-matched last
    payment now exposed;
  - the new payments' amount went unnamed;
  - a stopped series got a shorter-end prompt;
  - extending after the last payment back-dated payments.

  → `_processRecurringTransactions` strips bank identity from clones,
  `addC` and the `debt.sync.newAmount` note were added, a stopped chain's
  end is its last payment, and nothing is generated on or before today.
- **Review 7** (2 confirmed, 1 distinct): an empty "Update linked payments?"
  sheet appeared when nothing lay ahead and the longer end added nothing after
  today. → No plan in that case, and the view never shows an empty sheet.
  Each round found less: 8, 8, 4, 5, 6 and 1 distinct issues across rounds
  2 to 7. The loop stopped after round 7, because its only finding was
  low-impact.
- Every finding has a regression test in `tests/unit/loanSyncInPlace.test.js`
  (33 tests).
  Each test was mutation-checked: it fails on the code before its fix.

## Follow-ups (flagged during the round, not fixed)

- Split-vote review findings, deliberately left as they are:
  - A CSV round trip turns blank-category rows (converted transfer legs,
    imports) into a custom "Uncategorized" category. This predates the branch
    (`import.js:160`).
  - The FrequencyPicker title still wraps in fr/pt at 360 dp. Allowed by the
    design; truncating would lose meaning.
  - The category picker still offers "No category selected", which is then
    rejected inline.
  - The manual's fr/it/es/pt wording for "tag"/"transaction" in the History
    paragraph could be aligned.
- Loan sync (accepted limits):
  - moving a still-future first payment EARLIER doesn't create the new
    opening months (the sync re-prices, moves the end and deletes, but never
    back-fills);
  - a capped series' stop date follows the app's 60-month rule from the
    series' startDate, even if the series was later moved to another day.
  - after a "finish" sync (the loan ended before its next payment),
    correcting the loan back does not bring the deleted payments back: a
    stopped series is never restarted, so the user re-tracks by hand.
- ~~Stale deleted-account ids remain in widget configs, filters and
  `defaultAccountId` (adjacent to C-06).~~ Closed by 1.0.2 (BUG-29):
  `Store._pruneAccountRefs` on delete, at boot and cross-tab.
- A released duplicate loan keeps `needsNoteRelink` until it is linked, tracked
  or edited.

## Out of scope (flagged, not fixed here)

- The ~25 remaining `alert()` calls in Bank Connect, purchases, export and feedback
  (their tests assert `alert`), and the untranslated CSV-import skip reasons.
- Icon-picker group labels (English, ~16 keys), and the dead `PeriodPicker`.
- `CustomRangeModal` UTC parsing, and the 29th–31st monthly drift in
  `_calculateNextRecurrenceDate`.
- Account archiving (the report's alternative for BUG-14), a "switch back" shortcut
  on the currency caption, and repairing installs already restored on 1.0 by
  linking loans at boot (false-positive risk).
- Web build: browser Back with a sheet open (would need a history entry per sheet).
