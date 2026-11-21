# 1.3.1, part 2 — five leftovers of the 1.3 deep test

**Status: decisions taken 2026-11-21 (owner); built the same day on the branch `fixes-1.3.1-part2` (see "As built").**

Part 1 (`docs/deep-test-fixes-1.3.1-plan.md`) fixed the ten gate bugs. This part covers the two
riders it left out, the unbuilt half of BUG-75, and two owner decisions. The version stays
**1.3.1 / 10301** (no build of it has been uploaded). Comment tag `// 1.3.1 (BUG-NN)`.

## Decisions

| # | Bug | Decision |
|---|---|---|
| E1 | BUG-217 | The **sentence** is wrong. The import keeps each row's paid state from the file. |
| E2 | BUG-216 | **Every file** keeps tags as written (the tag picker's rule). An old folded tag already on the phone is reused. |
| E3 | BUG-75 | **Banner + confirm.** The loan is still linked after "Save anyway". |
| E4 | BUG-179 | **Block it.** An opening balance cannot be deleted from History. |
| E5 | BUG-188 | **The user picks each time:** "Add what is missing" or "Replace everything". |
| E6 | BUG-188 | Replace takes an **automatic safety copy** first. |

## Units

### U1 — BUG-217: the Review line (S)

- Reword `review.planned.one` / `.other` in the five dictionaries:
  "1 transaction is dated after today. It is imported as a planned payment and counts on its date."
- No code change. `facts.planned` stays the count of rows dated after today.
- Test: `i18n.test.js` covers the keys; one e2e assertion in `import_export.spec.js` on the new text.

### U2 — BUG-216: tags from files (S)

- `import.js` ledger route (line ~3025): replace `_foldTag(t)` with `Store.normalizeTag(t)`.
- Reuse rule: if the store has no tag equal to the normalized one but has its `_foldTag` form
  (a 1.1 import), use the folded one. Build the set of existing tags once per import.
- `tagRenames` then lists only real changes (case, `#`, `|`, `,`, over 40 characters, a reuse).
  `tagsDropped` stays for reserved or empty values.
- Check at build: the QIF route and the bank-file route for the same fold.
- Tests: `ledgerImport.test.js` — `café` and `pranzo lavoro` round-trip through `buildLedger`;
  a store that holds `cafe` gets `cafe`; a store that holds both keeps `café`.

### U3 — BUG-75: Track form banner and confirm (M)

- **Banner.** When the form opens with a `pendingLoanLink`, a read-only line above the amount:
  "Tracks {loan}: {amount} every month". Plain text, loan name escaped.
- **Confirm.** On save, compare with the loan's instalment (`LoanEngine.simulate` through
  `Store.getLoanProgress`): amount (to the cent), interval + frequency. On a difference, one
  `Components.Modal` sheet before the save: what the loan expects, what is being saved,
  **Save anyway** / **Go back**. A Transfer is not a difference (1.3.1 links it).
- The sheet comes before `RecurringUpdateModal` is ever involved (this is always a new series).
- No store change: `ADD_TRANSACTION` / `ADD_TRANSFER` keep consuming `pendingLoanLink`.
- New keys ×5: `debt.track.banner`, `debt.track.mismatchTitle`, `debt.track.mismatchBody`,
  `debt.track.saveAnyway`. No article or eliding preposition before a placeholder.
- Tests: an e2e in `debt_simulator.spec.js` (matching save: no sheet; €100 every 2 weeks: sheet,
  Go back keeps the form, Save anyway links).
- Open at build: leaving the form without saving already clears the pending link — verify.

### U4 — BUG-179: opening balance in History (M)

- `Components.TransactionItem.render`: no Delete action for `opening_balance` (as Paid already).
  The swipe then shows nothing to open; the tap still opens the read-only panel.
- `TransactionsView`: long press does not select the row; Select All skips it; the "Delete (N)"
  count never includes it.
- Store guard: `DELETE_TRANSACTION` and `DELETE_BULK_TRANSACTIONS` ignore an `opening_balance`
  id. `DELETE_ACCOUNT`, `UPDATE_ACCOUNT` (Edit Account) and `RESET_APP` remove or change it
  through their own code — confirm at build that none of them goes through the two guarded actions.
- Row title: "Opening balance" (label only, by `type`; the stored category `cat_balance` and its
  name do not change). New key ×5 if none exists.
- Already-deleted opening balances: no heal. Edit Account re-enters the amount (1.0.2 behaviour).
- Tests: unit (guards; account delete still removes it), e2e in a History spec (no bin,
  Select All count).

### U5 — BUG-188: restore asks "add" or "replace" (L)

One sheet before **every** restore of a backup (`Components.RestoreChoiceSheet`, used by the
picked file and by a log row; it replaces `backup.restoreConfirm*`).

**Add what is missing** (merge, for every backup file)
- Nothing already on the phone changes. That now includes accounts: `buildAccounts` no longer
  sends `UPDATE_ACCOUNT` for an account matched by id or name (name, type, icon, colour,
  opening balance stay). Check the same for categories, budgets, loans and rules.
- Result sheet: one more line when rows matched by id differ from the file —
  "{count} entries here differ from the backup and were kept."
- Manual and FAQ text already say "A restore keeps what is already here"; they gain one
  sentence about Replace.

**Replace everything** (full `.json` bundle only; a single CSV shows only "Add")
- The sheet states both sides: "157 entries here will be replaced by the 153 of this backup
  (20 Nov 2026)." Red button, focus on Cancel.
- Safety copy first (E6): on the phone apps `StackdBackup` writes a backup marked
  `before-restore`; it is listed on the Backup page and is not counted in the ten automatic
  files. If it cannot be written, the replace does not run and a sheet says so. On the web
  the sheet has "Download a copy first".
- Then one `Store.batch`: a new `CLEAR_LEDGER` action empties transactions, accounts,
  categories (back to defaults), budgets, loans, import rules and tag links, and resets the
  slices that hold ids (`_pruneAccountRefs` slices, `defaultAccountId`, `accountOrder`,
  graph filters); then `_restoreBundle`. A failure rolls the whole change back.
- Kept on purpose: theme, language, currency setting if the bundle has none, App lock,
  privacy, Pro, tab order, backup prefs and log, Home widgets (their account/category
  filters survive because a restore keeps ids), Bank Connect state.
- Attachments: the cleanup is a diff at the end of the change, so files whose rows come
  back with the same ids stay; files of rows not in the backup are deleted. The sheet says
  attachments added after the backup are lost.
- Open at build: bank connections name accounts by id — after a replace, a connection whose
  account is not in the backup must be unlinked (same path as account delete).

New keys ×5 (about ten). Tests: unit (`backup.test.js`: merge leaves an edited account and an
edited entry alone and counts the difference; replace equals the bundle exactly; a failing
bundle rolls back; safety copy failure blocks), e2e in `import_export.spec.js` (both paths on
the web build).

## Order and size

U1, U2 (small, independent) → U4 → U3 → U5. U5 is about half of the work.
`?v=` bumps for store, views, components, import, backup and the five dictionaries.

## Gates

lint, unit, e2e, `node tools/check-bundle.cjs`; a UI replay of the five bugs' report steps;
CLAUDE.md gets a short 1.3.1 section (parts 1 and 2). Security review before any build, as always.

## Not in this part

The other ~110 open bugs of the report; `tools/seed.cjs` field names.

## As built (2026-11-21)

- **U1 (BUG-217).** `review.planned.*` reworded in the five dictionaries. No code change.
- **U2 (BUG-216).** The ledger route reads tags with `Store.normalizeTag`; a tag the install
  holds only in its folded form is reused (`known` = tags on rows + `tagLinks` keys). A change of
  case alone is no longer reported as a rename. Cyrillic and emoji tags are now kept (the tag
  picker accepts them); only empty or reserved values are dropped. QIF goes through the same route.
- **U3 (BUG-75).** `Views._loanTrack()` gives the armed loan's name and next instalment. The form
  shows `#tx-loan-track`; a save that differs (amount, interval, frequency, or no repeat) opens
  `#loan-track-mismatch` through `Components.Modal` with **Save anyway** / **Go Back**
  (`Modal.show` gained `cancelText`). `onSave` carries `opts` through the opening-date sheet, so
  the answer is asked once. A payment that does not repeat is saved but leaves the loan untracked,
  and the sheet says so.
- **U4 (BUG-179).** No bin on the row (`data-opening="1"`, Edit only, opens at −62 px), a long
  press does not select it, `TOGGLE_TRANSACTION_SELECTION` / `SET_ALL_TRANSACTIONS_SELECTION`
  skip it, `DELETE_TRANSACTION` / `DELETE_BULK_TRANSACTIONS` ignore it. The row title is
  "Opening balance" in every list (`export.txType.opening_balance`, already in five languages).
- **U5 (BUG-188).** `Components.RestoreChoiceSheet` before every restore of a **bundle** (picked
  file or a saved-file row; the file is read first so the sheet can show its date and counts).
  - *Add what is missing:* `StackdImport._bundleRun = { keep, differ }` during `_restoreBundle`.
    An account or a budget already here is not written; a transaction here by id is kept as
    before. `result.differCount` counts kept items that no longer equal the file (transaction:
    amount, date, paid; account: name, opening balance; budget: amount).
  - *Replace everything:* `importText(text, { mode: 'restore', replace: true })` →
    `CLEAR_LEDGER`, `_restoreBundle`, `SETTLE_RESTORE` (`_pruneAccountRefs`), all inside the
    restore's one change. Before it, `StackdBackup.backupNow({ kind: 'before' })` writes
    `Stackd_before_restore_<stamp>.json` (log kind `before`, never pruned); a failed copy stops
    the replace.

**Differences from the plan**

- **Categories are not replaced and not "kept".** In both modes the backup's categories merge
  onto the list by name, with the file's icon and kind, as before 1.3.1. Emptying the list would
  give custom categories new ids (the categories file is matched by name) and break the widgets
  and filters that hold those ids. Categories added after the backup therefore stay after a
  replace; the confirm text says "Categories and settings stay".
- **The six single CSV files restore as before, with no sheet.** They are an explicit per-file
  upsert (the accounts file is how a transactions-first restore gets its icons and opening
  balances), so "nothing here changes" would not be true for them.
- **Web safety copy is automatic,** not an offer: the browser downloads the copy when the user
  confirms the replace.
- **Counts on the sheet are transactions only** (in the backup / here now).
- Bank connections: `SETTLE_RESTORE` unlinks a connection whose account is not in the backup
  (the existing `_pruneAccountRefs` rule). Not replayed with a live connection.

**Tests.** Unit: `ledgerImport.test.js` (tags), `bulkSelectionMode.test.js` (opening balance),
`backup.test.js` and `backupView.test.js` (merge, replace, rollback, safety copy, the sheet).
E2E: `fixes_131_part2.spec.js` (the five bugs through the UI).
