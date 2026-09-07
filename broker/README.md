# Stack'd Bank Connect broker

The server side of Bank Connect (`docs/bank-connect-plan.md` §2, phase B1 of
`docs/bank-connect-ux-plan.md`). A Cloudflare Worker that sits between the
app and the open-banking aggregator, holds the one aggregator credential,
and keeps only ownership + entitlement state in EU-pinned Durable Objects.

**Aggregator: Enable Banking** (since 2026-09-07 — GoCardless Bank Account
Data closed self-serve sign-ups; UX plan §11). It is the only thing
`src/enable-banking.ts` knows about; the app only ever sees this broker's API.

It is **pass-through by design**: bank data transits and is never written or
logged. This folder has its own tooling; nothing here is loaded by the app,
and the root `npm run lint/test` never touch it.

## Layout

| File | Role |
|---|---|
| `src/index.ts` | routing, CORS, client-id gate, sessions, every handler incl. the bank return |
| `src/durable-objects.ts` | `OwnerDO` (per owner, `jurisdiction('eu')`), `SystemDO` (breaker, global count), `RateDO` (per-IP windows), typed clients |
| `src/enable-banking.ts` | aggregator adapter: PEM import, RS256 JWT, error mapping, pagination |
| `src/auth.ts` | device tokens `<ownerId>.<secret>`; the DO stores only `sha256(secret)` |
| `src/html.ts` | the `/v1/connect/return` hand-off page |
| `test/` | node vitest suite on in-memory DO fakes + a fake Enable Banking that verifies the JWT signature |
| `scripts/smoke.mjs` | drives a deployed worker through the sandbox "Mock ASPSP" |

## Endpoints (v1)

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /healthz` | — | `{ok, mode, aggregator}` |
| `GET /.well-known/assetlinks.json`, `/apple-app-site-association` | — | from `ANDROID_*` / `IOS_APP_ID` vars |
| `GET /v1/institutions?country=IT` | client id | `{id: "IT:Name", name, country, logo, bic, historyDays, maxValidityDays, beta, sandbox}`, edge-cached 24h, 120/min per IP |
| `POST /v1/entitlement/verify` | client id (+ device) | no bearer → mints owner + `deviceToken` (10/h per IP). `open` mode → entitled for a year. `store` mode → verifies the receipt with the store (see below) |
| `POST /v1/connect/start` | device, entitled | `{country, institutionId, historyDays, validityDays}` → `POST /auth` at the aggregator → `{ref, bankRedirectUrl}`; clamped to the institution; 3 per owner, `MAX_CONNECTIONS` global |
| `GET /v1/connect/return?code&state` | — | the bank's redirect target: exchanges `code` for a session, stores `{id, ibanTail, currency, name}` per account, then hands off to the app (App Link when verified, else the custom-scheme page) |
| `GET /v1/connect/status?ref=` | device | the connection: `status` CR / LN / EX / RJ / UA, accounts, expiresAt, lastError |
| `GET /v1/connections` | device | the owner's connections (same shape) |
| `GET /v1/accounts/:id/transactions?date_from&date_to` | device, entitled | proxied, all pages merged → `{transactions, truncated}`; ownership-checked, unknown → 404 |
| `GET /v1/accounts/:id/balances` | device, entitled | proxied |
| `DELETE /v1/connections/:ref` | device | deletes the session at the aggregator, forgets the ref, releases capacity |

Every `/v1/*` call except the return needs `X-Stackd-Client: stackd-web`
(`CLIENT_ID`). Errors are `{error: <code>}`:
`401 device_token_required|invalid_device_token`, `402 subscription_required`,
`403 client_required`, `404 unknown_ref|unknown_account`, `409 connection_limit`,
`410 consent_expired`, `429 rate_limited|account_rate_limited`,
`502 aggregator_auth_failed|aggregator_error_<status>`,
`503 capacity|aggregator_paused|aggregator_rate_limited|aggregator_not_configured|aggregator_key_invalid`.
On staging (open mode) an `aggregator_auth_failed` carries a shape-only `diag`.

## Store entitlement (v1.09 B5)

In `store` mode `POST /v1/entitlement/verify` verifies receipts with the
stores itself (`src/store-verify.ts`): Google Play via a service-account JWT
→ `purchases.subscriptionsv2` (acknowledging as a backstop), Apple via an
ES256 App Store Server API JWT → subscription statuses (sandbox retry on a
production 404). Without a receipt it silently re-checks a stored one near
expiry / after a lapse (once per 6 h). Config: `PRODUCT_IDS`,
`PLAY_PACKAGE_NAME`, `APPLE_BUNDLE_ID`, `APPLE_ISSUER_ID`, `APPLE_KEY_ID`
(vars) and the secrets `PLAY_SERVICE_ACCOUNT_JSON` (whole key file) and
`APPLE_PRIVATE_KEY` (the `.p8`):

```powershell
cd C:\Users\ecalvaresi\Desktop\Projects\Stackd\broker; Get-Content "<service-account>.json" -Raw | npx wrangler secret put PLAY_SERVICE_ACCOUNT_JSON --env production
cd C:\Users\ecalvaresi\Desktop\Projects\Stackd\broker; Get-Content "AuthKey_<KEYID>.p8" -Raw | npx wrangler secret put APPLE_PRIVATE_KEY --env production
```

Errors: `400 receipt_required|receipt_invalid|product_unknown|platform_unknown`,
`502 store_auth_failed|store_error_<status>`, `503 store_not_configured|store_key_invalid`.

## Threat model (keep current)

- **Broker compromise** exposes the aggregator private key (revoke the
  application in the Enable Banking Control Panel and create a new one), the
  ownership mapping (opaque ids, IBAN tails, no names, no transactions) and —
  after B5 — store receipt identifiers. Nothing else exists to take.
- **Token theft** from a device exposes that owner's connections only; every
  data path is checked against the caller's own record and unknown ids are
  404, never 403. Revoking = `DELETE /v1/connections/:ref`.
- **The return URL** is unauthenticated by nature (the bank's browser
  redirect). `state` must be a well-formed ref whose owner record holds it in
  `CR`; the code is single-use at the aggregator; a replay renders the page
  and exchanges nothing.
- **Abuse as a free aggregator proxy** is bounded by the entitlement check,
  the per-IP mint/institutions limits, the per-owner request limit, the
  per-owner and global connection caps, and the circuit breaker. App
  attestation (`X-Stackd-Attest`, D-C5) is the real fix and is a fast follow.
- **Logging** records method, path, status and latency; aggregator failures
  log status + error code only. Never bodies, never headers, never refs.
- **`ENTITLEMENT_MODE=open`** is refused whenever `PUBLIC_URL` is the
  production host, regardless of `[vars]`.
- **EU pin:** `OwnerDO` is reached through `jurisdiction('eu')`. Local
  workerd lacks jurisdictions and `ownerNamespace()` falls back for that one
  error message only (`wrangler dev`); deployed workers always pin.

## Enable Banking application

Register at `enablebanking.com` → Control Panel → API applications:

- Environment **Sandbox** (activates automatically; only sandbox banks such as
  "Mock ASPSP"). Production needs a contract + company KYB, or *"Activate by
  linking accounts"* (restricted mode: only your own whitelisted accounts).
- Redirect URLs: `https://api-staging.stackdplatform.com/v1/connect/return`
  (add `https://api.stackdplatform.com/v1/connect/return` for production).
- Let the browser generate the key; it downloads `<application-id>.pem`.
  The application id (UUID) is `EB_APP_ID` in `wrangler.toml`; the PEM is the
  `EB_PRIVATE_KEY` secret.

## Run locally

```bash
cd broker
npm install
npm run check          # typecheck + tests + dry-run build
cp .dev.vars.example .dev.vars   # then fill EB_PRIVATE_KEY (see the file)
npm run dev            # http://localhost:8787
```

## Deploy staging (api-staging.stackdplatform.com)

One-time, in your own terminal (interactive browser login):

```bash
cd broker && npx wrangler login
```

Set `EB_APP_ID` in `wrangler.toml` `[vars]`, then upload the key from the
downloaded file (PowerShell) and deploy:

```powershell
cd C:\Users\ecalvaresi\Desktop\Projects\Stackd\broker; Get-Content "$env:USERPROFILE\Downloads\<application-id>.pem" -Raw | npx wrangler secret put EB_PRIVATE_KEY
```

```bash
cd broker && npm run deploy:staging
```

Smoke it (prints the sandbox bank link; complete it in a browser, the bank
returns to the broker, then run the printed `status` command):

```bash
cd broker && node scripts/smoke.mjs https://api-staging.stackdplatform.com
```

Point the dev app at staging from the browser console before enabling the
toggle: `window.__STACKD_BROKER_URL__ = 'https://api-staging.stackdplatform.com'`
(the dev origin is in `ALLOWED_ORIGINS`). `workers.dev` hostnames are blocked
on some networks (TLS alert for the whole domain, `wrangler tail` included),
which is why staging lives on the project's own zone.

## Deploy production (api.stackdplatform.com)

`--env production` uses `ENTITLEMENT_MODE=store`, the custom domain route and
its own secret (`wrangler secret put EB_PRIVATE_KEY --env production`, from a
production application). Fill `ANDROID_SHA256_FINGERPRINTS` (release keystore)
and `IOS_APP_ID` (`TEAMID.com.stackd.finance`) before any public build so the
App Links / Universal Links verify. B6 (legal) must land first.
