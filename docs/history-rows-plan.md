# History rows — selection, swipe, colours, density (HG-11)

Status: **BUILT 2026-11-08 — P1 and P2 on main (see "as built").** Device
check on the phone still to do.
Build 10202 round (1.2.2), comment tag `// 1.2.2 (HG-11)`.

## What the owner saw (phone, 2026-11-08)

1. A Select button in History's title row: not wanted.
2. Long press slides the row right and adds a checkbox before the icon:
   wanted instead is the mail-app gesture, the icon turning into a check.
3. A fast scroll shows the ✓ / pencil / bin buttons with no card over them.
4. The swipe that reveals those buttons is glitchy.
5. Too much red: spending is most rows. Wanted: spending neutral, transfers
   a calm blue, income green.
6. Every card repeats the date its day header already shows; the cards and
   the gaps between days are too tall.

## Causes found in the code

- (3) Each row keeps its action buttons permanently behind the card. On a
  fast scroll WebKit paints the small buttons before the card's layer, so
  they show alone for a frame or more.
- (4) A non-passive `touchmove` on every row (each scroll frame waits for
  JavaScript), the `.list-item:active` scale(0.99) fighting the drag's
  translate, and a long-press timer wired separately from the swipe.
- (2) Selection mode renders another row structure (no swipe box, an extra
  checkbox column), and a selected row gets an inline 2 px border: the row
  grows 2 px and everything shifts.

## Decisions (owner, 2026-11-08)

| # | Question | Decision |
|---|---|---|
| D1 | Select button | **Removed completely**; a long press is the only way in. The selection bar (Cancel · n Selected · Select All · Delete) stays as is. |
| D2 | The check | **Black circle, white check** (white circle, dark check in dark theme) — the app's primary colour. |
| D3 | Selected card | **Today's look** (grey fill, thick black outline), drawn so the row does not change height. |
| D4 | Animation | **Flat flip**, ~0.3 s: the icon narrows to a line and opens as the check; reverses on unselect. None under reduced motion. Unselected rows keep their icon in selection mode. |
| D5 | Colour scope | **Every transaction list**: History, Home Latest and Upcoming widgets. Sums (net, budgets…) keep red/green. |
| D6 | Day sum line | **Neutral grey** on a spending day, green on a positive day. |
| D7 | Transfer blue | **Everywhere**, including the New transaction amount when Transfer is picked. |
| D8 | Card density | **Compact, two lines**, ~60 px (was ~76): category + amount, then account + tags (+ paperclip). No date. |
| D9 | Gap between days | **~20 px** (was ~48). |
| D10 | Open row + scroll | **Closes on scroll** (and on a tap anywhere), like iOS Mail. |
| D11 | Long press | **0.45 s** (was 0.5). |
| D12 | Haptic | **A light tap** on native (`Components.Haptics.light()`), `navigator.vibrate` on the web where it exists. |

Colours: spending `--text-primary` (light near-black / dark near-white);
transfers `#2f62a8` light (6.1:1 on white), `#8ab4f0` dark (7.8:1 on the
dark surface); income unchanged.

## Phases

**P1 — gestures and selection** (D1–D4, D10–D12)
- One gesture controller on the list (`TransactionsView._wireRows`):
  pointer events, rows `touch-action: pan-y` (the browser owns vertical
  scroll), sideways drag with rubber band and flick, one open row, a tap on
  an open row only closes it, the open row closes when the list scrolls.
- Action buttons hidden until a row opens (`.is-open`); no `will-change`
  layer per row at rest; no `:active` scale on swipe rows.
- Long press 0.45 s → selection mode + that row; the click that ends the
  press is swallowed (keyboard clicks never are).
- Same row structure in and out of selection mode; the icon box has two
  faces (icon / check). The view diffs the selection between renders so
  only the row that changed flips (`_selRendered`, reset in `destroy()`).
- `aria-pressed` on rows while selecting. Select button and its keys removed.
- Tests: unit (row markup in both modes, flip classes, no Select button);
  e2e long press / tap to toggle / swipe open-close / scroll closes /
  fast scroll shows no action buttons (`history_rows.spec.js`); update
  `history_scroll`, `i18n_core`, `bulkSelectionMode`.

**P2 — colours and density** (D5–D9)
- `.tx-amt-expense` on rows (History, Latest, Upcoming); `.text-transfer`
  blue (also the form's transfer amount); day sum grey/green.
- `hideDate` on History rows; compact card, 8 px between cards, ~20 px
  between days, tighter day header.
- Tests: unit (classes, no date in History rows, date kept elsewhere);
  WebKit renders light + dark at 390 px; `page_titles` still on its line.

Each phase: lint, the whole unit suite, the e2e suite, `?v=` bumps.

### P1 as built (2026-11-08)

- `TransactionsView._wireRows` (views.js) replaces the per-row touch
  handlers and the separate long-press timer. Pointer events on
  `#history-list`; rows `touch-action: pan-y`; an 8 px slop decides the
  axis; rubber band past -130 / +90; a flick (0.35 px/ms) or half-way
  decides the snap (-110 Edit + Delete, +70 Paid; no Paid on an opening
  balance).
- **Found while testing:** Chromium (so the Android WebView) runs a
  sideways drag as a scroll gesture that goes nowhere and then **eats the
  next tap** — the first tap on Edit / Delete after a swipe did nothing.
  One non-passive `touchmove` on the list cancels the browser gesture only
  once the drag is sideways (a vertical drag is never cancelled).
  `history_rows.spec.js` checks that Delete answers the first tap.
- The list's scroll and a pointerdown outside the rows close an open row
  (listeners on `#router-view`, swapped per render, removed in `destroy()`).
- Long press 450 ms → `TOGGLE_SELECTION_MODE` + the row; the click that
  ends the press is swallowed (`_swallowClick`, reset on the next
  pointerdown; a keyboard click, `detail === 0`, never is). Haptic:
  native `Haptics.light()`, else `navigator.vibrate(30)`.
- `TransactionItem` with `allowSwipeReveal` keeps its swipe structure in
  selection mode and draws the icon as `.tx-icon-flip` with two faces;
  `flip: 'in' | 'out'` animates (scaleX 1→0→1, faces swap at 50 %, the
  check pops). `aria-pressed` while selecting. Plain lists (category
  detail) keep the single icon. The selected look is unchanged, drawn as
  border + inset ring (no 2 px growth).
- Removed: `#btn-start-selection-mode`, its handler, `history.select` /
  `history.selectAria` (5 languages).
- Checked: lint, 2,386 unit, 173 e2e (the known load-sensitive
  `storage_full` case passed on its own re-run); WebKit renders light +
  dark at 390 px (rest, mid-flip, selected, open row).

### P2 as built (2026-11-08)

- Tokens (variables.css, both themes): `--color-tx-expense`
  (= `--text-primary`) and `--color-transfer-val` (`#2f62a8` light,
  `#8ab4f0` dark). `.tx-amt-expense` colours spending rows in
  `TransactionItem` (also a negative opening balance), the Latest widget
  and the Upcoming widget (loan rows too); `.text-expense` is untouched, so
  the form's expense amount, nets and budgets keep their red.
  `.text-transfer` is the blue everywhere it is used: list rows, Latest,
  Upcoming and the New transaction amount on Transfer.
- History's day sum: green when positive, `--text-secondary` otherwise.
- `TransactionItem` option `hideDate` (History passes it); the category
  detail list and the widgets keep their dates. The subtitle cell is left
  out when it has neither a date nor a paperclip.
- Compact list, scoped to `.history-list`: card min-height 60 px with
  10 px padding (was 72 / 12), 2 px between the two lines (was 4), 8 px
  between cards (was 12), 20 px after a day (was 48), the day header
  8 px padding and no margins (was 12 px padding + 16 px margins).
- Checked: lint, 2,388 unit, 173 e2e (page titles still on their line);
  WebKit renders light + dark at 390 px (History top and scrolled, the
  form's transfer amount).

### Phone check fix (2026-11-08)

- In iPhone Safari the selection bar sat under the status bar once you
  had selected a row down the list, and it came back only after scrolling
  to the top. Cause: `body { min-height: 100vh }`. In Safari `100vh` is
  the height with the toolbar hidden, so with the toolbar shown the page
  itself could scroll a few dozen px on top of the view's own scroller,
  and that slid every sticky bar up until the list's scroll chained back
  to the top. Body is now `min-height: 100dvh` (the native WebView has no
  toolbar, so it never had the gap). `history_rows.spec.js` checks that
  the bar stays in full view at the top of a scrolled list while
  scrolling both ways, and that the page itself never scrolls.
