# Bank Connect — client UX spec & build plan

> Status: **B1–B6 SHIPPED 2026-09-07 (broker live on staging; app v1.05–v1.10). B7 (C5 web session + pairing) is PLANNED in §16 and not started — a new session should cold-start from §16 + `broker/README.md`. B8 (native wiring) is listed in §16 too.** See §9–§16.
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
| B3 | v1.07 | Connect leg + data: 3.6, 3.7, 3.8; `bankConnections` slice; normalizer; D-C8 window. **Shipped 2026-09-07 (§12); Android App Links intent filter + iOS Associated Domains are the native-build follow-up.** | B1, B2, U2 |
| B4 | v1.08 | 3.10, 3.11: refresh on open, insights, Refresh now, reconnect, disconnect, pause. **Shipped 2026-09-07 (§13).** | B3 |
| B5 | v1.09 | Real entitlement: IAP plugin, store sheet, restore, broker receipt verification, 402/grace handling. **Shipped 2026-09-07 (§14); live store checks pending the products.** | B0 products |
| B6 | v1.10 | C4 legal + store rework: terms/privacy ×5, listing copy, privacy labels. **Shipped 2026-09-07 (§15).** Gate for any public build carrying B2+. | — |
| B7 | v1.11 | C5 web session + pairing (3.12). **Planned, §16.** | B5 (done), a deployed web build at `app.stackdplatform.com` |
| B8 | native | Android App Links intent filter, SecureStorage plugin, `npx cap sync` for the purchase plugin; iOS Associated Domains in the Mac handoff. **Planned, §16.** | an Android build environment (see the gradle quirks memory) |

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

**Status: VERIFIED end to end on staging, 2026-09-07.** Sandbox application
`463906ef-…` registered (redirects for `api-staging` and `localhost:8787`),
key uploaded, `scripts/smoke.mjs` → Mock ASPSP consent → broker return →
`status` = `LN` with one account, balance 87.83 EUR, one booked transaction
proxied. Two lessons: (1) the authorization link is short-lived — a link
relayed through chat expired (`server_error`, `invalid_grant`); run the
smoke script and click within seconds; (2) the Mock ASPSP authenticates with
the Enable Banking control-panel login, so the flow must run in the
developer's signed-in browser. **For B3:** the mock account has no IBAN
(`ibanTail` empty → show the account name instead), `balance_type` was
`ITAV` (accept ITAV/CLAV/CLBD, prefer CLBD when several), `expiresAt` comes
back with microseconds (`…21.124000Z`, Date.parse copes).

## 12. B3 as built — v1.07, 2026-09-07

Connect leg, account mapping and the first fetch, on top of the U2 success
sheet (import-ux-plan §3a). Files: `src/bank-connect.js` (v2),
`src/views.js` (`BankMapView`, hub card actions + resume/sync, the
"Online banking" format label on the statement details step),
`src/components.js` (`BankWaitingModal`, `BankConnectErrorModal`),
`src/router.js` (`#bank-connect-map`), `src/main.js` (`appUrlOpen` +
`getLaunchUrl` → `BankConnect.handleReturn`), 25 keys ×5,
`tests/unit/bankConnectB3.test.js` (12 cases), the bank_connect e2e spec now
runs return → mapping → details → preview → confirm → success sheet → hub
card through the stub.

How it works, and where it deviates from §3:

- **Device identity is lazy.** `BankConnect.ensureDevice()` mints the owner +
  device token at the first `connect/start` (POST `/v1/entitlement/verify`
  without a bearer), caches `ownerId` + entitlement in the prefs slice and
  keeps the token in native SecureStorage when a plugin is present
  (`SecureStorage` / `SecureStoragePlugin`), else in the localStorage key
  `stackd_device_token` — deliberately outside `stackd_v1_` (not mirrored,
  not in the backup). A broker 401 `invalid_device_token` clears it.
- **The return leg is a read.** With Enable Banking the code exchange
  happens at the broker's return URL (§11), so `resumeConnection(ref)` only
  polls `/v1/connect/status` (up to 6 × 1.5 s while `CR`), records the
  connection (`recordConnection`, preserving any existing
  `stackdAccountId` mapping) and routes to `#bank-connect-map?ref=`; RJ /
  UA / EX open `BankConnectErrorModal` (Try again → picker). Entry points:
  `appUrlOpen` and the launch URL on native (App Link or `stackd://`), and
  the hub's attach when `pendingRef` is set (web return, cold start without
  the link). `parseReturnUrl` accepts both URL shapes.
- **Mapping (§3.7) as specified,** with two refinements: a bank account
  without an IBAN (the mock bank) is labelled by its name, and the created
  account is named `{bank} •••• {tail}` or `{bank} · {name}`; the v1.02
  currency guard is an inline error. **Import starts for the first mapped
  account only**; every other mapped account gets an *Import* button on the
  hub card (unmapped ones get *Link* back to this screen). That replaces
  §3.8's implicit "all accounts at once" — the pipeline is per account.
- **Fetch window (D-C8)** in `fetchWindow`: first fetch = `historyDays`
  (0 = maximum) clamped to the connection's limit and 730, floored at the
  day after the account's newest imported row; `importFrom` is a one-shot
  override cleared after use; later fetches start 7 days before
  `lastFetchAt`. Never in the future.
- **Normalizer** (`normalize`): booked rows only; `entry_reference` /
  `transaction_id` → `bankRef` (→ `ref:<accountId>|<ref>` importKeys);
  description = counterparty (creditor for debits, debtor for credits) +
  remittance, else the bank transaction code; closing balance prefers
  CLBD > CLAV > ITAV; `format: 'connect'` so the details step says
  "Online banking". Then `_ImportShared.startStatement` with the mapping's
  account forced onto the draft, `#import-map` → preview → the U2 sheet.
- **Broker list sync** (`syncConnections`): once per session on the hub
  when a device token exists — a reinstalled device rebuilds
  `bankConnections` from `GET /v1/connections` and drops refs the broker no
  longer has. The broker is the authority on which connections exist; the
  device is the authority on mappings.
- **Not done here:** the Android App Links intent filter and iOS Associated
  Domains (native build work, with the release fingerprint), the refresh
  lifecycle (B4: refresh-on-open, insights, reconnect, disconnect, pause
  semantics beyond the toggle), and the SecureStorage plugin install (the
  localStorage fallback carries the dev/web build).

## 13. B4 as built — v1.08, 2026-09-07

The refresh lifecycle (§3.10, §3.11). Files: `src/bank-connect.js` (v3),
`src/insights.js` (two rules + per-card targets), `src/views.js` (hub card
actions and states, factory-reset revoke), `src/components.js`
(`BankManageModal`), `src/main.js` (boot + foreground hook), `src/store.js`
(`pendingReplaceRef` default), 30 keys ×5, `tests/unit/bankConnectB4.test.js`
(10 cases), a third bank_connect e2e test (background fetch → insight →
Review → import; Refresh now; Manage → Disconnect).

- **Background refresh never commits.** `BankConnect.refreshDue` fetches
  every mapped account of every live connection whose `lastFetchAt` is
  older than 6 h (one at a time, never minting a device, never while the
  toggle is off) and parks the normalized statement in
  `BankConnect._pending` — memory only, keyed `ref|bankAccountId`, with
  `newCount` = the rows the pipeline would insert (importKey dedup-aware).
  Nothing reaches the store until the user reviews the preview. main.js calls
  `refreshOnOpen()` 2 s after boot and on every foreground return, throttled
  to one check per 30 min.
- **Surfaces (D-C13):** the `bankNew` Smart Insight (priority 0, value = the
  count, taps go to the hub — cards gained a `data-href`), an *N new* badge
  on the hub card, and the per-account button becoming *Review N new*, which
  imports from the cached statement without a second fetch. *Refresh now*
  forces a fetch for one connection and reads *Up to date* for 2 s when
  nothing new came back.
- **Expiry (§3.11):** the `bankReconnect` insight (expiring ≤ 14 days with
  the days left, or expired), the card's *Reconnect* button replacing
  *Refresh now* when expired, and the same in the Manage sheet.
  `BankConnect.reconnect` starts a new authorization for the same
  institution with `pendingReplaceRef` set; on the return the mappings carry
  over by IBAN tail (else name + currency), the old ref is removed locally and
  revoked at the broker, and the flow skips the mapping screen when every
  account carried over. `consent_expired` from a fetch flips the record to
  `EX` on its own.
- **Lapse (§3.11):** a `subscription_required` failure on *Refresh now* opens
  the paywall with the grace copy; the chip already said *Subscription
  needed*.
- **Disconnect:** Manage sheet (consent dates, history limit, linked-account
  count, *Link accounts*, *Reconnect* when relevant, *Disconnect* in the
  danger style) → house confirm modal → `BankConnect.revoke` (DELETE at the
  broker, drop pending, remove locally). Factory reset calls `revokeAll` with
  `keepalive` right before `RESET_APP`.
- **Degradation:** a failed refresh records `lastError`/`lastErrorAt` on the
  connection and turns the *Last synced* line amber; nothing else changes.
  Pausing the toggle clears pending statements as well.
- **Not done:** the SecureStorage plugin and native App Links (device build),
  the real store entitlement (B5), and the legal/store rework (B6).

## 14. B5 as built — v1.09, 2026-09-07

Store entitlement, both halves (§3.5, D-C3, D-C9, D-C12). Verified against
faithful fakes of the store APIs (the fakes verify the broker's signed JWTs)
because the Play and App Store products do not exist yet — the runbook below
is what remains.

**Broker** (`broker/src/store-verify.ts`, `POST /v1/entitlement/verify` in
store mode):

- A receipt in the body → verified with the store NOW. Google Play: a
  service-account JWT (RS256, signed in the Worker from the key file JSON in
  the `PLAY_SERVICE_ACCOUNT_JSON` secret) → OAuth token (cached in the
  SystemDO) → `purchases.subscriptionsv2`; ACTIVE / IN_GRACE_PERIOD /
  CANCELED-until-expiry count as active; an unacknowledged purchase is
  acknowledged as a backstop. App Store: an ES256 JWT (kid = `APPLE_KEY_ID`,
  iss = `APPLE_ISSUER_ID`, bid = `APPLE_BUNDLE_ID`, from the `.p8` in the
  `APPLE_PRIVATE_KEY` secret) → App Store Server API subscription statuses,
  with the sandbox-host retry on a production 404; statuses 1 / 3 / 4 count as
  active; the signed transaction payload is decoded, not chain-verified,
  because we fetched it from Apple ourselves. Only ids in `PRODUCT_IDS` are
  accepted (`product_unknown` otherwise); wrong bundle → `receipt_invalid`.
- The owner record keeps `{active, platform, productId, expiresAt,
  lastVerifiedAt, purchaseToken | originalTransactionId, state}`. A lapse
  (active → inactive) arms the existing 14-day grace alarm.
- No receipt in the body → the broker **re-checks silently** with the store
  when the stored entitlement is within 24 h of expiry or already lapsed, at
  most once per 6 h; a failed silent check keeps what it had. The client's
  `verifyEntitlement()` on every foreground return is what triggers it.
- Errors: `400 receipt_required | receipt_invalid | product_unknown |
  platform_unknown`, `502 store_auth_failed | store_error_<status>`,
  `503 store_not_configured | store_key_invalid`. Staging (open mode) never
  runs any of this.

**App** (`src/bank-connect.js` v4, `PaywallModal`):

- `cordova-plugin-purchase` 13.18 (D-C12) is a dependency; `initStore()`
  registers `stackd_bank_connect_monthly` / `_yearly` as paid subscriptions
  on the current platform, lazily, the first time the paywall needs prices.
  The paywall renders at once and fills the plan cards when
  `loadPrices()` resolves (yearly shows the per-month equivalent).
- Purchase = `store.order(offer)` → the `approved` transaction → its receipt
  (Play `purchaseToken`, App Store `originalTransactionId` /
  `transactionId`) posted to the broker → only an `active` answer finishes
  (acknowledges) the transaction and caches `{active, expiresAt, platform,
  productId}` in the prefs slice. A cancelled sheet rejects with
  `cancelled` (silent); anything else says the purchase didn't go through.
  Restore = `restorePurchases()` with the same approved path; nothing within
  8 s means "no subscription found".
- On the web build without the e2e stub: no store, prices null, Subscribe
  disabled with the "prices load on your phone" line; the stub keeps the
  Playwright flow synchronous.

**Runbook — when the products exist:**

1. **Play Console:** create the subscription `stackd_bank_connect_monthly`
   and `stackd_bank_connect_yearly` (one product, two base plans is also
   fine as long as the ids above are the product ids the plugin sees). Create
   a Google Cloud service account, grant it *View financial data* + *Manage
   orders and subscriptions* on the app in Play Console, download its JSON
   key → `wrangler secret put PLAY_SERVICE_ACCOUNT_JSON --env production`
   (file-based, see broker/README).
2. **App Store Connect:** create the auto-renewable subscription group with
   the same two product ids. Users and Access → Integrations → *In-App
   Purchase* key: download the `.p8` once → `wrangler secret put
   APPLE_PRIVATE_KEY --env production`; put its Key ID and the Issuer ID in
   `[env.production.vars]` `APPLE_KEY_ID` / `APPLE_ISSUER_ID`.
3. `npx cap sync` so the plugin lands in the native projects; test with
   license testers (Play) / sandbox testers (App Store) against a
   `--env production` deploy, or a second staging worker with
   `ENTITLEMENT_MODE=store`.
4. The 402 → paywall path (B4) and the grace alarm (B1) are already wired.

## 15. B6 as built — v1.10, 2026-09-07

The C4 legal, store and business rework (architecture plan §6), written by
the developer's assistant and **to be read through by a lawyer before the
public build** — it is careful, not legal advice.

**In-app Terms & Privacy (canonical, ×5 dictionaries).** `terms.updatedDate`
→ 2026-09-07, which by design re-shows the Bank Connect disclosure sheet to
anyone who had consented under the old date. Terms of Use gain clause 5
*Bank Connect (optional)* — opt-in, the two third parties by name (Enable
Banking Oy as the FIN-FSA-supervised AISP, the Stack'd relay server), consent
on the bank's pages, credentials never through the app, 90–180-day access,
refresh limits, review-before-save, availability not guaranteed, disconnect
= revoke — and clause 6 *Bank Connect subscription* (billed by Apple/Google,
auto-renew, cancel in store settings, refunds by the store, refresh stops at
lapse, connections kept 14 days then revoked, imported data stays, all else
free). Amended: intro, imported data (fetched rows, no pending), your data
(accounts you link), third-party names (institution list, not a party to
the bank/aggregator/store agreements). Privacy gains clause 3 *what
travels, what is kept* (the transit-only relay; the exact server-side record:
opaque owner/device id, per-bank ref + bank name + IBAN last-4 + currency +
name, subscription status + store id; deletion on disconnect or 14 days
after lapse; EU-jurisdiction Cloudflare) and clause 4 *recipients and legal
basis* (the bank, Enable Banking Oy with address and supervision, Apple or
Google, Cloudflare as EU processor; Art. 6(1)(b)). Amended: the short
version (now conditional on the toggle), what is stored (fetched rows only
after confirmation, the device token outside the backup), what the app does
not do, the GDPR position (controller for the technical records only, the
transactions transit), rights (disconnect = server-side erasure, complaint
right), security (encrypted throughout, per-device token), changes (this is
the announced change). `TermsModal.TERMS_IDS` / `PRIVACY_IDS` carry the
order; the intro cites "Terms 5–6 / Privacy 3–4" so the order is load-bearing.
Two FAQ entries (`bankConnect`, `bankPending`).

**Store forms.** `docs/store-listing.md`: listing copy ("local by default",
the Online banking paragraph, the subscription disclosure, the two required
links), the App Store privacy-label answers with the "linked to you"
judgement call spelled out, the Play Data-safety answers, the subscription
product table, the Enable Banking production question, screenshots.

**Marketing site** (`../StackdSite`, separate repo): `privacy.html` and
`terms.html` mirror the in-app clauses in English (they are the URLs the
stores link to); the hero drops "never leaves your phone" for "stays on your
phone" with the bank link named in the lede; the *Local first* principle
mentions the relay. Committed separately in that repo.

**Not done / decisions left to the owner:** the legal read-through; the
Enable Banking production route (contract + KYB vs restricted mode — §14
and store-listing §5); the App Store privacy label's "linked" column at
submission; localized versions of the marketing site pages (the site is
English-only today).

## 16. B7 as built — C5 web session + pairing, v1.11, 2026-09-07

Cold-start reading order for a new session: this section, then
`broker/README.md` (endpoints + runbook), then `src/bank-connect.js` (the
client; sessions live in `resolveSession` on the broker side,
`broker/src/index.ts`). Built to the plan that stood here (D-C2 / D-C3 /
D-C11, architecture §2); the three questions of the old §16.6 were taken as
recommended and are recorded in §16.6 below.

### 16.1 What it is

The web build (Vite output of this repo, one HTML file) can use Bank Connect
too, but only when **paired with a phone that holds the subscription**
(D-C2/D-C3: no web payment path). The pairing gives the browser a broker
session cookie that resolves to the SAME owner as the phone, so the
subscription and the existing connections become visible in the browser.
Until then the web build shows the pairing screen (§3.12) once the toggle is
on. A build that is neither native nor in web session mode (a stray
`localhost:3000` without the flag) still shows §3.2's "mobile only" card.

### 16.2 Broker (`broker/`) — as built

- **Web session = a device of kind `web` on the owner record**, verified by
  the same `/devices/verify` DO call as a native device. The credential is
  the cookie `stackd_session=<ownerId>.<secret>` (same grammar as the
  bearer; `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7776000`), set by
  the broker host. Same-site with `app.stackdplatform.com` (D-C11), so Lax
  rides on the app's `fetch(..., {credentials: 'include'})`. The web device
  entry additionally stores `csrfHash`, a sliding `expiresAt` and a coarse
  `label` (browser · OS from the UA, never the raw string).
- **CSRF:** every non-safe request (anything but GET/HEAD/OPTIONS) from a
  cookie session must carry `X-Stackd-CSRF`; `403 csrf_required` /
  `csrf_invalid` otherwise. The token is returned by the claim and by every
  `GET /v1/session`, which **rotates** it (and the client retries once on a
  403 after re-reading the session, so a second tab cannot lock the first
  out).
- **Lifetime (D-C19): 90 days sliding.** `GET /v1/session` re-issues the
  cookie and pushes the device's `expiresAt` 90 days out; a session past it
  answers `401 session_expired`, clears the cookie and drops the device.
- `resolveSession`: bearer first, else cookie (+ CSRF on mutations) →
  `{ownerId, record, owner, kind, device}`; `requireDevice` = that or
  `401 device_token_required`. The per-owner rate limit is shared.
  `POST /v1/entitlement/verify` over a cookie session **re-checks, never
  mints** (a browser can only get an owner by pairing).
- **Endpoints:**
  - `POST /v1/pair/code` — native (`403 native_only` from a browser),
    entitled → `201 {code, expiresAt}`. 8 chars from
    `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I; 32⁸ ≈ 1.1e12), 5-minute
    TTL, single-use; sha256 stored on the OwnerDO (`pairCodes`, last 10,
    expired pruned) AND in the SystemDO routing table `pair:<hash> →
    {ownerId, expiresAt}` (pruned on every put). 5 codes / hour / owner.
  - `POST /v1/pair/claim` — unauthenticated, body `{code}` (upper-cased,
    spaces/dashes dropped) → SystemDO `take` (get + delete, one DO turn) →
    OwnerDO `/pair/claim` (the owner record is the authority: it burns the
    code and adds the web device) → `201 {ownerId, active, expiresAt,
    platform, productId, mode, csrf, sessionExpiresAt}` + `Set-Cookie`.
    `400 invalid_code`, `410 code_expired`. 10 attempts / hour / IP.
  - `GET /v1/session` — the boot check: `401 no_session` (clean, no mint)
    or the same body as the claim with a fresh `csrf` and a re-issued
    cookie. `400 web_only` for a bearer.
  - `POST /v1/session/logout` — cookie + CSRF → removes only that web
    device, clears the cookie.
  - `GET /v1/devices` (D-C20) — any device → `{devices: [{id, kind,
    createdAt, lastSeenAt, label, expiresAt, current}]}`, web devices only;
    `id` = first 16 hex of the stored hash. `DELETE /v1/devices/:id` →
    revokes that browser (`404 unknown_device`).
- **CORS with credentials:** `Access-Control-Allow-Credentials: true` + the
  exact origin for the allow-list; `x-stackd-csrf` added to the allowed
  headers.
- **Connect from a web session:** `ReqRecord.kind` records who started the
  flow; when it is `web` and `PUBLIC_WEB_URL` is set, `/v1/connect/return`
  answers `302 → PUBLIC_WEB_URL/#bank-connect` (success, failure and the
  idempotent reload alike — the hub resumes from `pendingRef` and reads the
  outcome from `/v1/connect/status`). Without the var, or for a native
  ref, the hand-off page renders as before. `PUBLIC_WEB_URL` is
  `https://app.stackdplatform.com` in production and `http://localhost:3000`
  on staging until a staging web build exists.
- **Tests (`broker/test`, 43 total):** code → cookie → the phone's
  connections, no secret in any body, single-use + TTL + wrong code +
  excluded glyphs, CSRF missing/wrong/rotated, GET free, web return
  redirect (and the page fallback), sliding expiry, no-mint on cookie
  verify, logout, phone-side list/revoke with `current`, `native_only`,
  both rate limits, store-mode 402, credentialed CORS.

### 16.3 App (`src/bank-connect.js`, views, components) — as built

- **Availability:** `isWebSession()` = not native AND (`window.
  __STACKD_WEB_SESSION__ === true` OR `location.origin ===
  'https://app.stackdplatform.com'`); `isAvailable()` = native, the stub, or
  that. On the deployed origin `brokerUrl()` is the production broker
  (`__STACKD_BROKER_URL__` still wins, for `wrangler dev`).
- **Transport:** in web session mode `request()` sends `credentials:
  'include'`, no bearer, and `X-Stackd-CSRF` on non-GET calls; a 403
  `csrf_*` re-reads `/v1/session` and retries once; a 401 `no_session |
  invalid_session | session_expired` forgets the session locally and
  surfaces as `web_unpaired` (`fetchErrorKey` → `bank.webUnpaired`).
  `ensureDevice()` never mints on web: it throws `web_unpaired` when
  `checkSession()` says none. `hasIdentity()` (session on web, token
  elsewhere) gates `syncConnections` and `refreshDue`; `refreshOnOpen` on
  web runs `checkSession()` (a GET, which also slides the cookie) instead
  of the POST verify. `storeAvailable()` is false on web, stub or not.
- **Session state:** `BankConnect._webSession` — `undefined` until the
  first `/v1/session` answer of the page load, `null` = not paired, else
  `{ownerId, csrf, active}`. Every answer updates `bankConnect.ownerId` and
  the cached entitlement; losing the session resets both.
- **Hub on web:** toggle off → the explainer (consent first, no network);
  toggle on + session unknown → a one-line "Checking…" card while
  `attachEvents` runs the check and emits once; no session → the pairing
  card (`#bank-pair`: intro, 8-char code field with `autocomplete=
  one-time-code`, *Pair*, an inline error line, the "On your phone: Online
  banking → Settings → Pair a browser" hint) and the add CTA hidden;
  paired → identical to native (`pendingRef` resume / one-time sync).
  `pairClaim(code)` posts the code, adopts the session and rebuilds the
  list from `GET /v1/connections`.
- **Native settings sheet:** *Pair a browser* (entitled only) → `POST
  /v1/pair/code` → `BankPairCodeModal`: the code large and grouped
  (`ABCD EFGH`), a live "Expires in m:ss" countdown, *New code* once it
  runs out, *Done*. Below it *Paired browsers* (D-C20): label + "Paired
  {date}" + *Remove* per browser, "No browser is paired." when empty.
- **Web settings sheet:** no *Restore purchase*; *Log out of this browser*
  (danger) → confirm → `logoutWeb()`: broker logout, session forgotten,
  the mirrored connection list, pending reviews and cached entitlement
  cleared, toggle and consent kept.
- **Paywall on web:** the three perks, then *"Bank Connect is bought in the
  mobile app. Subscribe on your phone, then pair this browser to use it
  here."* with a *Pair* button (hidden once paired) and *Close*; no plans,
  no store note.
- **Settings row on web:** the subtitle reads "Pair this browser with your
  phone to use it here." while enabled and unpaired.
- **Return on web:** the browser lands on `#bank-connect`; the fresh page's
  hub checks the session, then the existing `pendingRef` resume (B3)
  finishes the flow.
- **CSS:** `src/styles/reset.css` gains `[hidden] { display: none
  !important }` — `.btn` is `inline-flex`, which had been keeping the
  at-cap hidden CTA (B2) on screen; the pairing screen exposed it.
- **i18n:** 25 keys × 5 (`bank.pair*`, `bank.paired*`, `bank.logout*`,
  `bank.webPaywall`, `bank.webUnpaired`).
- **Tests:** `tests/unit/bankConnectB7.test.js` (17: availability + broker
  URL, transport headers/credentials, CSRF retry, no-mint, dead session,
  offline, boot check, pairClaim, logoutWeb, native pairCode + devices, the
  hub's three web states and the form, the paywall and both settings
  sheets, the code sheet); the e2e `bank_connect.spec.js` gains the web
  scenario through the stub (`stub.session`, `stub.pairCode`: pairing
  screen → wrong/expired/right code → the phone's connection → log out →
  the Settings row copy). The one real-broker check (dev server against
  `wrangler dev`) is the owner's, see §16.5.

### 16.4 Local development against the real broker

```
cd broker && npm run dev        # http://localhost:8787, mode open
```

then in the app's console before enabling the toggle:

```js
window.__STACKD_WEB_SESSION__ = true;
window.__STACKD_BROKER_URL__ = 'http://localhost:8787';
```

`localhost:3000` → `localhost:8787` is same-site (ports do not count), so
the Lax cookie is sent; Chrome and Firefox accept a `Secure` cookie from
`http://localhost`, Safari does not (use Chrome for this check). A pairing
code comes from a native build on staging, or from a second dev tab
without the web flag (it mints a native device and can call
`BankConnect.pairCode()` from the console). `api-staging` is NOT usable
from `localhost:3000` for cookies (cross-site).

### 16.5 Deployment prerequisites (owner, still open)

1. **A deployed web build at `https://app.stackdplatform.com`:** a second
   Cloudflare Pages project (`stackd-app`) building this repo with
   `npm run build` (output `dist/`, single file) and the custom domain
   `app.stackdplatform.com`. Per D-C18 below, only once the native app is
   in TestFlight / Play testing.
2. `npm run deploy:staging` for the broker (the code above is not deployed
   yet); `--env production` later. `ALLOWED_ORIGINS` (production) already
   lists `https://app.stackdplatform.com`; `PUBLIC_WEB_URL` is in both
   environments' `[vars]`.
3. One real pairing: dev server + `wrangler dev` per §16.4, then the same
   against staging once a staging web build exists.
4. Nothing at Enable Banking: the redirect URL is unchanged (the broker's).

### 16.6 Decisions taken (as recommended in the plan)

- **D-C18** The code is built now; the Pages project waits for the native
  app to reach store testing. Until then the web build is exercised against
  `wrangler dev`.
- **D-C19** Session lifetime: 90 days sliding.
- **D-C20** Paired browsers are listed on the phone with a *Remove* action
  in v1 (`GET/DELETE /v1/devices`).

### 16.7 B8 — native wiring (needs the Android build environment)

Not Bank Connect logic, but required before a public build; listed here so
it is not lost: `npx cap sync` (pulls `cordova-plugin-purchase` and, once
added, `@aparajita/capacitor-secure-storage` into `android/`); the App
Links intent filter for `https://api.stackdplatform.com/v1/connect/return`
(and `api-staging.` for internal builds) with `autoVerify` + the release
keystore's SHA-256 in the broker's `ANDROID_SHA256_FINGERPRINTS`; the
`stackd://` scheme as fallback; `Browser` plugin (`@capacitor/browser`)
for the SCA page; iOS Associated Domains in the Mac handoff. Then a device
walk of §3.6 with a cold start from the link. The gradle/emulator quirks are
in the Android build memory.
