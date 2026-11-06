# Smart Insights 2.0 — plan (1.2.2, HG-7)

Status: **P1 (page + tab) and P2 (widget + tab order) BUILT 2026-11-06 (§11);
P3–P4 to do.** All decisions
taken (§9): an Insights page and a 5th tab; the widget is opt-in; nothing on
Home by default. Comment tag: `// 1.2.2 (HG-7)`.

Roles taken for this plan: lead designer, business analyst (personal-finance
metrics), WCAG 2.2 specialist.

Mockups (real renders inside the app):
- Round 1, *Home section* (superseded): `insights-light.png`,
  `insights-dark.png`, and the phone strips `light-0-today` … `light-3-C`.
- Round 2, *this plan*:
  - `page.png`: the Insights page;
  - `nav-compare.png`: the tab bar today, with five tabs, and scrollable;
  - `widgets.png`: the Insights widget, large and small;
  - `settings.png`: the Tab bar order.

---

## 1. Goals

1. **Readable at a glance.** One clear figure, one plain sentence, one optional
   detail line. No 12 px text, no sentence fragments that start after a number.
2. **Worth reading.** A catalogue of ~20 insight types instead of 5 fixed
   rules, ranked by how useful each is *today*.
3. **Grows with the data.** What the user sees depends on how much history
   they have. Anything still locked says what it takes to unlock it.
4. **Home stays the user's.** Insights leave the fixed Home slot and get a
   page of their own (a tab), plus a widget for anyone who wants them on Home.
5. **The tab bar becomes the user's too.** Tab order is a setting; Home is
   always first and always the start screen.
6. **WCAG 2.2 AA**, verified by tests (keyboard, focus, 200 % text, reorder
   without dragging), not just eyeballed.

Non-goals:
- no network and no AI model: insights stay on-device rules, as today;
- no stored insight history in the first release (§5.4).

---

## 2. Audit of today's section

### 2.1 Design

| # | Finding | Effect |
|---|---|---|
| D1 | Body text is 12 px (`.insight-text` 0.75rem); value 15 px. | Hard to read, below platform norms (iOS body 17 pt, Material body 14 sp). |
| D2 | The sentence is a **fragment that starts after the figure**: "53% · é o máximo que uma única conta detém (BPI)". | Reader must stitch number + lowercase clause; word order fights every language; screen readers read it as two unrelated chunks. |
| D3 | Icons are generic (wallet, pin, trend) in a sunken 32 px tile. | Spend ~44 px of width per card and add no meaning the sentence doesn't already carry. The tile is near-invisible (1.1:1 against the card). |
| D4 | Three separate cards with a 16 px card margin *plus* a 12 px gap. | Loose rhythm, looks like three unrelated notices. |
| D5 | Every card opens Analytics. | Tapping "BPI holds 53 %" lands on a screen that doesn't show account split. |
| D6 | Percentages are `${pct}%`, amounts carry cents ("+€3,388.00"). | Bypasses `Store.formatPercent` (French should read "53 %"); cents add noise to a headline figure. |
| D7 | Advice tone is mixed ("try to trim it", "consider spreading it"). | Reads as nagging; the facts already make the point. |

### 2.2 Analytics

Five fixed rules (account mix, top category, month-end outlook, income source,
bank), first three always win. Two of them (account mix, income source) barely
change month to month, so the section feels static. Nothing compares the user
with their own past, and nothing looks ahead except the month-end outlook.

### 2.3 WCAG 2.2 (AA) — today

| SC | Level | Today | Verdict |
|---|---|---|---|
| 2.1.1 Keyboard | A | Cards are `div role="button" tabindex="0"` with a **click listener only** — Enter/Space do nothing. | **Fail** |
| 4.1.2 Name, Role, Value | A | Role is *button* but the action is navigation (a *link*); the name is an assembled `aria-label`. | Weak |
| 1.3.1 Info and Relationships | A | Section title is a `<p>`; cards are not a list. | **Fail** |
| 2.4.6 Headings and Labels | AA | No heading to jump to. | **Fail** (with 1.3.1) |
| 1.4.1 Use of Color | A | "Good / bad" is carried by the figure's colour alone (green 53 %, red 51 %). | Borderline |
| 2.4.4 Link Purpose (in context) | A | Every card goes to Analytics regardless of topic. | Weak |
| 2.4.11 Focus Not Obscured (Min.) — *new in 2.2* | AA | The fixed bottom nav + FAB can cover a focused card near the bottom edge. | Unverified → test |
| 2.5.8 Target Size (Min.) — *new in 2.2* | AA | Whole card is the target (≥ 44 px). | Pass |
| 2.4.7 Focus Visible | AA | Global `[tabindex="0"]:focus-visible` ring. | Pass |
| 1.4.3 Contrast | AA | Body #475569 on #fff = 7.6:1; dark #94a3b8 on #161e2e = 6.5:1; figures use the AA `-text` tokens (#047857 5.5:1, #b91c1c 6.5:1; dark 11:1 / 8.8:1). | Pass |
| 1.4.4 Resize Text | AA | Sizes are in rem, but the viewport sets `user-scalable=no, maximum-scale=1` and the native app does not follow the OS text size. | **App-wide gap** (§10) |
| 1.4.12 Text Spacing | AA | Cards grow with text, no fixed heights. | Pass |

---

## 3. Design

### 3.1 The Insights page (`#insights`, `Views.InsightsView`), see `page.png`

Order, top to bottom:

1. **Title.** "Smart Insights" sits on the shared title line (HG-3, 32 px below the
   view area), with one subtitle line under it: "Worked out from your own
   entries, on this phone."
2. **Highlight card.** The day's top-ranked insight as a metric card: eyebrow,
   a 28 px figure (with an arrow when it has a direction), headline, a small
   chart where one helps, and a detail line.
3. **Needs attention.** Shown only when something applies: unpaid bills, a
   budget over its limit, Bank Connect. It sits directly under the highlight,
   so it is always on the first screen.
4. **This month**, **Trends**, **Accounts and loans**, **Tidy up.** Grouped
   rows, one card per section, every insight that applies, ranked inside its
   section. Empty sections don't render.
5. **Unlocks with more data.** The insight types the user's history doesn't
   support yet. Each is a static row with a lock, what it needs ("After 3
   months of entries · month 2 of 3") and a progress bar. This makes the data
   tiers visible and gives a reason to keep logging.
6. **Footer note**, with a shield icon: "Insights are worked out on this phone
   from your entries. Nothing leaves the device."

The page has no cap: everything that applies is listed. The 3–5 limit moves
to the widget (§3.3).

**Tier 0** (fewer than 5 counted rows): the highlight becomes the **starter
card**, "Log a few days of spending to unlock insights", with progress
("2 of 5") and a button to the transaction form. *Unlocks with more data*
lists everything below it.

### 3.2 Row and card anatomy (round 1, layout C)

- **Rows:**
  - a 20 px figure in a fixed 5.75 rem column (17 px when it is longer than 7
    characters);
  - a 16 px/600 headline and a 14 px detail line;
  - a chevron, and no icons.
- **Highlight card:**
  - a 14 px eyebrow and a 28 px figure;
  - a 16 px headline;
  - an `aria-hidden` micro-chart: pace bars, a budget bar with a *today* tick,
    or an account split bar;
  - a 14 px detail line.
- **Verdict in words.** Every headline says *less, more, over* or *on track*;
  the colour (AA `-text` tokens) only repeats it (1.4.1).
- **Whole sentences** in all 5 languages.
- **Figures:**
  - percentages go through `Store.formatPercent`;
  - headline amounts are in whole units (`formatCurrency(v, ccy, { whole: true })`).
- **Neutral tone of voice:** facts first, at most one gentle suggestion.

### 3.3 The Insights widget (`registry.insights`), see `widgets.png`

| Size | Shows | Tap |
|---|---|---|
| small | the top insight: figure (with arrow) + headline, 3 lines max | the Insights page |
| large (auto height) | the top **3** insights as rows + "All insights ›" | each row opens its own screen; the link opens the page |

- One insight per family (no two budget rows), with attention items first.
- The widget uses the same daily rotation as the page highlight, so the two
  agree.
- Tier 0 shows the starter card, in both sizes.
- **Hidden balances (HG-4):**
  - the widget's amounts are masked, like every Home surface;
  - the Insights page is not Home, so it is never masked (`isMoneyMasked` is
    dashboard-only).
- The small widget keeps the fixed 190 px height and clamps the headline at 3
  lines. The full text is one tap away on the page, so nothing is lost.

### 3.4 The tab, see `nav-compare.png`

- **The new tab:** a 5th tab, **Smart Insights**, with the Lucide `lightbulb` icon.
  `sparkles` reads as "AI", and these are plain rules.
- **The name (decided 2026-11-06):** "Smart Insights" in English. Each other
  language says the same thing in its own words, and never with a word close
  to Analytics ("Statistiques / Statistiche / Estadísticas / Estatísticas"),
  so "Analyses / Analisi / Análisis / Análises" are ruled out. The tab and the
  page share one name.
  - The names in use:

    | Language | Name |
    |---|---|
    | English | Smart Insights |
    | Italian | Approfondimenti smart |
    | Portuguese | Dicas Inteligentes (the user's own wording, title case) |
    | French | Astuces intelligentes |
    | Spanish | Consejos inteligentes |

  - Portuguese, French and Spanish all say "smart tips" (second pass,
    2026-11-06). The first pass used "Aperçus / Perspectivas / Perspetivas",
    which was too abstract.
  - French uses *astuces* rather than *conseils*, because *conseils* reads as
    financial advice, which these are not.
- **Decided: five tabs, all visible, no scrolling.**
  - The pill already stretches to 320 px.
  - With five items, each one is 54 px wide on a 393 px phone and 47 px on a
    360 px one, all at least the 44 px touch target.
- **Rejected: a scrollable pill** with the 5th tab peeking at the edge.
  The render shows the problems:
  - a half-faded icon next to the + button reads as decoration, not as
    "there's more";
  - a destination hidden off-screen is one most users never find;
  - a sideways swipe on the bar competes with the Android back-gesture edge
    and risks mis-taps.
- **If a scrollable bar is ever needed** (scrolling only earns its place at
  6+ tabs), the design is:
  - snap scrolling;
  - a fully visible half icon and a fade;
  - keyboard and screen-reader order that includes the off-screen tabs.

### 3.5 Tab bar order in Settings, see `settings.png`

- **A new Tab bar section** in Settings, under Appearance.
  - Home is the first row, locked ("Always first · opens at start").
  - The other four rows each carry **Move up / Move down buttons** (44 × 44,
    disabled at the ends) and a grip handle for dragging.
- **Dragging is optional; the buttons are not** (2.5.7 Dragging Movements, new
  in 2.2). After a move:
  - focus stays on the moved row's button;
  - a polite live region says "History moved to position 2 of 4" (4.1.3).
- **Storage:**
  - per device, in `stackd_v1_navOrder`: an array of view ids, Home excluded;
  - normalised on read: unknown ids are dropped, missing tabs are appended in
    the default order;
  - not in the backup (the house rule for prefs), and reset by `RESET_APP`;
  - set with the action `SET_NAV_ORDER`.
- **The nav updates live.** `main.js` already rebuilds the nav when the
  language changes; it rebuilds it on an order change too. The app always
  opens on Home, whatever the order.
- **Order only, no hiding.** Every page stays one tap away.

### 3.6 Home

The Smart Insights section leaves Home: `DashboardView` no longer calls
`Insights.renderSection`. **Nobody gets the widget automatically**, neither
existing installs on update nor new installs. It sits in the Add-widget
list, and the default Home seed stays one `latest` widget.

---

## 4. Insight catalogue

Row rules for every figure: **the app's aggregate rules**. Unpaid rows,
transfer legs, opening balances, rows dated before their account opened and
accounts in another currency never count. "So far" figures are month-to-date
(`Widgets._monthToDateFilters`). "By month end" figures include scheduled rows.

*Tier* = the minimum data tier (§5.1). *Family* = the section the insight
lists under on the page, and at most one per family in the widget. *Base* =
starting score (§5.2).

### 4.1 Attention: "Needs attention" section, always ranked first

| id | Fires when | Figure | Headline (EN) | Opens | Base | |
|---|---|---|---|---|---|---|
| `bankNew` | Bank Connect has rows waiting | count | "{n} new transactions from {bank} to review" | Bank Connect | 95 | exists |
| `bankReconnect` | a consent expired or expires ≤ 14 days | days / "Expired" | "{bank} needs a fresh consent" | Bank Connect | 90 | exists |
| `budgetOver` | a budget's spend > its limit this month | amount over | "{category} is over its budget" | Goals | 85 | new |
| `overdueUnpaid` | expenses marked unpaid dated today or earlier | count | "{n} payments past their date are still unpaid" | History · their month | 80 | new |

### 4.2 Insights: ranked, listed by family

| Family | id | Tier | Fires when | Figure | Headline (EN) | Opens | Base |
|---|---|---|---|---|---|---|---|
| Spending | `spendPace` | 2 | day ≥ 3, last month had ≥ 5 expenses, \|Δ\| ≥ 10 % vs last month's same days | ±% | "Less / More than by this day last month" | Analytics · this month | 60 + \|Δ\| (max 95) |
| Spending | `categorySpike` | 3 | a category already spent ≥ 120 % of its usual *whole* month (avg of last 3 months with spend, ≥ 2 such months) | +% | "{category} is above your usual month" | History · category + month | 65 + excess/2 |
| Spending | `topSpending` | 1 | top category of month-to-date spend | % | "{category} is where most of your money went this month" | History · category + month | 35 (+15 if ≥ 40 %) |
| Budgets | `budgetAtRisk` | 1 | day ≥ 5, a limit set, linear pace projects ≥ 105 % of it | % used | "{category} budget could run out early" | Goals | 70 + overrun |
| Budgets | `budgetsOnTrack` | 1 | ≥ 2 budgets, day ≥ 10, every one under its pace | n of n | "All your budgets are on track" | Goals | 40 |
| Budgets | `budgetSuggest` | 2 | no budgets at all, a category averaging ≥ 15 % of spend | avg | "Dining averages {amount} a month. Set a budget?" | Goals · that category | 30 |
| Cash flow | `monthOutlook` | 1 | (today's rule) | ±amount | "Set to put aside by the end of {month}" / "{month} is heading below zero" | Analytics · this month | 50 (+20 if negative) |
| Cash flow | `savingsRate` | 2 | last complete month had income | % | "You kept {pct} of October's income" / "October cost more than you earned" | Analytics · last month | 45 (+15 if negative) |
| Cash flow | `incomeSource` | 1 | one income category ≥ 50 % | % | (today's rule, rewritten) | Analytics | 20 |
| Upcoming | `upcomingWeek` | 1 | scheduled expenses in the next 7 days | total | "{n} payments due in the next 7 days" | History · next 7 days | 55 (+10 if > 25 % of balance) |
| Upcoming | `recurringLoad` | 2 | ≥ 2 active recurring expense series | €/month | "Goes to recurring payments every month" (detail: share of income, count) | History · recurring | 35 |
| Balance | `runway` | 3 | balance > 0, avg monthly spend of the last 3 complete months > 0 | n months | "Of spending covered by your balance" | Home graph sheet | 40 (+25 if < 1 month) |
| Balance | `balanceTrend` | 3 | \|Δ\| ≥ 5 % vs 3 months ago, or a new all-time high | ±amount | "Your balance grew since {month}" / "Your highest balance yet" | Home graph sheet | 40 (+15 high) |
| Balance | `accountMix` | 1 | ≥ 2 funded accounts | % | "{account} holds most of your money" | Home · Wallets | 20 |
| Loans | `loanProgress` | 1 | an active loan; a 25/50/75/100 % milestone in the last 30 days scores higher | % repaid | "Of your {loan} repaid" | Loan results | 30 (+40 milestone) |
| Data | `uncategorized` | 1 | ≥ 5 uncategorized rows in the last 60 days | count | "{n} transactions have no category" | History · uncategorized | 30 |
| Seasonal | `yearOverYear` | 4 | 12 complete months of history, \|Δ\| ≥ 10 % vs the same days last year | ±% | "Less / More than in November last year" | Analytics | 35 |

That is 4 attention types and 17 insight types: 15 new, 6 kept (rewritten).

**Not built — `lowBalanceAhead`** ("{account} could go below zero on {date}"), dropped
2026-11-06. A zero or negative balance is often normal: a cash wallet the
user keeps empty on purpose, or a credit card that runs negative between
statements and returns to 0 when nothing is owed. An alert would cry wolf
on exactly the accounts where the balance means nothing. Do not add it
back without a per-account opt-in.

---

## 5. Data tiers and ranking

### 5.1 Data tiers

Tiers are computed once per render from *counted* rows (§4):

| Tier | Condition | Unlocks |
|---|---|---|
| 0 · Starting | < 5 counted rows | the starter card; attention items still show |
| 1 · First month | 0 complete months with ≥ 5 rows | tier-1 insights |
| 2 · Building | 1–2 complete months | + pace, savings rate, recurring load, budget suggestion |
| 3 · Established | ≥ 3 complete months | + category spikes, runway, balance trend |
| 4 · Long history | ≥ 12 complete months | + same month last year |

Locked types are listed on the page under *Unlocks with more data*, with the
progress toward their tier.

### 5.2 Ranking

1. **Run the rules.** Every rule eligible for the tier runs, each in its own
   try/catch as today. A rule returns `null` or a candidate
   `{id, family, kind, score, figure, …}`.
2. **Attention first.** Attention items rank above everything, by score.
3. **Insights by score.** Each insight's score gets a small daily offset
   (0–8) from a hash of `id + today`. Close calls change from day to day but
   never reshuffle within a day, so nothing flickers and tests can pin the
   date.
4. **Placement.**
   - Page: the top non-attention insight becomes the highlight; the rest list
     in their family sections, in score order.
   - Widget: the top 1 (small), or the top 3 with one per family (large).

### 5.3 Performance

One shared **facts pass** feeds every rule. It is a single O(T) walk:
- month × category spend;
- month income and expense;
- row counts and first/last dates;
- unpaid and uncategorized counts.

It is memoized per render pass, like `Widgets._passMemo`. The widget runs on
every Home render, so this matters.

### 5.4 Not in this release

- "Not useful" dismissal per insight type (needs a stored prefs slice).
- Novelty decay (also needs storage).
- Hiding tabs.

---

## 6. WCAG 2.2 AA: how each criterion is met and tested

| SC | How | Test |
|---|---|---|
| 1.3.1 / 2.4.6 | page `<h1>`, section `<h2>`s, `<ul>/<li>`; widget rows are a list | unit: markup |
| 2.4.2 Page Titled | the visible `<h1>` is the screen title, as on every other screen; `document.title` holds the app version (Settings and `versionSync.test.js` read it), so no screen changes it | unit: one `h1` |
| 2.1.1 | a native `<a href>` for every insight; native buttons for reorder | e2e: Tab + Enter |
| 4.1.2 / 2.5.3 | link role, name = visible text; tabs keep `aria-label` + `aria-current` | unit |
| 2.4.4 | each insight opens its own screen, with a chevron cue | unit: href per rule |
| 1.4.1 | verdict words in every headline; sign/arrow on directional figures | unit |
| 1.4.3 | primary/secondary text and AA `-text` tokens (≥ 4.5:1, both themes) | unit: contrast calc |
| 1.4.11 | micro-chart fills ≥ 3:1 against the card; charts `aria-hidden`, numbers in text; lock rows state progress in text | unit |
| 2.4.7 | `a:focus-visible` / `button:focus-visible` ring | e2e |
| 2.4.11 *(new)* | `scroll-margin-bottom` = nav height on the page's links | e2e: the focused rect ends above the nav |
| 2.5.7 *(new)* | reorder works with the Move up/down buttons; dragging is an extra | e2e: reorder with buttons only |
| 2.5.8 *(new)* | rows ≥ 64 px, reorder buttons 44 px, tabs ≥ 47 px at 360 px | e2e: bounding boxes |
| 4.1.3 | reorder announces the new position (polite live region) | unit |
| 1.4.4 / 1.4.10 / 1.4.12 | rem sizes, no fixed heights on the page, figures wrap safely | e2e: html font-size 200 % → no horizontal overflow |
| 3.2.3 Consistent Navigation | the tab order is the user's own choice, the same on every screen | e2e: the order survives a reload |

Optional: `@axe-core/playwright` (dev dependency) on the page, Home and
Settings, in both themes.

---

## 7. i18n, privacy, data

- **Strings:** about 80 new keys × 5 languages.
  - They cover the insights, section names, locked rows, the starter card, the
    widget, the tab, the Tab bar setting and its live-region message.
  - Whole sentences, with `.one`/`.other` where a count appears.
  - Today's fragment keys are removed; `i18n.test.js` enforces parity.
- **New pref:** `stackd_v1_navOrder`, per device and outside the backup.
  No migration flag is needed, because the widget is never auto-added.
- Insights themselves are never stored.

---

## 8. Phases

| Phase | Scope | Done when |
|---|---|---|
| **P1 · Page + tab** | `#insights` route + `InsightsView`; the 5th tab; Home section removed; ranking core (tiers, scores, families, rotation, facts pass); the 7 kept rules rewritten (copy, `formatPercent`, whole units, deep links); starter card; *Unlocks with more data*; footer note | unit + e2e (keyboard, 200 % text, focus clearance, page title line), light/dark renders |
| **P2 · Widget + tab order** | `registry.insights` (small/large); the Tab bar setting (`SET_NAV_ORDER`, buttons + live region, optional drag); nav rebuild on change; the widget in the Add-widget list (no seed, no migration) | widget tests (i18n guard, masking), reorder e2e without dragging |
| **P3 · Rules, batch 1** | `spendPace`, `budgetAtRisk`, `budgetOver`, `budgetsOnTrack`, `upcomingWeek`, `overdueUnpaid`, `savingsRate` | per-rule unit tests, including the aggregate rules (unpaid, pre-opening, foreign currency, transfers) |
| **P4 · Rules, batch 2** | `categorySpike`, `runway`, `balanceTrend`, `recurringLoad`, `loanProgress`, `uncategorized`, `budgetSuggest`, `yearOverYear` | the same, plus an e2e per destination |

---

## 9. Decisions

Decided 2026-11-06:

- **All four insight families ship:** spending + budgets, cash flow +
  upcoming, balance + loans, data + seasonal. `lowBalanceAhead` is out (§4).
- **Everything beyond the widget's top 3 lives on the Insights page**, which
  replaces round 1's "See all" screen.
- **New users (tier 0) get a starter card.**
- **Smart Insights leave Home.** They get their own page and tab, plus a
  widget.
- **Tab order is a setting.** Home is always first and the start screen.
- **The tab bar shows five tabs, all visible, with no scrolling.**
- **Nobody gets the Insights widget automatically.** Existing users find
  Insights in the new tab after the update.

---

## 10. Related gap, outside this plan

**Text size, app-wide (1.4.4 Resize Text, AA).** The viewport disables pinch
zoom (`maximum-scale=1, user-scalable=no`), iOS Dynamic Type isn't wired, and
whether the Android WebView follows the system font scale still needs checking
on a device. P1 makes Smart Insights survive 200 % text, but the app as a whole
needs its own item: an OS text size → root `font-size` bridge, and a layout
pass at 200 %.

---

## 11. As built

### P1 · Page + tab (2026-11-06)

- **Engine, `src/insights.js`**
  - `analyze(state)` returns `{facts, tier, items, locked}`; `compute(state)`
    returns just the ranked items.
  - `_facts` counts rows by the aggregate rule. The tier comes from those
    counts plus complete months (`STARTER_ROWS` 5, `MONTH_MIN_ROWS` 5,
    `TIER_MONTHS` {2: 1, 3: 3, 4: 12}).
  - A rule is `{id, family, minTier, nameKey, compute(facts, state)}`.
    - `family` is the page section (`attention | month | trends | accounts |
      tidy`).
    - The finer catalogue family (Spending, Budgets…) used for the widget's
      one-per-family rule is added in P2/P3, when there are rules to tell
      apart.
  - An item carries `figure`, `tone` (`good | bad | ''`), `dir`, `head`,
    `body`, `href`, `filters` and `viz`.
    - `head` and `body` are plain text built by `_t()`, which escapes every
      param first. The dictionary holds no markup.
  - Ranking is `rank = (attention ? 1000 : 0) + score + _rotation(id, today)`.
    The rotation is FNV-1a, 0–8, and attention items get none.
- **The six kept rules**, rewritten as whole sentences: `bankNew`,
  `bankReconnect` (variants `expiring` / `expired`), `monthOutlook`,
  `topSpending`, `incomeSource` and `accountMix`.
  - Percentages go through `formatPercent`.
  - Amounts use the new `formatCurrency(v, ccy, { whole: true })`.
  - Each rule opens its own screen:
    - `topSpending` and `incomeSource` open History, filtered to the category
      and this month (`UPDATE_FILTERS … replace`);
    - `monthOutlook` opens Analytics for this month;
    - `accountMix` opens Home;
    - the bank rules open Bank Connect.
- **The page:** `Views.InsightsView` delegates to
  `Insights.renderPage`/`attachPage`, and the route is `#insights`.
  - The highlight is the top non-attention item, drawn as a split-bar chart
    (top three + rest) for top spending, income and accounts. It is never
    listed twice.
  - Tier 0 shows the starter card ("n of 5 entries so far", Add a
    transaction).
  - Locked rows say what each insight will tell (`insight.desc.<id>`) at
    tier 0. At tier ≥ 1 they show the need and a progress bar, since the
    needs differ.
  - With tier ≥ 1 and nothing applying, a quiet card ("Nothing stands out
    today") appears.
- **Large text:** `.insight-row` wraps. At 200 % text the figure takes the
  first line, the sentence the full width below it and the chevron sits at
  the end, in reading order (`.insight-text` basis 9rem,
  `overflow-wrap: anywhere`). Before this fix,
  the rem-sized figure column squeezed the sentence to ~70 px.
- **Tab:** a 5th `nav-item` (`data-view="insights"`, `lightbulb`,
  `nav.insights`). Each tab is 53 px wide on a 393 px phone.
- **Home:** `DashboardView` no longer renders or attaches the section. The
  old `.insights-section` / `.insight-card` styles are gone; the HG-7 CSS
  block sits at the end of `components.css`.
- **Strings:** the fragment keys were removed and about 45 whole-sentence keys
  added in all 5 languages, plus `nav.insights` = `insights.title` (the names are in §3.4). The other
  insights strings agree with the noun's gender (for example *les astuces …
  calculées*, *los consejos … calculados*).
- **Tests:**
  - unit: `insights.test.js` (rewritten, 22 tests); `bankConnectB4.test.js`
    and `escapeGuard.test.js` (now render `InsightsView`);
  - e2e: `insights.spec.js` (rewritten: tab, starter, keyboard, 2.4.11 focus
    clearance, 200 % reflow), `page_titles.spec.js` (adds `#insights`),
    `bank_connect.spec.js` (the bank insight on the page).

### P2 · Widget + tab order (2026-11-06)

- **Widget, `registry.insights`** (last in the Add-widget list; no seed, no
  migration). `widgets.js` delegates to `Insights.renderWidget` /
  `attachWidget`, so the page and the widget share one ranking.
  - Small: the top item (attention first). It shows the figure (with the
    arrow) and the headline clamped at 3 lines; the whole card opens the
    page.
  - Large: `Insights.top(items, 3)`, at most one item per catalogue family.
    Each rule now carries a `group` (bank, cashflow, spending, balance…),
    which is how the outlook and the income source never both show. Each row
    opens its own screen with its filters (`Insights.open`, shared with the
    page); "All insights" opens the page.
  - The rows leave the arrow out, so every figure fits the one 5.25rem column
    and the headlines line up. A figure never breaks mid-number; a longer one
    widens its own row.
  - Tier 0 shows the starter (head, bar, "n of 5 entries so far") in both
    sizes, and a tier with nothing to say shows the quiet card.
  - `autoHeight: 'large'` is new: only the large card grows
    (`.widget-card--auto`). The insights card's floor is the small height,
    so a starter or quiet card is not a tall empty box.
  - In edit mode a tap never follows a link. A preview card in the
    Add-widget sheet takes its links out of the tab order (`tabindex="-1"`).
  - Amounts mask on Home (`formatCurrency` → `isMoneyMasked`) and
    percentages stay.
- **Tab bar order** (Settings → Tab bar, under Appearance):
  - `state.navOrder` (`stackd_v1_navOrder`) holds the tabs after Home.
    `Store.NAV_TABS` is the default; `normalizeNavOrder` drops unknown ids
    and Home, keeps each id once and appends missing tabs in the default
    order. It is set by `SET_NAV_ORDER`, reset by `RESET_APP`, listed in
    `_reloadSlice`, synced across tabs and left out of the backup.
  - `Components.BottomNav.TABS` / `tabs()` build the bar. `main.js` rebuilds
    it when `BottomNav.key(state)` (language + order) changes. The app still
    opens on Home.
  - The Home row is locked first ("Always first · opens at start"). Every
    other row has a grip and Move up / Move down (44 × 44, disabled at the
    ends, labelled "Move {name} up/down").
  - After a move, focus returns to the moved row's button (the other one
    when it reached an end). `Components.Announcer` (one polite
    `#sr-announcer` live region outside `#router-view`, created before the
    first message) says "{name} is now in position {pos} of {total}". The
    count includes Home, as the list shows it.
  - Dragging the grip uses pointer events and stays DOM-only until release,
    then dispatches once.
  - "Restore the default order" shows only when the order differs.
- **Strings:** `navOrder.*` (7 keys) and `widget.insights.desc/all`, in all
  5 languages. The Romance languages phrase the move message as "Position 3
  sur 5 : {name}" so no participle has to agree with a tab name.
- **Tests:**
  - unit: `insights.test.js` (+10 widget tests), `navOrder.test.js` (new,
    11), `widgetsI18nGuard.test.js` (loads `insights.js`, so the widget's
    output is guarded), `homeWidgetsFifty.test.js` (ten types);
  - e2e: `insights.spec.js` (the widget from the gallery, its links,
    masking), `nav_order.spec.js` (new: keyboard reorder with focus and live
    region, 44 px targets, reset, a grip drag, reload).
