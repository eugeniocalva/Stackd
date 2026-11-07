# Category rings: an Others cap and tap-to-focus — plan (1.2.2, HG-8)

Status: **P1 BUILT 2026-11-07 (§11): the palette everywhere, the Others fold and
tap-to-focus on the Goals ring. P2 (Analytics) and P3 (Home, Insights) to do.** Comment tag:
`// 1.2.2 (HG-8)`. Research: a workflow of four code readers, three
independent designs (minimal, coherent, accessibility-first) and a judge
(2026-11-06). This plan is the judge's winner with the best ideas of the
other two grafted in.

## 1. The two asks

1. **Colours.** "How many categories can have a unique colour — 10, 15? After
   some number, the rest should go into Others, as Analytics did."
2. **Tap a slice.** As in the MoneyStats screenshots:
   - the tapped arc gets thicker and the others thinner;
   - the centre switches to the category and its amount;
   - a badge with the category icon appears on the arc, then turns into its
     percentage.

## 2. What the code does today

- **The Goals ring** is a Chart.js 4.4.2 doughnut (`BudgetView._budgetChart`,
  `src/views.js` ~4434). It has one arc per budgeted category with spending,
  in list order (budgeted first, then alphabetical, not by size), then the
  remaining budget as a grey track. An overspent month is one full red
  circle. Nothing reacts to a tap, except Chart.js's default 6 px hover pop,
  which sticks.
- **How many colours exist.**
  - `_CATEGORY_COLORS` has 12 entries but only 11 distinct colours: Salary
    and Groceries are both `#10b981`.
  - `_FALLBACK_PALETTE` adds one new colour (rose).
  - So the app can give **at most 12 distinct colours**.
  - Categories you create store no colour, so they draw from the 10
    fallback colours only. **The 11th repeats.** With 6 extra categories,
    Utilities already turns the same blue as Rent.
- **Colours move around.** They are handed out by list position over *every*
  category of the tab, budgeted or not. So a category's colour changes:
  - when you add a budget;
  - between the Expenses and Income tabs;
  - with the app language (the alphabetical order changes);
  - between Goals and Analytics.
- **Contrast.** Six of today's colours are below the 3:1 that WCAG 1.4.11
  asks of chart parts on the white card: gold 1.92, mint 2.12, amber 2.15,
  cyan 2.43, emerald 2.54, and the Others grey 2.56.
- **How many can be told apart.** About 7 hues reliably with full colour
  vision, and about 4 for colour-blind viewers. That is why colour can never
  be the only key.
- **Others today.** Analytics still folds into **top 5 + Others**
  (`CategoryDonutChart._capData`). The Home categories widget follows it.
  Goals never folded. Version 1.2.0 drew icon badges on the Goals arcs;
  HG-5 removed them.

**Answer to "10, 15?":** neither. The honest cap is **6 slices on one ring**.

## 3. The Others rule (one function for every ring)

`CategoryRing.fold(items)` in `src/components.js`:

- **Rank** by spend, biggest first. Ties go by a fixed palette priority, then
  by id. Never alphabetical, so the order doesn't change with the language.
- **Up to N categories:** each gets its own slice.
- **More than N:** the N − 1 biggest by name, plus **Others** holding the
  rest. Others always holds at least 2 categories, so there is never a
  one-member Others. Today Analytics does make one, with exactly 6.
- **Others** is slate `#64748b`, with the `more-horizontal` icon and the
  label "Others (3)". Its accessible name lists the members.
- **Drawing order**, clockwise from 12 o'clock: named slices by size, then
  Others, then (Goals only) the remaining-budget track.
- **Rows are never removed.** Grouping only changes the ring and the icon
  colours.

N = 6 is recommended (decision 1).

## 4. Colours: one stable palette

`Components.CategoryPalette` has **8 slots**, one hex for both themes, and
replaces `_CATEGORY_COLORS` and `_FALLBACK_PALETTE`:

| Slot | Colour | Default categories |
|---|---|---|
| s0 | `#3b82f6` blue | Rent, Loan Payment, Freelance |
| s1 | `#059669` green | Groceries, Salary |
| s2 | `#8b5cf6` violet | Entertainment, Investments |
| s3 | `#ea580c` orange | Dining Out |
| s4 | `#0891b2` teal | Transport, Adjustment |
| s5 | `#db2777` pink | Shopping |
| s6 | `#a16207` gold | Utilities, Other |
| s7 | `#c026d3` fuchsia | Health |

- **Contrast.** Every slot is ≥ 3:1 on the white card, the dark card and
  both icon discs (lowest 3.16). A white icon on any slot is ≥ 3.56:1.
- **Red is kept for "over budget"** (the rows and the overspent centre), so
  Health moves from red to fuchsia.
- **Your own categories** get a slot from a hash of their id. Ids are stable
  and survive a restore.
- **Stability.** On one ring, a slot already taken passes to the next free
  one, so no two slices ever share a colour. The same set of categories
  always gets the same colours, whatever the month, tab, amounts or
  language.
- **Nothing is stored.** No data-model or CSV change.

## 5. Tap-to-focus (Goals first)

**Engine.**
- Chart.js stays, and `RingChart.config` stays plugin-free.
- Goals passes a small plugin that only changes each arc's inner and outer
  radius while drawing, then restores them.
- The 180 px box and today's resting ring size (outer 82, inner 54) stay
  identical. The 6 px Chart.js reserved for its hover pop becomes room for
  the thick slice.

**Behaviour.**
1. **At rest:** "ALLOCATED €755.84", no labels on the slices, no hover pop.
2. **Tap a slice:**
   - it grows to about 38 px thick and the others thin to about 22 px
     (240 ms, the entry sweep's easing);
   - the centre crossfades to the category name, its amount and
     "of €667.84 spent";
   - a 28 px disc in the slice colour, with the white category icon,
     pops onto the arc;
   - at 0.9 s it morphs into a pill showing the percentage, e.g. "92.5%";
   - native builds tick a light haptic.
3. **Tap another slice:** the thickness moves straight across and the badge
   swaps.
4. **Tap the same slice, the centre, the track or outside the ring, or
   press Escape:** everything settles back (200 ms).
5. **Re-renders** keep the selection, already in its final state with no
   replay:
   - any store change, the limit editor opening or closing, a month change
     when that category is still a slice.

   The Expenses/Income switch and leaving Goals clear it. Nothing is
   dispatched; the state lives on the view.
6. **Tapping Others** shows "Others (3)", its total and its percentage.
   The member names reach screen readers.

**Overspent month (decided, see §8).**
- Today the ring is one solid red circle, so there would be nothing to tap.
- Instead it shows the category slices over total spent, without a track.
- The centre keeps the red "OVERSPENT" and the amount over, so the alarm
  stays in words and colour.

## 6. WCAG 2.2 AA

| Criterion | How it is met |
|---|---|
| 2.1.1 Keyboard, 4.1.2 Name/role/value | One real `<button aria-pressed>` per slice in a labelled group, in clockwise order. Its name is "Groceries: €617.84, 92.5% of spent". Enter or Space toggles a slice; Escape clears. |
| 2.5.8 Target size | A tap on a drawn slice is always that slice. A slice under 24° also gets a halo over the remaining-budget track beside it, so its target reaches 24° (a 24 × 24 px square fits at these radii) where there is room. Several tiny slices side by side keep their drawn size (accepted limit, §11); the slice buttons stay the keyboard and screen-reader path. |
| 4.1.3 Status messages | A tap with the finger is announced through `Components.Announcer`. A button activation relies on aria-pressed, so nothing is read twice. |
| 1.4.1 Use of colour | Selection shows as thickness, the badge, the centre name and aria-pressed. The other slices thin; they don't fade. |
| 1.4.11 Non-text contrast | Every slot ≥ 3:1 on both themes. The focus ring is 3 px. |
| 2.3.3 / reduced motion | The radii snap. The badge appears at once as one pill with both the icon and the percentage. |
| 1.4.4 Text at 200 % | The badge hides and the percentage moves into the centre line ("92.5% of €667.84 spent"). |
| 1.3.1 | Grouping never removes a row; the list keeps every number. |

Riders found on the way:
- the centre's "ALLOCATED" label is 3.50:1 on the dark card; it moves to
  the secondary text colour (6.50:1);
- two row-icon attributes were interpolated without escaping
  (`src/views.js` 4054 and 4075).

## 7. Phases

| Phase | Scope | Done when |
|---|---|---|
| **P1 · Palette, fold, Goals focus** | `CategoryPalette`, `CategoryRing` (fold, geometry, hit zones, focus plugin and controller), `Haptics.light`; `_assignColors` becomes a wrapper, so Analytics and Home take the new colours on the same day; the Goals ring, the row-icon rule, the overspent slices, CSS, strings in 5 languages | the unit tests for the palette (contrast, stability per language and tab), fold, geometry, hit zones and focus; a `ring_focus.spec.js` e2e (tap, morph, switch, clear, keyboard, a 1 % slice, reduced motion, 200 % text); a device check |
| **P2 · Analytics** | the Analytics donut uses the same fold (no one-member Others) and the same tap-to-focus; its centre reads "TOTAL" | its unit and e2e tests |
| **P3 · Home and Insights** | the Home categories widget drops its tooltip (a tap still opens Analytics: the ring is too small for a badge, and a long press starts a drag); the Smart Insights split bar takes its colours from the palette | one colour per category on every screen |

## 8. Decisions

1. **How many slices before Others:** 6 (5 + Others from 7 categories).
2. **What the percentage measures:** the share of this month's spending; the centre says "of €X spent".
3. **The new palette on every ring:** yes, from P1 (Goals, Analytics, Home, Insights).
4. **Which row icons keep a colour:** only categories on the ring; those inside Others are grey; rows off the ring are plain.
5. **Overspent month:** category slices over total spent, with the red
   "OVERSPENT" centre. Decided by the plan; say if you prefer the solid red
   ring.

## 9. Risks

- **Chart.js internals.** The focus plugin relies on how Chart.js 4.4.2
  stores arc radii. A unit test pins the geometry, and any Chart.js upgrade
  must re-run it.
- **HG-5's "nothing painted over Chart.js" rule.** The plugin only changes
  radii and is passed in by Goals. CLAUDE.md is amended in the same commit,
  so a later round doesn't remove it.
- **Colours change** for existing users on day one (decision 3).
- **Two percentages can differ.** Under budget, a slice's share of spending
  (92.5 %) isn't its share of the circle, because the remaining track is part
  of the ring. The "of €667.84 spent" line states the base (decision 2).
- **The ring and the list read in different orders.** The ring sorts by size;
  the rows stay budgeted-first and alphabetical.
- **Timing checks.** Animation timing can only be checked in Playwright and
  on a device, never in the hidden preview pane.

## 10. Process

Research workflow (2026-11-06): four code readers, three independent designs
(minimal, coherent, accessibility-first) and a judge, whose recommended plan
is §3–§9. Review workflow after P1: four lenses (correctness, lifecycle, WCAG,
strings and tests), each finding checked by a skeptic. It confirmed 8 of 13
findings; all 8 are fixed (§11).

## 11. As built

### P1 · Palette, fold, Goals focus (2026-11-07)

- **`Components.CategoryPalette`** (`src/components.js`):
  - `SLOTS` (8), `OTHERS` `#64748b`, `DEFAULT_SLOTS`, `PRIORITY`;
  - `slotOf(id)` uses FNV-1a for ids that aren't defaults;
  - `assign(ids)` walks the ids in priority order, then by id, and gives each
    its slot or the next free one.
  - `CategoryDonutChart._assignColors` is now a thin wrapper, so Analytics
    and the Home categories widget take the palette on the same day.
    `_CATEGORY_COLORS` and `_FALLBACK_PALETTE` are gone.
- **`Components.CategoryRing`:**
  - `fold(items, max = 6)` keeps the biggest first; ties go by palette
    priority, then id.
  - `geometry(values)` follows the Chart.js 4.4.2 doughnut formula: at box
    180, padding 7 and spacing 2 the radii are 82 / 54.12.
  - `plugin()` (`stackdRingFocus`) moves each arc's radii in
    `beforeDatasetDraw` and restores them in `afterDatasetDraw`.
  - `focus(chart, count, index, instant)` tweens the radii: 240 ms in,
    200 ms out, easeOutQuart. It uses requestAnimationFrame, with a timeout
    that finishes the tween when rAF is suspended.
  - `stop(chart)`.
- **Tap zones, after the review.** The first version spread every slice to
  24° by relaxing the zone boundaries. The review proved, by running the code
  and fuzzing it, that this slid whole runs of zones off their arcs: 23 % of
  slices on random rings answered a tap for a neighbour. As built:
  - `hitTest` checks the drawn arcs first, so a tap on a drawn slice is always
    that slice.
  - `hitZones` gives a slice under 24° a halo over the remaining-budget track
    beside it: up to 24° in all, at most half of that track, and never over
    another slice.
  - Accepted limit: several tiny slices side by side keep their drawn size,
    for example early in a month when every slice is thin. The slice
    buttons, now on each slice's drawn mid, stay the keyboard and
    screen-reader path.
  - A fuzz test over 5,000 rings pins it.
- **Goals (`BudgetView`):**
  - `renderList` folds the budgeted categories with spending and colours the
    rows: the slice colour, slate inside Others, none off the ring. It writes
    `_passTotals.slices` and `.ring {geo, zones, count, hasTrack}`.
  - `_ringHtml` writes the box: the canvas (aria-hidden), the resting centre,
    the readout, the buttons and the badges.
  - `_ringSelect`, `_ringAria` (escaped for markup, raw for the live region)
    and `_ringBigText`.
  - `attachEvents` builds the chart with `events: []`, `hoverOffset: 0`,
    `layout.padding: 7` and the plugin. It restores a focus instantly and
    wires the box's hit test, Escape and the card tap that clears.
  - The tab toggles and `destroy()` drop the focus and its timers.
  - An overspent month draws the slices over total spent.
- **After the review:**
  - At root ≥ 24 px the readout renders under the ring, in normal flow
    (`.ring-focus-readout--below`), and the hole keeps the resting centre.
  - The focus ring paints above the badge (`isolation` on the box, z-index).
- **Riders:**
  - `.donut-total-label` uses `--text-secondary` (6.5:1 on the dark card);
  - the row icon attributes are escaped;
  - `Haptics.light()`.
- **Strings:** 7 `budget.ring.*` keys × 5 languages.
- **Tests:**
  - unit: `categoryRing.test.js` (new: palette contrast and stability, the
    fold, geometry, halos and the 5,000-ring fuzz, the plugin, the Goals
    interaction, re-render, timers, reduced motion, large text, escaping
    including the Others names); `ringChart`, `categoryDonutChart` and
    `budgetEditor103` pin the new colours and the overspent slices.
  - e2e: `ring_focus.spec.js` (new: a real canvas; the morph; the same Chart
    instance after a tap; the plugin radii inside a real Chart.js draw; a
    0.6 % slice; its halo; keyboard; reduced motion; 200 % text; re-render).
- **Not yet:** P2 (the Analytics donut: the same fold and focus) and P3 (the
  Home categories widget's tooltip; the Smart Insights split bar still uses
  the stored colours until then).
