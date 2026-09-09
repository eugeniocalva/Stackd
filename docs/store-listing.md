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

## 2. Apple — App Privacy ("nutrition label")

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

## 3. Google Play — Data safety

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

Until one of these is in place, the listing must NOT advertise Online
banking; ship the app with `ENTITLEMENT_MODE=store` and no products, and the
feature simply shows "Subscription needed" with no purchasable plan — or
gate the Settings row behind a remote flag (not built; add if needed).

## 6. Screenshots

Keep the existing five; add one of the Online banking hub with a linked bank
and the review sheet ("Import complete — balances match your bank") once the
production path exists. Never show a real IBAN or bank name in captures.
