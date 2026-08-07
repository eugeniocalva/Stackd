# Debt Section Rebuild — Master Plan

> Working doc for the full rebuild of the debt/loan functionality (post v0.70).
> Any Claude session picking up a phase should read this file first, then the phase's
> acceptance criteria. Keep the phase checklist below up to date as work lands.

## Phase checklist

- [x] **Phase 1 — Loan engine** (`src/loan-engine.js` + unit tests, no UI) — done 2026-08-07, adversarially verified (see §6.7)
- [x] **Phase 2 — Store v2 + migration** (config-based loans slice, currency fix) — done 2026-08-07; legacy ADD_LOAN/UPDATE_LOAN payloads still accepted + legacy fields retained until Phase 3
- [ ] **Phase 3 — Simulator UI** (hub, simulator form, results + schedule)
- [ ] **Phase 4 — My Loans + integration** (promote flow, recurring-expense offer)
- [ ] **Phase 5 — Polish** (export/import, dead CSS, e2e refresh, docs)

---

## 1. Goal

Replace the current loan CRUD dashboard (`#debt`) with a proper loan **simulator +
tracker**, modeled on a reference iOS loan-calculator app but styled 100% in Stack'd's
existing design language:

1. **Hub** — pick a loan type to simulate (Mortgage / Personal loan / Installment plan),
   see saved simulations and tracked loans.
2. **Simulator** — full-featured form: amount, down payment (mortgage), duration,
   annual rate, first payment date, French/Italian amortization, first-installment
   interest-only (± duration extension), scheduled rate changes, early repayments
   (one-off/monthly, reduce-payment/reduce-duration), additional one-off/monthly fees.
3. **Results** — monthly payment, totals (interest, fees, grand total), last payment
   date, savings from early repayments, full amortization schedule (brief/detailed).
4. **Save** a simulation; **promote** it to *My Loans* (tracked, with paid/remaining
   progress derived from the real schedule).
5. On promote, **offer to create a recurring expense** for the monthly payment via the
   existing recurrence engine.

## 2. Current state (mapped 2026-08-07)

- `Views.DebtView` at `src/views.js:3697-4001` — plain CRUD list; the only math is an
  inline PMT preview (`views.js:3850-3856`) plus a **straight-line** (zero-interest)
  `Store.computeLoanRemainingBalance` (`store.js:2318-2336`). The two disagree.
- Store actions `ADD_LOAN`/`UPDATE_LOAN`/`DELETE_LOAN` at `src/store.js:1603-1645`;
  slice persisted under localStorage key **`stackd_v1_loans`** (must be migrated, users
  have data; no versioning exists).
- **Known bugs to kill:** DebtView always renders `$` regardless of the currency setting
  (compares ISO codes to symbols, `views.js:3719`, `:3952`); locale hardcoded `en-US`;
  `endDate` computed with overflowing `Date.setMonth()` (`views.js:3909`); undefined CSS
  var `--bg-tertiary` used at `views.js:3726/3747/3884`.
- The feature is an **island**: no links to transactions, accounts, analytics, or
  export/import. An earlier revision (git `2b5ce42`) had a simulator tab and a "Create
  Expense" bridge writing `sessionStorage['stackd_loan_prefill']` → `#add`; removed in
  `3976fb1`. The 60-month recurrence cap survives as `_capRecurrenceWindow`
  (`store.js:448-466`).
- Tests pinning current behavior: `tests/unit/debtView.test.js`,
  `tests/unit/store.test.js:109-195`, `tests/e2e/debt_simulator.spec.js` — all get
  rewritten in the phase that changes what they pin.
- Dead CSS from the removed tabbed simulator: `#tab-dashboard, #tab-simulator`
  (`src/styles/components.css:1564-1574`).

## 3. Navigation & header conventions (audit verdict)

The app has **two coexisting leave-a-screen conventions**, split by screen type (there
is no router back-stack — every back/close is a hardcoded `<a href="#route">`):

- **Drill-down/browse screens** → top-left `chevron-left` + *parent name* text link
  (CategoryDetailView `views.js:2219`, TagDetailView `views.js:2883`).
- **Form/task screens** → top-right **✕** in a 32px rounded square, navigating to the
  fixed parent (AddTransactionView `views.js:1376`, EditCategoryView `:2268`,
  EditAccountView `:3368`, TagsView `:2831`).
- Modals/bottom sheets → backdrop tap + swipe + footer Cancel (`components.js:175-198`).

**Rules for the new debt screens:**

| Screen | Family | Top-left | Top-right |
|---|---|---|---|
| Hub `#debt` | drill-down | `chevron-left` + "Dashboard" → `href="#dashboard"` (never `href="#"`) | — |
| Simulator form | form | — | ✕ → `#debt` |
| Results / loan detail | form | — | ✕ → `#debt` (+ `⋯` menu on saved items) |
| Sub-editors (rate change, early repayment, fee) | modal | `Components.Modal` bottom sheet, footer Save/Cancel | — |

Title sits **below** the back link on the hub (like CategoryDetail), not beside it.
For the ✕ use the literal `✕` character in the 32px rounded square (the pattern
AddTransactionView uses; note the app currently splits 2× literal ✕ vs 2× lucide `x` —
new code standardizes on the literal character, no hydration dependency).

## 4. Design language cheat sheet

Tokens in `src/styles/variables.css` (light `:root` :1-102, dark :104-157 — use tokens
only, both themes come free). Flat design, no gradients; depth = soft shadows + glass.

- Page: `.container` (max-width 600px) + `.animate-fade-in`; scroll container is
  `.view-container`.
- Titles: `.page-header-title` (Manrope, clamp 1.5-2rem); section labels:
  `.section-title` (xs, uppercase).
- Cards: `.card` (glass, radius 20px) / `.card card-elevated` (solid). Square tiles:
  `.wallet-card` family (160px, radius 28px, `--acc-color` accent bar) — use for the
  loan-type tiles.
- Lists: `.list-item` + `-icon/-content/-title/-subtitle/-value` (72px rows, 38px icon
  circle); flush variant `.list-item-flush` for in-card lists.
- Buttons: `.btn btn-primary` / `btn-secondary`; min-height 48px.
- Forms: `.form-group` > `.form-label` + `.form-control`; hero amounts:
  `.amount-input-group` > `.amount-input` (Manrope 4xl); toggles: `.toggle-switch`;
  segmented: `.chart-toggle-group` > `.chart-toggle-btn` (use for Brief|Detailed).
- Progress bar: 8px track, radius 4px — use `--bg-surface-sunken` for the track
  (**not** `--bg-tertiary`, which doesn't exist).
- Money display: always `Store.formatCurrency` / `Store.getCurrencySymbol`
  (`store.js:1815-1830`). Never a local formatter.
- Icons: `<i data-lucide="name">`; any NEW icon name must get an entry in
  `EMERGENCY_ICONS` (`src/main.js:7`, copied from `src/libs/lucide.js`) or it renders
  blank on native/`file://`. Call `window.StackdHydrateIcons()` in `attachEvents`.
- Every edited `src/*.js` needs its `?v=` cache-buster bumped in `index.html`;
  co-dependent files bump together.

## 5. Data model v2 + migration

One slice, same storage key `stackd_v1_loans`:

```js
loan = {
  id: string,                 // StackdDB.generateId()
  name: string,
  kind: 'sim' | 'active',     // saved simulation vs tracked loan (promote flips it)
  config: { /* LoanEngine input config, §6 — single source of truth */ },
  linkedSeriesId: string|null,// recurring-expense series created on promote (v: Phase 4)
  createdAt, updatedAt
}
```

**Everything else is derived** via `LoanEngine.simulate(config)` — no stored
`monthlyPayment`/`endDate`/`totalReimbursement` (the v1 fields that went stale).

**Migration (idempotent, at boot, pattern of `store.js:147-175`):** a record with a
`tan` field and no `config` is v1 → wrap it:
`kind:'active'`, `config = { type:'personal', principal:amount, duration:durationMonths,
durationUnit:'months', annualRate:tan, firstPaymentDate:startDate,
amortization:'french' }`. **Keep the legacy fields on the record** until Phase 3 removes
the old view (lets the existing DebtView keep rendering between phases). Phase 3 strips
them.

Store actions (Phase 2): keep `ADD_LOAN`/`UPDATE_LOAN`/`DELETE_LOAN` names (payloads
change to `{name, kind, config}`), add `PROMOTE_LOAN` (`sim → active`) and allow
`UPDATE_LOAN` to set `linkedSeriesId`.

## 6. LoanEngine spec (normative — includes all adversarial-review fixes)

`src/loan-engine.js` → `window.LoanEngine`. Pure, zero Stack'd dependencies (testable
standalone with the `executeFile` Vitest pattern). Script tag goes between
`utils/keyboard.js` and `store.js` in `index.html`.

### 6.1 Money & rounding

- Integer **cents** everywhere inside the engine (`…C` suffix). Boundary:
  `toCents(x) = Math.round(x * 100 + 1e-9)`.
- `centRound(x) = Math.round(x + 1e-9)` — **half-up is normative**: the calibration
  loan's first interest row is an exact float `.5` tie (37462.5) and half-up is what
  matches the reference (banker's rounding would give 374.62 and fail). Epsilon guards
  near-tie float products; claim scoped to balances < €100M.
- Exactly three rounding sites: `toCents` on input, the payment computation, per-period
  interest. Everything else is exact integer arithmetic.
- `annuityPaymentC(balC, r, n)`:
  - `r === 0` → `Math.floor(balC / n)` (**floor-then-absorb**: guarantees exactly `n`
    rows; final row absorbs the remainder upward). 1200€/11 → 10 × 109.09 + 109.10.
  - else → `centRound(balC * r / (1 - Math.pow(1 + r, -n)))` computed **cents-direct**.
- Monthly rate `r = annualRate / 100 / 12` (nominal, not effective).

### 6.2 Dates

`'YYYY-MM-DD'` strings only, **no `Date` objects** (repo rule — DST drift). Helpers
(all exported for tests): `parseYMD`, `formatYMD`, `daysInMonth` (Feb = 29 in leap
years: `(y%4==0 && y%100!=0) || y%400==0`), `addMonthsClamped(s, k, anchorDay)`.
Every schedule date derives **from the anchor**, never iterative stepping:
`date(i) = addMonthsClamped(firstPaymentDate, i, anchorDay)` with
`anchorDay = day(firstPaymentDate)` — so Jan 31 → Feb 28 → **Mar 31** (no 28-stickiness),
and leap Feb yields the 29th. Comparisons are plain string `<`/`>=`. All input dates
validated against `/^\d{4}-\d{2}-\d{2}$/` (unpadded dates break lexicographic compare).

### 6.3 Input config

```js
{
  type: 'mortgage'|'personal'|'installment',   // default 'personal'; engine-neutral,
                                               // the UI restricts fields per type
  principal: number,                           // > 0, required
  downPayment: number,                         // >= 0, < principal, default 0 (mortgage UI)
                                               // amortization runs on principal - downPayment
  duration: number,                            // int >= 1, required
  durationUnit: 'years'|'months',              // default 'years'; n in [1, 600] (§6.7)
  annualRate: number,                          // % in [0, 100); 0 allowed (installment)
  firstPaymentDate: 'YYYY-MM-DD',              // required; date of installment #1
                                               // (or of the IO installment if enabled)
  amortization: 'french'|'italian',            // default 'french' (rata costante);
                                               // italian = constant principal
  firstInstallmentInterestOnly: boolean,       // default false
  interestOnlyExtendsDuration: boolean,        // default true. true: IO row not counted,
                                               // n amortizing rows follow (+1 month).
                                               // false: IO consumes slot 1 → n-1 rows,
                                               // original end date kept (needs n >= 2)
  rateChanges: [{ annualRate,                  // % in [0, 100) — validated!
                  effectiveFrom: 'YYYY-MM-DD' }],  // sorted; same date → last wins
  earlyRepayments: [{ amount,                  // > 0
                  date: 'YYYY-MM-DD',          // one-off: when; monthly: start
                  frequency: 'once'|'monthly', // default 'once'
                  endDate: 'YYYY-MM-DD'|null,  // monthly only, optional stop date
                  mode: 'reducePayment'|'reduceDuration' }],  // default 'reduceDuration'
  additionalExpenses: [{ name, amount,         // >= 0; never touch amortization
                  frequency: 'once'|'monthly',
                  date }],                     // one-off only; default firstPaymentDate
  computeSavings: boolean                      // default true
}
```

### 6.4 Algorithm

Setup: validate; `n` from duration; `balC = toCents(principal - downPayment)`;
`N` = planned amortizing rows per the IO rules above; sort `rateChanges` and
`earlyRepayments` (by date, stable). Early repayments **snap to schedule slots**: the
first row whose date `>= er.date`; one dated during the IO period snaps to the first
amortizing row (documented: no principal reduction on the IO row itself); one dated
after the last planned row is ignored. Monthly ERs are active from their snap slot to
their `endDate` (if any).

**IO row** (if enabled), emitted before the loop at `firstPaymentDate`, index 0: apply
rate changes dated `<= firstPaymentDate`; `interestC = centRound(balC*r)`,
`principalC = 0`, `paymentC = interestC`, balance unchanged, event `interestOnly`.
Emitted even at 0% (0€ row keeps dates aligned).

**Main loop — `for k = 1 … N`, `break` when `balC === 0`.** At the top of row `k`
define `remaining = N - k + 1` (**inclusive of the row being processed** — pinned; the
off-by-one alternative silently mis-prices by ~2€/month). Strict per-row order:

1. **Rate change**: while next change `effectiveFrom <= date(k)` → update `r`
   (a change effective exactly on the due date governs that installment; whole-period
   repricing, no day-count pro-rata). If changed — french:
   `pmtC = annuityPaymentC(balC, r, remaining)`; italian: `prinShareC` untouched.
2. **Interest accrual** on the opening balance: `intC = centRound(balC * r)`.
   (**Bank-standard: interest before early repayment.** The reference app credits an
   ER against the same period's interest — borrower-favorable, doesn't match real
   statements. We accrue first; deliberate divergence, savings figures may differ
   slightly from the reference app.)
3. **Payment**: french `prinC = pmtC - intC`; italian `prinC = prinShareC`.
   **Final-row clamp: if `remaining === 1` OR `prinC >= balC` → `prinC = balC`**, row
   payment `= prinC + intC`, event `finalAdjusted`. (The clamp condition is the #1
   reviewer finding — without the `remaining === 1` arm, ordinary loans whose payment
   rounds down leave cents unpaid: e.g. 100,000€/4.05%/360 leaves 1.77€.) Then
   `balC -= prinC`.
4. **Early repayments** snapped to row `k`, in sorted order:
   `appliedC = min(toCents(amount), balC)`; `balC -= appliedC`; accumulate into the
   row's `extraPrincipalC`, event `earlyRepayment`.
   `reducePayment` → re-amortize over the rows *after* this one:
   `pmtC = annuityPaymentC(balC, r, remaining - 1)` (no-op if that's 0); italian
   `prinShareC = floor(balC / (remaining - 1))`. `reduceDuration` → keep payment; the
   `prinC >= balC` clamp ends the schedule early on its own.
5. Emit row `{index:k, date, paymentC, interestC, principalC, balanceC, annualRate,
   extraPrincipalC, events}`; stop when `balC === 0`.

**Totals**: integer sums. Invariant (assert): `Σ principalC + Σ extraPrincipalC ===
toCents(principal - downPayment)`. `totalPaidC = Σ paymentC + Σ extraPrincipalC`;
`totalExpensesC` = one-offs (counted even if dated past payoff — the user entered a
real cost) + monthly × emitted-row-count (IO row included; stops at payoff);
`grandTotalC = totalPaidC + totalExpensesC` (down payment excluded; UI may show it
added back). **Savings**: when ERs present and `computeSavings`, re-run once with
`earlyRepayments: []` → `{interestSavedC, monthsSaved, baseline…}`.

### 6.5 Output

```js
{ config, financedPrincipalC, downPaymentC, downPaymentPct, initialPaymentC,
  installmentCount, firstPaymentDate, lastPaymentDate,
  totalInterestC, totalPrincipalC, totalEarlyRepaymentsC, totalExpensesC,
  totalPaidC, grandTotalC, savings|null, schedule[] }
```

Brief schedule view = `{date, payment(+extra), balance}`; detailed adds
`{interest, principal}` — one row array feeds both.

### 6.6 Calibration fixtures (unit-test anchors, all verified by script)

- **French**: 111,000€ / 4.05% / 30y → payment **533.14**; rows 1-4 interest
  374.63 / 374.09 / 373.55 / 373.01, principal 158.51 / 159.05 / 159.59 / 160.13,
  balances 110,841.49 / 110,682.44 / 110,522.85 / 110,362.72; row 360 pays **529.79**;
  total interest **80,927.05**; final balance exactly 0.
- **Clamp regression**: 100,000€ / 4.05% / 360 must end at exactly 0 (fails without
  the `remaining === 1` arm — leaves 1.77€).
- **0%**: 1,200€ / 11m → 10 × 109.09 + 109.10, exactly 11 rows.
- **IO**: calibration loan, IO row = 374.63; don't-extend variant re-amortizes over
  359 → 533.90.
- **Rate change** @ row 180 → 5.00%: balance before 72,120.70, `remaining` = **181**,
  new payment **568.21**, still 360 rows, ends at 0.
- **Dates**: first payment 2026-01-31 → 2026-02-28 → 2026-03-31 → 2026-04-30;
  leap: 2028-02-29.
- ER fixtures: generate with the accrue-first convention at implementation time
  (reviewer's accrue-first run: 10,000€ ER @ row 61, reduceDuration → total interest
  65,630.51 vs 80,927.05 baseline).

### 6.7 Post-implementation amendments (normative — from the verification pass)

The implementation shipped with these refinements after a 3-agent verification
(line-by-line conformance, 11k-config property fuzz, JS bug hunt). They override
anything contradictory above:

1. **Validation additions**: financed principal (`principal - downPayment`) must be
   ≥ 1 cent (`E_DOWNPAYMENT` — a 0-cent loan used to crash with a raw `TypeError`);
   the three list fields must be arrays (`E_CONFIG`); `earlyRepayments[].amount`
   must be ≥ 1 cent (sub-cent amounts silently no-op'd); a `date` supplied on a
   *monthly* additional expense is validated then ignored; total months capped at
   **600** (was 1200).
2. **Sub-epsilon rates**: `annualRate` (or a rate change) below 1e-12 routes to the
   0% floor-then-absorb branch — `(1 + r) === 1` used to underflow the annuity
   denominator to an `Infinity` payment.
3. **Opening rate rule**: rate changes dated on/before the *first amortizing due
   date* define the loan's opening rate and the initial payment (standard `round`
   rule, no `rateChange` event). Only changes landing mid-schedule re-amortize.
4. **Ceiling re-amortization**: mid-loop recomputations (rate change,
   `reducePayment`) round the new payment **up** (`annuityPaymentCeilC`), not
   half-up. A payment rounded down half a cent amortizes slower than the plan it
   replaces, ballooning the final row and producing negative savings. Ceiling
   guarantees an extra repayment never lengthens the schedule. All calibration
   anchors are unaffected.
5. **`totalPrincipalC` semantics pinned**: it equals `Σ principalC + Σ
   extraPrincipalC` — always identically `financedPrincipalC`. Do NOT add
   `totalEarlyRepaymentsC` to it (double count).
6. **`installmentCount` includes the IO row** (index 0). UI copy must not present
   it as the contractual installment number for IO loans.
7. **Degenerate-regime caveat**: when the *exact* annuity payment sits within a
   fraction of a cent of pure interest (usury-level rates, or cent-scale
   principals over decades), cent quantization cannot track the contractual
   schedule and `savings` can come out negative (a monthly `reducePayment`
   re-spread genuinely gives back schedule progress). The engine flags this as
   `savings.degenerate: true`; **Phase 3 UI must check the flag** and show an
   explanatory message instead of a negative "saving". Money conservation
   (`Σ principal + Σ extra === financed`) held in every one of 11k fuzz configs
   regardless of regime.

## 7. Recurring-expense integration (Phase 4)

On **promote to My Loans** (and from a tracked loan's detail if not yet linked), offer
a bottom-sheet modal: *"Track the monthly payment automatically?"* → restore the old
bridge pattern: write a prefill payload to `sessionStorage['stackd_loan_prefill']` and
navigate to `#add` (user picks account/category and confirms) — amount = current
monthly payment, monthly recurrence anchored on the payment day, end date = last
payment date. The existing `_capRecurrenceWindow` (`store.js:448-466`) caps series at
60 months — keep, and surface the existing "Recurrence Capped" messaging for long
loans. On save, store the created `seriesId` back onto the loan (`linkedSeriesId`).
Consider seeding a `cat_debt` default category ("Loan payment") — append-if-missing
like the other DEFAULT_CATEGORIES migrations.

## 8. Phases — scope & acceptance criteria

### Phase 1 — Loan engine (no UI)
- `src/loan-engine.js` per §6; script tag + `?v=1` in `index.html`.
- `tests/unit/loan-engine.test.js` (executeFile pattern, bare `window`): every §6.6
  fixture, plus validation errors, ER clamp/full-payoff, monthly ER with endDate,
  italian amortization, invariant assertion.
- Acceptance: `npm run test` green; existing tests untouched and green; no other file
  edited except `index.html` script tag.

### Phase 2 — Store v2 + migration
- Migration §5 at boot (idempotent; legacy fields retained). New action payloads,
  `PROMOTE_LOAN`, `linkedSeriesId` support. `RESET_APP` already covers loans.
- Fix the currency bug NOW if trivial (old view swaps `formatCurr` for
  `Store.formatCurrency`) or defer to Phase 3 with the view replacement.
- Update `tests/unit/store.test.js` loan block for v2 shapes; add migration tests
  (v1 record in localStorage → boots to v2 with config).
- Acceptance: old DebtView still renders (legacy fields intact); tests green.

### Phase 3 — Simulator UI
- Replace `Views.DebtView` with: **Hub** (`#debt`) — back-link per §3, title "Loans",
  2-col type tiles (Mortgage/`building-2`?, Personal/`wallet`, Installment/`percent`),
  "Simulations" section (saved sims as `.list-item`s: name, key figures, date),
  "My Loans" section (Phase 4 fills it; empty-state until then).
- **Simulator form** (`#debt-sim?type=…&id=…`): ✕ top-right → `#debt`; hero amount;
  basics card; collapsible "Details" card (first payment date, amortization segmented,
  IO toggles with the info tooltip, rate-changes list + add, early-repayments list +
  add, fees list + add — each add opens a `Components.Modal` sheet); sticky
  "Calculate" `.btn btn-primary`.
- **Results** (`#debt-results`): summary rows, savings block, Brief|Detailed schedule
  (chart-toggle segmented), actions: Save simulation / Add to My Loans; saved sims
  reopen here with ⋯ (Edit / Promote / Delete).
- Routes added to `router.js`; views wired in `main.js` switch; icons through the
  EMERGENCY_ICONS checklist; `?v=` bumps for every touched JS file.
- Rewrite `tests/unit/debtView.test.js` and the hub half of
  `tests/e2e/debt_simulator.spec.js`.
- Acceptance: full simulate→save→reopen loop works in the browser preview (verify with
  the preview tools, screenshot proof); dark + light themes; currency setting
  respected; lint + tests green.

### Phase 4 — My Loans + integration
- Hub "My Loans" cards: name, monthly payment, progress bar (paid vs remaining derived
  from `schedule` × today — replaces `computeLoanRemainingBalance`; delete it and its
  pinned tests). Loan detail = results view + progress + next-payment row + "Create
  recurring expense" when `linkedSeriesId` is null.
- Promote flow + recurring-expense offer per §7.
- e2e: promote → prefilled `#add` → recurring series created (capped case included).
- Acceptance: end-to-end flow verified in preview; series edit/delete keeps working
  per v0.67 semantics (regression: recurring specs green).

### Phase 5 — Polish
- Include `loans` in export (`src/export.js`) and import (`src/import.js`).
- Remove dead CSS `components.css:1564-1574`; remove `scratch/` debt leftovers if the
  user agrees; sweep for `--bg-tertiary`.
- Bump app version in `index.html` `<title>`; final full test run + lint.

## 9. Open decisions

| # | Decision | Status |
|---|---|---|
| 1 | Hub layout: **single hub, stacked sections** (tiles → Simulations → My Loans) | **DECIDED** (user, 2026-08-07) |
| 2 | Promote → **prefilled `#add`** via `sessionStorage['stackd_loan_prefill']` | **DECIDED** (user, 2026-08-07) |
| 3 | ER interest convention: bank-standard accrue-first | **DECIDED** (§6.4.2) |
| 4 | ✕ literal char for new screens | **DECIDED** (§3) |
| 5 | Keep 60-month recurrence cap for loan series | **DECIDED** (§7) |
