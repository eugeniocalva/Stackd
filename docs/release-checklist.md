# Release checklist (v1.17)

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

## 0. Where v1.17 stands (measured 2026-09-09)

| Step | State of this build |
|---|---|
| 1 Version | ~~done~~ — `1.17.0` in package.json, `<title>`, gradle (`versionCode 11700`) and Xcode; the `versionSync` test passes |
| 2 Cache busting | **re-check** — cheap, and only ever valid as of the last commit |
| 3 Gates | ~~done~~ — lint clean, **75 files / 735 unit tests**, **50 e2e specs**, all green |
| 4 Build | **to run** — `dist/` on this machine predates the Bank Connect gate, so it is not the bundle to ship |
| 5 Sync | to run, after 4 |
| 6 Android bundle | **blocked** — `android/keystore.properties` does not exist yet, so a build now would be unsigned (launch-plan, owner side) |
| 7 iOS archive | **blocked** — needs a Mac (launch-plan, owner side) |
| 8 Smoke | to run, on the signed build and not before |
| 9 Ship | to run — no store accounts exist yet, and there are no git tags yet either |

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
npm test              # 75 files / 735 tests, ~60s
npm run test:e2e      # 50 specs, ~60s, auto-starts the dev server on :3000
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

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\aapt.exe" dump badging app-release.aab
```

`package: name='com.stackd.finance'` and the expected `versionCode`.

## 7. iOS archive (Mac)

```bash
npm install && npm run build && npx cap sync ios
open ios/App/App.xcworkspace
```

- Xcode 26 or later with an iOS 26 SDK — required for every App Store upload
  since 28 April 2026.
- First time only: add `ios/App/App/PrivacyInfo.xcprivacy` to the App target
  (drag it into the App group, tick the target). ~~The manifest itself
  exists~~ **DONE, ONE TIME** — but a manifest that sits on disk outside the
  target ships nothing, so the Xcode half of this is still open and belongs
  to the first Mac session.
- Signing: automatic, with the team selected; capabilities Associated Domains
  and In-App Purchase enabled on the App ID.
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

- **NOT FOR THIS RELEASE** — the "What's new" entry in all five listing
  languages. A first submission has no previous version to describe, and both
  stores treat release notes as optional on it. From the second release
  onwards, write it.
- **NOT FOR THIS RELEASE** — the broker. `broker/` deploys on its own
  cadence and never as part of an app release, and while Bank Connect is off
  no shipped build talks to it at all. When that changes, its gate is
  `npm run deploy:production` from inside `broker/`, which refuses to run
  until `scripts/preflight.mjs` passes.
