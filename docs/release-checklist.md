# Release checklist (v1.14)

Every store build follows this list, in order. The traps it exists to stop
are all silent: a stale synced bundle, an unbumped `?v=`, an `index.html`
left half-patched by an interrupted build, an unsigned bundle, a versionCode
Play has already seen.

`docs/launch-plan.md` is the plan for the FIRST release (accounts, products,
declarations, the things only the owner can do). This file is the mechanical
part, and it is the same for every release after that.

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
npm run lint          # 0 errors
npm test              # 74 files / 716 tests, ~30s
npm run test:e2e      # Playwright, auto-starts the dev server on :3000
```

If `npm test` is slow or flaky, do not lower the bar — `vitest.config.js`
caps the worker pool for exactly this reason; investigate instead.

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

## 6. Android bundle

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
  (drag into the App group, tick the target). A manifest on disk but outside
  the target ships nothing.
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
- Settings → In-app purchases: both tabs render prices from the store, and
  *Terms of Use* / *Privacy Policy* both open.
- If Bank Connect is enabled for the build: connect a bank, return through the
  App Link (warm), then again after killing the app during the bank step
  (cold start via `getLaunchUrl`).

## 9. Ship

```bash
git add -A && git commit && git push origin main
git tag v<version> && git push origin --tags
```

Upload the `.aab` to Play (internal → closed → production) and the archive to
TestFlight, then submit. Write the "What's new" entry in all five listing
languages.
