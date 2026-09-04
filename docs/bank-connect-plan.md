# Bank Connect Plan (Option C) — automatic retrieval via a Stack'd broker

> Status: **DRAFT — not started.** Cold-start reference for automatic bank
> data retrieval through a small Stack'd-operated broker server. Read
> `docs/bank-import-plan.md` §3f–§7a first — the fetched data flows through
> that pipeline UNCHANGED; nothing shipped in v0.99–v1.03 is reverted or
> refactored by this plan. Settle the §10 decisions with the user before C1.
> Relationship to `docs/import-ux-plan.md`: independent; recommended order is
> U2 (success modal) → C1–C4 → the rest of the UX plan.

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
  beyond any free allowance) plus hosting — a real recurring cost that may
  eventually need monetization (§10 D-C3).
- The PSD2 limits carry over regardless of architecture: consent re-auth
  every 90–180 days, ~4 refreshes/account/day, refresh-on-open rather than
  true background sync. Keep these in the UI copy.
- Native-app benefit is strongest, but with a broker the WEB build could
  also connect (no CORS problem — the broker is ours). Decision D-C7.

## 2. Architecture overview

```
device (Stack'd app)  ←→  broker (serverless, EU region)  ←→  GoCardless  ←→  bank
```

- The broker holds the ONE GoCardless secret (env var, never in any repo).
- **Pass-through by design:** the broker persists NO bank data — it stores
  only `{deviceToken → [requisitionId]}` ownership mappings. Transaction
  JSON transits, is never written, and response bodies are never logged.
- **Device identity, no visible accounts:** on first connect the app
  generates nothing itself — the broker issues an opaque bearer token,
  stored in native SecureStorage (never in `stackd_v1_*`, never in the CSV
  backup, never in the file mirror). All data endpoints require it and only
  return requisitions that token owns. The no-signup UX survives even
  though infrastructure exists.
- Per-device rate limiting at the broker; global circuit breaker for the
  aggregator quota.

### Broker endpoints (v1)

| Endpoint | Purpose |
|---|---|
| `POST /v1/connect/start` | body: country, institutionId → creates end-user agreement + requisition at GoCardless, returns `{deviceToken?, ref, bankRedirectUrl}` (token minted on first call) |
| `GET  /v1/connect/status?ref=` | after SCA: requisition state + linked bank accounts (id, IBAN tail, currency) |
| `GET  /v1/institutions?country=` | bank picker data (cacheable, unauthenticated OK) |
| `GET  /v1/accounts/:id/transactions?date_from=` | proxied booked transactions (ownership-checked) |
| `GET  /v1/accounts/:id/balances` | proxied balances |
| `DELETE /v1/connections/:ref` | revoke: deletes the requisition at GoCardless + the mapping |

### Threat model notes (write into the broker README)

Broker compromise exposes: the aggregator secret (rotate) and the ownership
mapping (opaque ids, no bank data, no names). It does NOT expose transaction
history — nothing is stored. Abuse vector: strangers using the broker as a
free GoCardless proxy → per-device limits at minimum; app attestation (Play
Integrity / App Attest) is the real fix — decision D-C5, likely a fast
follow rather than v1.

## 3. Phase C1 — Broker + connect flow

- **Broker service:** new top-level `broker/` folder in this repo (decision
  D-C6) — TypeScript on the chosen platform (D-C1; recommendation:
  Cloudflare Workers + KV, EU jurisdiction settings, deployed with
  wrangler; near-zero cost at small scale, no cold starts). Endpoints
  above, GoCardless client, token issuing, ownership store, rate limits.
- **Client connect flow** ("Connect a bank" in Others & Settings, native
  gate per D-C7): country pre-filled from locale → bank picker (broker
  `/institutions`) → disclosure screen (consent-style: names GoCardless,
  states what transits, links Terms) → open `bankRedirectUrl` in the system
  browser (`@capacitor/browser`) → deep-link return
  (`<appId>://bank-connect?ref=...`) → poll `/connect/status` → map each
  bank account to an existing Stack'd account or create one (IBAN-tail
  name; currency from the API — v1.02 slots in).
- **New slice `stackd_v1_bankConnections`:** `{ref, institutionId,
  institutionName, accounts: [{bankAccountId, stackdAccountId, currency}],
  connectedAt, lastFetchAt, status}` — opaque ids only, safe to mirror; the
  deviceToken alone lives in SecureStorage. Wire into init/cross-tab/
  RESET_APP; deliberately NOT in the CSV backup (connections are per-device).
- ⚠️ HARD PREREQUISITE: the **Android appId decision** (`com.stackd.app` vs
  iOS `com.stackd.finance`) — the deep-link scheme bakes it in and Play
  makes it permanent.

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
- First connect fetches the agreement's history window (D-C8, recommend 90
  days); subsequent fetches use `date_from = lastFetchAt - 7d` overlap.

## 5. Phase C3 — Refresh lifecycle

- On app open, per connection: fetch when `lastFetchAt` > 6h old —
  non-blocking; results surface as a review prompt ("12 new transactions
  from {bank}"), never auto-committed (house rule: no silent merging).
- Manual "Refresh now" per connection; "last synced" line on the card.
- Consent expiry (requisition status `EX`): Smart Insight + Settings banner
  "Reconnect {bank}" → re-runs the SCA leg via the broker.
- Degradation: broker/aggregator/network failures show "last synced X days
  ago" and nothing else; file import remains available for the same
  accounts (shared importKey space — mixing sources cannot duplicate).

## 6. Phase C4 — Legal, store, and business

- **GDPR:** operating the broker makes the developer a controller/processor
  in the connected-data flow even without storage — needs: privacy policy
  rework naming GoCardless as recipient and describing the transit-only
  broker, a DPA with GoCardless, EU hosting (D-C1 includes jurisdiction),
  and a documented no-logging policy.
- **In-app Terms/Privacy (×5 dictionaries):** conditional carve-out to the
  "nothing ever leaves your device" clauses — accurate for non-connected
  users, explicit about the GoCardless flow for connected ones; bump
  `terms.updatedDate`.
- **Store forms:** privacy labels change for the connected flow (disclose
  financial-data transmission); listing copy softens "100% local" to
  "local by default". Review risk is LOWER than B (server-backed bank
  connections are the standard fintech shape Apple sees daily).
- **Aggregator terms:** developer creates THE GoCardless account, reviews
  Bank Account Data commercial terms/free allowance, and budgets per-
  connected-account pricing. Monetization decision D-C3 gates how far to
  roll out (e.g. cap connections while free).

## 7. What is explicitly NOT in this plan

- No storage of bank data server-side, ever (pass-through is the product's
  differentiator among Option-C apps — guard it in review).
- No background push/silent sync, no webhooks (aggregator supports none for
  BAD; polling on open is the model).
- No pending transactions in v1 (D-C4), no multi-aggregator abstraction
  (thin client, GoCardless only — swapping later is a rewrite of one file).
- No removal of anything from v0.99–v1.03: file import stays first-class.

## 8. Testing

- **Broker:** its own unit tests with a mocked GoCardless (token flow,
  ownership enforcement — THE security test: token A must never read
  requisition B — rate limits, revoke); deployable to a staging worker.
- **Client:** normalizer fixtures (recorded API JSON → statement shape);
  bankConnections slice CRUD; e2e covers normalizer→preview by stubbing the
  broker client; the SCA/deep-link leg gets a manual device checklist.
- No live-API calls in any CI.

## 9. Suggested sequencing

| Step | Scope |
|---|---|
| 0 | Settle §10 decisions; create the GoCardless account; appId decision |
| 1 | U2 from the UX plan (success modal — the landing surface fetches reuse) |
| 2 | C1 broker + connect flow (staging broker first) |
| 3 | C2 fetch/normalize into the pipeline |
| 4 | C3 refresh lifecycle |
| 5 | C4 legal/store rework — MUST land before any public build with C1 |

## 10. Open decisions — settle before C1

1. **D-C1 — Broker platform + region:** Cloudflare Workers + KV, EU
   jurisdiction (recommended) vs a small EU VPS vs AWS Lambda (eu-central).
2. **D-C2 — Web build support:** native-only v1 (recommended — SecureStorage
   and deep links are native strengths) or include the web build via
   broker-set cookies?
3. **D-C3 — Cost/monetization stance:** absorb costs under a connection cap
   for v1 (recommended), or design the paid tier now?
4. **D-C4 — Pending transactions:** booked-only v1 (recommended; pending
   rows mutate and fight dedup) or include as `isPaid: false`?
5. **D-C5 — App attestation:** v1 or fast-follow? (Recommended:
   fast-follow; per-device rate limits at v1.)
6. **D-C6 — Repo layout:** `broker/` folder in this repo (recommended:
   shared context, like `mobile_apple/`) vs a separate repo.
7. **D-C7 — Deep-link/appId:** final Android appId ([[blocking]], see
   `docs`/memory) and whether iOS/Android share the scheme.
8. **D-C8 — First-fetch history depth:** 90 days fixed (recommended) vs
   user choice; older history stays the file-import path.
