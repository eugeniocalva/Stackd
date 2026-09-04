# Bank File Import Plan (Option A) — "Works with every bank in Europe"

> Status: **Phase 1 SHIPPED as v0.99 (2026-09-03)** — see §3f "as built" below.
> Phases 2–5 not started. This is the cold-start reference for the
> bank-statement import feature. Read it before touching import code, the same
> way `docs/debt-rebuild-plan.md` is the reference for loans.

## 1. Context and goal

Stack'd will support importing **bank statement files** (CSV, camt.053 XML,
MT940) that users export from their own web/mobile banking. Every EU bank
offers at least one of these formats, so this delivers "connect with banks all
over Europe" while keeping the app's core promise intact: **no backend, no
accounts, no network calls — the file is read locally with `FileReader` and
never leaves the device.**

This was chosen over PSD2 aggregator integration (GoCardless BYO-key, "Option
B") because it is pure client-side work, keeps the App Store / Play Store
privacy declaration at "Data Not Collected", works on the web build too, and
every piece of it (dedup, currency, category rules) is reusable groundwork if
Option B is ever built later.

### Non-goals (explicitly out of scope)

- **No network access of any kind.** No aggregator APIs, no FX-rate fetching.
- **No FX conversion.** Mixed-currency aggregation excludes, it never converts.
- **No PDF statement parsing.** Too fragile; CSV/camt/MT940 cover the market.
- **No OFX/QIF.** Rare in the EU; camt.053 + MT940 + CSV is the EU triad.
  Revisit only if users ask.

## 2. Current state (what exists today)

- `src/import.js` (`window.StackdImport`) parses **Stack'd's own export CSV**
  (round-trip format: `date, amount, account, category, type, note,
  transferref, seriesid, …`). It has a hand-rolled quoted-CSV parser with
  `,`/`;` detection and header squashing, date/time/bool normalizers, transfer
  re-pairing and series re-linking. `importCSV()` routes loans vs transactions
  by file shape.
- **There is no dedup**: re-importing the same file duplicates every row
  (deliberate for backup restore, wrong for bank statements).
- Transactions have no external/bank id field.
- Accounts have no `currency`; `state.currency` is one global display setting
  used by `Store.formatCurrency`.
- Imported rows can carry `recurrence`; bank rows must never (see §7).

## 3. Phase 1 — Import foundations: bank CSV + dedup

**Goal:** import any bank's CSV export through a column-mapping preview, with
duplicate protection. This phase builds the pipeline every later format reuses.

### 3.1 `importKey` dedup (the load-bearing piece)

- Every bank-imported transaction gets an `importKey` string:
  - If the format provides a stable bank reference (camt `AcctSvcrRef` /
    `EndToEndId`, MT940 `:61:` reference — phase 2), use
    `ref:<accountId>|<bankRef>`.
  - Otherwise a fingerprint: `fp:<accountId>|<date>|<amountCents>|<normalized
    description>` (lowercased, whitespace/punctuation squashed). Append a
    `#n` ordinal when one file legitimately contains n identical rows on the
    same day, so intra-file twins survive but a re-import still matches.
- New dispatch case `BATCH_IMPORT_BANK_TRANSACTIONS`: skips any incoming row
  whose `importKey` already exists in the target account, reports
  `{imported, duplicates}` back. Backed by a lazy `_importKeyIdx`
  (Set of keys), built O(T) on first use, **nulled at the top of `dispatch`
  and in `_sortData`** like `_openingIdx`/`_budgetSpendIdx`.
- The existing `BATCH_IMPORT_TRANSACTIONS` (backup restore) is untouched.
- `importKey` is included in CSV export/import round-trip (a restored backup
  must keep its dedup protection), as a new optional column — old exports
  without it still import fine.

### 3.2 Bank-CSV detection and column mapping

- `importCSV()` grows a third branch: rows that are neither loans nor Stack'd
  transaction shape (no `account` + `type` headers) are treated as a **bank
  CSV** and routed to the mapping flow instead of being skipped row-by-row.
- New view/modal: **Import mapping screen** where the user assigns columns:
  - `date` (+ date format: auto-detect DMY/YMD/MDY from the data, ask only on
    ambiguity), `description`, and either a single signed `amount` column or
    separate debit/credit columns (both conventions are common in the EU).
  - Decimal comma (`1.234,56`) and thin-space thousands separators handled by
    a shared `_parseBankAmount` (extend `_num`).
  - Target **account picker** (bank CSVs name no account; the user owns the
    mapping).
- **Mapping presets**: after a successful import, persist the mapping keyed by
  the file's header signature under `stackd_v1_importPresets` — next month's
  export from the same bank imports in two taps. House convention: prefs slice,
  **not** in the CSV backup.

### 3.3 Import preview screen

Before anything is dispatched, show a preview list: parsed rows with date /
description / signed amount, per-row checkbox, and badges for
**duplicate** (importKey already present — default unchecked) and
**unparseable** (excluded, with reason). Confirm dispatches one batch. This
screen is also where phase 3 category assignment and phase 5 matching surface,
so build it as its own view (`#import-preview`) with state held on the view
object, not in the store.

### 3.4 Data model notes

- Bank rows import as plain `income`/`expense` (sign decides), `categoryId:
  ''` until phase 3, `comment` = bank description, **never** `recurrence`,
  never `transferRef` (phase 5 may pair them later).
- Store `importKey` and (when available) `bankRef` on the transaction; both
  are inert everywhere else in the app.

### 3f. Phase 1 as built (v0.99, 2026-09-03)

Shipped per §3 with these concrete decisions (the code is the authority;
this records the deltas and specifics a cold start needs):

- **Mapping is index-based, not header-key-based.** Bank CSVs can have empty
  or duplicated headers, so a mapping stores zero-based column indexes
  (`{date, description, amountMode: 'single'|'split', amount, debit, credit,
  bankRef, dateFormat: 'dmy'|'mdy'|'ymd', decimal: 'auto'|'comma'|'dot'}`,
  `-1` = unmapped). `StackdImport.analyzeBankCSV(csvText)` returns
  `{headerLabels, rowsRaw, columns (index/label/samples), signature, guess}`;
  `buildBankTransactions(rowsRaw, mapping, accountId)` returns
  `{items: [{tx, duplicate, error}], stats}`. The preset `signature` is the
  squashed header labels joined with `|`.
- **importKey exactly as §3.1**, with `type` included in the fingerprint:
  `fp:<accountId>|<date>|<type>|<amountCents>|<normDesc(60, trimmed after
  slice)>`, `ref:` when a reference column is mapped (the ref is escaped
  inside the key — `%`→`%25`, `#`→`%23` — so a literal ref ending in `#2`
  can't collide with a twin suffix), `#n` ordinals for intra-file twins.
  Dedup is
  enforced twice: preview flags duplicates (not selectable — a flagged
  duplicate cannot be force-imported), and `BATCH_IMPORT_BANK_TRANSACTIONS`
  skips keys already present (third lazy index `_importKeyIdx`, same
  lifecycle as `_openingIdx`; public `Store.hasImportKey`).
- **Routing:** `importCSV` order is loans → Stack'd backup (first row has
  `date`+`amount`+`account`+`type` headers) → bank (`{kind:'bank', csvText}`
  to the caller) → error. The backup-restore path is unchanged (no dedup) but
  round-trips `ImportKey`/`BankRef`, now the last two `TX_HEADERS` columns.
- **Views:** `Views._ImportShared.draft` (the `_DebtShared` pattern) carries
  the flow across `#import-map` → `#import-preview`; both views guard a null
  draft with an empty-state card. Preset hit = exact signature match with
  per-index validation, falling back to the fresh guess. The preview list is
  one joined string with a single delegated listener; checkbox toggles patch
  `items[i].include` and update the summary/confirm labels in place (no
  dispatch, no re-render). `SAVE_IMPORT_PRESET` upserts by signature, caps
  the slice at 20 by evicting the smallest `updatedAt`. `RESET_APP` clears
  `stackd_v1_importPresets`; the slice is cross-tab synced and (house
  convention) NOT in the CSV backup.
- **Amount parsing** handles decimal comma/dot with auto-detection
  (rightmost separator wins when both present; a lone separator is decimal
  only with 1–2 trailing digits), Swiss `1'234.56`, NBSP/thin spaces,
  trailing minus, and parentheses negatives. Date-shaped columns are excluded
  from amount-column guessing; short debit/credit header hints (`af`, `bij`,
  `ref`, `id`) match whole words only.
- **i18n:** 45 `bankImport.*` keys + 4 new `terms.*` keys + 7 edited keys, in
  all five dictionaries; `TERMS_IDS` gained `importAccuracy` (after
  `notAdvice`) and `thirdParties` (before `changes`); `terms.updatedDate` →
  September 3, 2026 (§9 landed with this phase, as planned).
- **Tests:** `tests/unit/bankImport.test.js` (20 tests: parser table, guess
  heuristics, key formats/ordinals, dispatch dedup, preset upsert/cap,
  RESET_APP, backup round-trip) and `tests/e2e/bank_import.spec.js` (full
  mapping→preview→import flow on a semicolon/decimal-comma Italian CSV, then
  re-import showing both rows as non-selectable duplicates). First
  `setInputFiles` usage in the e2e suite.

## 4. Phase 2 — camt.053 / MT940 parsers + balance reconciliation

**Goal:** first-class support for the two structured EU statement formats.
These are better than CSV: stable references, ISO dates, explicit currency,
and opening/closing balances.

- **camt.053** (ISO 20022 XML; also accept camt.052 intraday): parse with the
  built-in `DOMParser` — no dependency. Extract per entry: `BookgDt`/`ValDt`,
  `Amt` + `@Ccy`, `CdtDbtInd`, `AcctSvcrRef`/`EndToEndId`, remittance info
  (`RmtInf/Ustrd`, creditor/debtor name) → description. Extract `Bal` blocks:
  `OPBD` (opening) and `CLBD` (closing).
- **MT940**: line-based text parser for `:60F:` (opening), `:61:` (entry:
  value date, D/C, amount, reference), `:86:` (description, possibly
  multi-line), `:62F:` (closing). SEPA `:86:` subfield tags (`?20`–`?29`
  purpose, `?32` counterparty) vary by bank — concatenate what's recognized,
  fall back to the raw line.
- File routing: extension + sniff (`<Document` xmlns containing `camt` → XML;
  leading `:20:`/`{1:` → MT940; else CSV). All three land on the same preview
  screen and the same `BATCH_IMPORT_BANK_TRANSACTIONS`.
- **Balance reconciliation:**
  - First import into an account with no transactions: offer to set the
    opening balance so that `OPBD` is honoured (creates/updates the
    `opening_balance` transaction — balances are computed, never stored).
  - Every import: after dedup, compare computed account balance at the
    statement's closing date against `CLBD`; on mismatch show a
    non-blocking warning with the delta ("Stack'd shows X, your bank reported
    Y"). This is the user's signal that manual entries and bank rows overlap
    (see phase 5) or that a statement gap exists.
- **Currency guard:** camt/MT940 declare the currency. Until phase 4 ships:
  if it differs from `state.currency`, warn prominently and let the user
  proceed or cancel (amounts are stored as numbers either way; nothing
  converts). After phase 4: check against the target *account's* currency.

## 5. Phase 3 — Category rules engine

**Goal:** imported rows stop landing uncategorized.

- Rules slice `stackd_v1_importRules`: ordered array of
  `{id, match, categoryId, createdAt}` where `match` is a lowercase substring
  tested against the bank description (substring only — no user-facing regex;
  YAGNI until proven needed).
- Applied **at preview time only** — rules are an import-time convenience,
  never a background mutation of existing data.
- Preview UX: each row shows its resolved category (rule hit or
  Uncategorized); tapping opens the existing category picker; after a manual
  pick, offer one-tap "always use this for '<merchant>'" which appends a rule.
- Rules management list in Others & Settings (view, delete, reorder — first
  match wins).
- Backup: include rules in the CSV export as their own section (like loans,
  recognized by shape) — unlike widget prefs these are user-authored data
  that would be painful to lose. Decision to confirm at build time.

## 6. Phase 4 — Per-account currency

**Goal:** honestly support the non-euro EU (SEK, PLN, CZK, DKK, CHF, GBP…)
without FX conversion.

- `account.currency` (ISO 4217 string). Boot migration: absent → set to
  `state.currency` (idempotent, mirrors the loans migration pattern).
  `state.currency` is reframed as the **primary currency**.
- Account form gains a currency picker (reuse the existing currency list from
  the settings picker). Existing accounts editable.
- `Store.formatCurrency(amount, currencyCode?)` — optional override, defaults
  to primary; per-account surfaces (account tiles, account-filtered history)
  format in the account's currency.
- **Aggregation policy — exclude, never convert:** dashboard totals, widgets,
  analytics, budgets and net-flow math operate on **primary-currency accounts
  only**. Non-primary accounts show their own balance in their own currency on
  their tile, and aggregate surfaces carry a caption ("excludes N accounts in
  other currencies" — whole-sentence plural keys per i18n rules). This is the
  only honest offline behaviour; a user-entered manual FX rate is a possible
  later enhancement, not part of this phase.
- Audit checklist for the exclusion: dashboard balance header, all 8 widget
  types, Analytics aggregates, budget spend index (`_budgetSpendIdx` must
  skip non-primary accounts), CSV export (add `Currency` column, ignored on
  import of old files).
- This phase is independent of phases 1–3 order-wise; it's sequenced fourth
  because a EUR-only user gets full value from phases 1–3 alone, and the
  currency guard in §4 keeps mixed imports safe meanwhile.

## 7. Phase 5 — Reconciliation polish: matching and transfers

**Goal:** bank imports coexist with hand-entered and recurring data instead of
double-counting it.

- **Match suggestions at preview:** for each incoming row, look for an
  existing *non-imported* transaction in the same account with the same
  amount and a date within ±3 days. On a hit, the preview row shows "matches
  existing: <desc>" and defaults to **link instead of insert**: the existing
  transaction absorbs the `importKey`/`bankRef` (so future re-imports dedup
  against it) and optionally the bank date. This is how a materialized
  recurring occurrence (rent on the 1st) meets its real bank row (rent booked
  on the 2nd) without duplication — the recurring member keeps its
  `recurrence` untouched; **never** arm or modify `nextDate` here.
- **Transfer detection:** within one import batch (or against recent existing
  rows), two rows with opposite signs, equal amounts, dates within ±2 days,
  across two *different* owned accounts get a "pair as transfer?" suggestion
  → sets a fresh shared `transferRef` (respecting the paired-legs model; the
  category empties like any transfer leg).
- Both are suggestions with explicit user confirmation on the preview screen —
  no silent merging.

## 8. Testing strategy

- **Unit (Vitest, `executeFile` pattern):** fixture files checked into
  `tests/fixtures/bank/` — at minimum: camt.053 samples in two bank dialects,
  MT940 with multi-line `:86:`, CSVs with decimal comma + `;` delimiter,
  debit/credit split columns, and DMY dates (Intesa/ING/Revolut/N26-style
  shapes). Tests cover: importKey stability across re-import, fingerprint
  ordinal for same-day twins, index invalidation, balance reconciliation
  math, currency guard, rule application order, match-instead-of-insert
  leaving `recurrence` untouched.
- **E2E (Playwright):** one spec driving a CSV file through mapping → preview
  → import → re-import shows duplicates unchecked; `setInputFiles` feeds the
  file input.
- Per house rules: unit `executeFile` chains load `i18n.js` + `i18n/en.js`
  after `db.js`; every new string keyed in **all five** dictionaries
  (`tests/unit/i18n.test.js` enforces); new Lucide icons added to the
  `EMERGENCY_ICONS` fallback; every touched `src/*.js` gets its `?v=` bumped
  in `index.html` (co-dependent files bump together).

## 9. Privacy Policy & Terms of Use review

The feature changes **nothing** about data collection — files are parsed
in-memory on-device and only the extracted transactions are stored locally.
But the legal text should say so explicitly, because "bank statement import"
is exactly the phrase that makes users and store reviewers look for a data
flow. All text lives as `terms.*` i18n keys (P8f) in five dictionaries;
bump `terms.updatedDate`.

**Privacy Policy (Part 2) — additions/edits:**

- `terms.privacy.whatStored` — add: bank statement files you import are read
  entirely on this device; the file itself is not kept, only the transactions
  extracted from it, stored in the same local storage as everything else.
- `terms.privacy.whatNot` — add "No uploading of imported files" to the
  negative list; the "nothing ever leaves your device" short version
  (`terms.privacy.short`) remains true and unchanged.
- `terms.privacy.gdpr` — still accurate (no controller/processor relationship
  arises; processing is local under the user's sole control), but extend the
  clause to name imported bank data explicitly so the claim visibly covers
  the app's most sensitive input.
- `terms.privacy.security` — extend the backup advice: imported bank data is
  as sensitive as the statements it came from; the CSV export now contains it
  too, so store backups accordingly.

**Terms of Use (Part 1) — additions/edits:**

- `terms.use.notAdvice` / accuracy — add an **import accuracy** clause:
  parsing depends on the format your bank exports; figures may be
  incomplete or misparsed, and the reconciliation warning is informational —
  verify against your bank's own records.
- `terms.use.yourData` — note that the user is responsible for the lawful use
  of statements they import (their own accounts / statements they are
  entitled to hold).
- New **third-party names** clause: bank names appear only as user-entered
  labels or file metadata; Stack'd is not affiliated with, endorsed by, or
  certified by any bank.

**Store-facing (not in-app, but same review):**

- App Store privacy label and Play Data Safety form stay **"Data Not
  Collected"** — importing local files the user picks does not constitute
  collection. Keep this claim in sync with the policy wording.
- Marketing/listing copy: say "import statements from any European bank",
  never "connects to your bank" (implies API access) and never bank logos or
  "works with <Bank>" claims (trademark + review risk).
- If Option B (aggregator connect) ever ships, this entire section must be
  redone — third-party recipient (GoCardless), consent, data-sharing
  disclosures. Out of scope here; noted so nobody edits Option A wording to
  accidentally cover it.

## 10. Suggested sequencing and versions

| Phase | Scope | Ships as |
|---|---|---|
| 1 | importKey dedup, bank-CSV mapping + presets, preview screen | v0.99 |
| 2 | camt.053/MT940, balance reconciliation, currency guard | v1.00 |
| 3 | Category rules | v1.01 |
| 4 | Per-account currency | v1.02 |
| 5 | Match/link + transfer detection | v1.03 |

Terms/Privacy edits (§9) land with **phase 1** — the moment any bank file can
be imported, the policy should already cover it.

Each phase is independently shippable; phases 1–2 are the credible minimum
for the "every bank in Europe" claim, since camt.053/MT940 are the formats
with EU-wide guaranteed availability.
