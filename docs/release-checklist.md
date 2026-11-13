# Release checklist (public 1.0)

Every store build follows this list, in order. The traps it exists to stop
are all silent: a stale synced bundle, an unbumped `?v=`, an `index.html`
left half-patched by an interrupted build, an unsigned bundle, a versionCode
Play has already seen.

`docs/launch-plan.md` is the plan for the FIRST release (accounts, products,
declarations, the things only the owner can do). This file is the mechanical
part, and it is the same for every release after that.

---

## How to read this file — it is deliberately NOT struck through

`launch-plan.md` and `store-listing.md` strike out what is finished, because
each of their items is done once and then stays done. **This file is a
recurring procedure.** §1–§9 run again at every release, so striking a step
because v1.17 passed it would be telling the next release to skip it.

Only two things carry a marker:

| Marker | Means |
|---|---|
| ~~struck through~~ + **DONE, ONE TIME** | setup done once that never repeats |
| **NOT FOR THIS RELEASE** | correct, but belongs to the release that ships Bank Connect |

Everything upright runs every time, **including this time**. Where the
current build stands is §0 — and §0 is the part that goes stale, so
re-measure it rather than trusting it.

---

## 0. Where 1.0.3 stands (measured 2026-10-12)

| Step | State of this build |
|---|---|
| 1 Version | done — `1.0.3` in package.json; versionCode and iOS build **10003**; `versionSync` test passes |
| 2 Cache busting | done — every changed script at `?v=75` |
| 3 Gates | done — lint clean, **151 files / 1,775 unit tests**, **96 e2e** (two load-sensitive e2e cases, see below) |
| 4 Build | done — `index.html` clean after the build |
| 5 Sync | done — Play Billing 9.0.0 and `cordova-plugin-purchase` present |
| 6 Android bundle | done — 1.0.3 (10003) from tag `v1.0.3`, upload key `56:CC:…:5C:6E`; `Desktop\Stackd-1.0.3-10003.aab` |
| 7 iOS archive | done — CI run 38221395717 uploaded build 10003 (second attempt; see below) |
| 8 Smoke | **to run** — owner, on the TestFlight / closed-test builds |
| 9 Ship | tag `v1.0.3` pushed; **Play upload and App Store submission are the owner's** (`launch-plan.md`, update 2026-10-12) |

Known load-sensitive tests. They fail on a busy machine or a slow runner, and a
re-run passes. Neither is a defect in the build. Harden both in 1.0.4.
- `tests/unit/debtView.test.js` › *the "Storage is full" sheet survives the
  closing name prompt's teardown* waits a fixed 800 ms. A polling wait made
  the NEXT test flaky (leftover teardown timers), so it was not changed.
- e2e `pro_paywall.spec.js` › *links Terms of Use and Privacy Policy by name*
  fails when `Components` scrolls the legal sheet to the privacy part on an
  80 ms timer before the sheet is laid out. It also fails on 1.0.2 code under
  load. The real fix is in the app: retry the scroll until the sheet has
  height.

Bank Connect is off in this build (`BankConnect.FEATURE_ENABLED === false`),
which is what step 3 enforces — see §3.

---

## 1. Version

```bash
npm version --no-git-tag-version <major.minor.patch>   # or edit package.json
npm run version:sync
```

`package.json` is the single source. `version:sync` rewrites the `<title>` in
`index.html`, `versionName` / `versionCode` in `android/app/build.gradle`, and
`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in the Xcode project.
`versionCode` = `major*10000 + minor*100 + patch`, so it only ever goes up.
`npm test` fails if the four disagree (`tests/unit/versionSync.test.js`).

**Both stores reject a build number they have already accepted.** A replaced
or rejected upload is re-uploaded under a bumped PATCH — never the same one.

## 2. Cache busting

Every edited `src/*.js` needs its `?v=` bumped in `index.html`, and files that
call into each other must move to the SAME number, one above the current max.
A client holding a fresh `views.js` and a cached `components.js` throws at
render — there is no module system to catch it.

```bash
grep -n '?v=' index.html
```

## 3. Gates

```bash
npm run lint          # zero-warning gate (--max-warnings 0)
npm test              # 79 files / 774 tests, ~30-60s
npm run test:e2e      # 53 specs, ~60s, auto-starts the dev server on :3000
```

If `npm test` is slow or flaky, do not lower the bar — `vitest.config.js`
caps the worker pool for exactly this reason; investigate instead.

Two of those tests guard the *shape of the release* rather than a feature,
and a red one means **do not ship**: `tests/unit/bankConnectHidden.test.js`
asserts `FEATURE_ENABLED` is still `false`, and `pro_paywall.spec.js` →
*"Bank Connect leaves no trace in the shipped build"* asserts the UI agrees.
A build that quietly turned the feature back on would ship a bank integration
the stores never reviewed, and would contradict the privacy answers filed
from `store-listing.md`.

## 4. Build the web bundle

```bash
npm run build
git diff --exit-code index.html     # must be clean
```

`build.cjs` rewrites `index.html`'s `<script defer>` tags to
`type="module"` for Vite and restores them in a `finally`. If the process was
killed mid-build, that diff is how you find out before shipping it.

## 5. Sync the native projects

```bash
npx cap sync android
npx cap copy ios        # `npx cap sync ios` needs a Mac (pod install)
```

`android/app/src/main/assets/public/`, `android/capacitor-cordova-android-plugins/`
and `ios/App/App/public/` are all gitignored, so a native build silently ships
whatever was last synced. After syncing, confirm the purchase plugin actually
landed — without it `window.CdvPurchase` is undefined and both paywalls
render as "Purchases are available in the mobile app" on a real phone:

```bash
grep billingclient android/capacitor-cordova-android-plugins/build.gradle
grep -c cordova-plugin-purchase android/app/src/main/assets/public/cordova_plugins.js
```

Expect `com.android.billingclient:billing:9.0.0` and a non-zero count.

## 6. Android bundle

The toolchain is Capacitor 8 / AGP 8.13.0 / Gradle 8.14.3, compiling and
targeting **API 36** with **minSdk 24** (`android/variables.gradle`). Play has
required API 36 of new apps since 2026-08-31, so do not lower it to make a
build pass.

This machine needs two environment workarounds (see the build-quirks note):

```powershell
$env:TMP = "C:\Windows\Temp"; $env:TEMP = "C:\Windows\Temp"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd android; .\gradlew.bat bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`.

Signing comes from `android/keystore.properties` (gitignored, pointing at a
keystore kept outside the repo). Without that file the build produces an
UNSIGNED bundle Play refuses — create it from
`android/keystore.properties.example` first. Verify the result:

`aapt dump badging` cannot read an `.aab`: it fails with "no
AndroidManifest.xml found", because a bundle stores its manifest as protobuf
under `base/manifest/`. Check the manifest Gradle merged into the bundle
instead, and the signature on the bundle itself:

```bash
grep -o 'package="[^"]*"\|android:versionCode="[^"]*"\|android:versionName="[^"]*"' \
  android/app/build/intermediates/bundle_manifest/release/processApplicationManifestReleaseForBundle/AndroidManifest.xml
"/c/Program Files/Android/Android Studio/jbr/bin/keytool.exe" -printcert \
  -jarfile android/app/build/outputs/bundle/release/app-release.aab | grep -E 'Owner|SHA256'
```

Expect `com.stackd.finance`, the expected `versionCode`/`versionName`, and
the upload key's SHA-256 (`56:CC:…:5C:6E`).

## 7. iOS archive

**Primary path since 2026-09-27: no Mac.** GitHub → Actions → *iOS to
TestFlight* → *Run workflow*. Leave **upload** unticked for a dry run
(build, sign, inspect the .ipa, send nothing); tick it to send the build to
App Store Connect. To replace a build already uploaded for the same version,
set **build number** above the last one (10001, 10002…) — the public
version stays `1.0`. Everything below is the fallback on a real Mac.

### 7b. On a Mac (fallback)

```bash
npm install && npm run build && npx cap sync ios
open ios/App/App.xcworkspace
```

- Xcode 26 or later with an iOS 26 SDK — required for every App Store upload
  since 28 April 2026.
- ~~First time only: add `ios/App/App/PrivacyInfo.xcprivacy` to the App
  target~~ **DONE, ONE TIME (2026-09-27)** — wired into `project.pbxproj`
  directly, and the CI workflow fails if it is missing from the archive.
- Signing: automatic, with the team selected; capabilities Associated Domains,
  In-App Purchase and (since 1.2.0) iCloud — iCloud Documents with the container
  `iCloud.com.stackd.finance` — enabled on the App ID. The CI path needs the same
  App ID setup; its .ipa check fails if the iCloud entitlement is missing.
- Product → Archive → Distribute → App Store Connect.

## 8. Smoke the build on a device

Before promoting past internal testing:

- Cold start, then background/foreground.
- Each of the five languages, light and dark.
- Add a third wallet on the free plan → the Pro lock page appears; buy with a
  license/sandbox tester → the lock lifts; kill and reopen → still Pro;
  reinstall → *Restore purchase* → Pro.
- Settings → In-app purchases: the one-time tab renders a real price from the
  store, and *Terms of Use* / *Privacy Policy* both open.
- Settings shows **no Online banking row**, and there is no subscriptions
  tab. If either appears, the build was made with the feature on — stop, and
  go back to §3.
- Interrupt a purchase: approve it with the network off, or kill the app
  between approval and delivery, then reopen. The entitlement must land on
  its own within a few seconds of the next cold start, with no tap. Google
  auto-refunds an approved-but-undelivered purchase after three days, so this
  is a money bug rather than a polish one.
- **NOT FOR THIS RELEASE** — the Bank Connect pass: connect a bank, return
  through the App Link (warm), then again after killing the app during the
  bank step (cold start via `getLaunchUrl`). It only means anything in a
  build where the feature is on.

## 9. Ship

```bash
git add -A && git commit && git push origin main
git tag v<version> && git push origin --tags
```

Upload the `.aab` to Play (internal → closed → production) and the archive to
TestFlight, then submit.

- **The app itself is Free on both stores.** App Store Connect → Pricing and
  Availability → Price Schedule must read €0.00 (Free); Play Console → the
  app is Free. €4.99 belongs only on the `stackd_pro` in-app purchase. The
  first iOS release went live as a paid €4.99 app (seen 2026-10-27): the app price had been
  set to the Pro price, so a buyer would have paid twice. After release,
  open the store page on a phone and check the button says *Get* / *Obter*,
  not a price.

- **NOT FOR THIS RELEASE** — the "What's new" entry in all five listing
  languages. A first submission has no previous version to describe, and both
  stores treat release notes as optional on it. From the second release
  onwards, write it.
- **NOT FOR THIS RELEASE** — the broker. `broker/` deploys on its own
  cadence and never as part of an app release, and while Bank Connect is off
  no shipped build talks to it at all. When that changes, its gate is
  `npm run deploy:production` from inside `broker/`, which refuses to run
  until `scripts/preflight.mjs` passes.

## 10. Rollback — when a release goes wrong

Added 2026-11-13 (GAP-6). Read it **before** shipping, not during the fire.
A store binary cannot be "rolled back": what you can do is stop it spreading
and ship a fixed build fast.

**Stop it spreading (minutes):**

- **Google Play** — ship every production release as a **staged rollout**
  (start at 10–20 %, not 100 %). If crash or ANR rates jump in *Android
  vitals*, or a bad bug is reported: Play Console → Release → Production →
  **Halt rollout**. Users who already updated keep the bad build; nobody new
  gets it. Resume or replace the release once it is fixed.
- **App Store** — release with **Phased Release for Automatic Updates**
  (7-day ramp). Problem found: App Store Connect → the version → **Pause
  Phased Release** (up to 30 days). Manual updates from the store page still
  get the build, so pausing slows it, it does not stop it.
- **Worst case (data loss, security):** remove the app from sale in the
  affected store until a fix is approved, and say so in a support note.

**Ship the fix (hours to a day):**

1. Fix on `main`, with a test that fails without the fix.
2. **PATCH bump** (`npm pkg set version=x.y.z+1 && npm run version:sync`):
   neither store accepts a build number twice, and a halted Play release
   needs a higher `versionCode` to replace it.
3. Gates (§3), build (§4–7), smoke on a device (§8).
4. Play: create a new release that replaces the halted one (staged again).
   App Store: submit the new version and ask for an **expedited review**
   (App Store Connect → Contact Us → App Review → expedited review request)
   when users are actually harmed.

**Data safety net:** a bad build can only damage data on the device. Users
with the daily backup on (Backup page) can restore yesterday's file; the
boot heals in `store.js` are idempotent, so a fixed build repairs what it can
on the next launch. Never ship a "fix" that deletes or rewrites user data
without a test that restores a real backup first.

**Website (Cloudflare Pages):** Cloudflare dashboard → Workers & Pages → the
site → Deployments → pick the last good one → **Rollback to this
deployment** (instant, no rebuild). Then `git revert` the bad commit in
`StackdSite` so the next push does not bring it back.

**Broker:** see `docs/broker-runbook.md` → *Rollback* (`wrangler rollback`).
Durable Object data migrations cannot be rolled back with the code: a
release that changes stored shapes must read both the old and the new shape
for one release.
