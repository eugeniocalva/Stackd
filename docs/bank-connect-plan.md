# Bank Connect Plan (Option C) — automatic retrieval via a Stack'd broker

> Status: **DECISIONS SETTLED 2026-09-04 — implementation not started.**
> Cold-start reference for automatic bank data retrieval through a small
> Stack'd-operated broker server. Read `docs/bank-import-plan.md` §3f–§7a
> first — the fetched data flows through that pipeline UNCHANGED; nothing
> shipped in v0.99–v1.03 is reverted or refactored by this plan. §10 holds
> the settled decisions; §2–§6 already reflect them.
> Relationship to `docs/import-ux-plan.md`: independent; recommended order is
> U2 (success modal) → C1–C5 → the rest of the UX plan.

## 1. The decision, and why B was superseded

The user wants users to connect their bank WITHOUT creating an account at any
supplier. That forces one shared aggregator account — and a shared
`secret_id`/`secret_key` can never ship inside the app: client binaries are
trivially extractable, and a GoCardless token derived from the secret can
enumerate EVERY requisition under the account, i.e. every user's bank data.
The secret must live server-side. One shared supplier account therefore
equals **Option C: a broker service operated by the developer**.

Option B (BYO key, no server — this document's previous content) is
superseded but remains the architectural fallback if C's costs or terms
prove unacceptable: the client-side phases below are ~90% identical either
way, so the decision is reversible at the acquisition layer.

**What C changes, honestly:**
- Stack'd (the developer) now operates infrastructure and sits in the data
  path — the unconditional "nothing ever leaves your device" claim becomes
  conditional on not connecting a bank. File import (Option A) remains the
  fully-local path forever and keeps that claim true for everyone who
  doesn't opt in.
- Aggregator commercial terms apply (priced per connected account/month
  beyond any free allowance) plus hosting. **Bank Connect is a paid
  subscription feature (D-C3)**; everything manual stays free.
- The PSD2 limits carry over regardless of architecture: consent re-auth
  every 90–180 days, ~4 refreshes/account/day, refresh-on-open rather than
  true background sync. Keep these in the UI copy.
- Native-app benefit is strongest; the WEB build also connects (D-C2) via a
  broker-set session cookie, entitled through a pairing code from an
  already-subscribed phone.

## 2. Architecture overview

```
device (Stack'd app)  ←→  broker (Cloudflare Workers, EU)  ←→  GoCardless  ←→  bank
```

- The broker holds the ONE GoCardless secret (wrangler secret, never in any
  repo, never in a committed `.dev.vars`).
- **Pass-through by design:** the broker persists NO bank data — it stores
  only ownership + entitlement state. Transaction JSON transits, is never
  written, and response bodies are never logged.
- **Ownership store = one Durable Object per owner, `jurisdiction: 'eu'`**
  (D-C1). NOT KV: KV is eventually consistent, so a mapping written by
  `connect/start` could be invisible to the `connect/status` call seconds
  later on another edge — exactly the SCA-return race. Jurisdiction
  restriction is a Durable Objects feature, not a KV one; the plan's EU
  claim only holds with DOs. KV is fine for the institutions cache and the
  24h GoCardless access token.
- **Owner record (DO):** `{ownerId, requisitionRefs: [...], entitlement:
  {platform: 'play'|'appstore', productId, expiresAt, lastVerifiedAt,
  originalTransactionId|purchaseToken}, devices: [{deviceTokenHash,
  kind: 'native'|'web', createdAt, lastSeenAt}], connectionCount}`.
  Opaque ids only, no names, no bank data.
- **Two auth modes, one session abstraction:**
  - *Native:* opaque bearer token, minted on first `entitlement/verify`,
    stored in native SecureStorage (never in `stackd_v1_*`, never in the
    CSV backup, never in the file mirror).
  - *Web:* `HttpOnly; Secure; SameSite=Lax` session cookie set by the broker
    on the SCA return, plus a CSRF token on mutating calls. Requires the web
    app and the broker on ONE registrable domain (first-party cookie) —
    D-C7/step 0.
  - Both resolve to the same `ownerId`; every data endpoint is
    ownership-checked against it. The no-signup UX survives even though
    infrastructure exists.
- **Entitlement is enforced at the broker, never in the client** (D-C3):
  `connect/start` and every data endpoint require a currently valid
  subscription on the owner. Receipts are verified server-side (Google Play
  Developer API service account; App Store Server API key). A lapsed
  subscription keeps the requisitions for a 14-day grace window (refresh
  refused, data already imported stays local — the user owns it), then the
  broker revokes them at GoCardless to stop aggregator billing.
- **Pairing (web entitlement):** an entitled native device requests a
  short-lived 8-char code; the web session submits it; the broker merges
  the web session into that owner (subscription AND existing requisitions
  become visible to the browser). Codes are single-use, 5-minute TTL.
- Per-device rate limiting at the broker; global circuit breaker for the
  aggregator quota; a global connection cap (`MAX_CONNECTIONS` env) as the
  abuse bound until attestation lands (D-C5).

### Broker endpoints (v1)

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET  /v1/institutions?country=` | none | bank picker data (cacheable) |
| `POST /v1/entitlement/verify` | device | body: platform + receipt/purchaseToken → verifies with the store, stores entitlement on the owner, returns `{active, expiresAt}` (mints the native device token on first call) |
| `POST /v1/connect/start` | device, entitled | body: country, institutionId → end-user agreement + requisition at GoCardless, returns `{ref, bankRedirectUrl}` |
| `GET  /v1/connect/return?ref=` | none | GoCardless redirect target: sets the web session cookie when the flow started on web, then redirects to the App Link / web app |
| `GET  /v1/connect/status?ref=` | device | requisition state + linked bank accounts (id, IBAN tail, currency, institution history limit) |
| `GET  /v1/accounts/:id/transactions?date_from=` | device, entitled | proxied booked transactions (ownership-checked) |
| `GET  /v1/accounts/:id/balances` | device, entitled | proxied balances |
| `DELETE /v1/connections/:ref` | device | revoke: deletes the requisition at GoCardless + the mapping |
| `POST /v1/pair/code` | native, entitled | mints a pairing code |
| `POST /v1/pair/claim` | web | body: code → merges the web session into the code's owner |
| `POST /v1/session/logout` | web | clears the cookie session |
| `GET  /.well-known/assetlinks.json`, `/.well-known/apple-app-site-association` | none | App Links / Universal Links verification (D-C7) |

Every request carries `X-Stackd-Client` (build-time client id — worthless
against extraction, filters lazy scanners) and a reserved `X-Stackd-Attest`
slot for D-C5.

### Threat model notes (write into the broker README)

Broker compromise exposes: the aggregator secret (rotate), the ownership
mapping (opaque ids, no bank data, no names) and store receipt identifiers.
It does NOT expose transaction history — nothing is stored. Abuse vector:
strangers using the broker as a free GoCardless proxy → entitlement check +
per-device limits + global cap at v1; app attestation (Play Integrity / App
Attest) is the real fix — D-C5, fast follow. Web-specific: CSRF on
mutating calls (token), cookie never readable by JS, pairing codes
single-use and short-lived, pair/claim rate-limited per IP.

## 3. Phase C1 — Broker + connect flow

- **Broker service:** new top-level `broker/` folder in this repo (D-C6)
  with its OWN `package.json`, `tsconfig`, `vitest` config and `wrangler`
  config — the root `npm run lint/test` never touch it, and nothing under
  `broker/` is ever loaded by `index.html`. TypeScript on Cloudflare
  Workers + Durable Objects (D-C1), staging on `*.workers.dev`, production
  on the purchased domain (step 0). Endpoints above, GoCardless client,
  session abstraction (bearer + cookie), entitlement verification,
  ownership DO, rate limits, connection cap.
- **Client connect flow** ("Connect a bank" in Others & Settings): country
  pre-filled from locale → bank picker (broker `/institutions`) →
  disclosure screen (consent-style: names GoCardless, states what transits,
  links Terms) → **paywall if not entitled** (store subscription sheet on
  native; "pair with your phone" code entry on web) → open
  `bankRedirectUrl` in the system browser (`@capacitor/browser`; plain
  navigation on web) → return via App Link (native) or cookie redirect
  (web) → poll `/connect/status` → map each bank account to an existing
  Stack'd account or create one (IBAN-tail name; currency from the API —
  v1.02 slots in).
- **Deep link = https App Link / Universal Link on the broker host**
  (D-C7), NOT a custom scheme: custom schemes are not unique, so any app
  can register `stackd://` and receive the return. The broker serves both
  well-known files; the return URL is `https://<broker>/v1/connect/return`,
  which GoCardless accepts and which degrades to a "return to the app"
  page when the app is not installed. A custom scheme is registered ONLY
  as a fallback. iOS and Android share the host.
- **Android appId → `com.stackd.finance`** (D-C7): change `applicationId`
  in `android/app/build.gradle` (namespace/package may stay
  `com.stackd.app`). Existing debug installs reappear as a new app — the
  only cost, since no Play upload has happened.
- **New slice `stackd_v1_bankConnections`:** `{ref, institutionId,
  institutionName, accounts: [{bankAccountId, stackdAccountId, currency}],
  connectedAt, lastFetchAt, historyLimitDays, status}` — opaque ids only,
  safe to mirror; the deviceToken alone lives in SecureStorage (web: the
  cookie, i.e. nowhere in the app). Wire into init/cross-tab/RESET_APP;
  deliberately NOT in the CSV backup (connections are per-device).
- **Entitlement client:** a Capacitor in-app-purchase plugin for the store
  sheet; on purchase/restore the receipt goes to `/entitlement/verify`;
  the client caches only `{active, expiresAt}` in `stackd_v1_bankConnect`
  prefs for UI gating — the broker is the authority.
- **Web build:** the connect UI is reachable on web; without an entitled
  session it shows the pairing screen. The Playwright suite runs on the web
  build, so the broker client exposes a stub hook
  (`window.__STACKD_BROKER_STUB__`) that e2e uses to drive connect through
  to the preview without network.

## 4. Phase C2 — Fetch & normalize (inherited from the B design)

- `src/bank-connect.js` (new global, loaded after import.js): thin client
  for the broker; normalizes the transactions+balances JSON into the
  EXISTING statement shape `{format: 'connect', currency, entries,
  openingBalance: null, closingBalance}` — `transactionId` → `bankRef` →
  `ref:` importKeys, so refetching overlapping windows dedups by
  construction.
- Feed `_ImportShared.startStatement(...)` → the standard details → preview
  → confirm flow (category rules, match/link, transfer pairing, currency
  guard, reconciliation — all v0.99–v1.03 machinery, unchanged). Booked
  transactions only in v1 (D-C4).
- **First fetch window (D-C8):** 90 days, clamped to the institution's
  advertised history limit (agreements exceeding it fail at creation), AND
  — when the mapped Stack'd account already holds imported rows — starting
  the day after its newest imported row, user-widenable. Reason: file
  import keys come from statement references (`AcctSvcrRef`/`EndToEndId`)
  while connect keys come from the API `transactionId`; they usually
  differ, so an already-file-imported window would double up, and the
  v1.03 match rule refuses to link rows that already carry a key. Older
  history stays the file-import path.
- Subsequent fetches use `date_from = lastFetchAt - 7d` overlap.

## 5. Phase C3 — Refresh lifecycle

- On app open, per connection: fetch when `lastFetchAt` > 6h old —
  non-blocking; results surface as a review prompt ("12 new transactions
  from {bank}"), never auto-committed (house rule: no silent merging).
- Manual "Refresh now" per connection; "last synced" line on the card.
- Consent expiry (requisition status `EX`): Smart Insight + Settings banner
  "Reconnect {bank}" → re-runs the SCA leg via the broker.
- Subscription lapse: broker returns `402`; the card shows "Subscription
  needed to refresh" with the store sheet (native) — imported data is
  untouched.
- Degradation: broker/aggregator/network failures show "last synced X days
  ago" and nothing else; file import remains available for the same
  accounts (shared importKey space — mixing sources cannot duplicate).

## 6. Phase C4 — Legal, store, and business

- **GDPR:** operating the broker makes the developer a controller/processor
  in the connected-data flow even without storage — needs: privacy policy
  rework naming GoCardless as recipient and describing the transit-only
  broker, a DPA with GoCardless, EU hosting (D-C1 includes jurisdiction),
  and a documented no-logging policy. Store receipt identifiers and the
  owner record are personal data under GDPR — list them.
- **In-app Terms/Privacy (×5 dictionaries):** conditional carve-out to the
  "nothing ever leaves your device" clauses — accurate for non-connected
  users, explicit about the GoCardless flow for connected ones; new
  subscription clauses (billing via the store, cancellation, grace window,
  what happens to imported data — nothing); bump `terms.updatedDate`.
- **Store forms:** privacy labels change for the connected flow (disclose
  financial-data transmission); listing copy softens "100% local" to
  "local by default"; subscription products configured in Play Console and
  App Store Connect; both stores require the subscription terms link.
- **Aggregator terms:** developer creates THE GoCardless account, reviews
  Bank Account Data commercial terms/free allowance, and sets
  `MAX_CONNECTIONS` from them.

## 6b. Phase C5 — Web session + pairing

Separable from C1–C4 so native can ship first: cookie session mode in the
broker, `/pair/*` endpoints, the pairing screen on web, the "Pair a
browser" entry on native, logout. Requires the production domain.

## 7. What is explicitly NOT in this plan

- No storage of bank data server-side, ever (pass-through is the product's
  differentiator among Option-C apps — guard it in review).
- No background push/silent sync, no webhooks (aggregator supports none for
  BAD; polling on open is the model).
- No pending transactions in v1 (D-C4), no multi-aggregator abstraction
  (thin client, GoCardless only — swapping later is a rewrite of one file).
- No web payment path (Stripe) — web entitlement is pairing-only (D-C3).
- No free tier and no trial for Bank Connect (D-C3).
- No removal of anything from v0.99–v1.03: file import stays first-class.

## 8. Testing

- **Broker:** its own unit tests with a mocked GoCardless and mocked store
  APIs (token flow, ownership enforcement — THE security test: token A must
  never read requisition B — entitlement gating, grace/revoke, pairing
  single-use + TTL, CSRF, rate limits, revoke); deployable to a staging
  worker.
- **Client:** normalizer fixtures (recorded API JSON → statement shape);
  bankConnections slice CRUD; first-fetch window math; e2e covers
  paywall → connect → normalizer → preview by stubbing the broker client;
  the SCA/App-Link leg and the store purchase get a manual device
  checklist.
- No live-API calls in any CI.

## 9. Suggested sequencing

| Step | Scope |
|---|---|
| 0 | GoCardless account; Play + App Store subscription products; buy the domain (staging may run on workers.dev, but cookies + App Links need the real host before any public build); flip the Android appId |
| 1 | U2 from the UX plan (success modal — the landing surface fetches reuse) |
| 2 | C1 broker (native bearer mode + entitlement) + connect flow, staging broker first |
| 3 | C2 fetch/normalize into the pipeline |
| 4 | C3 refresh lifecycle |
| 5 | C4 legal/store rework — MUST land before any public build with C1 |
| 6 | C5 web session + pairing |

## 10. Decisions — settled 2026-09-04

| # | Decision | Outcome |
|---|---|---|
| D-C1 | Broker platform + region | **Cloudflare Workers + Durable Objects with `jurisdiction: 'eu'`** for the ownership/entitlement store; KV only for caches. Not KV for ownership (eventual consistency breaks the SCA return; no jurisdiction control). |
| D-C2 | Web build support | **Native + web.** Web uses a broker-set HttpOnly cookie session; entitled via pairing code from a subscribed phone (C5, after native ships). |
| D-C3 | Cost / monetization | **Paid subscription, store billing only** (Play Billing + StoreKit), verified at the broker. **No free tier, no trial:** all manual features stay free; Bank Connect requires the subscription. 14-day grace on lapse, then requisitions revoked. Global `MAX_CONNECTIONS` cap remains as the abuse bound. |
| D-C4 | Pending transactions | **Booked only.** Pending rows lack stable ids and mutate on booking → duplicates. Copy: "appears once your bank books it". |
| D-C5 | App attestation | **Fast-follow.** v1 = entitlement + per-device limits + global cap; `X-Stackd-Attest` header reserved; build-time client id included. |
| D-C6 | Repo layout | **`broker/` in this repo** with its own package.json/tsconfig/vitest/wrangler; root tooling untouched. |
| D-C7 | appId + deep link | **`com.stackd.finance` on Android too** (gradle `applicationId` change). Return via **https App Links / Universal Links on the broker host**, custom scheme as fallback only. **No domain exists yet** — staging on workers.dev, domain purchase is step 0. |
| D-C8 | First-fetch depth | **90 days**, clamped to the institution limit, and starting after the account's newest imported row when file imports exist (key-scheme mismatch would otherwise duplicate). User-widenable. |
