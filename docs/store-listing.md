# Store listing, privacy labels and subscription disclosure (B6)

> Written 2026-09-07 with the Bank Connect legal rework (docs/bank-connect-ux-plan.md
> §15). This is the copy and the form answers to enter in Play Console and
> App Store Connect. The in-app Terms & Privacy (src/i18n/*.js `terms.*`)
> are canonical; the public copies live at
> https://stackdplatform.com/terms.html and /privacy.html — both stores
> require those two links on the listing and on the subscription screen.

## 1. Listing copy

**Short description (Play, 80 chars):** Private money tracking. Your data
stays on your phone — or link a bank, if you choose.

**Subtitle (App Store, 30 chars):** Local-first money tracker

**Description (both stores):**

Stack'd is a personal finance tracker that keeps your money on your phone.
Wallets, transactions, budgets, loans and tags live in the app's own
storage — no account to create, no cloud, no tracking, no ads.

- Track balances, budgets and recurring payments, in five languages.
- Import bank statements (CSV, camt.053, MT940) and review every row before
  it is saved. Balances reconcile against your bank's closing figure.
- Loan simulator and tracker with cent-exact schedules.
- Export everything as CSV, any time.

> **v1.15 / decision D1 — the FIRST release ships with Bank Connect switched
> off** (`BankConnect.FEATURE_ENABLED = false`). For that submission, OMIT the
> "Online banking" paragraph and the subscription sentence below, create only
> the `stackd_pro` product, and answer the privacy forms for the local-only
> app (§2a / §3a). The Terms and Privacy keep their Bank Connect clauses:
> they are written as conditional on a feature the user turns on, they are
> accurate for a build where nobody can, and rewriting them per release would
> desync the app from the site. Restore the paragraphs below when the feature
> ships.

**Online banking (optional, subscription).** Link your bank through a
licensed open-banking provider and import booked transactions with one tap.
You log in on your bank's own page; your credentials never touch Stack'd.
Every fetch is shown for review before anything is saved. Access lasts up
to 180 days and is renewed with your bank; banks allow a few refreshes a
day. Available for banks in the EEA and the UK.

Bank Connect is billed as an auto-renewing subscription through your store
account (monthly or yearly; price shown in the app). Cancel any time in
your store's subscription settings.

**What's free, and what isn't.** Everything above is free with up to two
wallets and the categories the app ships with. Stack'd Pro is a one-time
purchase that lifts both limits for good — no subscription. Online banking
is the only part billed monthly or yearly. Anything you have already
recorded always stays visible and editable.

Terms of Use: https://stackdplatform.com/terms.html ·
Privacy Policy: https://stackdplatform.com/privacy.html

**What's new (v1.10):** Online banking — link your bank and import booked
transactions automatically (optional subscription). Updated Terms & Privacy.

Phrasing rule: "local by default" / "stays on your phone", never "100%
local" or "nothing ever leaves your device" without the Bank Connect
qualifier (the marketing site's hero was changed the same way).

## 2a. Apple — App Privacy while Bank Connect is OFF (the first release)

With the feature switched off at build time the app makes no network calls of
its own and keeps nothing on a server. The only product is the one-time
unlock, and Apple handles that payment:

| Data type | Collected? |
|---|---|
| Purchases → Purchase History | **No.** The Stack'd Pro transaction id never leaves the device (`stackd_v1_pro`); Apple sees the purchase because Apple processes it. |
| Everything else | No |

So the answer for the first submission is **Data Not Collected**, which is
also what the marketing site says. §2 below is what it becomes the moment
Bank Connect ships — do not use it before then.

## 2. Apple — App Privacy ("nutrition label") — once Bank Connect ships

Before Bank Connect the answer was **Data Not Collected**. With Bank
Connect it is not, because transactions transit the developer's server and
the server keeps a link + subscription record. Recommended answers (confirm
against the current App Store Connect questionnaire at submission):

| Data type | Collected? | Linked to the user? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Financial Info → Other Financial Info (bank transactions, balances) | Yes (transit only, not retained) | No — tied to an opaque device/owner id, not to a name or Apple ID | No | App Functionality |
| Financial Info → Payment Info | No (Apple handles the subscription; the app only receives the transaction id) | — | — | — |
| Purchases → Purchase History (subscription status and original transaction id; the Stack'd Pro transaction id, kept on the device only) | Yes | No (opaque id) | No | App Functionality |
| Identifiers → Device ID (the opaque device token) | Yes | No | No | App Functionality |
| Contact Info, Location, Contacts, Usage Data, Diagnostics | No | — | — | — |

The broker also sees the request's IP address and User-Agent while Bank
Connect is in use — it rate-limits with them and forwards them to Enable
Banking and the bank because the payment-services rules require it for
online access, and stores neither. Apple's questionnaire has no IP data
type and exempts data used solely for security and fraud prevention, so
nothing is declared for it; Privacy clause 3 discloses it in words.

Notes for the reviewer field: "Bank Connect is opt-in. Bank data is
fetched via a licensed AISP (Enable Banking Oy, Finland) and relayed by our
EU-hosted server to the device without being stored or logged. The server
retains only an opaque device id, connection references (bank name, IBAN
last-4, currency) and the subscription status. Disconnecting deletes them."

The "linked to you" column is the judgement call: the ids are opaque and
the app has no account, but Apple treats persistent device identifiers as
linkable in some reviews. If review pushes back, flip Financial Info,
Purchases and Identifiers to "Linked to you" — the purposes stay the same.

## 3a. Google Play — Data safety while Bank Connect is OFF (the first release)

- **Does your app collect or share any of the required user data types?** No.
- Data deletion: no account exists; Factory Reset in the app erases
  everything. The support page carries the contact address.

§3 below applies from the release that ships Bank Connect.

## 3. Google Play — Data safety — once Bank Connect ships

- **Does your app collect or share any of the required user data types?** Yes.
- **Is all of the user data collected by your app encrypted in transit?** Yes.
- **Do you provide a way for users to request that their data is deleted?**
  Yes — Disconnect (per bank) and Factory Reset in the app; email for the rest.
- **Financial info → Other financial info:** Collected, not shared. Optional
  (only if the user enables Bank Connect). Ephemeral processing: the data is
  relayed and not stored. Purpose: App functionality.
- **Financial info → Purchase history:** Collected, not shared. Optional.
  Purpose: App functionality (subscription status, and the Stack'd Pro
  unlock — that one never leaves the device).
- **Device or other IDs:** Collected, not shared. Optional. Purpose: App
  functionality (the opaque device token).
- **Personal info, Location, Messages, Photos, Contacts, App activity, App
  info and performance:** Not collected.
- **Shared with third parties:** No — data is *received from* Enable Banking
  (a service provider acting on the user's consent), not shared with it.
  Payment goes to Google.

## 4. Products

Both listings must declare that the app contains in-app purchases, and the
description must name what is free: **two wallets and the built-in
categories**. Do not print the Pro price in the description — the store shows
the local price, and a hard-coded "€4.99" is wrong in every other currency.

### 4a. One-time product (v1.13)

| Field | Value |
|---|---|
| Product id | `stackd_pro` (`Pro.PRODUCT_ID`) — identical on both stores, case-sensitive |
| Type | Play: in-app product, one-time. App Store Connect: Non-Consumable |
| Price | €4.99 in the base storefront; review the generated per-country prices |
| What it unlocks | unlimited wallets (free plan = `Pro.FREE_ACCOUNT_LIMIT`, 2) and custom categories, forever, on any device signed in to the same store account |
| Display name | "Stack'd Pro" in all five locales; description from `pro.desc` |
| Restore | required and present: *Restore purchase* on the One-time tab (`#pro-restore-btn`) |
| Apple review | the first non-consumable is submitted WITH a binary: attach a screenshot of `#purchases` (One-time tab) and review notes "Settings → In-app purchases → One-time purchase" |
| Entitlement | local to the device (`stackd_v1_pro`); no server check, no receipt upload |

### 4b. Subscription products (v1.09)

| Field | Value |
|---|---|
| Product ids | `stackd_bank_connect_monthly`, `stackd_bank_connect_yearly` |
| Group / base plan | One product "Bank Connect", up to 3 banks (D-C9) |
| Price | set after the Enable Banking commercial terms are known; the reference app charges €2.99 / €4.99 a month |
| Free trial / intro offer | none (D-C3) |
| Grace period | store default; the broker keeps connections 14 days after lapse (Terms clause 6) |
| Required links | Terms of Use + Privacy Policy on the listing AND in the paywall (already in-app) |
| Localizations | en, fr, it, es, pt — display names: Bank Connect · monthly / yearly |

## 5. Enable Banking production access (decides the launch path)

Sandbox is enough for everything up to TestFlight/internal testing. Public
availability requires either:

1. **Enable Banking production application** — signed contract + company
   KYB (Stack'd Development Studio as the customer; pricing is volume-based
   with a monthly minimum, quote-only since 2026), or
2. **Restricted mode** ("Activate by linking accounts") — only the
   developer's own bank accounts work, which is fine for a personal build
   or a soft launch to yourself, not for public users.

**Settled (D1, v1.15):** the first release ships with the feature off at
build time — `BankConnect.FEATURE_ENABLED = false`, so there is no Settings
row, no routes, no subscription products and no "coming soon" card (which
would itself be dormant functionality under Apple 2.3.1). Nothing about it
reaches the network, so the privacy answers stay at "Data Not Collected"
(§2a / §3a). Turning it on is a one-line change plus a new build, which both
stores require anyway: the first subscription product is reviewed WITH a
binary. `tests/unit/bankConnectHidden.test.js` pins the shipped default.

## 6. Screenshots

Keep the existing five; add one of the Online banking hub with a linked bank
and the review sheet ("Import complete — balances match your bank") once the
production path exists. Never show a real IBAN or bank name in captures.
