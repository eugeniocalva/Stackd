# Broker incident runbook (v1.17)

What to do when the Bank Connect broker misbehaves or is compromised. Written
to be followed at 2am by one person who did not write it that day.

> **Owner: fill these in before you need them.** They are deliberately blank
> because guessing them would be worse than leaving them empty.
>
> | | |
> |---|---|
> | Supervisory authority (your EU member state) | `________` |
> | Its breach-notification portal | `________` |
> | Your controller identity (name, address) | `________` (see launch-plan O-02) |
> | Where the console logins live | a password manager, not this file |
>
> Keep this file free of secrets, tokens and personal data. It is committed to
> a public repository.

## How to read this file — nothing here is struck through, on purpose

`launch-plan.md` and `store-listing.md` cross out what is finished. **Nothing
in this file is ever finished.** Every step is conditional, to be run only
during an incident, and a struck-out line read at 2am means "skip this" —
which is the last thing this document should ever say.

So the steps stay upright. What is marked instead is **readiness**: whether
the thing a step depends on actually exists yet. That is §0a, it was measured
rather than remembered, and it is the part that goes stale.

---

## 0a. Readiness — what would work tonight (measured 2026-09-09)

**This runbook is currently dormant, and that is the correct state.** Bank
Connect ships switched off, no released build talks to a broker, and the
production Worker has never been deployed. There is no live incident surface.
It matters anyway, because readiness is exactly the thing you cannot build
during an incident.

| What a step needs | State |
|---|---|
| The pause lever, `/v1/ops/pause` (§2) | ~~built~~ **IN PLACE** — v1.16 A-12, with tests |
| The status snapshot, `/v1/ops/status` (§1) | ~~built~~ **IN PLACE** — v1.16 A-11 |
| The 15-minute monitoring cron | ~~built~~ **IN PLACE** — `[triggers]` in both envs |
| `preflight --secrets` after a rotation (§3) | ~~built~~ **IN PLACE** — `broker/scripts/preflight.mjs` |
| The end-to-end smoke (§7) | ~~built~~ **IN PLACE** — `broker/scripts/smoke.mjs` |
| The Service status line to notify on (§6) | ~~built~~ **IN PLACE** — `StackdSite/support.html` |
| **The production Worker itself** | **MISSING** — `api.stackdplatform.com` does not answer at all. Every command below points there, so today they hang rather than fail |
| **`EB_APP_ID` in `[env.production.vars]`** | **MISSING** — empty, so `deploy:production` is refused by its own preflight |
| **`ALERT_WEBHOOK_URL`** | **UNKNOWN from here** — it is a secret; with it unset the cron only keeps counters and pages nobody |
| **External pinger on `/healthz`** | **MISSING** — launch-plan O-30. Until it exists, "the Worker is down" is a class of incident nothing tells you about |
| **The owner table above** | **MISSING** — the 72-hour clock in §4 is not a good time to be searching for a portal URL |

**Rehearse before you need it.** Staging
(`api-staging.stackdplatform.com`) is live, runs this repo's code as of
2026-09-09, and is the safe place to learn the pause lever — it is
`ENTITLEMENT_MODE=open` against the Enable Banking sandbox, so pausing it
costs nothing.

One thing still blocks the rehearsal: **`OPS_TOKEN` is not set on staging**,
and both ops routes answer `404` without it by design, so the endpoint is
invisible rather than merely locked. Set one (any long random string; it
belongs in the password manager, not here):

```powershell
cd broker; npx wrangler secret put OPS_TOKEN
```

Then walk §1 and §2 end to end against staging: read `/v1/ops/status`, pause
with `{"minutes":5}`, confirm the app shows "temporarily unavailable", lift
it with `{"minutes":0}`. Swap the host for `api.stackdplatform.com` and add
`--env production` and the commands are the ones written below.

**How to read the codes while rehearsing:** `404` means `OPS_TOKEN` is unset
on that environment, `401` means it is set and your bearer token is wrong,
`403 client_required` means you reached a build whose ops routes still sit
behind the client header — i.e. one older than v1.16.

---

## 0. Before anything: what is actually at stake

Knowing this is what stops a 2am over-reaction, and it is also the input to
the GDPR risk assessment in step 5.

**The broker never holds transactions.** Bank data transits and is never
written or logged (`broker/README.md`, threat model). What it *does* hold, per
owner:

- an opaque owner id and per-device token hashes
- per linked bank: a connection reference, the bank's name, each account's
  **IBAN last 4**, currency and name
- subscription status and the store's transaction identifier

No names, no addresses, no bank credentials, no balances, no transactions.

It also holds, as secrets: the **Enable Banking private key**, the **Play
service-account key**, and the **Apple In-App Purchase key**.

So the worst realistic case is: someone can impersonate the app to Enable
Banking, and read a mapping of opaque ids to bank names and IBAN tails. That
is personal data and it is sensitive — but it is not account access and it is
not transaction history.

---

## 1. Detect

You will hear about it in one of four ways:

| Source | What it means |
|---|---|
| Alert webhook (`ALERT_WEBHOOK_URL`) | a counted fault crossed its threshold — see the table in `broker/README.md` |
| External uptime pinger on `/healthz` | the Worker itself is down; the cron is down with it, so no alert will come |
| A user emails `hi@stackdplatform.com` | usually the first sign of something the counters do not cover |
| Enable Banking, Apple or Google contact you | treat as confirmed until proven otherwise |

Two of those four are not armed yet — the webhook secret and the pinger — so
check §0a before assuming silence means health.

First command, always:

```bash
curl -H "authorization: Bearer <OPS_TOKEN>" https://api.stackdplatform.com/v1/ops/status
npx wrangler tail --env production --status error
```

`/v1/ops/status` gives the same snapshot the alert was built from, so you are
never debugging against a different picture than the one that paged you.

---

## 2. Contain — do this before you understand it

If there is any chance a key leaked or the Worker is serving something it
should not, **stop the bank traffic first and investigate second**.

```bash
# Halts EVERY aggregator call within one request. No deploy needed.
curl -X POST -H "authorization: Bearer <OPS_TOKEN>" -H "content-type: application/json" \
     -d '{"minutes":120}' https://api.stackdplatform.com/v1/ops/pause
```

Users see "temporarily unavailable" on refresh; **nothing is deleted and no
consent is lost**. Lift it with `{"minutes":0}`.

Do NOT reach for revoking the Enable Banking application as a first move: it
invalidates every user's consent and forces all of them through their bank's
login again. That is step 3, and only if a key is actually exposed.

Escalation, worst case (the Worker itself is serving malicious code): remove
the custom domain route in the Cloudflare dashboard, or
`npx wrangler delete --env production`. The app fails closed — Bank Connect
degrades to "unavailable" and every local feature keeps working, because
nothing else in Stack'd talks to a server.

---

## 3. Revoke and rotate

Only what is actually exposed. Each is independent.

**Enable Banking private key** (a broker compromise implies this):

1. Enable Banking Control Panel → the application → revoke / delete it.
   This invalidates every existing bank session at once. There is no
   broker-side mass-revoke, and this is the reason there does not need to be.
2. Create a new application with the same redirect URL
   (`https://api.stackdplatform.com/v1/connect/return`), terms and privacy
   URLs, and the data-protection email.
3. ```powershell
   cd broker; Get-Content "<new-app-id>.pem" -Raw | npx wrangler secret put EB_PRIVATE_KEY --env production
   ```
4. Put the new application UUID in `[env.production.vars] EB_APP_ID`, then
   `npm run deploy:production` (the preflight will check it).
5. Every user must re-link their banks. Say so — see step 6.

**Apple In-App Purchase key:** App Store Connect → Users and Access →
Integrations → In-App Purchase → revoke the key, generate a new one, then
`wrangler secret put APPLE_PRIVATE_KEY --env production` and update
`APPLE_KEY_ID`.

**Google Play service account:** Google Cloud console → the service account →
delete the compromised key, create a new JSON key, then
`Get-Content key.json -Raw | npx wrangler secret put PLAY_SERVICE_ACCOUNT_JSON --env production`.

**Cloudflare account:** rotate the API token, `npx wrangler logout` then
`login`, and check the audit log for deploys you did not make. If a deploy is
unexplained, assume the Worker source was replaced and redeploy from a known
good commit.

**Ops token / alert webhook:** `wrangler secret put OPS_TOKEN --env production`.

After any rotation:

```bash
cd broker && npm run preflight -- --secrets
curl https://api.stackdplatform.com/healthz
```

---

## 4. Assess — is it a personal-data breach?

GDPR Art. 4(12): a breach is destruction, loss, alteration, unauthorised
disclosure of, or access to personal data. Answer three questions and write
the answers down with timestamps; that record is itself required (Art. 33(5)).

1. **What categories?** Owner/device identifiers, bank names, IBAN last-4,
   account names, subscription identifiers. Transactions only if the Worker
   code itself was altered to capture data in transit — check the Cloudflare
   deploy audit log.
2. **How many people?** Count owner records with at least one connection.
3. **What is the likely consequence?** IBAN tails plus a bank name are useful
   for targeted phishing. That is a real risk to individuals, so the default
   answer to "unlikely to result in a risk" is **no** — i.e. notify.

**The 72-hour clock starts when you become aware, not when you finish
investigating.** A partial notification on time beats a complete one late;
Art. 33(4) explicitly allows information in phases.

---

## 5. Notify the supervisory authority (≤72 hours)

Portal and authority: see the table at the top of this file.

Include, per Art. 33(3): the nature of the breach and the categories and
approximate number of people and records; your contact point; the likely
consequences; the measures taken or proposed. Say plainly what the broker
does and does not hold — it materially reduces the assessed severity, and a
regulator cannot infer it.

If you are past 72 hours, notify anyway and state the reason for the delay.

---

## 6. Notify users (Art. 34, when the risk is high)

There is no push channel and no mailing list — by design, since the app has no
accounts. So:

1. Put it on the support page's **Service status** line
   (`StackdSite/support.html`), which exists for this.
2. Reply to anyone who writes to `hi@stackdplatform.com`.
3. If bank re-linking is required, the app already shows a reconnect state,
   but say why in plain words on the status line.

Draft, adapt honestly:

> **[date] — Bank Connect incident.** On [date] we found [what]. Bank
> transactions are never stored on our server and were not affected. The
> records involved were [categories]. We have [what you did]. If you use
> Online banking you will need to reconnect your bank, and no action is
> needed otherwise. Questions: hi@stackdplatform.com.

Never claim "no data was affected" unless step 4 actually established it.

---

## 7. After

- Lift the pause (`{"minutes":0}`) and confirm a real connect works end to end
  (`node scripts/smoke.mjs https://api.stackdplatform.com`).
- Write what happened, when you learned, what you did and the times, in the
  Art. 30/33(5) record. Keep it even when you decided not to notify — the
  reasoning is the thing a regulator asks for.
- Fix the cause, and add a counter or threshold in `src/index.ts` if the
  monitoring did not catch it. An incident the alerting missed should change
  the alerting.

---

## Known limitations

- **No broker-side mass session revoke.** Revoking the Enable Banking
  application is the mass revoke, at the cost of every user re-consenting.
  A per-owner `DELETE /v1/connections/:ref` exists; there is no admin loop.
- **The cron cannot report that the Worker is down.** That is what the
  external pinger on `/healthz` is for — and it **does not exist yet**
  (launch-plan O-30). Until it does, a dead Worker is silent.
- **Workers Logs retention** is 3 days on the free plan, 7 on paid. If an
  incident is older than that, the logs are gone — the counters in the
  SystemDO keep 48 hours, and the Cloudflare deploy audit log is retained
  separately and is what tells you whether the code was tampered with.
