# UI Polish & Platform Fit — Master Plan (v0.73)

> **Status: PLANNED — not yet implemented.**
> Source: user feedback of 2026-08-10 (4 annotated screenshots + 1 video of the
> current flow). Four independent workstreams, each shippable as its own phase.
> Line numbers cited below are as of v0.72 (commit d9a111d) — trust `src/`, not
> the numbers, if the file has moved on.

## Phase checklist

- [x] **Phase 1 — Safe-area / status-bar hardening** — done 2026-08-10; see §Phase 1 as built
- [ ] **Phase 2 — Widget size consistency** (uniform card heights per size across all 8 widget types)
- [ ] **Phase 3 — Account tile restyle** (Trade-Republic-like proportions, same structure/logic/colors)
- [ ] **Phase 4 — View transitions & motion polish** (soften the "mechanical" page/state switches)

---

## Phase 1 — Safe-area / status-bar hardening

### Symptoms (from screenshots)

1. Widget edit mode: `Done` / `+ Add` pills sit in the status-bar strip and are
   hard/impossible to tap.
2. Category selection modal: its top bar renders behind the clock (with or
   without keyboard).
3. Analytics: scrolled content ("TOTAL NET BALANCE · TODAY") re-appears *above*
   the page header, inside the status-bar strip.

### Root causes (verified in code)

| # | Cause | Where |
|---|---|---|
| 1 | The safe-top padding lives on the **scroller** (`.view-container { padding-top: var(--safe-top) }`), so it scrolls away with the content. Anything scrolled up — non-sticky section headers (the WIDGETS bar), widget remove buttons, summary text — renders into the status-bar strip, where iOS also swallows taps. | `src/styles/global.css:49` |
| 2 | Four modal top bars override the safe-aware `.modal-top-bar` class (`components.css:1127` pads `--safe-top`) with **inline `padding:`**, killing the inset. | `src/components.js:2621, 2736, 2860, 3332` |
| 3 | Per-view compensation hacks (negative `margin-top: calc(var(--safe-top) * -1)`) make every new sticky header a foot-gun. | `src/styles/components.css:428–435` |
| 4 | Android: Capacitor 6, `targetSdkVersion 34`, no StatusBar/safe-area plugin. On devices already running edge-to-edge (Android 15 gesture UI; enforced once we target SDK 35), the WebView reports `env(safe-area-inset-top)` = **0**, so all this CSS resolves to zero — "happens on some phone models". | `android/variables.gradle:3–4`, `package.json` |

### Fix (recommended: opaque inset owned by `#app`)

Move safe-area ownership one level up so no app content can ever occupy the
status-bar strip — a structural guarantee instead of per-view discipline:

1. `#app { padding-top: var(--safe-top) }` (strip shows `--bg-base`);
   **remove** `padding-top` from `.view-container` (`global.css:49`).
2. Sticky headers (`.history-header-sticky`, `.header-nav`) drop the
   `--safe-top` term from their padding and **delete** the two negative-margin
   hacks (`components.css:428–435`) and the `:has()` rule. They now stick below
   the strip naturally.
3. Modals are `position: fixed` (viewport-anchored, outside `#app` padding), so
   `.modal-top-bar` **keeps** its safe-top padding — instead we delete the four
   inline `padding:` overrides in `components.js` so the class wins again.
   Sweep all other `position: fixed` top-anchored surfaces
   (`.sheet-container`, `.bulk-selection-bar`, icon picker) for the same bug.
4. Splash screen (`index.html:22`) already pads — unaffected.
5. Android inset reality: add a tiny native-side fallback so `--safe-top` is
   real when the WebView is edge-to-edge — either `@capacitor/status-bar` with
   `overlaysWebView: false` (simplest: WebView never sits under the bar) or the
   `@capacitor-community/safe-area` plugin injecting real insets as CSS vars.
   Decide when we bump `targetSdkVersion` to 35; ship the CSS restructure now
   since it fixes iOS/PWA immediately.

**Trade-off accepted:** content no longer scrolls *behind* the clock
(translucent-blur effect). The strip becomes a clean opaque band — same as
Trade Republic and most finance apps. The existing in-app sticky-header blur
(`components.css:405–421`) still works below the strip.

**Alternative considered (rejected):** keep the under-clock scroll and add a
fixed blur "scrim" of height `--safe-top` + audit every surface individually.
Keeps the immersive look but leaves the tap-stealing class of bug reachable —
every future fixed/sticky element must remember the inset.

### Phase 1 as built (2026-08-10, v0.73)

Shipped as designed with one refinement discovered during implementation: the
four inline `padding:` overrides were **not** all bugs — two of them
(month picker `components.js:2621`, Balance Trend `:2860`) are *bottom sheets*
whose top edge is mid-screen, and their overrides were correctly suppressing
the class's safe-top. Meanwhile two class-only users (Custom Range `:746`,
Filter & Sort `:951`) were bottom sheets silently *inheriting* an unwanted
inset. So instead of "delete the overrides", the base class was inverted:

- `.modal-top-bar` base = **no** inset (bottom-sheet default); new
  `.modal-top-bar--safe` modifier adds `--safe-top`; only the two true
  full-screen modals (category selection, add-widget) carry the modifier and
  lost their inline styles (fully redundant with the class).
- `#app` owns `padding-top: var(--safe-top)` (global.css); `.view-container`
  lost it; sticky headers lost their `--safe-top` term; both negative-margin
  hacks deleted; the `:has()` hug-the-top rule kept as `padding-top: 0` only.
- Debug override implemented as `?safetop=<px>` (query before the `#hash`),
  read in `main.js` at DOMContentLoaded.
- Sweep confirmed all other fixed surfaces are bottom-anchored or already
  inset-aware (`.sheet-container`, icon picker ≤85vh sheet, nav action menu,
  bulk bar, expanded-graph 92vh sheet).
- `tests/unit/globalSafeArea.test.js` rewritten to the new invariants.
- Verified in Chromium at 375×812 with `?safetop=59`: scroller top edge at
  y=59, `elementFromPoint` in the strip hits `#app` (nothing interactive),
  sticky bar pins to the strip edge, category-modal bar pads 75px, sheet bars
  16px. Full unit (433) + e2e (19) suites green.

### Dev/testing aid

Add a debug override (e.g. `?safetop=59` or a localStorage flag read in
`main.js`) that force-sets `--safe-top: 59px`, so status-bar layouts are
testable in desktop Chrome and Playwright without a phone.

### Verification

- Update `tests/unit/globalSafeArea.test.js` to the new invariants (it
  currently asserts the negative-margin hacks exist — those assertions flip).
- Manual matrix with forced `--safe-top`: dashboard rest + scrolled, widget
  edit mode, category modal (+ keyboard), analytics scrolled, all sheets.
- Bump `?v=` for `components.js` (inline padding removals) per house rule.

---

## Phase 2 — Widget size consistency

### Symptom

Two `small` widgets side-by-side have different heights (Categories donut card
is taller than Latest transactions); `large` cards each pick their own height.

### Root cause

`.widgets-grid { align-items: start }` + `.widget-card { min-height: 140px }`
(`components.css:2016–2033`) — cards are content-sized, and every widget body
has its own intrinsic height (donut `max-height: 150px`, rows × N, chart wrap
`height: 180px`, …).

### Fix

iOS-widget model: **fixed height per size**, content adapts to the box.

1. Tokens in `variables.css`: `--widget-h-small: ~176px`,
   `--widget-h-large: ~320px` (final values tuned visually at 375px width).
2. `.widget-card { height: var(--widget-h-small); min-height: 0 }`;
   `.widget-card--large { height: var(--widget-h-large) }`;
   grid gets `align-items: stretch`; `.widget-card-body { flex: 1; min-height: 0;
   overflow: hidden }`.
3. Make bodies fill instead of dictate: `.widget-chart-wrap` → `height: 100%`
   (inside the flexed body) instead of fixed `180px`; donut sizes from the box;
   row lists get a row-height that fits the cap (large `latest` = 5 rows today —
   keep 5 with tightened rows or drop to 4, whichever fits `--widget-h-large`
   without clipping).
4. `widget-empty` / error placeholder center in the fixed box (already
   `height: 100%`).
5. The add-widget preview stage reuses `.widgets-grid`
   (`widgets.js:1396–1409`), so the preview inherits the fix for free.

Per-renderer sweep (all 8 types in `Widgets.registry`) to confirm nothing
overflows/clips at both sizes with empty, sparse, and dense data.

### Verification

Dev-server visual pass at 360/375/430px widths, all 8 types × 2 sizes, light +
dark; existing widget unit tests still green; `?v=` bump for `widgets.js` if
its markup changes (CSS-only changes need no bump).

---

## Phase 3 — Account tile restyle (Trade Republic proportions)

Reference: TR "Piani di accumulo / Ordini / Analisi" row — tiles are **wider
than tall** (≈1.3 : 1), generous radius, quiet border, small grey label with the
value right under it, and the next tile peeking in from the right edge.

### Current

`.wallet-card` — fixed 160×160 square (`components.css:902–920`), top accent
bar, 38px circular icon top-left, edit trigger top-right, type/name/balance
bottom-anchored, default badge bottom-right; `.btn-add-wallet-card` matches the
square (`:1034–1050`). Rendered in `DashboardView` (`views.js:292–338`).

### Change (structure, logic, colors, content unchanged — only geometry)

1. `flex-basis/width: clamp(150px, 44vw, 190px)`, `aspect-ratio: 4 / 3.1`
   (≈1.29 : 1, drop the fixed `height`) — on a 390pt phone: two full tiles +
   a visible peek of the third (scroll affordance, as in TR).
2. Rebalance the interior for the shorter box: icon box 38px → ~32px, padding
   one step tighter, `wallet-card-balance` stays `1.2rem` (fits — the box is
   *wider*), name keeps single-line ellipsis.
3. `.btn-add-wallet-card` gets the same clamp/aspect so the row stays uniform.
4. Keep: accent bar, `is-default` border + badge, `:active` scale, edit
   trigger hit-target ≥36px.

### Verification

Visual pass with 1, 2, 3, 6 accounts; long account names; default-account
styling; dark mode. CSS-only phase (no `?v=` bump needed unless `views.js`
markup is touched).

---

## Phase 4 — View transitions & motion polish

### Symptom (video)

Navigation (widget → categories → analytics, tab switches) swaps screens
instantly: `routerView.innerHTML = render(state)` on every dispatch
(`main.js:433`) — functional but mechanical. Modals/sheets already animate
(300ms spring `cubic-bezier(0.16, 1, 0.3, 1)`); full-screen navigation has no
motion at all.

### Best practices we'll apply

- **Animate navigation, never re-renders.** Only when `state.activeView`
  changes; same-view dispatches (typing, filters, chart toggles) stay instant.
  `main.js` already knows the previous view (`window._currentActiveView`).
- **View Transitions API first** (`document.startViewTransition`) — built for
  exactly this innerHTML-swap architecture. In WebView/Chrome ≥111 and Safari
  ≥18 we wrap the swap and style `::view-transition-old/new(root)`:
  ~250ms, outgoing fades, incoming fades + rises ~12px, ease-out.
  **Fallback** (older engines): add a one-shot `.view-enter` keyframe class on
  `#router-view` (fade + 12px rise, 200ms), removed on `animationend`. Zero
  dependencies either way.
- **Hierarchy-aware direction (optional polish, same phase):** bottom-nav
  peer switches = pure crossfade; drill-ins (`#category-detail`, `#debt-sim`,
  `#edit-account`…) = slide-in from right, and back = from left. Router keeps a
  tiny visited-stack to classify forward/back; skip if it fights the hash
  router — crossfade alone already kills the mechanical feel.
- **One motion vocabulary.** Tokens in `variables.css`
  (`--dur-quick: 150ms`, `--dur-view: 250ms`, `--ease-spring:
  cubic-bezier(0.16, 1, 0.3, 1)`) and reuse them in modals/sheets/FAB so the
  whole app shares one family of curves.
- **`prefers-reduced-motion: reduce`** disables view transitions and the
  fallback animation (media query around both).
- **Charts must not re-animate on every dispatch.** Views re-mount canvases on
  each render; with transitions this would read as double motion. Pass
  `animation: false` on re-mounts within the same view (dashboard path goes
  through `Widgets._mountChart`), keep the entry animation on first mount of a
  view visit.
- **Touch feedback stays instant** (<100ms): existing `:active` scales are kept
  and extended to widget cards and pills; scroll reset on navigation stays
  instant (never animated).

### Verification

Manual flow-through of the video's path (dashboard → widget tap → categories →
analytics → back) on the dev server; keyboard-driven form re-renders confirmed
animation-free; reduced-motion emulation in DevTools; e2e suite still green
(transitions must not break Playwright waits — the fallback class approach is
inert for tests, `startViewTransition` resolves fast; if flake appears, disable
via the reduced-motion hook in the Playwright config).

---

## Suggested order & scope notes

1 → 2 → 3 → 4. Phase 1 first (it's a bug class, and its debug override helps
verify the others on desktop). Phases 2–3 are CSS-heavy and low-risk. Phase 4
touches the core render loop in `main.js` — last, smallest diff, easiest to
revert independently.

Each phase: own commit, version stays v0.73 across all four (title bump in
`index.html` on Phase 1), `?v=` bumps only for changed `src/*.js` per the house
cache-busting rule.

## Open points (defaults chosen, flag if you disagree)

1. **Opaque status-bar strip** (Phase 1) instead of content-under-clock blur —
   recommended for reliability; TR does the same.
2. **Fixed heights for `large` widgets too** (Phase 2) — alternative is
   "uniform smalls, content-sized larges", but mixed large heights is exactly
   the inconsistency being reported, so fixed everywhere is recommended.
3. **Android plugin work deferred** (Phase 1.5) until we know which Android
   models reproduce it / when targetSdk 35 lands — the CSS restructure alone
   fixes every device where `env()` reports real insets (incl. iPhone PWA).
