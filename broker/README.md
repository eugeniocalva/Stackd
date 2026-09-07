# Stack'd Bank Connect broker

The server side of Bank Connect (`docs/bank-connect-plan.md` §2, phase B1 of
`docs/bank-connect-ux-plan.md`). A Cloudflare Worker that sits between the
app and GoCardless Bank Account Data, holds the one aggregator secret pair,
and keeps only ownership + entitlement state in EU-pinned Durable Objects.

It is **pass-through by design**: bank data transits and is never written or
logged. This folder has its own tooling; nothing here is loaded by the app,
and the root `npm run lint/test` never touch it.

## Layout

| File | Role |
|---|---|
| `src/index.ts` | routing, CORS, client-id gate, sessions, every handler |
| `src/durable-objects.ts` | `OwnerDO` (per owner, `jurisdiction('eu')`), `SystemDO` (token cache, breaker, global count), `RateDO` (per-IP windows), typed clients |
| `src/gocardless.ts` | aggregator client: token lifecycle, 401 retry, 429 → breaker |
| `src/auth.ts` | device tokens `<ownerId>.<secret>`; the DO stores only `sha256(secret)` |
| `src/html.ts` | the `/v1/connect/return` hand-off page |
| `test/` | node vitest suite on in-memory DO fakes + a fake GoCardless |
| `scripts/smoke.mjs` | drives a deployed worker through the sandbox bank |

## Endpoints (v1)

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /healthz` | — | `{ok, mode}` |
| `GET /.well-known/assetlinks.json`, `/apple-app-site-association` | — | from `ANDROID_*` / `IOS_APP_ID` vars |
| `GET /v1/institutions?country=IT` | client id | trimmed GoCardless list, edge-cached 24h, 120/min per IP |
| `POST /v1/entitlement/verify` | client id (+ device) | no bearer → mints owner + `deviceToken` (10/h per IP). `open` mode → entitled for a year. `store` mode → B5 (501 on receipts for now) |
| `POST /v1/connect/start` | device, entitled | `{country, institutionId, historyDays, validityDays}` → agreement + requisition → `{ref, bankRedirectUrl}`; clamped to the institution; 3 per owner, `MAX_CONNECTIONS` global |
| `GET /v1/connect/return?ref=` | — | GoCardless redirect target; App Link when verified, else the custom-scheme page |
| `GET /v1/connect/status?ref=` | device | requisition status; on `LN` resolves `{id, ibanTail, currency, name}` once and caches it in the DO |
| `GET /v1/connections` | device | the owner's requisitions (public shape) |
| `GET /v1/accounts/:id/transactions?date_from&date_to` | device, entitled | proxied, ownership-checked, unknown → 404 |
| `GET /v1/accounts/:id/balances` | device, entitled | proxied |
| `DELETE /v1/connections/:ref` | device | revokes at GoCardless, forgets the ref, releases capacity |

Every `/v1/*` call needs `X-Stackd-Client: stackd-web` (`CLIENT_ID`).
Errors are `{error: <code>}`: `401 device_token_required|invalid_device_token`,
`402 subscription_required`, `403 client_required`, `404 unknown_ref|unknown_account`,
`409 connection_limit`, `429 rate_limited|account_rate_limited`,
`503 capacity|aggregator_paused|aggregator_rate_limited|aggregator_not_configured`.

## Threat model (keep current)

- **Broker compromise** exposes the aggregator secret (rotate at GoCardless),
  the ownership mapping (opaque ids, IBAN tails, no names, no transactions)
  and — after B5 — store receipt identifiers. Nothing else exists to take.
- **Token theft** from a device exposes that owner's connections only; every
  data path is checked against the caller's own record and unknown ids are
  404, never 403. Revoking = `DELETE /v1/connections/:ref`.
- **Abuse as a free GoCardless proxy** is bounded by the entitlement check,
  the per-IP mint/institutions limits, the per-owner request limit, the
  per-owner and global connection caps, and the aggregator circuit breaker.
  App attestation (`X-Stackd-Attest`, D-C5) is the real fix and is a fast
  follow.
- **Logging** records method, path, status and latency. Never bodies, never
  headers, never query strings with refs.
- **`ENTITLEMENT_MODE=open`** is refused whenever `PUBLIC_URL` is the
  production host, regardless of `[vars]`.
- **EU pin:** `OwnerDO` is reached through `jurisdiction('eu')`. Local
  workerd lacks jurisdictions and `ownerNamespace()` falls back for that one
  error message only (`wrangler dev`); deployed workers always pin.

## Run locally

```bash
cd broker
npm install
npm run check          # typecheck + tests + dry-run build
cp .dev.vars.example .dev.vars   # then fill the two GoCardless secrets
npm run dev            # http://localhost:8787
```

## Deploy staging (workers.dev)

One-time, in your own terminal (interactive browser login):

```bash
cd broker && npx wrangler login
```

Then:

```bash
cd broker && npx wrangler secret put GC_SECRET_ID
cd broker && npx wrangler secret put GC_SECRET_KEY
cd broker && npm run deploy:staging
```

Smoke it (prints the sandbox bank link; complete it in a browser, then run
the printed `status` command):

```bash
cd broker && node scripts/smoke.mjs https://stackd-broker-staging.<account>.workers.dev
```

Point the dev app at staging from the browser console before enabling the
toggle: `window.__STACKD_BROKER_URL__ = 'https://stackd-broker-staging.<account>.workers.dev'`
(the dev origin is in `ALLOWED_ORIGINS`).

## Deploy production (api.stackdplatform.com)

`--env production` uses `ENTITLEMENT_MODE=store`, the custom domain route and
its own secrets (`wrangler secret put … --env production`). Fill
`ANDROID_SHA256_FINGERPRINTS` (release keystore) and `IOS_APP_ID`
(`TEAMID.com.stackd.finance`) before any public build so the App Links /
Universal Links verify. B6 (legal) must land first.
