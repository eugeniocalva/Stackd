# Account order on Home (HG-12)

Status: **P1 BUILT 2026-11-08; P2 in progress.** Build 10202 round
(1.2.2), comment tag `// 1.2.2 (HG-12)`.

## What the owner saw

Home's account tiles show a "DEFAULT" chip (and a thicker outline) on the
default account. The owner does not like it and asks which order the tiles
should follow instead: by name, by money, or the user's own.

## How it works today

- `DashboardView` sorts the tiles: the default account first, then by
  balance, highest first (`views.js`, `walletsHtml`). Balances of accounts
  in other currencies are compared as raw numbers (100 USD sorts like
  100 EUR).
- The default account (`state.defaultAccountId`, set by the "Default
  account" switch in Edit Account) is preselected in New Log, the import
  screens and the loan simulator. The chip and outline are its only marks
  on Home.
- Every other account list is alphabetical (`state.accounts` is kept
  sorted by name, `_sortData`): Settings → Manage accounts, the account
  pickers, the History / Analytics filters, the expanded graph's filter.
  The Account balances widget groups by type (`ACCOUNT_TYPES` order), then
  by name.
- Because the order on Home follows the balance, a tile moves whenever an
  expense or transfer changes which account holds more money.

## What other apps do (research, 2026-11-08)

| App | Order of accounts | "Default" shown on the account? |
|---|---|---|
| YNAB | Grouped by fixed type sections; **drag to reorder** inside a section (web sidebar; iOS "Reorder Accounts") | No |
| Copilot Money | Fixed type sections; manual reorder is a top feature request (also "sort by balance", "pin to top") | No |
| Revolut | Accounts and Pockets can be **marked as favourites, which moves them up**; drag-to-reorder tiles is a long-standing request | No |
| Monarch | Dashboard cards rearrange by drag; accounts follow type groups | No |
| Quicken / Simplifi | Alphabetical by default; manual sort and "by balance" are requested and partly added | No |
| ZeroSum (2026 changelog "your accounts, your order"), Outbank, Toshl, Relay | **Manual order** (drag, or within a group) | No |

Pattern: a list the user controls is the standard, usually manual order,
often within type groups. Sorting by balance is offered as an option at
most, never as the only order, because tiles that jump around break muscle
memory. The default account is a setting that preselects the account for
new transactions; no app marks it with a badge on the account.

Sources: YNAB help "Edit Account Details"; Copilot feature board "Re-order
Accounts" and help "Accounts tab overview"; Revolut community "Drag&drop
feature for ordering account tiles"; Monarch help "Customizing Your
Dashboard"; Quicken community "re-order accounts in the sidebar";
ZeroSum changelog v1.21; Lunch Money feedback "Order accounts by balance".

## Options

**Order**

- A. **Your order (manual).** Long press a tile to drag it, like the Home
  widgets (UX-5); also Move up / Move down in Settings → Manage accounts,
  like Settings → Tab bar (HG-7 P2). New accounts go to the end. Stable:
  nothing moves unless you move it. *Recommended.*
- B. A sort setting: Your order / Balance / Name / Type. More control,
  but one more setting, and "Balance" makes tiles jump.
- C. By balance only (today without the default-first rule).
- D. Alphabetical only (matches every other list today).

**The default account's mark**

- No mark on Home. The default stays where it matters: preselected in New
  Log, and shown in Edit Account and Manage accounts. *Recommended.*
- A small quiet mark (for example a filled star by the name) instead of
  the chip.

**Where the order applies**

- Home tiles only.
- Home tiles, Manage accounts and the account pickers / filters
  (one order everywhere; the balances widget keeps its type groups but
  orders accounts inside a group by your order). *Recommended with A.*

## Shape of the build (if A)

- `stackd_v1_accountOrder` = an array of account ids (a preference, like
  `navOrder`), `SET_ACCOUNT_ORDER`; `Store.orderedAccounts()` returns
  accounts in that order, unknown ids dropped, accounts missing from it
  appended by name. `state.accounts` stays alphabetical on disk (CSV, import
  matching and `_sortData` untouched).
- First run: the saved order starts as **today's Home order** (default
  first, then balance), so nothing moves on the update.
- `DELETE_ACCOUNT` prunes the id (`_pruneAccountRefs`); `RESET_APP` clears
  it. Backup: not in the CSV backup (house convention for preferences),
  unless decided otherwise.
- Home: long press on a tile → drag (DOM only until release, one
  dispatch), a light haptic, like the widget drag. A plain tap still opens
  the account; ⋯ still edits it.
- Manage accounts: Move up / Move down per row (focus kept, announced),
  plus a grip to drag, like the Tab bar settings.
- Remove `.wallet-card-default-badge` and `.wallet-card.is-default`.
- Tests: unit (order helper, prune, first-run seed, new account appended,
  badge gone); e2e (long-press drag on Home with real touch, Move up/down
  in Manage accounts, order kept after reload); WebKit renders.

## Phases

- P1: the order model + Home (tiles in your order, drag, no chip).
- P2: Manage accounts reorder + the order in pickers, filters and the
  balances widget (if "everywhere" is chosen).

## Decisions (owner, 2026-11-08)

| # | Question | Decision |
|---|---|---|
| D1 | Tile order | **Your order** (manual). |
| D2 | Default account's mark | **None** on Home (no chip, no outline). The default stays a setting: preselected in New Log, shown in Edit Account and Manage accounts. |
| D3 | Where to reorder | **Both**: long press + drag on a Home tile, and Move up / Move down (+ grip) in Settings → Manage accounts. |
| D4 | Where the order applies | **Everywhere**: Home tiles, Manage accounts, the account pickers, the History / Analytics filters, the graph filter; the balances widget keeps its type groups, ordered inside by your order. |
| D5 | Start order | **Alphabetical** (the Home tiles reshuffle once on the update). |
| D6 | New account | **At the end** (before the + Add tile). |
| D7 | Backup | **Not in the backup**: a phone preference, like the tab order. A restore starts alphabetical. |
| D8 | Hold time on Home | **0.45 s**, like selecting a row in History. |

Consequences for the build:

- No saved order = alphabetical (the store order), so D5 needs no seed.
  The first `ADD_ACCOUNT` after the update saves the current alphabetical
  order plus the new id, so D6 holds from then on.
- The first-run seed described under "Shape of the build" (today's Home
  order) is dropped.
- P1 = order model + Home (drag, no chip); P2 = Manage accounts reorder +
  the order in every picker, filter and the balances widget.

### P1 as built (2026-11-08)

- Store: `state.accountOrder` (`stackd_v1_accountOrder`, ids), loaded by
  `_loadAccountOrder`, cross-tab synced, in `_reloadSlice`, pruned by
  `_pruneAccountRefs` (so `DELETE_ACCOUNT` and the boot heal drop gone
  ids), cleared by `RESET_APP`. `SET_ACCOUNT_ORDER` saves
  `normalizeAccountOrder(ids)`. `Store.orderedAccounts(list?, order?)`:
  known ids in the saved order, the rest in store order (alphabetical);
  `[]` = alphabetical. `ADD_ACCOUNT` appends the new id, writing the
  order as it shows first when none is saved (D6). `state.accounts` stays
  alphabetical.
- Home: tiles from `orderedAccounts()`; no DEFAULT chip, no
  `.is-default` outline (`dash.defaultBadge` removed in all five
  languages). `DashboardView._wireTileDrag`: 450 ms hold (a move past
  8 px first = a scroll), then the tile follows the finger, swaps when its
  centre crosses a neighbour's (FLIP slide, haptic tick on native), the row
  scrolls itself within 48 px of an edge, one `SET_ACCOUNT_ORDER` on
  release, the ending click swallowed. Positions in offset coordinates
  (the row is `position: relative`). The row keeps its sideways scroll
  across re-renders (`_tileScrollX`, reset on entry and in `destroy()`).
  A non-passive touchmove cancels the browser gesture once lifted.
- Tests: `accountOrder.test.js` (model, D5/D6, prune, reset, reload,
  `_reloadSlice`, Home markup); `home_account_order.spec.js` (CDP touch:
  hold + drag saves and survives a reload, the edge scroll carries a tile
  to the end, a tap opens the account, a quick swipe scrolls and moves
  nothing). Lint, 2,396 unit, 179 e2e; WebKit renders light + dark.
