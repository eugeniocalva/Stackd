# Import & Export Plan — MoneyStats-style import, export and backup

> Status: **IE-1…IE-4 DONE (engine only, no visible change); IE-5…IE-7 (screens, one feature-branch merge) next.** Cold-start reference for the
> import/export redesign. Owner decisions taken on 2026-10-24 are in §1 and
> §12; MoneyStats samples in it/en/de/pt are analysed in §2.
> Code facts were mapped on 2026-10-24 against `main` at `d38bb6a`
> (1.0.3, `?v=75`) and the plan was adversarially reviewed the same day
> (5 lenses, 43 confirmed findings folded in, 46 rejected). Re-check line
> numbers before editing.

## 1. Goal and owner decisions

Bring Stack'd's import/export up to what MoneyStats offers (screens shared on
2026-10-24), using Stack'd's own UI components, while keeping every existing
backup file and the import rules exactly as they are.

| # | Decision (2026-10-24) | Taken |
|---|---|---|
| O1 | Column layout of the new transactions export | **Exact MoneyStats layout** — the same 17 columns in the same order |
| O2 | Language of header names and fixed words | **App language** (it → `Conto;Data;Ammontare…`); the importer reads all 5 languages |
| O3 | Where the 6 existing backup exports live | **Separate "Backup" row/screen**, next to a new "Import and export" row |
| O4 | Import extras in this round | **All four**: paste box, Check/preview step, QIF files, import settings sheet |

What stays untouched (hard requirement):

- The six backup exporters (`exportAccounts`, `exportCategories`,
  `exportTransactions`, `exportLoans`, `exportBudgets`, `exportImportRules`),
  their file names, headers and byte-identical content including the BOM —
  pinned by ~24 unit files and 3 e2e specs (§10).
- The restore engine for **backup files**: `buildTransactions` and the other
  `build*` restorers keep their behaviour and dedup rules (1.0.2 D1–D16).
  Ledger/QIF imports use it through an **opt-in `{ledger:true}` mode** (§6d)
  that never changes the default path.
- The restore readers (`parseCSV`, `_readRecords`, `_detectDelimiter`,
  `_normalizeDate`, `_restoreDecimal`) — the new Auto reader (§6b) is a
  separate function.
- Import rules: `Components.ImportRulesModal`, `ADD/DELETE_IMPORT_RULE`, the
  rules CSV export and restore.
- The bank-statement flow (`#import-map` → `#import-preview`, camt/MT940,
  presets, match/link/pair, the U2 success sheet) and the Bank Connect hooks
  into `_ImportShared` (`bank-connect.js:929-932`). It gains an optional
  pre-read input (§6g) but its default path is unchanged.
- **Nothing from another app is written without the Review screen.** Ledger
  and QIF rows are committed only by Review's *Import* button (§6a).

## 2. What MoneyStats does (reference)

- **Settings → Data**: rows *Online banking*, *Sync*, *Import and export*,
  *Backup*. *Import and export* opens a small sheet: **Import file / Export
  file / Cancel**.
- **Import screen**: a large text box (shows a sample, the picked file's
  text, or pasted text) → **Choose a file** → **Settings** sheet (column
  delimiter *auto*, row delimiter *auto*, date format `dd-MM-yyyy`, currency
  factor `1.0`, *ignore quotes* toggle) → hint "Select a CSV, QIF or TXT file
  or paste the content in the text field" → primary **Check**.
- **Export screen**: header with back chevron, title and a **share icon**;
  subtitle "Copy the text or save the file in your drive"; a preview text
  box of the generated file → format picker (*TXT*, *CSV (Excel)*, *Email
  attachment*, *Numbers*, *MoneyStats*) → **Settings** (delimiter, date
  format) → **Period** sheet (start month / end month) → primary **Export
  file** → share sheet → "Your file was exported to your device". On entry
  an *Information* popup says export is for other programs and backups are
  for restoring (More / Settings / Backup).
- **The file** (`Export_MoneyStats.csv`, 6,051 rows, analysed 2026-10-24):

  ```
  "Conto";"Data";"Ammontare";"Valuta";"Saldo";"Valuta";"Titolo";"Ricevente";"Uso";"Categoria";"Commento";"Hashtags";"Ammontare";"Valuta";"Tasso di cambio";"Stato del pagamento";"Marchio"
  "Cash";"01/11/2021";"0,00";"EUR";"313,60";"EUR";"Saldo";"";"";"";"";"";"0,00";"EUR";"1,00";"pagato";""
  "AB";"01/11/2021";"-25,33";"EUR";"0,00";"EUR";"Shopping";"";"";"Shopping";"Vetri Apple Watch…";"Elettronica e Accessori";"-25,33";"EUR";"1,00";"pagato";""
  ```

  - `;` or `,` delimiter (a MoneyStats setting), every field quoted, UTF-8
    without BOM, LF, dates `dd/MM/yyyy` (or `dd-MM-yyyy`), decimal comma, no
    thousands separator.
  - **Opening balance** = a row with Ammontare `0,00` and the balance in
    Saldo; Titolo is "Saldo" or empty (BPI). Saldo is `0,00` on every other
    row — it is not a running balance.
  - **Transfer** = two rows with category "Trasferimento", same day, opposite
    amounts, different accounts, written next to each other — **either leg
    first** (134 of 229 pairs + first, 95 − first). 4 day/amount groups hold
    4–6 such rows across 3 accounts.
  - **Category** = Categoria, falling back to Titolo (97 rows have an empty
    Categoria; 11 rows have a different, non-empty Titolo).
  - **Hashtags** joined with ` | `, case and accents kept, no `#`; 2 cells
    contain commas.
  - Ricevente/Uso/Marchio always empty, Tasso di cambio always `1,00`,
    second Ammontare/Valuta equal to the first, Stato always `pagato` in this
    file (an unpaid row reads `non pagato`, seen in a later screenshot).
  - Rows ascending by date; future scheduled rows included (to 2027-02-28,
    ~4 months ahead).
- **The same data exported with MoneyStats in English, German and
  Portuguese** (owner samples, 2026-10-24) — only the header row and the
  payment-status word change; every other cell is byte-identical:

  | Col | it | en | de | pt |
  |---|---|---|---|---|
  | 1 | Conto | Account | Konto | Conta |
  | 2 | Data | Date | Datum | Data |
  | 3 | Ammontare | Amount | Betrag | Montante |
  | 4 | Valuta | Currency | Währung | Moeda |
  | 5 | Saldo | Account balance | Kontostand | Saldo |
  | 6 | Valuta | Currency | Währung | Moeda |
  | 7 | Titolo | Title | Titel | Título |
  | 8 | Ricevente | Receiver | Empfänger | Recebedor |
  | 9 | Uso | Usage | Verwendung | Uso |
  | 10 | Categoria | Category | Kategorie | Categoria |
  | 11 | Commento | Comment | Notiz | Comentário |
  | 12 | Hashtags | Tags | Tags | Hashtags |
  | 13 | Ammontare | Amount | Betrag | Montante |
  | 14 | Valuta | Currency | Währung | Moeda |
  | 15 | Tasso di cambio | Exchange rate | Wechselkurs | Taxa de câmbio |
  | 16 | Stato del pagamento | Payment status | Zahlungsstatus | Status do pagamento |
  | 17 | Marchio | Mark | Markierung | Marca |
  | paid word | pagato | paid | bezahlt | pago |
  | unpaid word | non pagato | not paid | nicht bezahlt | não pago |

  French and Spanish (owner screenshots, 2026-10-24; only part of the header
  row was visible):

  | Col | fr | es |
  |---|---|---|
  | 3 / 13 | ? | Cantidad (seen as "…idad") |
  | 4 / 6 / 14 | ? | Moneda |
  | 5 | ? | Saldo |
  | 9 | ? | Uso |
  | 10 | Catégorie | Categoría |
  | 11 | Note | Comentario |
  | 12 | Tags | ? |
  | 15 | Taux de change | Tipo de cambio |
  | 16 | Statut de paiement (seen as "Statut de…") | Estado de pago (seen as "…do de pago") |
  | 17 | Marque | Marca |
  | paid / unpaid | payé / impayé | pagado / no pagado |

  Columns marked `?` or "seen as" are inferred; a screenshot of the full
  first line in fr and es would complete them (not blocking — §6c's
  structural fallback reads those files anyway).

  Consequences:
  - **"Saldo" and "Trasferimento" are data, not vocabulary**: they stay
    Italian in the en/de/pt files (they are the user's own title/category
    names). Balance rows and transfers must be recognised by **structure**
    (§6d), with words only as a hint.
  - Date format (`dd/MM/yyyy`), delimiter (`;`) and decimal comma are
    MoneyStats *settings*, not tied to the language (the English file uses
    them too).
  - The paid/unpaid words are now known in all six MoneyStats languages;
    MoneyStats' fr/es header rows are only partly known (table above).

## 3. Target experience — Settings and Backup

### 3a. Settings (Others & Settings)

The two cards *Data Export* and *Bank data* (`views.js:3992-4030`) become one
**Data** card in the Settings row style (`#btn-manage-accounts` pattern,
`views.js:3867-3876`):

| Row | Id | Opens |
|---|---|---|
| Online banking (only when `BankConnect.featureEnabled()`) | `#btn-open-bank-connect` (unchanged, stays first) | `#bank-connect` |
| **Import and export** — "Bring in a file or send your data to another app" | `#btn-open-import-export` | the Import/Export sheet |
| **Backup** — "Save a full copy or restore one" | `#btn-open-backup` | `#backup` |
| **Import rules** — "Categories learned from your imports" | `#btn-import-rules` (id kept) | `Components.ImportRulesModal` (unchanged) |

**Import/Export sheet** (`#import-export-sheet`, built on `_bankSheet` with
the `RecurringUpdateModal` option-card layout): *Import file* → `#import`,
*Export file* → `#export`, *Cancel* (`data-back-dismiss`); backdrop tap
closes.

The Bank Connect picker's "Import a statement instead" link
(`#bank-go-import`, `views.js:7098`) is retargeted from `#settings` to
`#import`.

### 3b. Backup screen (`#backup`)

A secondary screen (chevron + title header, back to `#settings`):

- **Create a backup** — info line ("A backup is a full copy of your Stack'd
  data. Restore it on this or another phone.") and the six buttons with
  their current ids `#btn-export-accounts|categories|transactions|loans|
  budgets|rules` and handlers, unchanged.
- **Restore a backup** — the hidden `#import-csv-file` input and
  `#btn-import-csv` (ids kept, label "Restore from a file"). It calls
  `importCSV` exactly as today in **restore mode** (§6a):
  - Stack'd backup files → direct restore → `#import-result-modal` (one tap,
    no Check — §12 Q1).
  - Bank CSV / camt / MT940 → `#import-map` as today.
  - **Ledger or QIF file → nothing is written**; the text is handed to the
    Import draft and the app opens `#import-review` (same Review as the
    Import screen).

## 4. Target experience — Import

### 4a. Import screen (`#import`)

Title + ✕ header (`data-router-leave` → `#settings`; the ✕ clears the draft).

1. **Text box** `#import-text` — `<textarea>` styled with the dormant
   `.note-textarea` (`components.css:852-871`) + monospace.
   - Placeholder: a localized sample in a valid ledger shape —
     `Account;Date;Amount;Currency;Title;Category;Comment` + 3 rows, using the
     localized ledger headers (§5).
   - Typing/pasting edits the draft text.
   - After *Choose a file*, the box shows the **first 200 lines** read-only,
     with a line above it: "Showing 200 of 6,052 lines from
     Export_MoneyStats.csv" (`.one/.other`) and a *Clear* link.
   - The full text lives only in the module draft — never in `render()`
     HTML, never in the store or storage (the privacy terms say the file is
     not kept). Pasted text gets the pseudo file name "Pasted text".
2. **Choose a file** `#btn-import-choose` (secondary) — hidden
   `<input type="file" id="import-file-input">`. Android's chooser drops
   extensions it cannot map to a MIME type (`.qif`, `.940`, `.sta`), so on
   native the input uses `accept="*/*"` and relies on content sniffing; the
   web build keeps an extension list (`.csv,.txt,.qif,.xml,.940,.mt940,.sta`).
   **Device check in IE-6** (QIF from a browser download and from Drive).
3. **Settings** `#btn-import-settings` (secondary) → Import settings (§4b).
4. Hint: "Choose a CSV, TXT, QIF, camt.053 or MT940 file, or paste the
   content in the box."
5. **Check** `#btn-import-check` (primary, disabled while the box is empty;
   busy label while it runs) → `analyzeText` (§6a) and routes:

| Recognised as | Goes to |
|---|---|
| Ledger file (MoneyStats, Stack'd export, plain multi-account shape) | `#import-review` |
| QIF | `#import-review` |
| A Stack'd backup file (any of the 6) | `#import-review` in *backup* mode: file kind + row count; Import = today's restore |
| Single-account bank CSV | `#import-map`, handed the Check analysis (§6g) |
| camt.053/052, MT940 | the existing statement details screen |
| Bank CSV / statement while there are **no accounts** | inline "Create an account first" (the guard moves into the shared handoff, §6g) |
| Nothing usable | inline error `#import-check-error` with a localized reason |

The draft (text, file name, overrides) survives Back like `#import-map`; the
screen is not added to `FORM_VIEWS` (`_formSnapshot` would stringify an
800 KB textarea). It is cleared on ✕, on *Clear* and after a confirmed
import.

### 4b. Import settings sheet

Built like `BankSettingsModal` (`components.js:4290-4345`). Every setting
defaults to **Auto**; Review shows what Auto decided. Overrides live in the
Import draft for the whole Import → Review flow (never reset by `destroy()`)
and are cleared with the draft — a remembered override would silently misread
the next, different file.

| Setting | Values | Applies to |
|---|---|---|
| Column delimiter | Auto, `;`, `,`, Tab, `\|` | ledger, QIF-less CSV, bank CSV |
| Row delimiter | Auto, LF, CRLF, CR | ledger, bank CSV |
| Date format | Auto, Day-Month-Year, Month-Day-Year, Year-Month-Day | ledger, QIF, bank CSV (seeds `mapping.dateFormat`) |
| Decimal separator | Auto, Comma, Dot | ledger, bank CSV (seeds `mapping.decimal`) |
| Amount factor | `1` | ledger, QIF, bank CSV — e.g. `-1` flips signs, `0.01` reads cents, a rate converts |
| Ignore quotes | off | ledger, bank CSV |

Stack'd backup files and camt/MT940 ignore the sheet (their formats are
fixed); when Check routes to one of those, Review says "Import settings
don't apply to this file".

**Amount factor reader**: its own parser — optional sign, comma or point,
up to 6 decimals, non-zero; `showFieldError` on 0/empty/garbage. Each
factored amount is rounded to cents once. (`Store.parseAmount` is a money
reader: it rejects more than 2 decimals.)

### 4c. Review screen (`#import-review`) — the Check result

Computed by a **dry run of the real import** (§6f), so its numbers are the
numbers Import will land. Layout:

- **Header card**: recognised format ("MoneyStats export", "Stack'd export",
  "QIF file", "Stack'd backup"), file name, rows, date range, and what Auto
  decided (delimiter, date order, decimal, factor) with a *Change* link that
  `leaveTo`s back to `#import`.
- **Accounts**: name, currency, *New* / *Already in Stack'd*, rows to add,
  opening balance, balance after import.
- **Transfers**: "229 transfers paired"; unpaired transfer rows are listed as
  plain income/expense.
- **Categories** (owner, Q2): one row per file category with *existing* /
  *new*. When a 5-language synonym table (`import.catSynonyms`, e.g.
  ristoranti/restaurants/restaurantes → Dining Out, supermercato/spesa/
  groceries/courses → Groceries, stipendio/salary/salaire → Salary) matches a
  built-in category, the row shows it as the **suggested** target; tapping the
  row opens `Components.CategorySelectionModal` to pick another existing
  category or *Keep "<file name>"*. Picks live in the draft and travel to
  Import as a `{fileName → categoryId}` map that `ledgerToRows` applies.
- **Tags**: renamed tags listed when the fold (§6d) changes them
  ("Pranzo a Lavoro" → `pranzo-a-lavoro`).
- **Heads-up cards** (only when they apply):
  - **Existing account, earlier rows**: for an account already in Stack'd,
    rows dated before its opening date would land uncounted. The card shows
    count and net and offers *Move opening date to <earliest row>* (with the
    file's opening balance as an option), applied inside the Import batch
    with `Store.openingDateImpact` semantics — the log form's "move" choice
    (`views.js:2665`).
  - **Possible duplicates**: rows with the same account, day, type and amount
    as a Stack'd row but a different note (typically a bank-imported row).
    Toggle *Skip rows that look like ones already in Stack'd* (§12 Q8).
  - **Planned rows**: "86 rows are dated after today; they are imported as
    planned payments."
  - **Payment status**: status words that are neither paid nor unpaid in any
    language, with a count and a paid/unpaid choice.
  - **Problems**: unreadable rows grouped by localized reason (the engine's
    English reason tokens stay as keys; only the display maps them).
- **QIF without account names / single account**: an account field — pick an
  existing account or type a new name (unique via `Store.findAccountByName`);
  default the file name.
- **Import N transactions** `#btn-import-confirm` (disabled with a
  "Nothing new to import" line when N = 0; `.zero` plural) → commits the
  same route on the same text and overrides inside one `Store.batch` → clears
  the draft → `leaveTo('#settings')` → result sheet:
  - the existing `#import-result-modal` NoticeSheet, extended with an
    optional secondary action (backwards compatible) for *View transactions*
    when one account was involved;
  - when the imported accounts are in a currency other than the main one:
    *Switch main currency to EUR* (now `currencySwitchImpact` sees the new
    accounts, so `CurrencySwitchConfirm` pre-ticks correctly).
- **States**: busy (Check and Import), failure (storage full → the existing
  `others.importStorageFull`), and an `emptyState` guard for a deep link or
  reload with no draft (the `_ImportShared.emptyState` pattern).

## 5. Target experience — Export

### 5a. Export screen (`#export`)

Title + ✕ header (`data-router-leave` → `#settings`) with a share icon
(`#export-share`, same action as *Export file*, like MoneyStats) and the
subtitle "Copy the text or save the file". A *Copy text* link under the
preview copies the **whole** file (`navigator.clipboard.writeText`, already
used at `components.js:4357`).

1. **Info note** (`info` icon) — a card rather than MoneyStats' popup on
   every entry (no extra tap): "Export makes your data available to other
   apps (Excel, Numbers, Google Sheets, MoneyStats). It does not keep repeats,
   loans or budgets — to move Stack'd to another phone, use Backup." with a
   link to `#backup`.
2. **Preview** `#export-preview` — read-only monospace textarea, first 50
   lines of the exact file, rebuilt when a setting changes.
3. **Format** → `ListPicker`: *CSV (Excel)* (`.csv`, `text/csv`) or
   *Text (TXT)* (`.txt`, `text/plain`, always Tab — the delimiter setting is
   disabled for TXT). Email, Numbers and Drive are share-sheet targets, not
   formats (the Android Share plugin types the file by extension).
4. **Settings** → Export settings sheet:
   - column delimiter (`;` `,` Tab; CSV only)
   - date format (`dd/MM/yyyy`, `dd-MM-yyyy`, `dd.MM.yyyy`, `MM/dd/yyyy`,
     `yyyy-MM-dd`)
   - decimal separator (comma, dot)
   - *Quote every field* (on)
   - *Add BOM for Excel* (on; off gives a MoneyStats-identical byte stream)
   - defaults from the app language: it/fr/es/pt → `;` + `dd/MM/yyyy` +
     comma; en → `,` + `MM/dd/yyyy` + dot
   - **persisted** in a new `exportPrefs` slice (§7c), like MoneyStats.
5. **Period** → sheet with *Start* and *End* month fields opening
   `Components.MonthPicker`, an *All time* chip and an **Include planned
   payments** toggle (**on**). Default (owner, Q3): **every month with data,
   planned rows included** — MoneyStats behaviour. Stack'd materialises
   recurring and loan series up to 60 months ahead, so the Period sheet
   shows the resulting end month and the toggle lets the user drop planned
   rows in one tap.
6. **Export file** `#btn-export-file` (primary) → `exportLedger` →
   `_download` → native share sheet / web download. File name
   `Stackd_export_<YYYYMMDDHHmmss>.csv|txt`. On the web a "File exported"
   NoticeSheet follows; on a phone the share sheet is the feedback (§12 Q4).

### 5b. File layout — `StackdExport.buildLedger`

Pure builder `buildLedger(state, opts) → {text, lineCount, fileName}` (the
preview and the file share it; never adds a BOM) and
`exportLedger(state, opts)` delivering through
`_download(name, text, type, {bom})` (§7d).

**Columns** (O1 — MoneyStats order; headers in the app language, O2):

| # | it header | Value written by Stack'd |
|---|---|---|
| 1 | Conto | account name |
| 2 | Data | date, chosen format |
| 3 | Ammontare | signed amount (expense negative); `0` on balance rows |
| 4 | Valuta | account currency |
| 5 | Saldo | opening balance on balance rows, else `0` |
| 6 | Valuta | account currency |
| 7 | Titolo | category name; "Transfer" word on transfer legs; "Balance" word on balance rows; empty when uncategorized |
| 8 | Ricevente | empty |
| 9 | Uso | empty |
| 10 | Categoria | category name; "Transfer" word on transfer legs; empty on balance rows / uncategorized |
| 11 | Commento | note (`comment \|\| note`), one line |
| 12 | Hashtags | tags joined with ` \| ` |
| 13 | Ammontare | same as 3, except on a cross-currency transfer leg: the other leg's amount |
| 14 | Valuta | same as 4, except on a cross-currency transfer leg: the other leg's currency |
| 15 | Tasso di cambio | `1`, or other/own amount on a cross-currency leg (4 decimals) |
| 16 | Stato del pagamento | "paid" / "unpaid" word |
| 17 | Marchio | empty |

Header sets and the fixed words (*Balance*, *Transfer*, *paid*, *unpaid*)
are dictionary keys `ledger.col.*` / `ledger.word.*` created in **IE-2**
(§8). **it, en and pt headers equal MoneyStats exactly, and the paid/unpaid
words equal MoneyStats in all five Stack'd languages** (§2 tables), so a
Stack'd export in it/en/pt is the file MoneyStats writes; fr and es use the
MoneyStats headers seen so far and Stack'd's own translations for the rest
(to be aligned once the full fr/es header rows are known).
The *Balance* / *Transfer* words that Stack'd writes in Titolo/Categoria are
localized (`Saldo`, `Trasferimento` in Italian); the importer does not
depend on them (§6d). Category names are written as stored (never translate
stored data).

**Rows**:

- Ascending by date, then time, then creation order; balance rows first.
- **Balance rows**, one per account, dated at its opening date:
  - every account with an opening row — **including a 0 opening** — gets one
    when the period contains its opening date, **or** when the file holds
    rows of that account dated before its opening date (they must stay
    uncounted after re-import);
  - if the period starts after the account's opening date (or the account has
    no opening row but has counted rows before the period start), a
    synthetic balance row at the period start carries
    `getBalanceAtDate(dayBefore, [account])`, so a partial export re-imports
    with correct balances.
- **Transfers**: both legs, adjacent, income leg first; each in its own
  account's currency.
- Unpaid rows are written with the *unpaid* word; planned (future) rows only
  when *Include planned payments* is on.
- What the format cannot carry (a backup does): time, recurrence, ids,
  import keys, loan links, budgets, `amountEdited`.

**Formatting**: amounts with the currency's digits (≤ 2), the chosen decimal
separator, no grouping; `_toRow` gains a quote-all mode; `_formatDate` gains
the 5 patterns; CRLF for CSV, LF for TXT.

## 6. The import engine

### 6a. Entry points and modes

- `StackdImport.analyzeText(text, opts)` — pure: reads the text once (§6b),
  detects the kind, returns `{kind, records, delimiter, decided, …}`. Check
  uses it.
- `StackdImport.importText(text, opts, done, fail)` — the routing closure
  extracted from `importCSV` (`import.js:2129-2214`) with its `Store.batch`
  wrapper (`:2218-2239`). `opts.mode`:
  - `'restore'` (default; what `importCSV` passes): identical to today for
    every existing kind. A ledger or QIF file returns a **non-writing**
    `{kind:'ledger'|'qif', text}` handoff, like `'bank'` does today.
  - `'commit'` (only Review's *Import*): writes ledger/QIF rows.
- `importCSV(file, …)` stays `_readFileText` → `importText(text,
  {mode:'restore'})`; its object-based test signature and synchronous
  callbacks are kept (`fullRestore:34-41`, `csvEncoding:60-63`).
- The header-only check for ledger files runs next to
  `_stackdKindOfHeaderOnly`, **before** `parseCSV` (which throws "File is
  empty or missing headers" on a header-only file).

### 6b. The Auto reader (`_readTextAuto`, new; restore readers unchanged)

- **Rows**: CR-only and CRLF normalised to LF (or forced by the row
  setting), then the existing RFC 4180 `_splitRecords`; *ignore quotes*
  bypasses quote handling.
- **Delimiter**: score `;` `,` Tab `|` by the most consistent column count
  over the first 20 records. On `;`/`,` files it must agree with
  `_detectDelimiter` on every existing fixture (`csvQuotes103` inch marks,
  `bankImport` analyzer).
- **Dates** (ledger, QIF, bank handoff): one order per file from all rows
  (not a 50-row sample): a 4-digit first token → ymd; any first token > 12 →
  dmy; any second token > 12 → mdy; all-ambiguous → for Stack'd's own export
  the date pattern matching `exportPrefs` on this install, else the header
  language (English → month-first, otherwise day-first; QIF → day-first),
  always shown in Review with *Change*. Real days-in-month validation;
  2-digit years → 20xx. The restore reader `_normalizeDate` keeps its pinned
  per-row behaviour. **Correction after the owner samples:** the header
  language is no evidence of date order (MoneyStats' English export uses
  `dd/MM/yyyy`, and Stack'd's en headers equal MoneyStats'), so the
  all-ambiguous tie-break is: this install's `exportPrefs.dateFormat` if set,
  else day-first — always shown in Review with *Change*.
- **Amounts**: `parseBankAmount` leniency (currency letters, `(x)`, trailing
  minus) with one decimal convention per file, × amount factor, rounded once.

### 6c. Ledger detection (`isLedgerHeader`)

- Headers NFD-folded (accents stripped) before squashing — today
  "Catégorie" squashes to "catgorie".
- Raw header array by index (MoneyStats repeats *Ammontare*/*Valuta*;
  `parseCSV` keys would keep the wrong copy). The **first** occurrence wins;
  13/14 are read as the counterpart amount/currency.
- Alias table: Stack'd's own 5 `ledger.col.*` sets (all dictionaries) +
  MoneyStats' **verified it/en/de/pt sets** and the **seen fr/es headers**
  (§2 tables) + common fr/es words
  for account, date, amount, currency, balance, title, payee, purpose,
  category, comment, hashtags/tags, rate, payment status, brand/mark. The
  structural fallback covers MoneyStats languages not sampled: 17 columns
  with ISO currency codes at indexes 3, 5 and 13. Fixtures: one header row
  per sampled language (the owner's data itself is never committed).
- Match = account + date + amount, **no** `type` column (a `type` column
  stays a Stack'd backup), and either ≥ 2 of balance / title / category /
  hashtags / status, or exactly the plain shape `Account, Date, Amount,
  Category[, Note]`.
- Guards against bank CSVs (German `Konto`/`Saldo`): the account column must
  hold names, not IBAN/number-only values, in ≥ 80% of rows; and nothing is
  written without Review.

### 6d. Ledger → rows, and the `{ledger:true}` restore mode

`ledgerToRows` produces the row objects `buildTransactions` reads (squashed
keys); `buildTransactions(rows, {ledger:true})` adds ledger-only rules.

- **type** from the sign; `amount` = abs, 2 decimals, dot.
- **Balance rows** (amount 0 and Saldo ≠ 0, or amount 0 with a balance word)
  → `opening_balance` with the Saldo **including `0.00`**, dated at the row's
  date. `create({openingBalance:0, openingDate})` keeps the account's lower
  bound, so Stack'd's own pre-opening rows stay uncounted. A 0/0 row without
  a balance word is skipped as a zero-amount row.
- **Transfers** — the category is data (the owner's English/German/
  Portuguese exports still say "Trasferimento"), so candidates are found in
  two ways:
  - rows whose category/title is a known transfer word in any language
    (`ledger.word.transfer` × 5, + `Umbuchung`/`Übertrag`, `Transferência`,
    `Transferencia`, `Virement`, `Transfer`); and
  - a **learned transfer category**: a category value whose rows pair up
    structurally (rules below) ≥ 90% of the time over ≥ 4 pairs is treated
    as the file's transfer category. Review says "Treated 'Trasferimento'
    as transfers (229 pairs)" with a switch to import them as plain rows.
  - "Trasferimenti Margarida" (77 one-sided rows in the sample) must never
    qualify — pinned by a test.
  - Probe on the owner's file (2026-10-24): adjacency alone (either order)
    pairs all 229 "Trasferimento" pairs (458/458 rows = 100%); the only
    other category with any pair is the empty one (1 pair / 34 rows = 6%).

  Pairing rules:
  1. adjacent neighbours in **either order**, opposite signs, different
     accounts, same day, same paid state, same category value, and same
     cents — or, when the two legs' currencies differ (or columns 13/14 say
     so), no cents condition;
  2. the rest through a `date|cents` map with the same conditions;
  3. exactly 2 legs per ref; category blanked on paired legs. Unpaired ones
     stay income/expense in the file's own category.
- **Ledger dedup rules** (`{ledger:true}`):
  - a transfer pair is a duplicate only when **both** legs match store legs
    that share one `transferRef`; otherwise both legs are imported (leg-wise
    fingerprinting can silently lose a new same-day, same-amount transfer);
  - no orphan-leg claim: a leg matched to a plain store row (typically a
    bank-imported row) counts as a duplicate, and the other leg is still
    imported (listed in Review);
  - everything else (plain rows) keeps the multiset fingerprint.
- **Category** = Categoria, else Titolo (except balance words). When both are
  filled and differ, Titolo goes into the note ("Titolo — note").
- **Note** = Commento (+ Ricevente/Uso when filled), one line.
- **Tags** = hashtags split on `|`, then folded: NFD, strip combining marks,
  lowercase, runs of whitespace or `/` → `-`, drop anything outside
  `[a-z0-9-_]`, collapse `-`. (Spelled out here — the UI normaliser at
  `views.js:2351` deletes spaces and accented letters instead.) Commas inside
  a tag cell are part of the tag, not separators.
- **Paid** — the whole cell, case-insensitive and accent-folded, against
  MoneyStats' verified words in six languages: paid `pagato` / `paid` /
  `bezahlt` / `pago` / `pagado` / `payé`; unpaid `non pagato` / `not paid` /
  `nicht bezahlt` / `não pago` / `no pagado` / `impayé` (plus Stack'd's own
  `ledger.word.paid/unpaid`). Never by substring — every unpaid word
  contains a paid word ("non pagato" ⊃ "pagato", "impayé" ⊃ "payé"), so a
  `contains` test would read every unpaid row as paid; a unit test pins all
  twelve. Any other value → Review heads-up with a paid/unpaid choice (never
  silently paid).
- **Currency** from the first Valuta.
- **Order**: `BATCH_IMPORT_TRANSACTIONS {keepOrder:true}` stamps a monotonic
  `createdAt` so rows of one day keep the file's order (today every row gets
  the import's wall-clock time and a random tie order).

### 6e. QIF (`parseQIF`)

- `sniffFormat` returns `'qif'` when the first non-blank line starts with
  `!Type:`, `!Account` or `!Option`.
- Records: `D` date, `T`/`U` amount, `P` payee, `M` memo, `L` category
  (`Cat:Sub` → category *Cat*, *Sub* as a tag; `[Account]` → transfer),
  `N` number, `C` cleared, `^` end. `!Account` blocks give names and types;
  without one, Review asks for the account (§4c).
- Opening balance: the first record "Opening Balance" with `L[Self]`.
- Transfers: `L[Other]` records paired with the opposite record in the other
  account (§6d rules); an unmatched one stays income/expense.
- Splits (`S`/`$`/`E`): one row per split, sharing payee/memo.
  `!Type:Invst` → "not supported" reason.
- Currency: QIF has none → the main currency (shown in Review).

### 6f. Check = dry run

`buildTransactions` dispatches `ADD_ACCOUNT`/`ADD_CATEGORY` as it builds, and
a separate planner would have to mirror D11 ownership, orphan legs, the k-th
opening rule, exact-spelling placement and the take-back of accounts created
for dropped rows. Instead:

- New `Store.dryRun(fn)`: runs `fn` inside a batch, always aborts, restores
  every touched key, **without** emitting a render or announcing a save
  failure, and returns `fn`'s result. Check runs the commit path inside it
  and keeps `stats` + adapter facts (transfers, planned rows, date range,
  per-account balances).
- Cost: one rollback reloads the touched slices (≈1.2 MB parse for 6k rows) —
  acceptable once per Check; measured on a device in IE-6.
- Import re-runs the same path for real (counts can go stale through
  cross-tab sync) and reports the final stats.
- Parity test: Review counts = Import stats across a matrix (empty install;
  same-named existing account; same name, other currency; case-variant
  names; partial overlap; twin rows; re-import; half-present transfer).

### 6g. Bank-file handoff

- `analyzeBankCSV(text, {records, delimiter})` accepts pre-read records;
  `_ImportShared.start(text, fileName, state, {analysis, overrides})` uses
  them, seeds `mapping.dateFormat` / `mapping.decimal` from the overrides,
  and `buildBankTransactions` applies the amount factor.
- The "no accounts" guard moves from the Settings handler into this shared
  handoff, so both `#backup` and `#import` get it.
- With no `analysis` argument everything behaves as today (Bank Connect and
  the Backup restore path).

## 7. Store and data changes

### 7a. No change to stored transaction shape

Ledger and QIF imports produce ordinary income/expense/opening_balance rows
and transfer pairs. No new transaction fields.

### 7b. Small engine additions

- `BATCH_IMPORT_TRANSACTIONS {keepOrder}` (§6d).
- `buildTransactions(rows, {ledger})` (§6d).
- `Store.dryRun(fn)` (§6f).

### 7c. `exportPrefs` slice (new, persisted)

`{format:'csv'|'txt', delimiter, dateFormat, decimal, quoteAll, bom}` under
`stackd_v1_exportPrefs`; `SET_EXPORT_PREFS`. House rules: entry in
`_reloadSlice` (storageFull.test scans for it), cross-tab sync, reset by
`RESET_APP`, **not** in the CSV backup. The period is not persisted.

### 7d. `_download` BOM option

`_download(name, content, type, {bom = true} = {})` and the same option on
`_shareNative`. The default keeps the six backups byte-identical
(`exportNative.test.js:64`). The BOM setting is tested on the native
`Filesystem.writeFile` data and the web Blob, not through the
`(name, content)` capture stub.

## 8. i18n

New key groups (all 5 dictionaries, enforced by `i18n.test.js`):

- **IE-2:** `ledger.col.*` (17 headers) and `ledger.word.*` (balance,
  transfer, paid, unpaid) — file vocabulary, read by the importer and
  written by the exporter. `paid`/`unpaid` equal MoneyStats in all 5
  languages; `col.*` equal MoneyStats in it/en/pt and as far as seen in
  fr/es (§2). Once shipped,
  a value may only gain aliases, never change (old exports must keep
  importing); a unit test pins the five sets. Ledger tests load all 5
  dictionaries.
- `others.data*` — the Data card rows and subtitles.
- `ie.sheet.*` — Import/Export sheet.
- `backup.*` — Backup screen.
- `import.*` — Import screen, hint, sample, file line (`.one/.other`),
  "Pasted text", settings sheet labels/values, check errors.
- `review.*` — Review screen, heads-up cards, per-count sentences
  (`.zero/.one/.other`), localized skip reasons.
- `export.*` (beside the existing `export.shareTitle/failed*`) — Export
  screen, formats, settings, period, info note, "File exported".
- `MonthPicker`'s hard-coded English `MONTHS` and "Selected:"
  (`components.js:3213, 3299`) move to `I18n.monthNames('short')` and a key,
  since the Period sheet reuses it (small test added).
- The localized-header choice (O2) is an explicit exception to "CSV headers
  stay English": backups stay English; the ledger file is an interchange
  format read back in every language. Recorded in CLAUDE.md in IE-8.

## 9. Phases

Each phase lands green (lint with zero warnings, unit, e2e), bumps `?v=` for
every src file it edits (house rule), and is tagged `// 1.1.0 (IE-n)`.

| Phase | Content | Exit test |
|---|---|---|
| **IE-1 Engine prep** | `analyzeText`, `importText` with modes, `_readTextAuto` (Tab, `\|`, CR, ignore quotes, consistency score), file-level dates + validation + 2-digit years, lenient amounts + factor parser, `_download` BOM option. No UI. | every existing import/export test unchanged; new `importText.test.js`, `csvDetect.test.js` |
| **IE-2 Ledger import** | `ledger.col/word` keys (5 dicts), alias table, `isLedgerHeader` + IBAN guard, header-only branch, `ledgerToRows`, `{ledger:true}` dedup, transfers (either order, groups, cross-currency), balance rows incl. 0, tag fold, paid words, `keepOrder`, `Store.dryRun`; restore mode returns the non-writing handoff | `ledgerImport.test.js` on an **anonymised** MoneyStats-shaped fixture (never the owner's file): 7 accounts, minus-first pairs, a 6-row/3-account group, a cross-currency pair, openings incl. 0, planned rows, re-import = 0 new, a later file with one extra same-day transfer = exactly 2 rows, a half-present transfer, a bank-imported leg; parity matrix (§6f); negatives: German Konto/Saldo bank CSV, IBAN account column; `importCSV` on the fixture writes nothing |
| **IE-3 QIF import** | `sniffFormat` qif, `parseQIF`, splits, transfers, investment refusal | `qifImport.test.js` (Quicken + MoneyStats-style samples); `importCSV` on QIF writes nothing |
| **IE-4 Ledger export** | `buildLedger`/`exportLedger`, quote-all, date patterns, decimals, balance-row rules, synthetic rows, adjacency, cross-currency columns 13–15, `exportPrefs` slice | `ledgerExport.test.js`: Italian header = MoneyStats byte for byte (BOM off); **round trip** export → import on an empty install gives the same accounts, balances, transfers (incl. cross-currency), categories and UI-charset tags in all 5 languages × setting combinations; fixtures: 0-opening account with pre-opening rows, opening after the period end, partial export of an account without an opening row |
| **IE-5 Settings + Backup** | Data card, Import/Export sheet, `#backup`, ids kept, routes/views, icons in `EMERGENCY_ICONS`, `#bank-go-import` → `#import` | spec/test updates (§10) |
| **IE-6 Import screen + Review** | `#import`, settings sheet, `#import-review` (all §4c states), **bank handoff with analysis (§6g) — owner reminder 2026-10-24: after IE-1 a bank file sent to `#import-map` is still re-read by `analyzeBankCSV` with the old `;`/`,` reader; IE-6 must pass Check's records and overrides, verified by the Tab/CR-only e2e below**, result sheet secondary action + currency switch | new `import_export.spec.js` (paste → Check → Review → Import; file → Check; ledger picked on `#backup` → Review; TSV and CR-only bank files → `#import-map` with separate columns; camt on `#import`); escapeGuard VIEWS + seeded-draft steps; **device check**: file picker with QIF/TXT/CSV from Downloads and Drive, Check + Import timing on 6k rows |
| **IE-7 Export screen** | `#export`, preview, format, settings sheet, period sheet + planned toggle, web notice | e2e download content = expected Italian file; native share/BOM/type unit tests |
| **IE-8 Copy, docs, release** | manual/FAQ (5 languages, `supportProse` counts), Settings copy (`others.importDesc/exportDesc` retired), terms text pointing to Backup (§12 Q10), CLAUDE.md section, `docs/import-ux-plan.md` status, What's new, version 1.1.0 | full suite + device check (Android, iOS) in 5 languages, light/dark |

**IE-1 as built (2026-10-24, `?v=76` for import.js and export.js):**
`StackdImport.importText(text, {mode}, done, fail)` holds the routing and
the `Store.batch` wrapper; `importCSV` = `_readFileText` → `importText`
(`mode:'restore'`; `mode` is accepted but nothing branches on it until
IE-2). `analyzeText(text, opts)` returns `statement | backup (backupKind) |
bank | empty | unknown` with `{delimiter, records, rows, header, rowCount,
decided}` and never writes. Auto reader `_readTextAuto` (+ `_autoDelimiter`,
`_autoRecords`, `_autoFields`, `AUTO_DELIMITERS`): Tab/`|`, consistency
score over 20 records on the first 64 KB, CR-only rows, forced
delimiter/row delimiter, ignore quotes. Dates: `_guessDateOrder(values,
fallback)` → `{order, ambiguous, mixed}`, `_parseDateStrict(raw, order)`.
Amounts: `_guessDecimal`, `_parseFactor`, `_ledgerAmount`.
`StackdExport._download(name, content, type, {bom})`. Tests:
`csvDetect.test.js` (17), `importText.test.js` (13), `exportNative.test.js`
+2; full suite 153 files / 1,807 unit + 96 e2e green, lint clean. The
bank handoff (§6g) still re-reads with `analyzeBankCSV` — it gets the
analysis in IE-6 with the Import screen.

**IE-2 as built (2026-10-24/25, `?v=77` for db, store, import, views and
the 5 dictionaries):** ledger vocabulary (`LEDGER_ALIASES`, `LEDGER_WORDS`,
`ledger.col.*`/`ledger.word.*` pinned per language); `_ledgerShape`
(header / plain / MoneyStats structural layouts; a balance column counts
only in MoneyStats' pattern — `_balancePattern` — or as several accounts'
running balances; `_isAccountName` rejects IBANs incl. masked/suffixed and
masked card numbers; footer rows don't count as accounts);
`ledgerToRows` (openings decided by date: earliest balance row unless most
entries precede it; running balances open from the earliest row with a
balance, Saldo − amounts; blank-currency openings take the account's
currency; transfers: adjacency, then same-currency-first Kuhn matching per
day|amount|category, counterpart columns for cross-currency legs, learned
categories from final pairs, `transferCategories` opt-out kept in facts;
whole-cell paid words in 6 languages, unknown → unpaid + reported; tag fold
with `tagsDropped`); `buildTransactions(rows,{ledger:true})` (pair dedup in
two phases; lone legs only against provable legs — bank rows with an
importKey or BUG-14 leftovers by their localized note; plain rows plain
first, cross-kind only on a non-empty note; `openingsKept`; `placement`);
`checkText` = commit inside `Store.dryRun` (db `_dry` scope, state restored,
own render dropped, pending save failure kept) with `ledger.after`
per-account figures; `BATCH_IMPORT_TRANSACTIONS {keepOrder}`. Restore mode
routes exactly as before and only relabels the bank hand-off `ledger`
(Settings still opens `#import-map`). Three adversarial review rounds; the
owner's 6,051-row exports (it/en/de/pt) import with the hand-checked
balances, 229 transfers, Check == Import, re-import 0. Tests:
`ledgerImport.test.js` (82), `ledger_handoff.spec.js` (2); suite 1,889 unit
+ 98 e2e green. Known limit: renaming an account in Stack'd then
re-importing an old export duplicates that account's rows.

**IE-3 as built (2026-10-25, `import.js?v=78`):** `sniffFormat` → `'qif'`
on a leading `!Type:`/`!Account`/`!Option:`; `parseQIF(text, opts)` turns
records into ledger rows (`layout:'qif'`) imported by the same
`commitLedger` path (kind `'qif'`, `ledger.qif = {accounts, named,
defaultAccount}`): `!Account` blocks name accounts, a single-account file
takes its name from `opts.accountName` (Review) or its `POpening Balance` /
`L[X]` record, else 'QIF'; the first `L[Self]` record is the opening;
`L[Other]` legs are `Transfer` rows (paired by the ledger rules, the other
account kept in the note); splits (`S`/`E`/`$`) one row each; `Cat:Sub/Class`
→ category + tags; one date order (incl. `M/D'YY`) and decimal mark per
file; `!Type:Invst` records skipped as 'investment accounts are not
supported'. `analyzeText`/`checkText` handle `'qif'`; restore mode still
answers 'unrecognised file'. Tests: `qifImport.test.js` (8); suite 1,897
unit + 98 e2e green.

**IE-4 as built (2026-10-25, `?v=79` for store, export, import):**
`StackdExport.buildLedger(state, opts) → {text, lineCount, fileName, prefs}`
(no BOM) and `exportLedger` (through `_download` with `{bom}` and the
csv/txt type). 17 MoneyStats columns from `ledger.col.*`; balance rows
first (an account's opening when the period holds it or the file holds
entries dated before it; otherwise, for a later period start, the counted
balance the day before — `getBalanceAtDate`), then entries by date, time,
creation with a transfer's incoming leg first; cross-currency legs carry the
other leg in 13/14 and a 4-decimal rate; `includePlanned` (default true);
TXT = Tab + LF, CSV = CRLF; file name `Stackd_export_<YYYYMMDDHHmmss>`.
Store: `exportPrefs` slice (`SET_EXPORT_PREFS`, `getExportPrefs`,
`normalizeExportPrefs`, `exportDefaults` — it/fr/es/pt `;` dd/MM/yyyy
comma, en `,` MM/dd/yyyy dot; quoteAll and bom on), reload, cross-tab,
`RESET_APP`. The ledger importer falls back to the saved export date order
for all-ambiguous files. Tests: `ledgerExport.test.js` (37, incl. a
25-combination round trip over 5 languages × 5 date formats with varying
decimal/delimiter/format/quoting); the owner's 6,051-row file round-trips
identically in all 5 languages. Suite 1,934 unit + 98 e2e green.

IE-1…IE-4 change nothing a user can see (a ledger/QIF file picked on
Settings still writes nothing) and land on `main` one by one. **IE-5…IE-7
land as one merge from a feature branch** — IE-5 alone would expose rows
that lead nowhere, and `main` may still cut 1.0.x hotfixes.

## 10. Tests to update or add

**Navigation updates** (ids kept, Settings → `#backup`): `bank_import`,
`budget_backup`, `full_restore`, `import_matching`, `import_rules` (rules
button stays on Settings), `loan_restore`, `markup_safety`,
`statement_import`. Where a spec uploads a second file after the bank flow
lands on `#settings` (`bank_import:132`, `statement_import:131`,
`import_rules:103`, `import_matching:103`), it taps into `#backup` first.

**Assertion updates**:
- `pro_paywall.spec.js:158-173` (ship gate): import stays free → the Import
  and export row on Settings and `#btn-import-csv` on `#backup`.
- `bankConnect.test.js:313` (`#bank-go-import` href → `#import`) and
  `:316-324` (`btn-open-bank-connect` before `btn-open-import-export`; the
  "Bank data" heading assertion becomes the Data card heading).
- `bankConnectHidden.test.js:103-111` (ship gate): Settings has the Data card,
  no Bank Connect row.
- `noticeSheet.test.js:103-201`, `reviewFixesMisc.test.js:110-157`,
  `escapeGuard.test.js:450-461` (`ambacc` REACHED path): render `BackupView`
  instead of `OthersView`.
- `escapeGuard.test.js` `VIEWS`: add `BackupView`, `ImportView`,
  `ImportReviewView`, `ExportView`, with steps that seed a hostile ledger
  draft (the new views show file text that never passed a store write).
- `exportNative.test.js`: add BOM-off and `.txt` type cases; existing cases
  unchanged.

**Unchanged by design**: `localeFormatting`, `csvRoundTrip`, `restore*`,
`fullRestore`, `csvRecords`, `csvQuotes103`, `csvEncoding`, `bankImport`,
`statementImport`, `importMatching`, `importRules`, `importSuccess`.

**Fixtures**: synthetic and anonymised only. The owner's real export stays
out of the repo.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Ledger detector captures a real bank CSV (German `Konto`/`Saldo`) | strict signature + IBAN guard (§6c); restore mode never writes ledger rows; Review before every write |
| Review counts differ from what Import lands | Check is a dry run of the same code (§6f) + parity test |
| A new same-day transfer silently dropped as a "duplicate" | per-pair transfer dedup in `{ledger:true}` (§6d) |
| One leg already bank-imported → the other account never gets the money | no orphan-leg claim in ledger mode (§6d) |
| Rows before an existing account's opening date land uncounted | Review heads-up with *Move opening date* (§4c) |
| Overlap with bank-imported rows imported twice (notes differ) | *Possible duplicates* heads-up (§4c) |
| EUR accounts left out of totals on a USD install | currency switch offered on the result sheet, after the accounts exist |
| 6,000-row file freezes the phone | text out of `render()`; textarea shows 200 lines; busy states; dry-run cost measured on device |
| Round-trip drift (date order, tags, transfer words) | IE-4 round-trip matrix; `ledger.*` values frozen once shipped |
| QIF not pickable on Android | `accept="*/*"` on native + content sniffing; device check in IE-6 |
| CSV formula injection in Excel (BUG-124, deferred) | unchanged scope (§12 Q5) |

## 12. Decisions

Taken by the owner on 2026-10-24 (second round):

| # | Question | Decision |
|---|---|---|
| Q2 | Suggest Stack'd's built-in categories in Review? | **Yes, as suggestions** the user can change (§4c) |
| Q3 | Default export period | **Everything, planned rows included** (MoneyStats behaviour; toggle on, §5a) |
| Q7 | Supersede `docs/import-ux-plan.md` U1 (rename + FAB entry)? | **Yes, drop U1** — the Import screen is the single entry for every file; U3–U5 stay open there, re-pointed at the Data card |
| Q8 | *Skip rows that look like ones already in Stack'd* default | **On** when the matching Stack'd row came from a bank import (`importKey`), **off** otherwise |

Taken as recommended unless the owner objects:

| # | Question | Recommendation |
|---|---|---|
| Q1 | *Restore from a file* on Backup stays one-tap for Stack'd backups? | **Yes** — ledger/QIF files picked there still go through Review (§3b) |
| Q4 | Success notice after Export | **Web only**; on a phone the share sheet is the feedback (1.0.2 D-U7-2, `exportNative.test.js:71`) |
| Q5 | Guard text cells against Excel formula injection now? | **No**, keep BUG-124 deferred |
| Q6 | Version | **1.1.0** (code 10100); comments `// 1.1.0 (IE-n)` |
| Q10 | Terms text ("use the CSV export in Others & Settings", "CSV backups") | **Reword to point at Backup** in IE-8; bump `terms.updatedDate` only if legally needed (a bump re-shows the Bank Connect disclosure) |

Owner task:

| # | Task | Status |
|---|---|---|
| Q9 | MoneyStats samples in other languages | **Done 2026-10-24**: en, de, pt exports + it/de/en/es/fr/pt screenshots of an unpaid row; headers, paid and unpaid words in §2. Optional, not blocking: a screenshot of the full first line in fr and es to complete those header rows |
