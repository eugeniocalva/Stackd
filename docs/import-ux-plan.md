# Bank Import UX Plan — making the feature findable, guided, and habitual

> Status: **DRAFT — not started.** This is the cold-start reference for the
> import UX work. The underlying LOGIC is complete (v0.99–v1.03, see
> `docs/bank-import-plan.md` §3f–§7a — read that first); this plan is about
> how a user DISCOVERS, TRUSTS, and RETURNS to it. Written 2026-09-04 for
> review; open decisions in §9 should be settled before phase U1 starts.

## 1. The gap, honestly stated

The import engine ships with real screens (`#import-map`, `#import-preview`,
the rules sheet), but the journey around them is an afterthought:

- **Buried entry point.** The only way in is FAB → Others & Settings → scroll
  to Data Import → a button still labeled "Import CSV" (`others.importCsv`) —
  three taps deep, under a label that undersells camt/MT940 support. Nothing
  on Home, History, the FAB menu, the welcome flow, or any empty state ever
  mentions the feature exists.
- **Dead-end ending.** Confirm fires a native `alert()` (six `alert()` calls
  live in the import flow) and dumps the user back on Settings. There is no
  "view what I just imported", and the reconciliation result — the single
  biggest trust signal the feature produces — is a line of alert text.
- **No provenance.** In History, a bank-imported row (`tx.importKey`) looks
  identical to a manual one. Users can't tell what came from where, and the
  edit view says nothing about a row's bank origin.
- **No habit loop.** Statements are a monthly ritual; the app never reminds,
  never shows when the last import happened, never shortcuts the repeat run.
- **No guidance.** Nothing explains WHERE in a bank portal to find a
  CSV/camt.053/MT940 export — the one question every first-time user has.

## 2. Phase U1 — Naming + entry points (discoverability)

- **Rename the flow.** `others.importCsv` → "Import bank statement" (all 5
  dictionaries; the button doubles as the busy-state label in the change
  handler — both usages). Keep ONE file input + shape routing (backups and
  loans exports are still recognized automatically — the updated
  `others.importDesc` already says so).
- **FAB action menu entry.** `Components.BottomNav` menu (components.js ~44–63)
  currently holds a 2×2 grid + a full-width Settings row. Add an "Import
  statement" item — cleanest layout: the bottom row becomes two half-width
  tiles (Import | Others & Settings). Target: navigate `#settings` and
  auto-open the file picker (see D2 in §9) or plainly deep-link to the Data
  Import card with a scroll anchor.
- **Empty states.** History's and Home's zero-transaction states gain a second
  CTA next to "Add transaction": "…or import a bank statement". (Locate the
  existing empty-state markup in TransactionsView/DashboardView; keep it one
  line + link.)
- **Welcome flow hint.** `_showRegionSetupModal` (main.js) gets one closing
  line under the language/currency pickers: "You can import your bank's
  statements later from Others & Settings." No new step, just orientation.
- i18n: ~4 new keys + 1 renamed ×5.

## 3. Phase U2 — The ending: success screen instead of alert()

- Replace the Confirm `alert()` chain with a **success modal**
  (`Components.Modal.show` family — house has no toasts): count imported /
  linked / paired as list rows with icons, and the **reconciliation verdict
  as a visual state**: green check "Balances match your bank ({amount} on
  {date})" vs amber "Stack'd shows {app}, your bank reported {bank}" — the
  same data the alert buries today, promoted to the moment's centerpiece.
- Modal buttons: **"View transactions"** (primary → `#transactions?account=<id>`
  — the wallet-tile deep-link filter already exists) and "Done" (→ Settings).
- Same treatment for the map/preview validation alerts (`mappingIncomplete`,
  `nothingSelected`) → inline error text under the offending control instead
  of alert (small; the pattern exists in EditAccountView's name flash).
- The `bankImport.done*` / `reconcileMismatch` keys get reused; a handful of
  new keys for the modal chrome ×5.
- E2E updates: bank_import / statement_import / import_matching specs assert
  the modal instead of dialogs (drop the dialog-accept handlers for confirm).

## 4. Phase U3 — Provenance in History

- **Imported badge:** rows with `tx.importKey` get a subtle marker in
  `Components.TransactionItem` (a 12px `landmark` or `download` glyph beside
  the account name — both icons exist in EMERGENCY_ICONS; verify before use).
  One-line change since both History and Category-detail render through
  TransactionItem; mirror in the `latest` widget's hand-rolled rows.
- **Edit view provenance:** AddTransactionView in edit mode shows a read-only
  line when the tx carries `importKey`: "Imported from a bank statement" (+
  `bankRef` when present). Deleting/editing stays allowed — the line is
  informational.
- Optional (decide in review): a "source" filter chip in History (all /
  imported / manual). Lean NO for v1 — the badge may be enough.

## 5. Phase U4 — The habit loop

- **Smart Insight nudge** (house pattern: a rule in `insights.js`, renders on
  Home): when the account with the newest `importKey` transaction has seen no
  import for > 35 days → "Your last bank import was {days} days ago — import
  your latest statement." Tap → the U1 entry point. Rules in insights.js are
  getter-based and already localized ×5; one new rule + keys.
- **"Last import" line on the Data Import card:** newest importKey tx date +
  its account name, so the Settings card itself shows state instead of being
  a stateless button.
- Deliberately NOT a widget: the widget registry is user-curated space and an
  import nudge there would nag; the insight slot is the house channel for
  exactly this kind of prompting (it self-dismisses when stale).

## 6. Phase U5 — Guidance: "where do I get my statement?"

- An info affordance (small `info` icon link) on the Data Import card AND the
  statement-details/mapping screens opening a **help sheet** (Modal family):
  three short sections — CSV, camt.053 (ISO 20022), MT940 — each saying what
  it is and the generic path in banking portals ("look for Export / Download
  / Statements — formats are usually offered where you view transactions").
  Generic on purpose: never name banks (Terms §thirdParties).
- **FAQ entry** (`faq.*` has 7 ids; add `import`): "How do I import my bank
  statements?" — the FaqModal ID-array + getter pattern makes this a 2-line
  code change + 2 keys ×5.
- The Manual's import entry was already rewritten in v1.00/v1.01 — verify it
  still matches after U1's renaming.

## 7. Cross-cutting house rules (per CLAUDE.md — enforced, not optional)

- Every new string in all FIVE dictionaries (i18n test fails otherwise);
  whole-sentence plural keys; no `t()` at file-load time (FAQ/help-sheet
  content behind getters).
- New icons must exist in `EMERGENCY_ICONS` (main.js) — verify with grep, or
  add entries from the lucide 0.400.0 snapshot only.
- Modals mount in `#modal-container` → call `StackdHydrateIcons` on their own
  root. Emits coalesce — never dispatch then read the fresh DOM in-tick.
- Bump `?v=` for every touched src file; bump the `<title>` per phase
  (suggested: U1+U2 ship together as **v1.04**, U3 as v1.05, U4+U5 as v1.06 —
  small releases, each independently shippable).
- Tests: unit via the `executeFile` pattern where logic is testable (insight
  rule, provenance line); e2e updates for every changed flow (the three
  import specs assert alerts today and WILL break in U2 — budget for it).

## 8. File touchpoints (for scoping, not exhaustive)

| Phase | Files |
|---|---|
| U1 | components.js (FAB menu), views.js (Others card, empty states), main.js (welcome hint), i18n ×5 |
| U2 | views.js (confirm + validation flows), components.js (success modal if extracted), i18n ×5, all 3 import e2e specs |
| U3 | components.js (TransactionItem), widgets.js (latest rows), views.js (edit view), i18n ×5 |
| U4 | insights.js (new rule), views.js (Data Import card), i18n ×5 |
| U5 | components.js (FaqModal ids + help sheet), views.js (info links), i18n ×5 |

## 9. Open decisions — answer during review

1. **D1 — FAB menu layout:** split the Settings row into Import | Settings
   (recommended), or grow the grid to 6 tiles?
2. **D2 — FAB import target:** deep-link to Settings' Data Import card, or
   auto-open the file picker on arrival? (Auto-open needs a one-shot flag —
   e.g. a `?import=1` param the OthersView consumes — browsers allow
   programmatic `.click()` on a file input only within a user gesture, so
   this needs a same-gesture trick or graceful fallback. Recommended:
   deep-link + scroll + brief highlight, no auto-open.)
3. **D3 — Post-import landing:** success modal over Settings (recommended,
   smallest change), or a dedicated `#import-done` view?
4. **D4 — History source filter chip:** in or out for v1? (Recommended: out;
   badge only.)
5. **D5 — Button rename wording:** "Import bank statement" vs "Import
   statement" vs "Import from file". (Recommended: "Import bank statement" —
   it is the feature's name everywhere else now.)
6. **D6 — Nudge threshold:** 35 days? And should it appear at all when the
   user has never imported? (Recommended: never-imported users get the U1
   empty-state CTA instead; the insight only fires for returning importers.)
