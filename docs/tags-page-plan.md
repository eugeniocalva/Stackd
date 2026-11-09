# Tags page — add, edit, confirm (1.2.2 HG-14)

Settings → Tags (`#tags`, `Views.TagsView`) today lists every tag with its
count and linked categories; a tap opens History filtered by the tag, and only
an unused tag can be removed. The owner wants it to work like MoneyStats'
Hashtags screen: a primary **+** to add a tag, a tap that **edits** the tag
(name + categories) instead of leaving the page, and a **confirmation** before
a rename or a category change lands.

## Industry patterns (2026-11-09)

- Finance apps keep tags under Settings → Tags with Edit and Delete per tag
  (Monarch, Lunch Money). Rename rewrites the tag everywhere; delete removes
  it from transactions, never the transactions.
- Renaming onto an existing name is a merge (Outbank, Ghost, Bear) — the
  confirmation names the target and how many rows join it.
- A change that rewrites many rows gets a summary confirmation naming the
  count (Apple HIG: confirm consequential changes, say what will happen).
- MoneyStats: one category per tag ("Ogni tag è subordinato a una categoria").
  Stack'd keeps **several** (owner's answer): tag links are explicit ∪
  derived from saved rows (`Store.getTagLinks`).

## Decisions (owner, 2026-11-09)

| # | Question | Answer |
|---|---|---|
| D1 | Categories per tag | Several |
| D2 | A removed category still has rows with the tag | Ask per category: **keep the rows and lose the tag** · **keep the rows and the tag** (the category stays linked) · **move the rows** to one of the tag's other categories (transfers and opening balances skipped) |
| D3 | Rename onto an existing tag | Offer to merge |
| D4 | Delete a used tag | Removes it from its transactions (they stay) |
| D5 | Category control | Chips (icon + name, ✕) + "Add category" |
| D6 | Move target with several categories | Picked in the confirm sheet, newest added preselected; no Move when no category is left |
| D7 | Confirmation | One summary sheet for all changes |
| D8 | Reaching History | "See N transactions ›" link in the sheet |

## Design

- **Page.** Header: title, primary **+** (`#tags-add`, same 44 px filled
  circle as the ✕), ✕. A row tap (or Enter/Space) opens the edit sheet.
- **`Components.TagEditSheet.show({tag})`** (`tag` null = new). One sheet,
  three steps, PeriodSheet's pattern (own `#tag-edit-sheet` wrapper):
  1. *form* — Name (`#tag-name`, normalized through `Store.normalizeTag`),
     categories as chips + "Add category", "See N transactions ›" (edit
     only), Delete (edit only) / Save / Cancel. Save is enabled only when
     something changed; an empty name or a new tag on an existing name is a
     field error.
  2. *cats* — the category list (‹ back, tap adds).
  3. *confirm* — the summary: rename on N rows (or merge into #x with N
     rows), categories added, and per removed category with rows the three
     choices (D2) with a "Move to" select. Confirm / ‹ Back.
  Delete has its own confirm step ("Remove #x from N transactions?").
- **Store.** `EDIT_TAG {tag, name, categoryIds, removed: {catId: {mode:
  'untag'|'keep'|'move', to}}}` — one dispatch: rows first (untag / move /
  rename with dedupe), then `tagLinks` (old key dropped, merged into the
  target, explicit set = the sheet's categories), then the History/Analytics
  tag filters follow the rename. `DELETE_TAG {fromTransactions: true}`
  strips the tag from every row and the filters too.
