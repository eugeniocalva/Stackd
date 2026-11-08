# User journey of Stack'd — plan (UJ)

Status: **BUILT 2026-11-08** (D1–D8 decided the same day). Build 10202 round;
nothing here changes the app except bug fixes the journey tests turn up
(tagged `// 1.2.2 (UJ)`).

## Why

The owner wants the full user journey of the app as an artifact for an
external UX/UI designer's evaluation, with pictures, flows and tasks; and
wants the same work to seed an end-to-end test baseline that exercises the
whole application.

## Decisions (owner, 2026-11-08)

| # | Question | Decision |
|---|---|---|
| D1 | Deliverable (the claude.ai artifact tools are down in the authoring session) | **A self-contained HTML page + a PDF** in `docs/user-journey/`; sent as files now, published as a claude.ai artifact from a fresh session later (one call). |
| D2 | Scope | **The shipped app (1.2.x)**: onboarding, Home, History, Goals, Analytics, Smart Insights, New Log, accounts, categories, tags, Loans, Import / Export / Backup, Settings, Stack'd Pro. Bank Connect left out (not in the build). |
| D3 | Format | **Personas + screen flows**: three personas (first-time user, daily logger, power user), each with stages, steps, the screen at each step, goals, friction and open questions; then a screen-by-screen appendix with every control. |
| D4 | Screenshots | **English, light theme**, 390×844 (iPhone logical size) @2x, invented example data (`tools/seed.cjs`). |
| D5 | Test depth | **Journey tests + the full suite**: one Playwright spec per persona journey walking the real screens in order, kept in `tests/e2e/journey_*.spec.js`; then the whole e2e suite and the unit suite. |
| D6 | Bugs found | **Fix everything found**, each with its regression test, committed and pushed per fix. |
| D7 | Sequencing | **In parallel**: the screen inventory first (shared backbone), then the page is built while the journey specs are written and run; Coverage and Findings sections land at the end. |
| D8 | Reader | **An external UX/UI designer**: plain product language, screens named as the app names them, no code identifiers, a short primer at the top. |

## Build

1. **Screen inventory** (`docs/user-journey/inventory.md`, working file):
   every screen, sheet and menu, its controls, where each leads, from the
   router map, the in-app manual structure and the dictionaries.
2. **Capture script** `tools/journey/capture.cjs`: drives the dev server
   (:3000) with the shared seed, English, light theme, and saves one PNG per
   journey step to `docs/user-journey/img/`. Deterministic (clock pinned,
   Chart.js animation off, reduced motion).
3. **Journey specs** `tests/e2e/journey_first_time.spec.js`,
   `journey_daily.spec.js`, `journey_power.spec.js`: each walks its persona's
   steps through the real UI (taps, forms, sheets), asserting what the user
   sees at each step. Written and run by subagents while the page is built.
4. **The page** `docs/user-journey/index.html` (+ `build.cjs` that inlines
   the images and prints `user-journey.pdf` through Chromium): primer,
   personas, journey maps (stage → steps with screenshot, goal, what the app
   shows, friction, open question), flow diagrams (SVG), the screen
   appendix, Coverage (which steps have an automated check) and Findings.
5. **Run** the three journey specs, the whole e2e suite and the unit suite;
   fix what fails (D6); record results in the page.

## Personas (draft)

- **Nora, first-time user** — installs, picks currency and language, creates
  her first account with an opening balance, logs a first expense, finds
  History and Home's graph, sets one Goal, hits the free-plan limit on a
  third account and sees Stack'd Pro.
- **Marco, daily logger** — opens Home on a new day, reads balances and the
  month's net, logs 2–3 expenses with tags and a photo, a transfer between
  accounts, a recurring payment, marks a payment paid from History's swipe,
  selects and deletes a duplicate, checks Goals and Smart Insights.
- **Lea, power user** — imports a bank CSV (mapping, rules, duplicates),
  exports a ledger, runs a backup and restore, simulates and tracks a loan
  linked to a recurring payment, reorders accounts and tabs, hides balances,
  switches language, uses a custom period and filters in Analytics.

## As built (2026-11-08)

- **Backbone:** `docs/user-journey/inventory.md` — §A every screen, sheet and
  menu with its controls; §B the three personas with stable step ids
  (N1–N15, M1–M16, L1–L25); corrected after the first spec runs to how the
  app behaves (opening balance as a row of its day, no paid mark on future
  members, Jul 25, the ⋮ on the list row…).
- **Screenshots:** `tools/journey/capture.cjs` drives the dev server
  (:3000) with `tools/seed.cjs` + two extra rows (a €100 dinner that puts
  Dining Out over its limit, a €120 payment later this month), English,
  light, 390×844 @2x, Chart.js animation off; one WebP per step in
  `docs/user-journey/img/` + `manifest.json`. Each step first closes any
  sheet left by the one before (`closeSheets`), so a miss never cascades.
- **Page:** `tools/journey/content.cjs` (the designer-facing text: primer,
  map, personas, journeys with Does / Sees / Friction / Question per step,
  screen catalogue, coverage, findings, ten questions) rendered by
  `tools/journey/build.cjs` into one self-contained
  `docs/user-journey/index.html` (images inlined, ~3.6 MB) and
  `user-journey.pdf` (A4, Chromium). Publish to claude.ai from a fresh
  session with `publish_files` on the HTML.
- **Journey specs:** `tests/e2e/journey_first_time.spec.js` (7 tests),
  `journey_daily.spec.js` (11, real touch, clock pinned to 15 Nov 2026),
  `journey_power.spec.js` (5, clock pinned to 8 Nov 2026) — 23 tests driving
  every step through the UI. Written by three parallel subagents from the
  inventory while the page was built (D7).
- **Found and fixed:** the Goals page was titled "Budget" (Presupuesto /
  Orçamento) while its tab, the manual and Insights say Goals →
  `budget.title` renamed in all five languages (`i18n_core.spec` updated).
- **Design questions** (not bugs, in the page's Findings): the opening
  balance as an "Adjustment" row on its day; future recurring rows looking
  like past ones; Debt vs Loans and Others vs Others & Settings naming;
  onboarding with no explanation and three empty states on Home; the length
  of New Log; Home's hierarchy; discoverability of swipes / pager / drag;
  density of Insights cards and the scope sheet; the Data screens; the
  free-plan wall with no warning.
- **Harness notes:** a flung CDP swipe on `#home-pager` can park headless
  Chromium between panes and swallow the next tap (a swipe that pauses
  before lifting snaps); `Modal.hide()`'s 300 ms sweep can remove a sheet
  opened inside that window under a pinned clock.

