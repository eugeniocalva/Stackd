# Bank Connect — client UX spec & build plan

> Status: **B2 SHIPPED 2026-09-06 (v1.05); B1 broker BUILT + on staging 2026-09-07 with Enable Banking (GoCardless closed, §11) — next: Enable Banking app registration, smoke, then B3.** See §9–§11.
> Companion to `docs/bank-connect-plan.md`, which holds the architecture and
> the §10 decisions (all SETTLED — nothing here reopens them). That document
> says what the broker does; this one says what the USER sees, in what
> order it is built, and which files it touches. Cold-start order: read
> `docs/bank-import-plan.md` §3f–§7a (the pipeline every fetch flows into),
> then `docs/bank-connect-plan.md`, then this file.
>
> Reference material: a screen walk-through of **MoneyStats** (Tennstedt
> Software GmbH), a competitor selling the same GoCardless-backed feature,
> reviewed on 2026-09-06 in Italian. §1 records what it does and what
> Stack'd adopts, adapts or drops. Open questions for the user are in §8.

## 0. Step-0 status (2026-09-06)

| Item (from architecture plan §9 step 0) | Status |
|---|---|
| Domain | **Done** — `stackdplatform.com` bought and on Cloudflare 2026-09-05 (site on Pages). |
| Android `applicationId` → `com.stackd.finance` | **Done** — commit `6f17b07`, 2026-09-04. |
| Aggregator account | **Changed 2026-09-07 (§11):** GoCardless Bank Account Data is closed to new sign-ups (the existing GoCardless login is the payments product). Now **Enable Banking**: sandbox application registered by the user, `EB_APP_ID` var + `EB_PRIVATE_KEY` secret. Production needs a contract + company KYB (or restricted mode). |
| Store subscription products | **Open** — needs Play Console and App Store Connect (Apple Developer enrollment is still pending per the launch checklist). Blocks B5 only. |
| Broker host | **Staging live:** `api-staging.stackdplatform.com` (Worker custom domain; `workers.dev` is blocked on the developer's network — TLS alert for the whole domain, `wrangler tail` included). Production: `api.stackdplatform.com` (D-C11). Both `.well-known` files are served by the broker host. |

## 1. The reference app, screen by screen

What MoneyStats shows (Settings → "Bank data" → "Online banking"):

1. **Settings section "Bank data"** grouping four rows, each a title plus a
   one-line description and a chevron: Online banking, Sync (iCloud),
   Import & export, Backup.
2. **Online banking hub:** a master toggle "Online banking", a "Settings"
   row, an empty body with a dimmed "powered by GoCardless" wordmark, and a
   full-width bottom CTA "Add new bank". With the toggle off the rows are
   greyed out; flipping it on without a subscription immediately pops a
   sheet "Online banking — View in-app purchases / Later".
3. **Bank settings sheet** (X / ✓ header): User ID ("default"),
   Subscription status ("disabled"), Transaction history (dropdown,
   "Maximum"), Validity duration (dropdown, "180 days"), Import start
   (date + time), "Automatic classification" toggle (keyword tags →
   categories), "Import pending transactions" toggle, and a "Restore
   subscription" button.
4. **In-app purchases:** two tabs (One-time purchases / Subscription
   plans); a "Single bank connection" card (7-day trial, then €2.99/month
   or €29.99/year) and a "Multi bank connection" card (up to 3 banks,
   €4.99/month or €49.99/year), each with "More details" and a white
   subscribe button; "Is your bank supported? — Check now"; "Already
   purchased? — Restore purchases"; the store's auto-renewal note; a
   "Terms of use & Privacy" link.
5. **Legal:** a long terms page that opens with a data-protection promise.

### What Stack'd takes from it

| Pattern | Verdict | Reasoning |
|---|---|---|
| "Bank data" settings section with described rows | **Adopt, adapted.** Rename the current *Data Import* section to *Bank data* and give it two rows: *Online banking* (new) and *Import bank statement* (the U1 rename). Export stays where it is. | The description line is what makes the feature discoverable; the import-UX plan already identified the buried entry point. |
| Master toggle on the hub | **Adopt, repurposed as the network consent switch.** Off by default; off means the app makes ZERO calls to the broker. | Turns the privacy story into a control the user can see: "local by default" is literally a switch. |
| Sheet nagging for a purchase the moment the toggle flips | **Drop.** Toggle → disclosure sheet → bank picker; the paywall appears only when the user taps *Connect* on a chosen bank. | Nobody should pay before knowing their bank is supported, and consent must precede commerce. |
| Bank settings sheet | **Adopt, trimmed.** Keep: history depth, consent validity, import-from date, subscription status, restore, a support id. Drop: "User ID: default" (meaningless), auto-classification toggle (v1.01 rules already run in every preview), pending toggle (D-C4: booked only), time-of-day on the start date. | Every kept field maps to a real GoCardless agreement parameter or a real broker fact. |
| Two tiers, one-time purchases, 7-day trial | **Partially.** No trial and no one-time products (D-C3). Tier count is D-C9; recommendation is ONE product. | D-C3 settled the billing model; tiering was not decided. |
| "Is your bank supported? Check now" before buying | **Adopt, stronger:** the bank picker itself sits before the paywall, and the paywall names the chosen bank ("Works with Intesa Sanpaolo"). | The institutions endpoint is unauthenticated and free, so there is no reason to gate the search. |
| "powered by GoCardless" wordmark | **Adopt** (text line, no logo asset). | Names the recipient of the data — a transparency requirement under C4, and a trust line. |
| Store auto-renewal note + Terms link on the paywall | **Adopt.** | Both stores reject subscription screens without them. |
| Sync (iCloud) row | **Out of scope.** Not part of this feature. | — |

## 2. Information architecture

```
#settings ─ Bank data ─ Online banking ──► #bank-connect (hub)
                                             ├─ toggle (off → on): BankDisclosureModal
                                             ├─ Settings row: BankSettingsModal (sheet, not a route)
                                             ├─ connection card: Refresh now / Manage / Disconnect
                                             └─ Add a bank ──► #bank-connect-add (picker)
                                                                └─ Connect ──► PaywallModal (if not entitled)
                                                                              └─ system browser (bank SCA)
                                                                                  └─ App Link return ──► #bank-connect-map?ref=
                                                                                                          └─ Import ──► #import-preview (existing)
```

Three new routes, three new modals, one new global. The whole fetch side
reuses `#import-preview` and everything behind it unchanged.

## 3. Screen specifications

### 3.1 Settings entry (OthersView)

Section title *Bank data* (was *Data Import*). Row 1: icon `landmark`,
title *Online banking*, description *Connect your bank and import your
latest transactions automatically.*, chevron → `#bank-connect`. When
enabled, the description is replaced by a status line: *2 banks · synced
3 h ago* / *Consent expired for Fineco* / *Subscription needed*. Row 2:
the existing file import, renamed per import-UX D5. On the web build
before C5 the row still renders, with the description *Available in the
mobile app* and a disabled chevron.

### 3.2 Hub `#bank-connect` (BankConnectHubView)

Header: back, title *Online banking*, no `+` in the header (the bottom CTA
is the single add affordance — one fewer thing to explain).

Top card: toggle row *Online banking* + row *Settings* (chevron, opens
3.9). Below it, one of four states:

| State | Body | Bottom CTA |
|---|---|---|
| Toggle OFF (default) | Explainer card: what it does, *Nothing is fetched while this is off. Statement import always works without it.* Footer line *Powered by GoCardless*. | *Add a bank*, disabled |
| ON, no connections | Empty card *No banks connected yet* + the same footer | *Add a bank* |
| ON, connections | One card per connection (anatomy below) | *Add another bank* (hidden at the per-owner cap) |
| Web build before C5 | *Bank Connect works in the mobile app for now.* | none |

Connection card anatomy: bank logo or initials tile + institution name;
one row per linked bank account *•••• 1234 → Main checking* (IBAN tail,
arrow, Stack'd account name, currency if it differs from the app default);
*Last synced 3 h ago* / *Never synced*; a status chip: **Active** ·
**Expires in 12 days** (≤ 14 days) · **Expired — reconnect** ·
**Subscription needed** · **Paused** (toggle off). Actions: *Refresh now*
(primary, disabled while a refresh is in flight or the daily quota is
spent — *Try again tomorrow*), *Manage* (sheet: remap accounts, consent
dates, history limit, *Disconnect* in the danger style).

Turning the toggle OFF with connections present asks *Pause online
banking?* — *Your banks stay connected; nothing is fetched until you turn
it back on. To remove a bank's access, disconnect it from its card.*
Pausing never revokes anything at GoCardless.

### 3.3 Disclosure sheet (BankDisclosureModal)

Shown the first time the toggle goes on (and again whenever
`terms.updatedDate` moves). Consent-style, not a wall of text: title *Before
you connect a bank*; four short points — (1) Stack'd opens your bank's own
login page; your credentials never pass through Stack'd; (2) transactions
travel from GoCardless through the Stack'd server to this device and are
**not stored** on the server; (3) access lasts up to 180 days, then the
bank asks you to confirm again; (4) you review every import before it is
saved, and you can disconnect at any time. Links: *Terms* and *Privacy*
(the in-app pages). Buttons: *Continue* / *Not now* (reverts the toggle).
Persists `bankConnect.consentAt`.

### 3.4 Bank picker `#bank-connect-add` (BankPickerView)

Country select (pre-filled from `Store.getLocale()` region, otherwise the
account currency's country), search box, list of institutions from
`GET /v1/institutions?country=` (cached 24 h in the broker, in memory in
the client). Each row: logo, name, small line *Up to 730 days of history ·
consent 180 days* from `transaction_total_days` /
`max_access_valid_for_days`. Tapping a row selects it and enables the
bottom CTA *Connect {bank}*. Empty search: *Can't find your bank? Its
statements can still be imported from a file.* → `#settings`.

The CTA branches: entitled → 3.6; not entitled → 3.5.

### 3.5 Paywall (PaywallModal)

Full-height sheet. Title *Bank Connect*; one line naming the chosen bank
(*Works with {bank}*) when arrived from the picker. Three bullets:
automatic import of booked transactions via GoCardless · up to {n} banks
· you review every import before it is saved. Price options come from
the store (`monthly` / `yearly`, yearly shown with the per-month
equivalent). Buttons: *Subscribe* (store sheet), *Restore purchase*.
Footer: the store's auto-renewal note (the store-required wording, one
key per store), links *Terms* · *Privacy*, and the honesty line *Bank
Connect is optional — statement import stays free.* No trial, no
one-time products, no "Later" nag: closing returns to the picker with the
selection kept.

Entitlement resolution: purchase/restore → receipt →
`POST /v1/entitlement/verify` → `{active, expiresAt}` cached in
`bankConnect.entitlement` → the CTA re-evaluates. Any 402 from the broker
later re-opens this sheet with the reason line *Your subscription ended
on {date}* / grace copy *Refreshing stops on {date} unless you renew*.

### 3.6 Bank hand-off and return (ConnectWaitingModal)

`POST /v1/connect/start` with country, institution, the defaults from 3.9
(`historyDays` clamped to the institution limit, `validityDays` clamped to
its max) → `bankRedirectUrl` opened in the system browser
(`@capacitor/browser`; plain navigation on web). Meanwhile the app shows a
non-dismissable-by-tap sheet *Waiting for {bank}…* with *Cancel* (which
deletes the requisition via `DELETE /v1/connections/:ref`). Return arrives
through the App Link (`appUrlOpen` in main.js → `BankConnect.handleReturn`),
which closes the browser, polls `GET /v1/connect/status?ref=` up to ~30 s,
and routes to 3.7 on `LN`. Requisition `RJ`/`UA`/`EX` show one error sheet
each: *Your bank declined the connection* / *You cancelled at the bank* /
*The link expired — start again*, all with *Try again*.

If the app is opened cold from the App Link (process was killed while in
the browser), the pending `ref` must survive: keep it in
`bankConnect.pendingRef` so `handleReturn` can resume.

### 3.7 Account mapping `#bank-connect-map?ref=` (BankMapView)

One row per bank account from `/connect/status`: *•••• 1234 · EUR ·
balance 1 234,56*. Each has a picker: an existing Stack'd account (default:
the first account with a matching currency and no other connection, if any)
or *Create "{bank} •••• 1234"* (type `checking`, currency from the API — the
v1.02 per-account currency slot). A bank account whose currency differs
from the chosen Stack'd account is refused with the v1.02 currency-guard
wording. Accounts can be left *Skip*ped. CTA *Import transactions* saves
the connection (`ADD_BANK_CONNECTION`) and starts the first fetch.

### 3.8 First fetch → preview

`BankConnect.fetchStatement(connection, account, dateFrom)` → normalizer →
`Views._ImportShared.startStatement(statement, '{bank} •••• 1234', state)`
→ `#import-preview` exactly as a file import: category rules, match/link,
transfer pairing, reconciliation against the API balance as
`closingBalance`. `dateFrom` per D-C8: `today − historyDays`, clamped to
the institution limit, and never earlier than the day after the mapped
account's newest imported row (the preview header says *Showing
transactions since {date}* with a *Widen* link that opens 3.9's
import-from field for this run). The U2 success modal is the landing
surface, with its *View transactions* deep link — U2 lands before B3.

### 3.9 Bank settings sheet (BankSettingsModal)

X / ✓ header like the reference. Fields:

| Field | Values | Backing |
|---|---|---|
| Transaction history | 30 · 90 (default) · 180 · 365 days · Maximum | `bankConnect.historyDays`; default for NEW connections; clamped per institution at connect time (D-C8) |
| Consent duration | 90 · 180 days (default: the institution maximum) | `bankConnect.validityDays` → agreement `access_valid_for_days` |
| Import from | date (no time) | `bankConnect.importFrom`; optional override of the D-C8 floor for the next fetch only, then cleared |
| Subscription | read-only: *Active until {date}* / *Ends {date}* / *Not subscribed* | `bankConnect.entitlement` |
| Support ID | read-only, 8-char tail of `ownerId`, tap to copy | for `hi@stackdplatform.com` tickets; opaque |
| Restore purchase | button | store restore → verify |

Helper lines under the first two mirror the reference's ("*The furthest
back your bank will send transactions*", "*How long the bank connection
stays valid before you must confirm it again*").

### 3.10 Refresh lifecycle (C3, user-visible part)

On app open, for each connection with `lastFetchAt` older than 6 h and the
toggle on: fetch in the background, dedup through the existing importKey
space, and if anything is new, surface it — never auto-commit. Surface
recommendation (D-C13): a Smart Insight card *12 new transactions from
{bank}* → *Review* opens `#import-preview`, plus a count badge on the hub
card. *Refresh now* on a card does the same synchronously with the
waiting sheet. Broker/network failure: the card's *Last synced* line
goes amber (*Couldn't reach your bank — last synced 3 days ago*) and
nothing else changes.

### 3.11 Expiry, lapse, disconnect

- **Consent expiry** (`EX`, or `expiresAt` ≤ 14 days): chip on the card,
  status line in Settings, one Smart Insight *Reconnect {bank}* → re-runs
  3.6 for the same connection; mappings are kept.
- **Subscription lapse** (broker 402): chip *Subscription needed*, refresh
  refused, imported data untouched, paywall with the grace copy.
- **Disconnect** (Manage sheet, danger style): confirm *Disconnect {bank}?
  — Stack'd stops fetching and revokes its access at GoCardless. Imported
  transactions stay in Stack'd.* → `DELETE /v1/connections/:ref`, then
  `REMOVE_BANK_CONNECTION`.
- **Factory reset**: revokes every connection (best effort, fire and
  forget) before clearing the slices — the existing RESET_APP path.

### 3.12 Web build (C5, later)

The hub on web shows the pairing screen when no entitled session exists:
8-char code field + *On your phone: Online banking → Settings → Pair a
browser*. Native's settings sheet gains a *Pair a browser* row that mints
the code and shows it large with the 5-minute countdown. Logout row on
web. Everything else renders identically.

## 4. Copy rules

- All strings under `bank.*` in the five dictionaries (~90 keys; counts
  as whole-sentence plurals: `bank.newTransactions.one/other`,
  `bank.expiresIn.one/other`, `bank.connectedBanks.zero/one/other`).
- Say **booked** transactions everywhere a fetch is described; the pending
  question gets one FAQ entry (*appears once your bank books it*).
- Never write "sync" for the fetch — the app never pushes anything and
  the word sets a background-sync expectation PSD2 cannot meet. Use
  *refresh* / *import*. "Online banking" stays as the feature name because
  it is what users search for.
- Never claim "nothing leaves your device" in this feature's copy; the
  C4 rework makes the global claim conditional.

## 5. Code touch-list

| Area | Change |
|---|---|
| `index.html` | new `<script defer src="src/bank-connect.js?v=1">` right after `import.js`; bump `?v=` on every co-dependent file per the house rule. |
| `src/bank-connect.js` (new global `window.BankConnect`) | broker client (`fetch` wrapper adding `X-Stackd-Client`, bearer from secure storage, 401/402/429 mapping), `normalize(txJson, balJson, currency) → statement {format:'connect', …}` (`transactionId` → `bankRef` → `ref:` importKey), `openSca(url)`, `handleReturn(url)`, `refreshDue(state)`, entitlement adapter (IAP plugin ↔ `/entitlement/verify`), and `window.__STACKD_BROKER_STUB__` for e2e. Loaded after `import.js` because it reuses `_ImportShared`. |
| `src/store.js` | slices `bankConnections` (`stackd_v1_bankConnections`, architecture §3 shape) and `bankConnect` prefs (`{enabled, consentAt, historyDays, validityDays, importFrom, pendingRef, entitlement:{active, expiresAt}}`); actions `SET_BANK_CONNECT_PREF`, `ADD_BANK_CONNECTION`, `UPDATE_BANK_CONNECTION`, `REMOVE_BANK_CONNECTION`; wired into `init`, the cross-tab `storage` handler and `RESET_APP` like `importRules`; both deliberately outside the CSV backup. |
| `src/views.js` | `BankConnectHubView`, `BankPickerView`, `BankMapView`, shared helpers in `_BankShared`; OthersView section rewrite (3.1). |
| `src/components.js` | `BankDisclosureModal`, `BankSettingsModal`, `PaywallModal`, `ConnectWaitingModal`, the Manage sheet; all call `StackdHydrateIcons` on their own root. |
| `src/router.js` | `#bank-connect`, `#bank-connect-add`, `#bank-connect-map` (+ `?ref=`). |
| `src/main.js` | three `case`s in the view switch; `appUrlOpen` → `BankConnect.handleReturn`; refresh-on-open call after `Store.init()`; `EMERGENCY_ICONS` entries for `landmark`, `link-2`, `unplug`, `refresh-cw`, `shield-check`, `badge-check`. |
| `src/insights.js` | two insight types: new-transactions-to-review, reconnect-needed. |
| `src/i18n/*.js` ×5 | `bank.*` keys; terms/privacy carve-outs (C4); `terms.updatedDate`. |
| `android/` | App Links intent filter for `https://api.stackdplatform.com/v1/connect/return` (autoVerify); plugins. |
| `ios/` | Associated Domains entitlement (`applinks:api.stackdplatform.com`) — Mac handoff item. |
| `broker/` | per architecture §3; adds `ENTITLEMENT_MODE=open` honoured ONLY on staging so B2–B4 can be exercised before the store products exist. |
| `tests/` | see §7. |

Native plugins (D-C12, D-C15 pick the exact packages):

| Need | Candidate | Note |
|---|---|---|
| Open the bank's SCA page | `@capacitor/browser` | Custom Tabs / SFSafariViewController; `Browser.close()` on return |
| Return deep link | `@capacitor/app` (already installed) | `appUrlOpen`; the back-button handler already lives in main.js |
| Device token at rest | `@aparajita/capacitor-secure-storage` or `capacitor-secure-storage-plugin` | Keychain / Keystore; never `stackd_v1_*` |
| Store subscription | `cordova-plugin-purchase` v13 (Capacitor-compatible) | receipts verified at the broker (D-C3); RevenueCat would add a third party to the entitlement path |

## 6. Build sequence

| Step | Version | Scope | Needs |
|---|---|---|---|
| B0 | — | GoCardless account (sandbox institution first), commercial terms → price + `MAX_CONNECTIONS`; DNS `api.` → Worker; store products when the developer accounts exist. | Apple enrollment (blocks products only) |
| B1 | — | `broker/` v1 on staging: institutions, connect start/return/status, accounts proxy, revoke, ownership DO, bearer sessions, rate limits, staging-only open entitlement; unit tests with mocked GoCardless. | B0 sandbox credentials |
| B2 | v1.05 | Client shell: 3.1, 3.2, 3.3, 3.4, 3.9, the paywall UI reading the cached entitlement; `bankConnect` prefs slice; i18n; stub + e2e. Runs against the stub or staging. | — |
| B3 | v1.06 | Connect leg + data: 3.6, 3.7, 3.8; `bankConnections` slice; Android App Links; normalizer; D-C8 window. | B1, B2, U2 |
| B4 | v1.07 | 3.10, 3.11: refresh on open, insights, Refresh now, reconnect, disconnect, pause. | B3 |
| B5 | v1.08 | Real entitlement: IAP plugin, store sheet, restore, broker receipt verification, 402/grace handling. | B0 products |
| B6 | v1.09 | C4 legal + store rework: terms/privacy ×5, listing copy, privacy labels. **Gate for any public build carrying B2+.** | — |
| B7 | later | C5 web session + pairing (3.12), iOS Associated Domains in the Mac handoff. | B5, production domain (done) |

B2–B4 are testable end to end on an internal Android build against the
staging broker with entitlement open; nothing ships publicly before B5 and
B6.

## 7. Testing

- **Unit (Vitest, executeFile chain + `bank-connect.js` after `import.js`):**
  normalizer fixtures (recorded sandbox JSON → statement shape, importKey
  derivation, currency), slice CRUD + RESET_APP + cross-tab, D-C8 window
  math (history clamp, newest-row floor, import-from override), settings
  defaults, `refreshDue` thresholds, return-URL parsing (`ref` extraction,
  cold-start resume via `pendingRef`).
- **E2E (`tests/e2e/bank_connect.spec.js`)** through
  `window.__STACKD_BROKER_STUB__`: toggle → disclosure → picker → paywall
  (stub not entitled) → stub entitle → connect → mapping → preview →
  confirm → U2 modal → hub card shows the connection; expiry chip;
  disconnect. Web-build "mobile only" state.
- **Broker:** its own suite (architecture §8) — the ownership test is the
  one that must never regress.
- **Manual device checklist:** SCA round-trip incl. cold start from the
  App Link, store purchase + restore on both stores, 402 grace path,
  Custom Tabs close, i18n of the store note.
- No live GoCardless or store calls in CI.

## 8. Decisions — settled 2026-09-06

The user took the recommendation on all eight. The GoCardless account
(B0) already exists; it is needed later to list subscriptions/agreements.

| # | Decision | Outcome |
|---|---|---|
| D-C9 | Tiers and price | **One product, "Bank Connect"**, up to 3 banks, monthly + yearly. Price set after reading the GoCardless commercial terms; the reference's €2.99 / €4.99 a month brackets the market. |
| D-C10 | Master toggle | **Network consent switch.** Off = zero broker calls; turning it off pauses and never revokes. |
| D-C11 | Hostnames | **`api.stackdplatform.com`** (broker, App Links host) and **`app.stackdplatform.com`** (web build) — same registrable domain for the D-C2 cookie. |
| D-C12 | IAP plugin | **`cordova-plugin-purchase`**, receipts verified at the broker (D-C3). No RevenueCat. |
| D-C13 | New-transactions surface | **Smart Insight + hub badge**; no modal on launch. |
| D-C14 | Bank logos | **GoCardless logo URLs** (only after the toggle is on) with an **initials fallback**. |
| D-C15 | Secure storage | **`@aparajita/capacitor-secure-storage`**. |
| D-C16 | Settings section | **"Bank data"**, holding *Online banking* and *Import bank statement*. |

## 9. B2 as built — v1.05, 2026-09-06

Client shell landed: §3.1, §3.2, §3.3, §3.4, §3.9 and the paywall UI of
§3.5, plus the start of §3.6 (the requisition is created and the bank page
opened; the return leg is B3). Files: `src/bank-connect.js` (new global,
loaded after `import.js`), `src/store.js` (slices + 4 actions),
`src/views.js` (`_BankShared`, `BankConnectHubView`, `BankPickerView`,
OthersView section), `src/components.js` (`_bankSheet`,
`BankDisclosureModal`, `BankSettingsModal`, `PaywallModal`), `src/router.js`,
`src/main.js` (2 cases, 4 fallback icons), 86 keys ×5 dictionaries
(`bank.*` + `others.bankData`), `tests/unit/bankConnect.test.js` (21 cases),
`tests/e2e/bank_connect.spec.js` (2 flows through the stub).

Deviations from §3, all deliberate:

- **Paused keeps the cards.** With the toggle off and connections present
  the hub renders the connection cards with a *Paused* chip and the
  Settings row reads *Paused*; the explainer card is only for the
  never-connected state. (§3.2's table implied the explainer whenever off.)
- **House chrome over the reference's.** The bank settings sheet uses the
  bottom Save / Cancel pair like every other sheet, not the X / ✓ header;
  the hub's back link reads *Others* (the DebtHub pattern).
- **Terms from the disclosure = "Not now".** `TermsModal` owns
  `#modal-container`, so opening it closes the disclosure sheet and reverts
  the toggle; the user flips it again after reading.
- **Consent is versioned** by the English `terms.updatedDate`
  (`bankConnect.consentVersion`); a terms bump re-shows the disclosure with
  no new key.
- **Web build** renders the mobile-only state (toggle disabled, no CTA)
  unless `window.__STACKD_BROKER_STUB__` is present; C5 lifts this.
- **Entitlement plumbing is stub-only until B5.** `BankConnect.prices()`
  returns null without a store, the paywall's Subscribe is disabled and
  Restore alerts *Purchases are available in the mobile app*. A successful
  purchase from the paywall closes it and starts the connect leg
  immediately (the user's intent was Connect).
- **Broker URL** is `https://api.stackdplatform.com` with a
  `window.__STACKD_BROKER_URL__` override for staging.
- **Store actions `ADD/UPDATE/REMOVE_BANK_CONNECTION` shipped now** so B3
  only wires the flow; `startConnect` already persists `pendingRef` +
  `pendingInstitution` for the cold-start resume of §3.6.

Verified: lint clean, 66 unit files / 640 tests green, the two e2e flows
green, and a manual walk of Settings → hub → disclosure → picker → paywall
→ settings sheet in the mobile viewport.

Next: **B1** (the broker, `broker/`) is now the critical path — B3 cannot
start without `/v1/connect/*` on staging. B2's stub documents the exact
request/response shapes B1 must honour: `GET /v1/institutions?country=`
(GoCardless institution shape, `transaction_total_days` /
`max_access_valid_for_days`), `POST /v1/connect/start` with
`{country, institutionId, historyDays, validityDays}` → `{ref,
bankRedirectUrl}`.

## 10. B1 as built — the broker, 2026-09-07

`broker/` is a self-contained Cloudflare Worker (own `package.json`,
`tsconfig`, `vitest`, `wrangler.toml`; root tooling untouched, D-C6).
`broker/README.md` is its reference: layout, the endpoint table, error
codes, the threat-model notes and the deploy runbook. 27 tests on in-memory
Durable Object fakes and a fake GoCardless — including THE ownership test
(owner B reads nothing of owner A) — the typecheck, and a
`wrangler deploy --dry-run` all pass locally; `wrangler dev` boots the real
runtime with the three Durable Object classes.

Deviations from the architecture plan (§2), all deliberate:

- **No KV.** The 24h aggregator token, the circuit breaker and the global
  connection count live in a singleton `SystemDO`; the institutions list is
  edge-cached through the Cache API (24h). One fewer resource to provision;
  KV can come back if the institutions cache ever needs to be global.
- **`GET /v1/connections`** was added: a device that lost its
  `stackd_v1_bankConnections` slice (reinstall, restore from the file
  mirror) rebuilds it from the broker in B3.
- **Refs embed the owner id** (`<ownerId>_<random>`) so the C5 web return
  can find the owner without a global index; refs stay opaque to the bank.
- **Per-account 429s pass through** as `account_rate_limited` (the bank's
  daily budget) and never trip the global breaker; only aggregator-level
  429s pause everyone for 10 minutes.
- **Grace revoke is a DO alarm** (store mode): `active → inactive` arms it
  14 days out; firing revokes every requisition at GoCardless.
- **Open mode is refused on the production host** whatever `[vars]` say
  (`PUBLIC_URL` check in `parseConfig`).
- **Local `wrangler dev` has no jurisdictions** (workerd throws "not
  implemented"); `ownerNamespace()` falls back to the unpinned namespace for
  that exact error only, so a deployed worker can never lose the EU pin.

Not yet done: the staging deploy itself needs a one-time `wrangler login`
and the two GoCardless secrets from the user's terminal (README runbook),
then `scripts/smoke.mjs` drives the sandbox institution end to end.

## 11. Aggregator pivot — Enable Banking, 2026-09-07 (D-C17)

**What happened.** The first staging smoke test returned a 401 from
GoCardless. The user's GoCardless login is the *payments* product
(`manage.gocardless.com`); **Bank Account Data** (ex-Nordigen) is a separate
login whose sign-up page now says *"New signups for Bank Account Data are
currently disabled"*. Access is a sales conversation aimed at larger
customers. The user chose to switch (D-C17) rather than wait.

**Decision D-C17 — Enable Banking** as the aggregator. Self-serve sign-up,
free sandbox (activates automatically; "Mock ASPSP" test bank), EU-wide
coverage incl. Italy, consent up to 180 days for most banks, at least a year
of history for most banks. **Caveats to carry into B6:** production access
requires a signed contract + company KYB (or *"Activate by linking
accounts"* — restricted mode limited to the developer's own accounts, fine
for TestFlight/internal builds); pricing is volume-based with a monthly
minimum and quote-only. Salt Edge is the fallback if the contract terms do
not fit a one-person app.

**What changed in the broker** (`broker/README.md` is current):

- `src/gocardless.ts` → `src/enable-banking.ts`: RS256 JWT signed in the
  Worker with the application's PEM (PKCS#8, PKCS#1 or base64-of-PEM all
  accepted; `kid` = application id, 1h TTL, memoised per isolate). No token
  cache in the SystemDO any more.
- **The return URL does the work.** The bank sends `code` + `state` (= our
  ref) to `/v1/connect/return`; the broker exchanges the code for a session
  there, stores `{id, ibanTail, currency, name}` per account and only then
  hands off to the app. `/v1/connect/status` is now a read of the owner
  record (no aggregator call), with `EX` derived from `expiresAt` and from
  `SESSION_EXPIRED`-class aggregator errors (410 `consent_expired`).
- Institution shape is now the broker's own:
  `{id: "IT:Name", name, country, logo, bic, historyDays, maxValidityDays,
  beta, sandbox}`. B2's normalizer already accepted `historyDays` /
  `maxValidityDays`, so the app needs no change; `historyDays` is a default
  (365) because Enable Banking exposes no per-bank history limit.
- Transactions are returned as ONE list per window (`continuation_key`
  pages merged, `truncated` flag after 25 pages); PSU-online headers
  (`Psu-Ip-Address`, `Psu-User-Agent`) are forwarded from the device request
  so banks apply their online limits rather than the 4-per-day background one.
- Record fields: `requisitionId`/`agreementId` → `authorizationId` /
  `sessionId` (+ `lastError`). Revoke = `DELETE /sessions/{id}`.
- 31 tests; the fake aggregator verifies the real RS256 signature against a
  generated key pair, so the JWT path is covered end to end.

**Transaction shape for B3's normalizer** (Enable Banking): `entry_reference`
/ `transaction_id` (→ `bankRef`), `transaction_amount {amount, currency}`,
`credit_debit_indicator` CRDT/DBIT, `status` BOOK/PDNG (booked only, D-C4),
`booking_date`, `value_date`, `remittance_information[]`, `creditor.name` /
`debtor.name`, `bank_transaction_code`. Balances: `balances[].balance_amount`
with `balance_type` (prefer CLBD, else the first).

**Status:** deployed to `api-staging.stackdplatform.com`; the GoCardless
secrets were removed from the worker. Waiting on the Enable Banking sandbox
application (app id → `EB_APP_ID` in `wrangler.toml`, PEM → `EB_PRIVATE_KEY`
secret), then the smoke test against "Mock ASPSP".
