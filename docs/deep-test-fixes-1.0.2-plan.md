# Deep Testing Report fixes — Plan (1.0.1 → 1.0.2)

**Status: BUILT on 2026-10-05, verified on the Android emulator; iOS device check pending.** The owner approved every recommended default (D1–D16 and the unit-level defaults in the designs file). Built on the local branch `fixes-1.0.2`; see "As built" at the end.

**Source:** *Stack'd 1.0.1 Deep Testing Report* (2026-10-04, private artifact
claude.ai/artifact/168A1GzCnkaWobBZTkM298). It covers 68 criteria and found 111 new bugs: 14 high,
53 medium and 44 low. The release gate is the report's "Fix before the public release (1.0.2)"
bucket, 21 bugs. This plan covers those 21 plus recommended **riders**: next-update bugs that touch
the same code and cost little extra.

**Companion:** `docs/deep-test-fixes-1.0.2-designs.md` holds the full per-unit designs: root
cause with exact lines, fix, code sketch, data repair, tests, i18n keys, risks, decisions and
owned regions. Each implementation unit gets its section verbatim. This file is the summary,
the decisions and the procedure.

**Method.**
- Nine read-only investigators each took one code region. They confirmed every root cause at
  `efcac0c` (= tag v1.0.1 plus docs) and designed the fix, its tests and any repair of data
  already on devices.
- Two adversarial reviewers per design read it against the code, one for correctness and one
  for compatibility and data. They raised **131 issues** across the nine designs.
- A reviser checked each issue in source and folded in the valid ones. Almost all were
  accepted; a few were corrected or rejected with a reason recorded in the design.
- U4 applied its sketches to a scratch copy of `src/`: the full unit suite stayed green, and
  its 18 new tests each fail on `efcac0c`.
- All 21 gate bugs were already in 1.0. The report's only 1.0.1 regressions are BUG-74 (a rider
  here) and BUG-127 (Low, later).

Comment tag: `// 1.0.2 (BUG-NN)`, using the report's BUG ids. Never `v1.0x`.

---

## Item map — the 21 gate bugs

| Bug | Sev | Root cause (confirmed at efcac0c) | Fix | Unit | Effort |
|---|---|---|---|---|---|
| 24 | High | Stored names, account types, tags and series ids are interpolated raw into `innerHTML`: `views.js:84, 97, 451–452`, Categories, Budget, pickers, the delete sheet. Account colours and icons are written raw into `style=` and `data-lucide=` at about 30 sites, and no write path validates them. Escaping exists as 13 separate copies that never reach these sinks. | One escaper, `I18n.esc` (i18n.js loads before every renderer), with the existing short aliases delegating to it. Escape t() **params**, never t() output. Names stay verbatim on disk and are escaped everywhere. Colours: palette only. Icons: validated on write, plus a boot heal. Every id read from a file goes through `Store.fileId`, which keeps a safe id and maps anything else to a stable safe id. ADD_ACCOUNT, ADD_CATEGORY and BATCH_IMPORT_TRANSACTIONS act as store backstops. A jsdom crawl of every view and sheet produced the sink list, and re-running it after integration catches new sinks. | U1 | M |
| 25 | High | The form has no opening-balance mode. It maps the row to income and drops the sign (`views.js:1522, 1554, 1752`), and the store applies `Math.abs` and spreads the payload (`store.js:1345, 1368, 1416–1421`). Edit Account then writes a €0 opening balance dated today on any account without one, which hides all its history (`views.js:3964, 4262–4271`). | (A) An opening-balance row opens a read-only panel with an *Edit Account* button. (B) A store guard pins the type and keeps the sign. (C) Edit Account defaults to the earliest row date and sends no opening balance on an untouched save. (D) A balance-neutral boot heal (D6). (E) Six lines in U6's `buildAccounts`. | U2 | M |
| 26 | High | Every member stores its own copy of `endDate`, `interval` and `frequency`, but only the armed member's copy bounds generation (`store.js:754–757`). Every path that ends a series early leaves the old copy on the payments it keeps: the "This and future" regenerate, `deleteFuture`, Recurrent off, and `DELETE_LOAN`. A later scoped edit re-arms from that stale copy. | The schedule becomes series-level: `_scheduleOf` / `getSeriesSchedule` read the armed member (or the last one, for a stopped series), and every early end writes the real end onto the survivors. A boot heal, `_healSeriesSchedules`, runs before the recurring pass and again inside `BATCH_IMPORT_TRANSACTIONS`. | U3 | M |
| 27 | High | The form resends the untouched Paid switch (`views.js:2292–2295`), and `propagate()` copies it to every member in scope (`store.js:1468–1505`). | Paid state is per payment (D5). An untouched switch sends no `isPaid` key, scoped propagation never copies `isPaid`, rebuilt payments start paid, and the scope sheet says so. | U3 | S |
| 28 | High | `computeNetFlowData` builds bucket edges with `toISOString()` (`store.js:3418, 3438, 3450`). East of UTC, every Day, Week and Month bucket starts a day early. | A shared local-date helper, `Store._localYMD(value)` (with the existing `_todayYMD`), replaces the three formatters. A lint rule against date-only `toISOString()` lands after U2 and U4 merge. | U4 | S |
| 29 | High | `DELETE_ACCOUNT` (`store.js:1224–1276`) never prunes the saved Home view, the History and Analytics filters, widget scopes, `defaultAccountId` or the bank mappings. Readers treat a non-empty list as an explicit selection, so a stale id selects nothing and Home reads €0.00. | `_pruneAccountRefs()` drops ids that no longer name an account and saves only changed slices. It runs from DELETE_ACCOUNT and as a boot heal. A widget or saved view left with no accounts widens to *All*. The default wallet moves to the first remaining base-currency account. | U5 | M |
| 30 | High | The UI has no unique-name check (`views.js:4244–4258`). On restore, `import.js` matches accounts by name (`:184, 1293`), so same-named accounts merge (±€300). | UI half (U5): `Store.findAccountByName`, rejecting case-insensitive trimmed duplicates across currencies and types, like categories in BUG-11. Import half (U6): append `AccountId` and `Id` columns, trust ids only in a Stack'd export, and match accounts by id. | U5 + U6 | S + L |
| 31 | High | `buildTransactions` reads amounts with `Math.abs(parseFloat(...))` (`import.js:169`), so "12,50" becomes 12 and "1.850,00" becomes 1.85. The result sheet still says success. | One strict reader with one decimal convention per file, inferred from its cells. It tolerates spaces, apostrophe groups and currency symbols. A cell that is not one complete number is skipped and reported as *invalid amount*. | U6 | M |
| 32 | High | `_stampImportKey` puts the account id in the dedup key (`import.js:808, 816`). A restore re-keys accounts, so statement dedup no longer recognises earlier imports. | Keys follow the account the row lands on: id-keeping from BUG-30, plus `Store.rebaseImportKey`. A boot heal re-points only keys whose account no longer exists. | U6 | S |
| 33 | High | `parseCSV` and `analyzeBankCSV` split the file on newlines before reading quotes (`import.js:43, 598`). A camt.053 note with a line break, once exported and restored, loses the rest of its row: an unpaid bill comes back paid and transfers split. Bank CSVs lose rows. | An RFC 4180 record reader (`_splitRecords`) shared by every CSV path, falling back to the 1.0.1 line reader for broken files. Every import writes notes on one line, and a boot heal flattens notes already stored (rider R1). | U6 | M |
| 34 | High | `StackdDB.save` turns `QuotaExceededError` into `false` (`db.js:112–122`). `dispatch` never checks it, mutates state and emits, so entries show as saved and vanish at the next start. A half-applied change can leave an account without its opening balance. | A write journal in `db.js` (`begin`/`end`/`abort`) makes each change all-or-nothing, rolling back so the most space is freed first. `Store.batch` wraps dispatches and restores. A one-button "Storage is full" sheet appears, with a launch variant. A CSV restore is all-or-nothing. | U7 | L |
| 35 | High | `ADD_TRANSFER` and `UPDATE_TRANSFER` write one amount to both legs (`store.js:1584, 1604, 1669, 1677, 1707`). €100 out arrives as $100. | Each leg is stored in its own currency, and nothing is converted. When From and To differ in currency, the form shows a required *Amount received* field and the income leg stores it. Same-currency legs mirror as today. Pairs already stored 1:1 are not repaired automatically: editing one asks for the received amount (D3). | U8 | M |
| 36 | High | An explicit account selection skips the base-currency filter (`getBalanceAtDate`, `store.js:2959–2971`). € and $ are added into one € total on Home, History, Analytics and widgets. | `Store.aggregateSelection(ids)` returns `{ids, currency, excluded}` and is called at every choke point. The base currency wins. A selection with no base account uses its largest same-currency group, formatted in that currency. The existing "excluded" caption explains what was left out (D4). | U8 | M |
| 37 | High | `StackdExport._download` uses a Blob plus `<a download>` (`export.js:3–13`). The Capacitor WebView has no download listener, so on Android nothing happens, with no file and no message. iOS is very likely the same. | A native branch in `_download` only: write the file (with BOM) to the Filesystem cache, then open the share sheet through `@capacitor/share`, a new plugin (D2). A sheet appears only on failure. Web is unchanged. | U7 | M |
| 38 | Med | New Log and New Account prefill `toISOString().split('T')[0]` (`views.js:1504, 3964`, `store.js:1155, 1189`). Between 00:00 and 02:00 in Rome that is yesterday. | Use `Store._todayYMD()` / `_localYMD()` from U4. The recurrence end default uses the existing noon-anchored `_calculateNextRecurrenceDate`. | U2 | S |
| 39 | Med | `AddTransactionView.render` leaves `initialAccount = ''` for a new log (`views.js:1510`), so the select shows the alphabetically first account. | One guard after the pending-category block: use the Default Wallet if it still exists, otherwise the first account by name. This also fixes the currency prefix, the transfer From and a stale loan prefill. The Default Wallet hint gets new wording (values only, all five languages). | U2 | S |
| 40 | Med | `Components.Modal.show` always binds the backdrop tap and the 150 px swipe (`components.js:230–263, 286–291`), so the mandatory welcome sheet can be dismissed. The app is then left in USD and half translated. | A `dismissible: false` option: no touch or backdrop handlers, an invisible handle spacer, and `data-back-swallow`. The welcome sheet uses it and saves the chosen language at once. | U5 | S |
| 50 | Med | `#tx-amount` is `type="number"` and is read with `parseFloat` (`views.js:2211–2216`), so "1,234.56" becomes 1.23456. `#bdg-amount` has the same problem. | Both fields become `inputmode="decimal"` text inputs read by a new `Store.parseAmount` that understands the locale. Ambiguous or malformed input gets an inline error with an example in the user's format (D7). | U2 | M |
| 55 | Med | `Store._categoryMonthSpend` (`store.js:3182–3194`), the single source of budget spend, applies neither the unpaid nor the pre-opening exclusion. | Add both exclusions inside the index build. Goals, the widget, the editor hint and rollover all follow. A month before the account existed counts €0 and carries its allocation forward (D8). | U9 | S |
| 78 | Med | `buildTransactions` never checks whether a row already exists, so importing the same backup twice doubles every transaction, series and loan. | Match rows in this order: trusted Id, then a series or transfer already held here, then a re-pointed ImportKey, then a multiset fingerprint for files from before 1.0.2. Duplicates are skipped and reported as "N rows were already in Stack'd". Loans match on kind, name and terms. | U6 | L |
| 86 | Med | `Router.handleBack` doesn't know about the budget-limit editor, a pane inside BudgetView (`views.js:2770`). Back leaves Goals, drops the typed limit, and the stale editor reopens later. | A budget-editor step in `handleBack`: "Discard changes?" when dirty, close to the list when clean, and stay on Goals either way. `editCategoryId` is cleared in `destroy()`. | U9 | S |
## Riders (recommended)

Each touches code its unit already owns. Effort is added to the unit's.

| Bug | Sev | What | Unit | Effort |
|---|---|---|---|---|
| 87 | Med | Back after saving or deleting a log, category, account or loan reopens the closed form or a "Transaction not found" page (`Router.navigate` pushes a history entry). Fix with `Router.leave(path)`, which rewrites the form's entry in place. Covers the ✕ links, the Pro lock card and the Debt exits. | U9 | M |
| 90 | Med | A kill within about a second of a save loses it although the file mirror holds it: boot trusts the stale localStorage and overwrites the mirror. Fix with one staged commit per change to the mirror and a write revision, so boot can trust the newer copy. Native only. | U7 | L |
| 74 | Med | "Update linked payments" overwrites a loan payment the user edited by hand. This is a 1.0.1 regression. Mark "Only this" amount edits on loan-linked payments, keep them on sync and name them in the prompt. | U3 | M |
| 52 | Med | Moving a series to a later day with "This and future" drops its last payment. Move the series end by the same number of days (a series at the 60-month cap still loses one). | U3 | S |
| 63 | Med | A foreign-currency selection shows a € sign on widgets and Analytics charts. Reuse BUG-36's resolver. | U8 | M |
| 67 | Med | The custom-range sheet's "today" is a UTC date and "Last N days" covers N+1 days. | U4 | S |
| 68 | Med | The custom-range calendar month arrows do nothing. They will browse a per-calendar month without moving the range. | U4 | S |
| 69 | Med | After midnight on the 1st, History and Analytics stay on last month. Live periods roll forward on a new day (`Store._rollLivePeriods`). | U4 | M |
| R-date | — | Save accepts an empty date: a dateless row is invisible, and a dateless recurring row throws. Add a required-date check (`form.dateRequired`). | U2 | S |
| R1 | — | Flatten multi-line notes already stored by camt imports (boot heal `_healMultilineNotes`). | U6 | S |
| R-bank | — | Bank Connect "Create account" maps to the wrong account and can create duplicate names. It is switched off in this build, so the bug is latent; fix it with explicit ids and validation first. | U5 | S |

**Not recommended for 1.0.2** (designed, deferred): CSP on the built app (U1, right after 1.0.2);
the loan simulator's and 50/30/20 widget's money fields (BUG-50 class, U2); translated CSV skip reasons
(U6); a warning when an account's currency changes (BUG-48) and loan currency (BUG-121) (U8). The
rest of the report's "next" and "later" buckets stay in their buckets.

---

## Implementation units

Same model as 1.0.1: one git worktree per unit, region ownership, and one integrator.

| Unit | Bugs | Owns (summary; exact lines in the designs file) | Effort |
|---|---|---|---|
| U1 Escaping | 24 | `i18n.js` (`I18n.esc`); the escaper aliases in views.js, components.js, widgets.js, insights.js; about 37 one-token sink edits listed by the crawl; `Store.safeId` / `fileId` and the colour/icon validators; `_healMarkupFields` | M |
| U2 Transaction form | 25, 38, 39, 50, R-date | views.js AddTransactionView (1478–1616, 1883–1890, 2209–2253), budget amount field 2993, EditAccountView 3077–3096, 3964, 4261–4271; store.js 1155, 1189, 1340–1347, `parseAmount`/`amountExample` after `formatCurrency`, `_healConvertedOpeningBalances`; import.js 1281–1282 | M |
| U3 Recurring | 26, 27, 74, 52 | store.js UPDATE_TRANSACTION (1336–1548), UPDATE_TRANSFER (1624–1765), DELETE_TRANSACTION deleteFuture (1814–1854), BATCH_DELETE (1916–1967), DELETE_LOAN, SYNC_LOAN_SERIES, loan-sync helpers (3818–4108), new schedule helpers at 740; views.js form scope logic (2235–2295) and scope sheet copy | M |
| U4 Dates | 28, 67, 68, 69 | store.js Period Helpers (`_localYMD`, `_rollLivePeriods`), `computeNetFlowData`, `_getPreviousPeriod`; components.js custom-range sheet; router.js 182–187; main.js resume handler | M |
| U5 Accounts | 29, 30 (UI), 40, R-bank | store.js `findAccountByName`, `_pruneAccountRefs`, DELETE_ACCOUNT, RESET_APP prefs reset, the bank-mapping case; components.js Modal `dismissible`; main.js welcome sheet; views.js account form 4246–4259, delete sheet 4307, Bank Connect map 6800–6896 | M |
| U6 Import/restore | 30 (import), 31, 32, 33, 78, R1 | import.js (records reader, amount reader, resolver, dedup, loans, result lines); export.js row builder and new columns (15–21, 154–214); store.js `rebaseImportKey`, `_healRestoredImportKeys`, `_healMultilineNotes`, BATCH_IMPORT hooks; the import block of the Settings result sheet | L |
| U7 Native data | 34, 37, 90 | db.js (whole file); store.js `init` → `_initState` and `dispatch` → `_reduce` wrappers with `Store.batch` / `takeSaveFailure`; export.js `_download` (3–13); pro.js 63–70; the import reader's onload wrapper (1444–1446, 1530–1531); `@capacitor/share` | L |
| U8 Currency | 35, 36, 63 | store.js ADD/UPDATE_TRANSFER amount lines, `aggregateSelection` after `foreignAccountCount`, `getBalanceAtDate`, the aggregate choke points; views.js transfer fields (the received amount) and Analytics/History totals; widgets.js totals and formatting | M |
| U9 Budgets & Back | 55, 86, 87 | store.js `_categoryMonthSpend` (3177–3194) and rollover (3239–3245); router.js `leave`, `handleBack` budget step, entry stamping; views.js BudgetView editor state, the save/delete exits (2404, 2445, 3983, 4298, 4316, 5186–5481, 7008, 7030) | S–M |

### Shared contracts (land first, as one foundation commit F0)

Several units call helpers that another unit owns. To keep the worktrees independent, the
integrator lands these on the integration branch **before** branching the units. F0 contains
the helpers and their unit tests, with no call sites:

| Helper | Owner | Used by | Contract |
|---|---|---|---|
| `I18n.esc(v)` | U1 | all renderers | null-safe; escapes `& < > " '`; valid as content and in quoted attributes |
| `Store.safeId(v)`, `Store.fileId(v)`, colour/icon validators | U1 | U6, U5 | `safeId` returns the id if it matches the safe id alphabet, otherwise null. `fileId` keeps a safe id and maps any other value to a stable safe id, so cross-file references and dedup by Id still work. **U6 reads every id cell through `fileId`**: a hard merge gate. |
| `Store._localYMD(value)`, `Store._todayYMD()` | U4 | U2, U9 | no args → local today; null/'' → ''; 'YYYY-MM-DD' passes through; Date / ms / ISO → local day |
| `Store.parseAmount(text, opts)`, `Store.amountExample()` | U2 | U8, U9 | locale-aware; returns a number or an error code |
| `Store.findAccountByName(name, exceptId)` | U5 | U6 | trimmed, case-insensitive, across currencies and types |
| `Router.leave(path)` | U9 | U5, U2 | leave the current screen without keeping its history entry |

`Store.batch` / `StackdDB` journal (U7) and `Store.aggregateSelection` (U8) stay inside their units:
their callers are inside the same unit, and the integrator wires the few cross-unit call sites at merge.

### Merge order

1. F0 (shared helpers).
2. Then, in any order and conflict-free by region: U4, U7, U3, U9, U2, U5, U8.
3. Then **U6**, last of the feature units: it depends on F0, U5's account helpers and U7's batch,
   and it is the largest.
4. **U1's sweep last.** It crosses every unit's lines, so it is applied on top of the merged
   branch. U1 turns its jsdom sink crawl into `tests/unit/escapeGuard.test.js`. The crawl seeds
   a marker into every user field, renders every view and sheet, and fails on any unescaped
   marker. It runs again after the merge to catch sinks the other units added.

### Rules every unit follows (unchanged from 1.0.1, plus three)

- Do not bump `?v=` in `index.html`, and do not edit `CLAUDE.md` or `docs/`.
- New i18n keys go at the end of each dictionary, in all five, under a `// 1.0.2 (BUG-NN)` header.
  Plural variants are whole sentences.
- Run targeted unit tests and lint only. No e2e in units (port 3000 is shared); the integrator runs e2e once.
- Keep `UPDATE_TRANSACTION` and `UPDATE_TRANSFER` in sync, use `StackdDB` only, and leave the store ungated.
- **New:** every boot heal is idempotent, saves only what it changed, and has a test for its no-op path.
- **New:** every new user-facing sheet has a dismiss control (the Back rule), and every message
  goes through `NoticeSheet` or inline field errors, never `alert()`.
- **New:** worktrees branch from the integration branch after F0, not from `main`. Fast-forward
  first; the 2026-10-02 lesson is that worktrees are created from `main`.

---

## Data repair at boot

These run in `Store.init`, in this order, before `_processRecurringTransactions`. Each one is
idempotent and saves only when it changed something.

| Heal | Unit | What it repairs | Guard against false positives |
|---|---|---|---|
| `_pruneAccountRefs` | U5 | stale account ids in the Home view, filters, widgets, `defaultAccountId` and bank mappings | only ids that name no existing account |
| `_healConvertedOpeningBalances` | U2 | an opening balance turned into income or expense by BUG-25 | only when the account has no opening-balance row and exactly one Adjustment row noted "Opening Balance", with nothing dated before it; the lost sign of a converted income is left for the user |
| `_healSeriesSchedules` | U3 | stale `endDate`/`interval`/`frequency` copies on series members (BUG-26) | the series' own armed or last member decides; also runs inside `BATCH_IMPORT_TRANSACTIONS` |
| `_healRestoredImportKeys` | U6 | dedup keys that name an account id from before a restore | only keys whose account no longer exists |
| `_healMultilineNotes` | U6 | notes with line breaks from camt imports | from 1.0.2 no write path can store one |
| `_healMarkupFields` | U1 | icons that are not in the icon list | colours are already reset by the existing palette migration |
| mirror revision (lazy) | U7 | none in the past; from now on, boot trusts the newer of localStorage and the file mirror | native only |

**Not repairable, so it goes in the release notes:**
- payments un-paid by BUG-27 (re-mark them with a swipe);
- amounts truncated by BUG-31 (re-restore the original file after a factory reset);
- accounts merged by BUG-30 (same);
- rows doubled by a double import before 1.0.2 (delete them, or reset and restore once);
- cross-currency transfers stored 1:1 before 1.0.2 (editing one asks for the received amount);
- loan payments hand-edited before 1.0.2 (a sync re-prices them as in 1.0.1);
- writes lost to BUG-34 or BUG-90 before 1.0.2.
- opening balances that 1.0.1 turned into an Adjustment income or expense (BUG-25) and that the heal cannot prove: the account also has an earlier or undated row, more than one such row, an edited note or category, or a later €0 opening balance. Repairing those would move the balance. Manual fix: Edit Account first (original amount, sign and ORIGINAL opening date; the form prefills the earliest row's date), save, then delete the Adjustment "Opening Balance" row in History;
- a converted income keeps its amount but not its lost minus sign (one tap on Negative in Edit Account);
- accounts already restored with a €0 opening balance dated on their creation day (set the Opening Balance Date back in Edit Account).

---

## Decisions for the owner

Recommended defaults are in **bold**. Approving "all defaults" approves every row, including
the unit-level ones in the designs file.

- **D1 Scope.** **The 21 gate bugs plus the recommended riders (87, 90, 74, 52, 63, 67, 68, 69,
  R-date, R1, R-bank)**, or the 21 gate bugs only.
- **D2 Native CSV export (BUG-37).**
  - **Share sheet through the official `@capacitor/share` plugin**: a new native dependency, so
    `npm install` and `cap sync` are needed on both platforms.
  - Or write the file to Documents with the Filesystem plugin and show where it went.
  - In both cases: **no message after a successful share, a sheet only on failure; no one-tap
    "Export everything" in 1.0.2.**
- **D3 Cross-currency transfers (BUG-35).**
  - **A required "Amount received" field, shown only when From and To differ in currency; each
    leg stored in its own currency.**
  - **No implied-rate line; no currency codes in the pickers (the field's hint names both).**
  - **Pairs already stored 1:1 are not repaired; editing one asks for the received amount.**
  - **A loan sync never copies a figure into a leg in another currency.**
- **D4 Mixed-currency selections (BUG-36).**
  - **The base currency wins: foreign accounts in a mixed selection are left out of the
    totals, with the existing caption.**
  - **A selection with no base account uses its largest same-currency group, shown in that
    currency.**
  - **Lists keep every row, each in its own currency.**
  - This reverses v1.02's documented "user's call" (bank-import-plan §6a). With the BUG-63
    rider declined, the fallback is base-only.
- **D5 Paid state (BUG-27).** **Per payment: flipping Paid changes only that payment, whatever
  the scope. Payments rebuilt by a date or schedule edit start paid, and the scope sheet says so.**
- **D6 Opening balance rows (BUG-25).**
  - **A read-only "Opening Balance" panel with an Edit Account button**, instead of the
    transaction form.
  - **A balance-neutral heal for already converted rows** (§Data repair).
  - **Edit Account prefills the earliest row date** for an account without an opening balance.
- **D7 Typing amounts (BUG-50).**
  - **"1,234.56" and "1.234,56" are both read correctly.** A lone separator followed by exactly
    three digits is read as grouping only when it is the UI language's grouping character;
    otherwise the field shows an inline error.
  - **More than two decimals is an inline error, with an example in the user's format.**
  - **A negative budget limit is refused.**
- **D8 Budgets (BUG-55).** **Unpaid expenses don't count as spent until marked paid, with no
  extra "pending" line. A month before the account existed counts €0 and carries its allocation
  forward.**
- **D9 Welcome sheet (BUG-40).** **A tap outside or a swipe does nothing; Back stays swallowed;
  the chosen language is saved at once.**
- **D10 Account names (BUG-30).** **Unique across currencies and types, trimmed and
  case-insensitive. Existing duplicates are left alone: a save that doesn't rename still works.**
- **D11 Restoring a backup (BUG-30/31/32/78).**
  - **Ids are kept, and trusted only in a Stack'd export.**
  - **Rows already in Stack'd are skipped and reported. Files from before 1.0.2 are matched by
    fingerprint.**
  - **A same-named local account absorbs a backup account only in the same currency.**
  - **On an id match the backup's name wins, unless another account here already uses it.**
  - **A cell that is not one complete number is skipped and reported.**
  - **A broken (non-RFC) file falls back to 1.0.1's line reading.**
- **D12 Storage full (BUG-34).**
  - **Each change is all-or-nothing, and a CSV restore is all-or-nothing.**
  - **A one-button "Storage is full" sheet appears, with a launch variant.**
  - **No storage meter in 1.0.2.**
  - **A Pro unlock that can't be saved is kept for the session.**
- **D13 Escaping (BUG-24).**
  - **One escaper; names stored verbatim and escaped everywhere.**
  - **Colours palette-only, with a silent fallback.**
  - **Icons validated, plus a boot heal.**
  - **Ids from files read through `Store.fileId`, with store backstops.**
  - **Dead components escaped now.**
  - **CSP right after 1.0.2.**
- **D14 Android Back (BUG-86/87).**
  - **On the budget editor: "Discard changes?" when dirty, close to the list when clean.**
  - **Saves and deletes never leave the form in history.**
  - **A save from an account-filtered History returns to it.**
- **D15 Deleting an account (BUG-29).**
  - **The default wallet moves to the first remaining base-currency account.**
  - **A widget or view left with no accounts widens to All.**
  - **Factory reset also resets the saved Home view and the default wallet.**
- **D16 Release.**
  - **Version 1.0.2 / versionCode 10002.**
  - **Let iOS 1.0.1 finish Apple review but don't release it; let Android 1.0.1 keep running
    the closed test.**
  - **Upload 1.0.2 to both as soon as it passes re-test.** The closed-test clock is unaffected.

Every other choice (about 60, all with a stated recommendation) is listed per unit in the
designs file, under "Uxx decisions".

---

## Integration and verification

1. Branch `fixes-1.0.2` from `main` and land **F0** (shared helpers plus their tests).
2. Run the units in parallel worktrees branched from `fixes-1.0.2`; each commits to its own
   branch. Use `merge=union` on `src/i18n/*.js` while merging, then remove it.
3. Merge in the order above. U6 comes after the others; then apply U1's sweep and re-run the
   sink crawl.
4. Make one `?v=` bump for every changed script, to a single value above the current maximum.
   Today: db.js 14, i18n.js 2, store/views/components/widgets/router/export/import/main and the
   dictionaries 73, pro.js 1, insights.js 6. Co-dependent files move together.
5. Add `@capacitor/share` (if D2 holds), then run `npm run version:sync` to 1.0.2.
6. Run `npm run lint`, the full `npm test`, then the full `npm run test:e2e`. Add the lint rule
   against date-only `toISOString()` (D-U4-7) here.
7. Run an adversarial review of the integrated diff, one reviewer per unit plus an integration
   lens. Fix whatever is confirmed.
8. Do live checks of every gate bug's reproduction steps (from the report) in Playwright
   Chromium with a Pixel 7 profile, Europe/Rome. Then check on the **Android emulator** with a
   1.0.2 debug build:
   - Back: the budget editor, and after a save or delete;
   - export through the share sheet;
   - the kill race (0.3–0.8 s);
   - storage full (seed close to the quota);
   - landscape (BUG-88 is not in scope, just note it).
9. Squash onto `main` as **uncommitted** changes, report, and ask before committing.
10. Release (owner): build the AAB and run the iOS workflow with build 10002, following
    `docs/release-checklist.md`. Upload to the Android closed test and submit to Apple; the iOS
    1.0.1 submission can be withdrawn or left in place. Release notes: §Data repair "not
    repairable" list, in plain words, in all five languages.

## Accepted limits (from the reviews)

- A series at the 60-month cap still loses its last payment when moved later (BUG-52 light fix).
- An Analytics drill-down tapped right after midnight, before any other interaction, copies the
  previous period into History (D-U4-8).
- On the web only, an import draft reopened with browser Back after its account was deleted
  would write to the dead id (D-U5-10). This is a follow-up.
- Duplicates already created by a 1.0/1.0.1 double import cannot be told apart from genuine
  twins, so they are not removed automatically.
- Writes lost before 1.0.2, through BUG-34 or BUG-90, are gone; the mirror was already overwritten.

---

## As built (2026-10-05)

Built on the local branch `fixes-1.0.2` (F0, nine unit branches `fix102/u2`…`u9` merged in
the planned order, U6 last, then U1's sweep), version **1.0.2 / versionCode 10002**, every
changed script at `?v=74`.

**Method, as run.**
- F0 landed the shared helpers with 48 tests (`f0Helpers`, `localYMD`, `amountParse`,
  `findAccountByName`, `routerLeave`); one reviewer found 3 issues (parseAmount whitespace
  grouping and Number input, a leaking router test listener), all fixed.
- U2–U9 ran in parallel worktrees. Each unit proved its new tests fail on the base (red/green),
  then got two adversarial reviewers (design conformance; regressions and house rules) and a
  fixer, with a re-check round when a major issue was fixed. U3 needed two rounds (3 majors:
  the BUG-52 end shift counted a payment moved past the end, a stopped series' end moved with
  an "Only this" edit, and UPDATE_TRANSFER classified schedule changes differently from
  UPDATE_TRANSACTION). U7 had 2 majors, U6 1, all fixed.
- U1's sweep ran on the merged tree. Its jsdom crawl (`tests/unit/escapeGuard.test.js`: about
  75 marker fields through dispatch, every CSV, a bank statement, broker text and poisoned
  storage; 50+ view variants, about 45 sheets, every widget config, a two-level tap crawl)
  found **30 leaking fields in 204 places on the unfixed code and 0 after**, including two
  sinks outside the design (statement currency and balance dates in the import map).
- An integrated review (one reviewer per unit plus an integration lens) raised 19 issues, 1
  major: re-importing a 1.0.1 backup after the BUG-25 heal added the converted opening balance
  again (the fingerprint now also lists an opening balance under its 1.0.1 Adjustment form).
  Also fixed: a boot that fails at the quota no longer brings back unsafe stored icons
  (`_sanitizeMarkupFields` in `_reloadSlice`), Bank Connect "Create account" never maps to a
  rolled-back id, the debt simulator ✕ leaves instead of pushing.
- Live checks replayed every gate bug and rider in headless Chromium (Pixel 7, Europe/Rome,
  `page.clock` for midnight and month-end): **all 30 web-checkable items fixed**. BUG-37
  (native export) and BUG-90 (kill race) are native-only, see "Still open".

**Small fixes taken along the way** (found by the live testers in the same flows, minor):
long unbroken names no longer push the History amount off-screen; tag chips keep a real
remove button with an aria-label; an opening balance can no longer be marked unpaid by swipe;
the screen-reader "Amount" label is hidden again (`.visually-hidden`, `.sr-only` never
existed); the scope sheet warns when a rebuild replaces hand-edited later amounts
(`recUpdate.rebuildAmountNote`); a hash change between two `#edit?id=` entries re-renders the
form; the Custom Range calendars are labelled Start/End; a restore keeps empty categories
empty instead of creating "Uncategorized"; the import result lines are whole-sentence plurals;
the widget currency note is a sentence, not a caps label; two hard-coded English strings in the
recurring sheet and the net-flow card are translated. Deferred: the accounts-first restore's
"Skipped N rows" wording (belongs with R2).

**Verification at the end of the round.** `npm run lint` clean; **1,584 unit tests in 138
files**; **89/89 e2e** (about 20 new specs, written blind in the units, all green after one
spec fix: markup_safety now returns to Home after its reload). `npx cap sync android` and
`ios` done for `@capacitor/share`; `nativeWiring.test.js` guards it.

**Android emulator (1.0.2 debug build, API 36, 2026-10-05): all checks pass.**
- BUG-37: all six Settings exports open the system chooser; Cancel is silent (no sheet); every
  file starts with a BOM; the device's transactions CSV re-imports (its rows report as already
  in Stack'd).
- BUG-90: 7 saves force-stopped 0.3–0.8 s after Save and 4 deletes force-stopped after the
  confirm all survived; twice the WebView's leveldb did not yet hold the row and the newer
  committed mirror restored it at boot. Never a leftover .tmp.
- Back: dirty budget editor → "Discard changes?"; untouched → closes to the list on Goals;
  after saving/deleting a log, account or category Back never reopens the form or a
  not-found page; bare Home minimizes.
- BUG-34: with localStorage filled to the quota, a new log and a new account each show
  "Storage is full", and after a relaunch nothing is half-saved.
- BUG-40: outside tap, swipe (slow and fast) and Back leave the welcome sheet up; Italiano +
  Inizia applies the language.
- Noted, out of scope (BUG-88): in landscape the bottom nav and FAB slide off screen because
  `utils/keyboard.js` keeps the portrait height and reads any viewport under 85% of it as an
  open keyboard. Fix with the next landscape round (re-baseline on orientation change).
  On API 29+ Android shows its own "Sharing 1 file" chooser header, so the localized
  `export.shareTitle` is visible only on Android 7–9 and iOS (not a defect).

**Still open before release.**
- iOS on TestFlight: export through the share sheet and the mirror commit (Web Inspector:
  `Filesystem.readdir('stackd_db')` after a save shows promoted .json files and no .tmp).
- Release notes: drafted below (store text in five languages; the longer list in English).
- Build the AAB locally and the iOS build through Actions (`docs/release-checklist.md`).

## Release notes (draft for the owner)

**Store "What's new"** (under Play's 500-character limit; paste per listing language).

- **en:** Reliability update. Saves are now all-or-nothing, with a clear message when storage is full. CSV export opens the share sheet on your phone. Restoring a backup keeps your accounts apart, reads decimal commas correctly and skips rows you already have. Transfers between currencies record the amount received. Dates follow your time zone around midnight. Plus many fixes to recurring payments, budgets, opening balances and the Back button.
- **fr :** Mise à jour de fiabilité. Chaque enregistrement est complet ou annulé, avec un message clair si le stockage est plein. L'export CSV ouvre le menu de partage. La restauration garde vos comptes séparés, lit les virgules décimales et ignore les lignes déjà présentes. Les virements entre devises enregistrent le montant reçu. Les dates suivent votre fuseau horaire. Et des corrections pour les paiements récurrents, budgets, soldes d'ouverture et le bouton Retour.
- **it:** Aggiornamento di affidabilità. Ogni salvataggio avviene per intero o per niente, con un messaggio chiaro se lo spazio è pieno. L'esportazione CSV apre il menu di condivisione. Il ripristino tiene separati i conti, legge la virgola decimale e salta le righe già presenti. I trasferimenti tra valute registrano l'importo ricevuto. Le date seguono il tuo fuso orario. E correzioni a pagamenti ricorrenti, budget, saldi iniziali e tasto Indietro.
- **es:** Actualización de fiabilidad. Cada guardado se completa entero o no se aplica, con un mensaje claro si el almacenamiento está lleno. La exportación CSV abre el menú para compartir. Restaurar una copia mantiene tus cuentas separadas, lee la coma decimal y omite las filas que ya tienes. Las transferencias entre divisas registran el importe recibido. Las fechas siguen tu zona horaria. Y correcciones en pagos recurrentes, presupuestos, saldos iniciales y el botón Atrás.
- **pt:** Atualização de fiabilidade. Cada gravação é feita por inteiro ou não é feita, com uma mensagem clara se o armazenamento estiver cheio. A exportação CSV abre o menu de partilha. Restaurar uma cópia mantém as contas separadas, lê a vírgula decimal e ignora as linhas já existentes. As transferências entre moedas registam o montante recebido. As datas seguem o seu fuso horário. E correções em pagamentos recorrentes, orçamentos, saldos iniciais e no botão Voltar.

**Longer notes (site / support page, English master; translate from the "Not repairable" list).**
1.0.2 fixes problems that could already have changed some data. The app repairs what it safely can at the first launch. A few things it cannot tell apart from deliberate choices, so they need one manual step:
- Payments of a recurring series that a "This and future" or "All" edit marked unpaid: swipe them paid again.
- A backup restored on 1.0/1.0.1 that used decimal commas (amounts lost their cents), or that merged two accounts with the same name: factory reset, then restore the same file again on 1.0.2. Your backup file is intact.
- Rows doubled by importing the same backup twice: delete the extra rows, or factory reset and restore once.
- Transfers between two currencies saved before 1.0.2 recorded the same number on both sides: open one and enter the amount that arrived; use "This and future" for a whole series.
- An opening balance that 1.0.1 turned into an "Adjustment" row and that the app could not repair: in Edit Account enter the original amount, sign and opening date, save, then delete the "Opening Balance" Adjustment row in History.
- Loan payments you edited by hand before 1.0.2 are re-priced by the next "Update linked payments", as in 1.0.1. From 1.0.2 on, hand edits are kept.
- Changes lost before 1.0.2 because storage was full, or because the app was closed within a second of saving, cannot be recovered.
