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
| `src/auth.ts` | device tokens `<ownerId>.<secret>`; the DO stores only `sha256(secret)`; the web session cookie + pairing codes (v1.11) |
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
| `POST /v1/pair/code` | native, entitled | v1.11: `{code, expiresAt}` — 8 chars, 5-minute TTL, single-use, 5/h per owner |
| `POST /v1/pair/claim` | — | v1.11: `{code}` → the browser becomes a `web` device on that owner: `Set-Cookie stackd_session` + `{ownerId, active, expiresAt, csrf, sessionExpiresAt}`; 10/h per IP |
| `GET /v1/session` | cookie | v1.11: the web boot check — same body with a fresh `csrf`, re-issues the cookie (90 days sliding); `401 no_session` |
| `POST /v1/session/logout` | cookie + CSRF | v1.11: removes the web device, clears the cookie |
| `GET /v1/devices`, `DELETE /v1/devices/:id` | device | v1.11: the owner's paired browsers (`{id, label, createdAt, lastSeenAt, current}`) and revoke |

**Two auth modes (v1.11 B7, UX plan §16):** a native device sends
`Authorization: Bearer <ownerId>.<secret>`; a browser sends the HttpOnly
cookie `stackd_session=<ownerId>.<secret>` (`Secure; SameSite=Lax`, set by
the claim) plus `X-Stackd-CSRF` on every non-GET call. Both resolve to the
same owner record; the app's `fetch` uses `credentials: 'include'` on web,
which is why CORS echoes the exact origin with
`Access-Control-Allow-Credentials: true`. A web-started connect returns to
`PUBLIC_WEB_URL/#bank-connect` instead of the hand-off page.

Every `/v1/*` call except the return needs `X-Stackd-Client: stackd-web`
(`CLIENT_ID`). Errors are `{error: <code>}`:
`400 invalid_code|web_only`, `401 device_token_required|invalid_device_token|no_session|invalid_session|session_expired`,
`402 subscription_required`, `403 client_required|csrf_required|csrf_invalid|native_only`,
`404 unknown_ref|unknown_account|unknown_device`, `409 connection_limit`,
`410 consent_expired|code_expired`, `429 rate_limited|account_rate_limited`,
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

## Monitoring (v1.16, A-11)

Cloudflare Workers Logs have **no alerting**, and retention is 3 days on the
free plan and 7 on paid — so by default nothing tells you that the Enable
Banking key expired or that purchases started failing. Both are total outages
of a feature, not slow degradations, and both are invisible from the outside:
the API keeps answering, it just answers with an error.

**A cron (every 15 min, `[triggers]` in wrangler.toml)** reads the counters and
posts to `ALERT_WEBHOOK_URL` when something crosses a threshold. Only faults an
operator can act on are counted — never per-user 4xx like a bad token, which
would turn ordinary traffic into Durable Object writes and bury the signal:

| Condition | Fires at | Why it matters |
|---|---|---|
| `aggregator_key_invalid`, `aggregator_not_configured` | 1/hour | every bank connect is failing |
| `aggregator_auth_failed` | 3/hour | the EB key is wrong or expired (a couple can be transient) |
| `store_auth_failed`, `store_not_configured`, `store_key_invalid` | 1–3/hour | purchases rejected AFTER the store charged the user |
| `internal` | 10/hour | unhandled 5xx |
| `breaker_open` | while open | the aggregator paused every caller |
| `capacity_high` | 90% of `MAX_CONNECTIONS` | the next connect will be refused |

A condition alerts once and then stays quiet for 6 hours, so a persistent
fault pages you once rather than 96 times a day. A webhook outage never throws
out of the cron; the next tick retries.

**`GET /v1/ops/status`** is the same snapshot on demand, so an alert and a
manual check can never disagree. It 404s unless `OPS_TOKEN` is set, and needs
`Authorization: Bearer <OPS_TOKEN>` — capacity and failure counts are not
public.

```powershell
npx wrangler secret put ALERT_WEBHOOK_URL --env production   # any JSON webhook
npx wrangler secret put OPS_TOKEN --env production
curl -H "authorization: Bearer <OPS_TOKEN>" https://api.stackdplatform.com/v1/ops/status
npx wrangler tail --env production --status error            # live, when you are watching
```

**This is not an uptime check.** If the Worker is down the cron is down with
it. Uptime belongs outside the failure domain: point any external pinger at
`GET /healthz` (public, no auth, `{ok:true}`) every few minutes. That is an
owner task and needs no code.

## Threat model (keep current)

- **Broker compromise** exposes the aggregator private key (revoke the
  application in the Enable Banking Control Panel and create a new one), the
  ownership mapping (opaque ids, IBAN tails, no names, no transactions) and —
  after B5 — store receipt identifiers. Nothing else exists to take.
- **Token theft** from a device exposes that owner's connections only; every
  data path is checked against the caller's own record and unknown ids are
  404, never 403. Revoking = `DELETE /v1/connections/:ref`.
- **Web sessions (v1.11):** the cookie is `HttpOnly` (never readable by
  JS) and `SameSite=Lax`; every mutation needs the `X-Stackd-CSRF` header,
  whose hash lives on the web device entry and rotates on each boot check,
  so a cross-site form post or top-level navigation cannot act. Sessions
  expire 90 days after the last check. Pairing codes are single-use,
  5-minute, 32⁸ keyspace, 5/h per owner to mint and 10/h per IP to claim;
  the SystemDO only routes a claim, the owner record decides. Logout
  removes only that browser; the phone lists and revokes browsers
  (`/v1/devices`). A cookie session can re-check entitlement but never
  mint an owner.
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
(the dev origin is in `ALLOWED_ORIGINS`). For the **web session mode**
(v1.11) use `wrangler dev` instead — cookies need a same-site broker, and
`localhost:3000` → `localhost:8787` is one; set
`window.__STACKD_WEB_SESSION__ = true` and
`window.__STACKD_BROKER_URL__ = 'http://localhost:8787'` (UX plan §16.4).
`PUBLIC_WEB_URL` (`[vars]`) is where a web-started connect flow returns. `workers.dev` hostnames are blocked
on some networks (TLS alert for the whole domain, `wrangler tail` included),
which is why staging lives on the project's own zone.

## Deploy production (api.stackdplatform.com)

**A preflight runs first and will refuse the deploy.** `npm run
deploy:production` is preceded by `predeploy:production`, which is
`scripts/preflight.mjs`. Run it any time on its own:

```bash
npm run preflight              # config only
npm run preflight -- --secrets # also ask Cloudflare which secrets are set
```

It exists because every one of these failures is SILENT in production rather
than loud: an empty `EB_APP_ID` answers 503 on the first bank connect, missing
store keys reject purchases the store has already charged for, empty App-Link
fingerprints send every bank return down the `stackd://` fallback, and a
missing Capacitor WebView origin fails CORS on every native request at once.
It checks that the required vars are non-empty, that the mode is `store` and
the host is not staging, that `ALLOWED_ORIGINS` still carries
`https://localhost` and `capacitor://localhost`, that `IOS_APP_ID` is
`TEAMID.bundleid` and agrees with `APPLE_BUNDLE_ID`, that the fingerprints are
really colon-separated SHA-256 (a pasted SHA-1 is the classic error), and —
by reading the app repo rather than a copy — that the package ids and the
subscription product ids still match the app, and that `stackd_pro` never
appears (Stack'd Pro is a LOCAL entitlement; its receipts must not reach the
broker). `test/preflight.test.ts` covers it.

`--env production` uses `ENTITLEMENT_MODE=store`, the custom domain route and
its own secret (`wrangler secret put EB_PRIVATE_KEY --env production`, from a
production application). Fill `ANDROID_SHA256_FINGERPRINTS` (release keystore)
and `IOS_APP_ID` (`TEAMID.com.stackd.finance`) before any public build so the
App Links / Universal Links verify. B6 (legal) must land first.

The fingerprint is the signing certificate's SHA-256, colon-separated, as
`keytool` prints it (several may be listed, comma-separated — e.g. the Play
App Signing key and the upload key). Staging takes the debug keystore so
internal builds verify against `api-staging`:

```powershell
keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android | Select-String SHA256
keytool -list -v -keystore <release>.jks -alias <alias> | Select-String SHA256
```

Then redeploy and check `https://api-staging.stackdplatform.com/.well-known/assetlinks.json`
shows it; on the device `adb shell pm get-app-links com.stackd.finance` must
say `verified` for the host (Android 12+: `adb shell pm verify-app-links
--re-verify com.stackd.finance` after a reinstall).
