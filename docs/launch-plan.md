# Launch plan — Google Play and the App Store (v1.14, 2026-09-09)

The plan for the FIRST public release of Stack'd on both stores. Written from
a nine-area audit of the app, the broker, both repos and the current store
policies (each policy claim below was read from the official page on
2026-09-08/09; re-check anything dated before you act on it).

`docs/release-checklist.md` is the mechanical build-and-ship list and is the
same for every release. This file is the one-off: accounts, agreements,
declarations, products, and the code work that still stands between today and
a submittable build.

**Status in one line:** the product is built and the legal texts now match it,
but no store account, no store product and no production backend exists yet,
and the Android wrapper cannot be uploaded to Play until it targets API 36.

---

## 1. The three things that set the date

Everything else fits around these.

| Blocker | Why | Who | Lead time |
|---|---|---|---|
| **Android targets API 34, Play requires 36** | Since 31 Aug 2026 new apps must target Android 16. Needs a Capacitor 6 → 7 → 8 migration; the Nov 1 extension is for apps already published, not first submissions. | assistant, then a device test | 1–2 days of work |
| **Play closed testing: 12 testers, 14 days** | Applies to personal Play accounts created after 13 Nov 2023, before production access is granted. | owner | **14 days of calendar**, plus ~7 days for the access review |
| **No Apple Developer Program membership** | Nothing on the App Store side can start — no app record, no products, no TestFlight. Uploads also require Xcode 26 / iOS 26 SDK, i.e. a Mac. | owner | hours to days for enrolment, plus Mac access |

Realistic shape: **Android is roughly 4–6 weeks out** (migration → signed build
→ closed test 14 days → production access review), **iOS depends entirely on
when enrolment and a Mac happen** and is then 1–2 weeks (TestFlight, review).
They run in parallel; neither waits for the other.

## 2. Decisions only you can make

Take these before the work below hits them. My recommendation is in each row.

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Ship with Bank Connect hidden, or wait for Enable Banking production access?** Production needs a signed contract + company KYB, and pricing is a quote with a monthly minimum. | **Ship without it.** Launch the local app plus Stack'd Pro, keep Online banking dark behind the remote flag (A-04), and turn it on in an update once the contract is signed. It removes the hardest reviewer question, the largest fixed cost and the "financial services" pressure on both accounts. |
| D2 | **Sole trader or company?** This decides the Play account type, whether you need a D-U-N-S number, and which address is published. | **Sole trader** unless a company already exists. A company means a D-U-N-S (up to 30 days) and, on Play, the full legal address published. Note Play requires an Organization account for "financial services" apps — another reason D1 matters. |
| D3 | **Which address and phone go public?** Both stores publish trader contact details in the EU. Apple accepts a P.O. Box for individuals (with proof); Play publishes your country for personal accounts and the full address once you monetise. | Get a **P.O. Box or a business address** and a **second phone number** before enrolling. Do not use your home address, and do not commit either to these repos — they are public. |
| D4 | **iPhone-only or universal?** I have set the project to iPhone-only. | **Keep iPhone-only for v1.** Universal means the app is reviewed on iPad and needs 13-inch iPad screenshots; an iPhone-only app still installs and runs on iPad. One line to reverse later. |
| D5 | **App name.** "Stack'd" is crowded on both stores, including *Stack'd Money*, a finance app on the App Store. Apple requires unique names and may refuse the bare one. | Try **"Stack'd"**, with **"Stack'd — Money Tracker"** ready as the fallback (30-char limit). Reserve it in App Store Connect the day enrolment lands. Run an EUIPO search before printing anything. |
| D6 | **Bank Connect price.** Still unset because it depends on the Enable Banking minimum. | Deferred by D1. Set it when you have the quote; the reference point is €2.99/month or €4.99/month. |
| D7 | **Launch countries.** | **EEA + UK only** at first: it matches Bank Connect's coverage, keeps you inside one legal regime, and you can widen any time. |

## 3. What I changed today (v1.14)

All of this is in the working tree, tested, not committed.

**Legal alignment — the app and the website now describe the same product.**
- New Terms clause 7, *Stack'd Pro (one-time purchase)*, in all five languages
  and on the website: billed once by the store, not a subscription, restorable
  on the same store account, refunds by the store, existing data never hidden.
  It sits after the subscription clause so `terms.intro`'s "Terms 5–6 /
  Privacy 3–4" cross-reference stays correct.
- Removed the false claim that "every other feature of Stack'd remains free",
  which stopped being true at v1.13, from the Terms (×5), the website and the
  listing copy.
- Privacy policy: now covers iOS (the site said Android and web only); names
  Apple/Google as processing the Pro payment too; says the device token lives
  in secure storage rather than "outside the app's backup"; **discloses that
  the broker sees and forwards your IP address and User-Agent**, which it does
  and the policy did not mention; and replaces the untrue "no cloud backup of
  your data" with an accurate description of the phone's own backup.
- Rewrote the Children clause, which claimed the app "collects no data from
  anyone" three clauses after describing what the server keeps.
- `terms.updatedDate` → 9 September 2026 in all five dictionaries and on both
  website pages. **This re-shows the Bank Connect consent sheet to anyone who
  accepted under the old date** — intended, the substance changed.
- Website: fixed the deletion-request email, which rendered on the live site as
  "[email protected]" in the one sentence Google's Data safety and Apple
  5.1.1(i) point at; corrected the metadata and homepage privacy claims that
  still said nothing leaves the phone; added a "What it costs" section and a
  "Purchases and Bank Connect" support section.

**Both paywalls.**
- Prices now carry their period ("€2.99 / month", "€29.99 / year") instead of a
  bare amount — Apple's sign-up-screen checklist wants the subscription length
  and the full renewal price, Play wants the billing frequency visible before
  purchase.
- *Terms of Use* and *Privacy Policy* now appear as two separately labelled
  links on the subscription sheet and on both tabs of the purchases screen. A
  single combined "Terms and Conditions" button is a routine review pushback.
  A *Privacy Policy* row was also added to Settings → Support.
- Active subscribers get **Manage subscription**, opening the store's own
  subscription centre — both stores require an easy route to cancel and only
  the store can do it.
- **The native app was hard-wired to the STAGING broker.** `brokerUrl()`
  returned staging unless the origin was exactly the deployed web build, so a
  store build would have run against open entitlement mode and sandbox banks.
  Production is now the default everywhere; only a browser dev server on
  localhost still defaults to staging.
- **The broker would have rejected every native request.** `ALLOWED_ORIGINS`
  listed neither `https://localhost` (Android) nor `capacitor://localhost`
  (iOS), and the app sends custom headers, so every call is preflighted. Added
  to both environments.
- Removed the two placeholder alerts in Settings. "Rate the App" said *"App
  Store rating flow coming soon"* — exactly the unfinished content Apple
  2.1(a) rejects. It now opens the store page and is hidden entirely when
  there is no store URL for the platform; "Send feedback" opens a prefilled
  mail draft carrying the app version, platform, language and record counts,
  never the records themselves.

**Native and release engineering.**
- `minSdk` 22 → 23: Play Billing Library 9.0.0 (which the purchase plugin
  brings) requires 23, so the first Gradle sync with billing would have failed
  the manifest merge.
- Release signing scaffold: `signingConfigs.release` reading a gitignored
  `android/keystore.properties`, with an example file. Absent that file the
  build fails loudly instead of quietly producing an unsigned bundle.
  `*.jks`, `*.keystore` and `keystore.properties` are now ignored — they were
  commented out, in a public repo.
- Android backup rules: the user's data stays in the phone's backup (it is the
  only thing that survives a lost handset), the Bank Connect device token is
  excluded from both cloud backup and device transfer.
- One version number: `package.json` is now the source and `npm run
  version:sync` rewrites the `<title>`, the Android `versionName`/`versionCode`
  and both Xcode versions. They disagreed — the app said v1.13 while both
  stores would have shown 1.0 with `versionCode 1`, which Play rejects on the
  second upload. `tests/unit/versionSync.test.js` keeps them in step. Now
  1.14.0 / build 11400.
- iOS: `PrivacyInfo.xcprivacy` written (needs adding to the Xcode target on a
  Mac); `ITSAppUsesNonExemptEncryption=false`; `armv7` → `arm64`; device family
  set to iPhone-only.
- `npm test` is a usable gate again: it was hitting vitest worker timeouts on
  this machine (one worker per core, each booting a jsdom over ~1 MB of
  source). Capped pool, raised timeouts — **74 files / 716 tests pass in 31
  seconds**, and `npm run lint` reports 0 errors.
- `docs/release-checklist.md` written; `docs/store-listing.md` gained the
  Stack'd Pro product row, the free/paid listing paragraph, and the IP
  disclosure note in the privacy labels.

## 4. My side — what remains

Ordered. IDs are stable so we can refer to them.

### Before the first store build

- **A-01 · Capacitor 6 → 7 → 8 migration (blocks Play entirely).**
  `npx cap migrate` twice, taking `compileSdk`/`targetSdk` to 36, `minSdk` to
  24, AGP 8.13, Gradle 8.14.3, plus Node 22+ and Android Studio Otter (both
  already on this machine). Then the edge-to-edge work: at target 36 Android
  16 removes the opt-out, and `env(safe-area-inset-*)` is unreliable on older
  Android WebViews, so the app's `--safe-top`/`--safe-bottom` need the
  System Bars plugin's CSS variables as a fallback. Ends with a real emulator
  run on API 36 in both themes. **This is the single largest remaining piece
  and needs a device loop, so it wants its own session.**
- **A-02 · Verify the purchase plugin actually lands.** `npm run build && npx
  cap sync android`, then confirm the billing dependency and
  `cordova_plugins.js` are non-empty. The local Android project predates the
  plugin, so nothing has ever exercised the purchase path on a device.
- **A-03 · Unfinished-transaction safety.** If the broker is unreachable after
  an approved purchase, the transaction is never finished, the user is told
  "you were not charged" — and Google auto-refunds an unacknowledged purchase
  after 3 days. Initialise the store at boot on native so the plugin replays
  approved transactions, and distinguish a broker outage from a declined
  receipt in the message.
- **A-04 · Remote availability flag for Bank Connect** (needed if D1 = ship
  without it). A `bankConnect: false` answer from the broker hides the
  Settings row and the hub, so the feature can be switched on later without a
  new binary, and doubles as a kill switch. About a day with tests.
- **A-05 · Store screenshots.** Extend the existing Playwright capture script
  to emit the store sizes (1260×2736 for the 6.9" iPhone, 1080×1920 for Play)
  in all five languages, from seeded data, with no real bank names or IBANs.
- **A-06 · Localised listing copy** (fr/it/es/pt short + full descriptions)
  drafted into `docs/store-listing.md` for you to paste.

### After you have the store records

- **A-07 · Apple app id.** One constant (`Views.APPLE_APP_ID`) turns the Rate
  row on for iOS and gives the website its App Store link.
- **A-08 · App Store badge and link on the website**, once the id exists.
- **A-09 · Broker production deploy config check** — a preflight that refuses
  to deploy with an empty production variable, so a half-configured worker
  cannot go live.

### Worth doing, not blocking

- **A-10 · Restore on a second device** currently mints a second broker owner
  that is also entitled, and the old device's bank links do not follow. Index
  the store receipt to one owner.
- **A-11 · Broker monitoring**: nothing tells you the API is down or that
  auth failures are spiking; Workers logs are 3 days on the free plan.
- **A-12 · Incident/breach runbook** (GDPR gives you 72 hours) and a status
  line on the support page.
- **A-13 · Localised legal pages** on the website (English-only today; the app
  ships five languages). Generatable from the dictionaries.
- **A-14 · Repo tidy** before more eyes land on a public repo: stale scratch
  files, no README.
- **A-15 · Clear the 13 lint warnings** so lint can run at zero.

## 5. Your side — what remains

### Now, nothing blocks these

- **O-01 · Decide D1–D5, D7** (§2). D2 and D3 gate both store accounts.
- **O-02 · Sort the public identity**: legal form, the address you are willing
  to publish, a phone number that can receive verification codes, and a
  document proving name and address for Apple. Keep them out of both repos.
- **O-03 · Enrol in the Apple Developer Program** ($99/yr). Individual unless a
  company exists — the seller name is your legal name and cannot be changed
  later without an entity transfer. Then sign the Paid Apps agreement and fill
  the banking and tax forms: **in-app purchases do not work in sandbox until
  that agreement is active.** Join the Small Business Program (15%) right after
  acceptance.
- **O-04 · Create the Google Play developer account** ($25 once). Check the
  creation date — if it is after 13 Nov 2023 and personal, the 12-tester
  14-day closed test applies and it is on the critical path. Complete identity
  verification with the public details from O-02.
- **O-05 · Line up 12 closed testers** (real Google accounts, opted in and
  staying opted in for 14 consecutive days; opting out restarts the clock).
- **O-06 · Get a Mac with Xcode 26.** Required for every App Store upload since
  April 2026. Borrowed, rented or a cloud Mac all work.
- **O-07 · Create the upload keystore** with the `keytool` line in
  `android/keystore.properties.example`, store it outside the repo, and back it
  up in two places.
- **O-08 · Legal read-through.** The Terms and Privacy are careful but were
  written by me, not a lawyer, and they now describe two paid products and a
  cross-border data flow. Also ask about: the governing-law clause the Terms
  still lack, and the identity block GDPR Art. 13 wants.
- **O-09 · Enable Banking** — only if D1 says wait: request a quote, sign the
  contract, complete KYB, create the production application (redirect
  `https://api.stackdplatform.com/v1/connect/return`, plus the terms, privacy
  and data-protection email).
- **O-10 · Confirm the Cloudflare DPA is accepted** on the account and keep a
  copy; start a one-page Art. 30 processing record.

### Play Console, once the account exists

- **O-11 · Payments profile and tax settings** — nothing paid can be created
  without them.
- **O-12 · Create `stackd_pro`**: one-time product, €4.99, title, description,
  512×512 icon, per-country prices reviewed, then **Activate**. If D1 says
  ship without Bank Connect, do not create the subscriptions yet.
- **O-13 · Add license testers** (Settings → License testing) so purchases can
  be exercised without being charged.
- **O-14 · App content declarations**: Data safety (answers ready in
  `docs/store-listing.md` §3), **Financial features declaration** (mandatory
  for every app — with Bank Connect dark, "no financial features" is
  defensible; with it live, *Support services → Other* naming Enable Banking
  Oy as the licensed provider), Content rating (IARC), Ads = No, Target
  audience = 18+, Advertising ID = No, Government apps = No, and App access
  instructions telling the reviewer how to reach the Pro purchase.
- **O-15 · Store listing**: 512 icon, 1024×500 feature graphic, at least 4
  phone screenshots at 1080×1920, five languages, category Finance, contact
  email, privacy policy URL `https://stackdplatform.com/privacy`.
- **O-16 · Upload, closed test, then apply for production access.**

### App Store Connect, once enrolled

- **O-17 · Reserve the app name** (D5) the day you can — this is the item most
  likely to force a rename late.
- **O-18 · DSA trader declaration.** Required for EU distribution; selling
  in-app purchases makes you a trader. Your address, phone and email are
  published on the product page in all 27 EU territories, and email and phone
  need two-factor verification. Do it before the first submission — it blocks
  it.
- **O-19 · Create `stackd_pro`** as a Non-Consumable with the same id, price,
  five localisations, a review screenshot of the purchases screen and review
  notes. The first in-app purchase is reviewed **with the binary**.
- **O-20 · App ID capabilities**: Associated Domains and In-App Purchase.
- **O-21 · App Privacy answers** from `docs/store-listing.md` §2, the age
  rating questionnaire, screenshots (6.9-inch iPhone), keywords, support URL
  `https://stackdplatform.com/support`, marketing URL, and the Terms of Use +
  Privacy Policy links in the description.
- **O-22 · Decide standard vs custom EULA.** Apple's standard licence applies
  unless you paste your own; the in-app Terms contain HTML and would need a
  plain-text version. Standard is simpler and I recommend it.
- **O-23 · Sandbox testers**, then TestFlight, then submit.

### Mac steps (O-06 first)

- **O-24 · `npx cap sync ios`** (pod install), open the workspace in Xcode 26.
- **O-25 · Add `PrivacyInfo.xcprivacy` to the App target** — on disk is not
  enough, it must be in the target to ship.
- **O-26 · Signing and capabilities**, archive, upload to TestFlight.
- **O-27 · Set `IOS_APP_ID`** (`TEAMID.com.stackd.finance`) on the broker so
  Universal Links verify, and walk the bank return on a device if Bank Connect
  is live.

### Broker production (only if Bank Connect ships)

- **O-28 · Fill every empty production value** and deploy: `EB_APP_ID` +
  `EB_PRIVATE_KEY`, `ANDROID_SHA256_FINGERPRINTS` (the **Play App Signing**
  certificate, available only after the first upload — not your upload key),
  `IOS_APP_ID`, and for receipt checks `PLAY_SERVICE_ACCOUNT_JSON` (a Google
  Cloud service account granted *View financial data* and *Manage orders and
  subscriptions*) plus `APPLE_PRIVATE_KEY`/`APPLE_KEY_ID`/`APPLE_ISSUER_ID`
  from an **In-App Purchase** key, not a team API key. Then verify `/healthz`
  reports `mode=store` and that `/.well-known/assetlinks.json` lists the
  fingerprint.
- **O-29 · Also add the release fingerprints to the *staging* worker.** Both
  broker hosts are declared as App Links in the shipped manifest, and on
  Android 11 and below verification fails for ALL hosts if any one of them
  fails — which would silently push every bank return onto the fallback path.

## 6. Most likely rejections, and the answer

- **Play, target API level** — cannot be uploaded at all until A-01 lands.
- **Apple 2.1 / incomplete build** — the placeholder alerts are gone as of
  today; make sure the reviewer can reach and complete a purchase (App access
  notes, sandbox testers, the Paid Apps agreement active).
- **Apple 3.2.1(viii), "money management apps should be submitted by the
  financial institution"** — the answer, in the review notes, is that Stack'd
  holds no funds, moves no money and gives no advice; the licensed activity is
  performed by Enable Banking Oy, a FIN-FSA-registered AISP. Shipping with
  Bank Connect dark (D1) avoids the question entirely for v1.
- **Apple 3.1.2, subscription disclosure** — fixed today; verify on the device
  that price, period, restore and both legal links are all visible on the
  sheet.
- **Metadata mismatch** — the website and the listing must not promise more
  than the free plan gives. Fixed today; keep it that way when editing copy.
- **Data safety / privacy label mismatch** — the answers in
  `docs/store-listing.md` are written to match the policy exactly; if you
  change one, change both.

## 7. Costs

| Item | |
|---|---|
| Apple Developer Program | $99 / year |
| Google Play developer account | $25 once |
| Domain + Zoho mail | already paid |
| Cloudflare Workers | free tier is enough; $5/month buys 7-day log retention |
| Enable Banking | quote only, volume-based with a monthly minimum — the reason D1 exists |
| Mac access | borrowed, rented or cloud |
