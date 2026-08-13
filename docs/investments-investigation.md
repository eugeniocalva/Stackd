# Investigation — Stocks & Portfolio tracking

**STATUS: INVESTIGATION ONLY. No code written.** This document records what
the codebase actually supports today, what the requested feature set costs,
and the decisions that must be made before a line of implementation code is
written. Read `CLAUDE.md` first for the architecture; this doc assumes it.

Investigated 2026-08-13 against v0.92 (commit `ec669e1`).

---

## 1. Verdict up front

The feature is buildable and the codebase is in good shape for it — the
loans rebuild (v0.71) and the widget system (v0.72) both established exactly
the patterns a portfolio feature needs: a config-driven slice, a pure
derivation engine, a registry, and CSV round-tripping.

**But two of the fifteen requested items are not incremental work — they
change what the app *is*:**

1. **Any live market-data integration contradicts the shipped Terms &
   Privacy Policy**, which is not a marketing page but a substantive
   document with a GDPR position. This is a product/legal decision, not an
   engineering one. §2.
2. **Multi-currency is not optional once you hold a foreign-listed asset**,
   and the store has no concept of an amount-in-a-currency anywhere. §4.3.

Everything else — the holdings ledger, the math engine, the portfolio page,
the CRUD, the sell workflow, CSV export — is ordinary work that fits the
existing patterns cleanly.

**Recommendation: split the feature in two.** Ship a complete, useful,
zero-network portfolio tracker first (manual price entry). Add live pricing
afterwards as an explicitly opt-in, off-by-default layer. This de-risks the
legal question, gets a working feature out in a third of the time, and means
the price layer can be dropped entirely without wasting the rest of the work.

---

## 2. The blocker: the shipped privacy policy

`src/i18n/en.js` (P8f, shipped v0.91) contains, in the app's own Terms &
Privacy Policy screen, statements including:

| Key | Claim |
|---|---|
| `terms.privacy.short.d` | "…does not collect, transmit, sell or share any personal data. There is nothing to opt out of, because **nothing ever leaves your device**." |
| `terms.privacy.whatStored.d` | "…never sent to a server — the app works **fully offline and has no backend**." |
| `terms.privacy.whatNot.d` | "No third-party data sharing." |
| `terms.privacy.gdpr.d` | "**no data is transferred** (within or outside the EU/EEA), and **no consent banner is required** because there is nothing to consent to." |
| `terms.privacy.changes.d` | "If a future version ever changes how data is handled… this policy **will be updated first** and the change **clearly announced in the app** before anything leaves your device." |

These are translated into five languages and shipped.

### What a market-data call actually discloses

It is tempting to treat this as "just fetching public prices" — it isn't.
A quote request sends **the exact list of tickers the user owns**, on a
recurring schedule, tied to an IP address and (for keyed APIs) an API key.
The set of symbols someone holds is financial profile data. Quantity and
cost basis stay local, but composition does not. That is a third-party
transfer, and the GDPR paragraph above is a specific claim it falsifies.

### The API-key problem makes it worse

There is no backend, so a shipped key would sit in the APK bundle in
plaintext, extractable by anyone. That means:

- The key gets scraped and the free tier burns out for every user at once.
- Or you stand up a proxy — which creates the backend the policy denies,
  and routes every user's holdings through a server you control. This is
  strictly the *worst* privacy option and should be ruled out.

### The three honest paths

| Path | Privacy impact | Policy change | Verdict |
|---|---|---|---|
| **A. Manual prices only** | None. Stays fully offline. | None needed. | ✅ Ship this first regardless |
| **B. Opt-in BYOK** — user pastes their own API key, feature off by default, in-app disclosure at enable time | Only for users who opt in, with informed consent | Add an "optional online features" clause; honours the `terms.privacy.changes.d` promise | ✅ Recommended for live pricing |
| **C. Bundled key or own proxy** | Every user, silently | Guts the GDPR position | ❌ Do not |

Path B is also the only one that satisfies the app's *own written commitment*
about how such a change gets made. If live pricing ships, the policy update
and the in-app announcement are part of the work, not a follow-up.

---

## 3. What the codebase makes easy

Verified, not assumed:

- **`INTERNET` permission is already in the Android manifest.** No native
  permission work needed.
- **`CapacitorHttp` can patch `fetch`/`XHR` to native**, bypassing CORS on
  device entirely — enabled with `plugins.CapacitorHttp.enabled: true` in
  `capacitor.config.json`. It ships in `@capacitor/core` (the project is on
  v6). This solves the CORS problem *on Android only*; the dev server and
  any browser use still need a CORS-enabled provider.
- **The async-into-sync-render problem is already solved by the store.**
  Views are synchronous string builders, but `dispatch → emit → wholesale
  re-render` means the pattern is just: fetch resolves → `dispatch('SET_QUOTES')`
  → view re-renders with fresh data in `state`. No new plumbing.
- **`export.js` already has the exact precedent** for a slice that doesn't
  flatten into columns: `LOAN_HEADERS` carries readable columns *plus* a
  `Config` JSON column that the importer actually trusts. Holdings lots can
  use the same shape.
- **`_DebtShared` + `LoanEngine`** is the model for a pure `PortfolioEngine`:
  no dependencies on other globals, integer cents, `'YYYY-MM-DD'` string
  date math, fully unit-testable.
- **The widget registry** means a portfolio widget is a registry entry, not a
  `DashboardView` edit.
- **Swipe infrastructure exists** (`components.js` — transaction rows, modal
  dismiss), so item 13 has prior art to copy rather than invent.
- **`loan-engine.test.js` / `loanCsvRoundTrip.test.js`** are directly
  reusable test templates.

---

## 4. What the codebase makes hard

### 4.1 Balances are derived, and everything depends on that

`getAccountBalance` / `getGlobalBalance` / `getBalanceAtDate` reduce over
`state.transactions`. Analytics, budgets, the dashboard chart, the forecast,
and Insights all read through them.

**Folding market value into those functions would silently move every number
in the app.** A budget "remaining" figure that swings with the S&P is wrong.
Investments must be a *parallel* quantity that only specific surfaces
(Net Worth, the portfolio page, the investment Analytics tab) combine with
cash — never a term inside `getBalanceAtDate`.

This directly shapes item 13 (swipe between Net Worth / Cash / Investments):
"Cash" is today's `getGlobalBalance()` unchanged, "Investments" is
`PortfolioEngine.totalValue()`, "Net Worth" is the sum computed at the view
layer.

### 4.2 The holdings ↔ cash coupling

You asked for sell to "deduct quantity and allocate cash back to a wallet",
which implies buy should symmetrically deduct cash. Two models:

- **Separate ledger** — holdings live in `stackd_v1_holdings`, untouched by
  transactions. Clean, zero disruption, but buying stock doesn't reduce your
  cash balance, which will read as a bug.
- **Linked ledger** *(recommended)* — the lot record is the source of truth
  for quantity and cost basis, and each buy/sell *optionally* creates a
  linked transaction pair. This is exactly the `linkedSeriesId` pattern from
  loans, including its read-through behaviour: `getLoanLinkedTransactions`
  means deleting the series un-tracks the loan rather than corrupting it.
  Copy that contract — deleting the linked transaction must degrade the lot
  gracefully, not orphan it.

The `Investment` account type already exists in `Store.ACCOUNT_TYPES`, and
`cat_investments` already exists in `DEFAULT_CATEGORIES`. Both are usable
anchors.

### 4.3 Currency — the genuinely invasive part

The app has **one global currency**, a five-entry symbol map
(`getCurrencySymbol`: USD/EUR/JPY/GBP/CNY), and `formatCurrency(amount)`
takes a bare number. Nothing anywhere carries a currency tag.

The moment a EUR-configured user holds `AAPL`, you need:

- a currency on the lot and on the quote,
- an FX rate slice with its own staleness handling (item 4),
- a decision on **which** rate applies to cost basis: the rate at purchase
  (correct — it's what you actually paid) or today's rate (wrong, but
  simpler). Getting this wrong makes P/L quietly incorrect for every foreign
  holding, in a way that looks plausible.
- `getCurrencySymbol` extended, or replaced with `Intl.NumberFormat`'s
  `style: 'currency'`.

Note that FX is a *second* network dependency with its own provider, and it
is required even in an otherwise-manual-price build if you allow foreign
assets. **Constraining v1 to the app's own currency removes this entire
axis** and is the single biggest scope lever available.

### 4.4 localStorage headroom

Everything is `localStorage`, and `StackdDB.save` rewrites the whole slice
as one JSON string on every write. A naive daily-bars cache (20 tickers × 5
years ≈ 25k points) will approach the ~5 MB origin quota and make every
write O(entire history).

Constraint for the cache design: **store latest quote + a bounded sparse
series** (e.g. one point per week, capped at 2 years), not raw daily bars.
`StackdDB.save` returns `false` on quota failure — currently nothing checks
the return value anywhere, which is fine for small slices and not fine here.

### 4.5 Corporate actions

A price feed returns prices, not history. A 4:1 split makes a holding's P/L
crater by 75% overnight unless the lot is adjusted. Dividends are missing
income. Neither is solvable from a quote endpoint alone.

This is worth naming as an explicit **non-goal for v1** with a visible caveat
in the UI, rather than discovering it as a bug report.

### 4.6 i18n cost is real and enforced

816 keys × 5 dictionaries today, and `tests/unit/i18n.test.js` **fails the
build** on a missing key, a placeholder mismatch, or a half-defined plural.
A feature this size adds an estimated 120–180 keys, i.e. **600–900 new
dictionary entries**. Budget this per phase — bolting it on at the end is
how the last phase doubles.

Also: any structure that feeds `t()` at render time (a provider registry, a
tab definition list) must expose a **getter**, or it freezes in the boot
language.

### 4.7 No network test infrastructure exists

Unit tests execute `src/*.js` via `new Function(...)` against a mock
`window`. There is no fetch mock, no fixture layer, no offline-simulation
harness. Whatever fetch layer gets built must take an **injectable
transport** so tests never touch the network — decide this at design time,
because retrofitting it is painful.

---

## 5. Triage of the fifteen requested items

**Legend:** 🟢 fits existing patterns · 🟡 needs a design decision ·
🔴 blocked on §2 / §4.3

| # | Item | | Notes |
|---|---|---|---|
| 1 | "Add Asset" in FAB → modal | 🟡 | Modal itself is trivial. But the FAB menu is a 2×2 grid + one full-width row; a 5th tile needs a layout call. Ticker entry without search (item 8) means free-text — needs validation rules. |
| 2 | Portfolio page | 🟢 | New route + view module. Follows `#debt` / `DebtHubView` exactly. |
| 3 | Live price API | 🔴 | §2. Also: every viable free provider needs a key; free tiers are tight (tens of calls/day to a few hundred/month — verify current limits at build time, they change often). |
| 4 | FX rate caching | 🔴 | §4.3. Needed only if foreign-currency assets are in scope. |
| 5 | Background fetch/cache layer | 🟡 | "Background" is misleading — there is no service worker and Capacitor won't run JS when the app is closed. Realistically: fetch on app foreground, throttled, with a staleness window. |
| 6 | Portfolio math engine | 🟢 | Pure module, `LoanEngine` template. **Must decide FIFO vs average cost** — affects P/L on partial sells and is tax-adjacent (add a "not tax advice" caveat). |
| 7 | Downtime UI / stale-price timestamp | 🟢 | Good design instinct. Note the store's deliberate local-time, noon-anchored string date math — do not reintroduce `new Date('YYYY-MM-DD')` round-trips for the timestamp. |
| 8 | Company-name → ticker search | 🔴 | Same §2 problem, and *worse*: it transmits free-text queries as the user types. Needs debounce + explicit disclosure. |
| 9 | Edit / delete asset | 🟢 | Standard CRUD. Needs the loans-style guard for a lot with linked transactions. |
| 10 | Sell workflow | 🟡 | Core of the feature. Depends entirely on the §4.2 model choice and the §6 cost-basis choice. |
| 11 | Holdings list view | 🟢 | Part of item 2. |
| 12 | Wallets-carousel summary card | 🟢 | `DashboardView` renders wallet cards from `state.accounts` in a fixed sort; the summary card is a prepended tile alongside the existing `btn-add-wallet-card`. |
| 13 | Swipe top balance (Net Worth/Cash/Investments) | 🟡 | Swipe prior art exists. Needs a decision on whether the selection persists across sessions (`SET_ANALYTICS_BALANCE_MODE` is the precedent for a persisted view toggle). |
| 14 | Analytics tabs | 🟡 | `AnalyticsView.render` is one large function; tabs mean splitting it. **Chart-leak trap:** instances must be tracked by id and disposed on tab switch — same bug class as `Widgets._charts`. |
| 15 | CSV export of holdings + history | 🟢 | `exportLoans` is the template, including the JSON-column trick. Must also extend `import.js` (`isLoanRows`-style shape routing) and `RESET_APP`. |

---

## 6. Decisions needed before Phase 1

These are yours to make; my recommendation is marked.

1. **Live pricing** — Manual only / opt-in BYOK ✅ / bundled key.
2. **Currency scope** — app-currency assets only ✅ for v1 / full multi-currency.
3. **Ledger model** — separate holdings ledger / **linked to transactions ✅**
   (loans `linkedSeriesId` pattern).
4. **Cost basis** — **average cost ✅** (simpler, matches most consumer apps)
   / FIFO (tax-correct in more jurisdictions, more state).
5. **Asset classes** — stocks & ETFs only ✅ / include crypto (different
   providers, 24/7 pricing, 8-decimal quantities).
6. **Corporate actions** — explicit non-goal for v1 ✅, with a UI caveat.

---

## 7. Proposed phasing

Each phase is independently shippable and independently useful. Phases 1–4
involve **zero network code** and no policy change.

| Phase | Scope | Items |
|---|---|---|
| **P1 — Ledger & engine** | `stackd_v1_holdings` slice, lot record shape, boot migration hook, `PortfolioEngine` (pure: total value, abs/% P/L, cost basis), unit tests. No UI. | 6 |
| **P2 — CRUD & routes** | Add-asset modal, `#portfolio` route + view, holdings list, edit/delete, manual price entry. | 1, 2, 9, 11 |
| **P3 — Cash coupling** | Buy/sell workflows, linked transactions, cash allocation back to a wallet, delete/unlink degradation. | 10 |
| **P4 — Surfaces** | Wallets summary card, Net Worth/Cash/Investments swipe, Analytics tabs, portfolio widget, CSV export + import + `RESET_APP`. | 12, 13, 14, 15 |
| **P5 — Live pricing** *(gated on §2)* | Provider adapter behind an injectable transport, BYOK settings screen, quote + FX cache with bounded history, staleness UI, symbol search, **policy update + in-app disclosure**. | 3, 4, 5, 7, 8 |

i18n keys are added **within each phase**, not deferred.

Rough weight: P1–P4 together are comparable to the v0.71 debt rebuild. P5
alone is comparable again, most of it in the cache/staleness/error-state
layer rather than the fetch call itself.

---

## 8. Non-negotiables (carried from house rules)

- **Cache-busting:** every `src/*.js` edit bumps its `?v=` in `index.html`;
  co-dependent files bump together.
- **Load order** is dependency order. A `portfolio-engine.js` goes beside
  `loan-engine.js` (before `store.js`); a `market.js` fetch layer goes after
  `store.js`.
- **Never translate stored data.** Ticker symbols, currency codes and CSV
  headers stay as-is on disk; only labels are localized.
- **Widgets are month-to-date** — `Widgets._monthToDateFilters` if a
  portfolio widget touches `getFilteredTransactions`.
- **Charts** mount via `Widgets._mountChart`, never `new Chart`.
- **Landing work:** verify, then ask before committing. One commit per
  phase, `<title>` version bumped.
