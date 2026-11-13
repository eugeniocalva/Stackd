# Shake fix, all currencies and App lock (1.3.0)

Round opened 2026-11-12 from one piece of user feedback ("add the South
African Rand, and a lock for the app with PIN or fingerprint") plus the
owner's own report that Shake to hide stops working after every relaunch.

Comment tag: `// 1.3.0 (PL-N)`.

| Id | Item |
|---|---|
| PL-1 | Shake to hide keeps working after a relaunch (web retry + native iPhone detection) |
| PL-2 | Every currency, one searchable picker, the phone's regional currency preselected at first launch |
| PL-3 | App lock: PIN, Face ID / fingerprint, lock delay, Forgot PIN |
| PL-4 | `plugins/stackd-privacy` — the native half of PL-1 and PL-3 |

## 1. Decisions (owner, 2026-11-12)

| # | Question | Decision |
|---|---|---|
| D1 | Fallback when biometrics fail | The app's **own 4-digit PIN**; biometrics are an optional shortcut on top |
| D2 | Forgot PIN | The **phone's screen lock** (passcode / biometrics) turns App lock off; data untouched |
| D3 | When to lock | Always on a fresh launch; on return after a **"Lock after" delay** — Immediately / 1 minute / 5 minutes, **default 1 minute** |
| D4 | Free or Pro | **Free** for everyone |
| D5 | Shake fix scope | Web retry fix **and** native shake detection on iPhone |
| D6 | 3-decimal currencies (BHD, IQD, JOD, KWD, LYD, OMR, TND) | **Left out** of the picker until amounts can carry thousandths. An import can still create such an account; it shows 2 decimals, as today |
| D7 | Phone widgets while App lock is on | **Unchanged** — they follow Hide balances only; a hint under the App lock switch says so |

Decisions taken while building (assistant, recorded here):

- **A1** App lock exists on the phone apps only. A browser-only PIN is bypassed
  from the developer tools, so the web build shows no App lock row. Tests reach
  the feature through `window.__STACKD_LOCK_STUB__`.
- **A2** App lock is a screen gate, not encryption. The data on disk is what it
  was before; the manual says so.
- **A3** D2 has a hole on a phone with no screen lock: anyone holding it could
  set one and then reset the PIN. So the phone's screen lock resets the PIN
  only when the phone already had one **when the PIN was created**
  (`deviceSecureAtSetup`). Otherwise Forgot PIN explains that the only way
  back is to reinstall the app and restore a backup.
- **A4** "Immediately" means immediately: coming back from the photo picker or
  the share sheet asks to unlock. The 1-minute default exists to avoid that.
- **A5** A currency symbol comes from the system's narrow symbol in a fixed
  English locale (ZAR → `R`, SEK → `kr`, CHF → `CHF`), so it does not change
  with the app language. The five original currencies keep their pinned
  signs. An unknown code shows the code itself, never `$`.
- **A6** A word sign — two or more characters, with a letter, not ending in a
  currency sign — is followed by a no-break space (`CHF 1,234.56`,
  `kr 1,234`, `Cg. 12.00`); every other sign stays glued (`R1,234.56`,
  `R$1,234.56`, `€1,234.56`).
- **A7** Currency names come from `Intl.DisplayNames` in the app language —
  no dictionary keys per currency. The five original `currency.*` keys stay
  (tests and the manual read them).
- **A8** Currencies without a minor unit (KRW, VND, CLP…) show no decimals,
  like JPY. CNY keeps its historical 0-decimal display.
- **A9** The app-switcher cover is on whenever App lock is on: an opaque cover
  view on iPhone, `setRecentsScreenshotEnabled(false)` on Android 13+. Older
  Android keeps its thumbnail (the alternative, `FLAG_SECURE`, also blocks
  every screenshot).

## 2. PL-1 — Shake to hide

**Root cause.** iOS WebKit delivers `devicemotion` only to a page that called
`DeviceMotionEvent.requestPermission()` from a user gesture in this page
load. The 1.2.2 fix (`PrivacyShake.armPermission`) asked on the first touch
after launch but removed its listeners *before* knowing the answer. A first
touch that ends a scroll or a swipe is not a gesture iOS accepts, the call is
refused, and nothing asked again until Home re-rendered — in practice until
the Settings switch was flipped. It was also armed only while Home was mounted.

**Fix (web).** `armPermission` stays armed until iOS answers `granted`; every
`click` and `touchend` retries. `main.js` arms it at boot when Shake to hide
is on, whatever the first screen.

**Fix (native, iPhone).** `StackdPrivacy.startShake()` runs CoreMotion's
device-motion feed (no permission, no usage string) with the same rule as the
web detector — 3 jolts above 13 m/s² inside 900 ms — and emits `shake`.
`PrivacyShake.start` uses it when the plugin offers it and falls back to
`devicemotion` otherwise (Android, the web build). The cooldown stays in JS.

## 3. PL-2 — Currencies

- `Store.CURRENCY_CODES`: every active ISO 4217 currency except funds, metals
  and the seven of D6. `Store.isCurrencyCode` (3 capital letters) guards
  `SET_CURRENCY`.
- `Store.currencyName(code)`, `currencyLabel(code)` (`ZAR — South African
  Rand`), `getCurrencySymbol(code)` (always markup-safe), `currencyPrefix(code)`
  (symbol + the A6 space), `regionCurrency()` (the phone's region → currency).
- `Components.CurrencyList` is the one searchable list (Suggested, then all by
  name; search by code, name or symbol). Hosts: the Settings picker (still
  two-step: pick, then Done — 1.0.1 BUG-01), the onboarding picker, and the
  account form.
- Onboarding preselects `regionCurrency()`; EUR when the region is unknown.
- Fixed along the way: `$` for any unlisted currency (amounts, masks, widgets,
  the Pro price), "USD — US Dollar" for an unlisted base in Settings, the
  hidden-balances motion and the amount readers that knew only `$ € £ ¥`.

Accepted limits: amounts are stored in cents, so a currency with thousandths
shows two decimals; two currencies that share a sign (USD / CAD `$`, JPY / CNY
`¥`) look alike on mixed screens, as before.

## 4. PL-3 — App lock

**State.** `state.appLock` under `stackd_v1_appLock`, per device, outside the
backup, removed by `RESET_APP`:
`{enabled, salt, hash, iter, biometrics, delay (0|60|300), deviceSecureAtSetup,
fails, lockedUntil}`. One action, `SET_APP_LOCK` (merge + normalize). The PIN
is never stored: PBKDF2-SHA-256 (WebCrypto), 16-byte salt.

**`window.AppLock`** (`src/app-lock.js`, after `pro.js`, before `main.js`):

- `available()` — native platform with `Capacitor.Plugins.StackdPrivacy`, or
  the test stub.
- `boot()` — called by `main.js` after `Store.init()` and before the first
  render: when enabled, the lock screen is up before any figure is drawn.
- Lock screen `#app-lock`: full-screen, opaque, above every sheet, `#app` is
  `inert` underneath. Four dots, a 12-key pad, a biometrics key, Forgot PIN.
  Wrong PINs: the 5th starts a 30 s wait, then 1 min, 5 min, 15 min.
- Leaving and returning: `pause`/`resume` (and `visibilitychange`) stamp the
  moment the app left; a return after `delay` locks. Nothing is stamped while
  a system prompt of ours (biometrics, the phone's passcode) is in front.
- Setup / change / turn off run in the same screen in `setup` mode with a
  Cancel control.
- Android Back: `Router.handleBack` asks `AppLock.handleBack()` first — a
  locked app minimizes, a setup screen cancels.
- Deep links and widget taps navigate underneath; the user lands on them after
  unlocking.

**Settings → Privacy.** `#toggle-app-lock`, then (while on) `#toggle-app-lock-bio`
(only when the phone has biometrics enrolled), `#btn-app-lock-delay`,
`#btn-app-lock-change`.

## 5. PL-4 — `plugins/stackd-privacy`

`Capacitor.Plugins.StackdPrivacy`, same skeleton as `stackd-cloud`:

| Method | Result |
|---|---|
| `status()` | `{biometry: 'none'\|'fingerprint'\|'face'\|'iris'\|'generic', enrolled, deviceSecure}` |
| `authenticate({reason, title, cancelTitle, allowDeviceCredential})` | always resolves: `{ok: true}` or `{ok: false, code: 'cancel'\|'lockout'\|'unavailable'\|'failed'}` |
| `setPrivacyCover({enabled})` | `{}` |
| `startShake()` / `stopShake()` | `{native: true}` on iPhone, `{native: false}` on Android; event `shake` |

Android: `androidx.biometric` (`BIOMETRIC_WEAK`, plus `DEVICE_CREDENTIAL` when
allowed). iOS: `LocalAuthentication`, `NSFaceIDUsageDescription` in
`Info.plist`, CoreMotion for the shake.

## 6. Verification

Unit and e2e here; an Android build and emulator check here. The iPhone half
(Face ID prompt, the cover, native shake) can only be checked on a TestFlight
build — listed in "As built" until done.

## 7. As built (2026-11-12, not yet released)

**PL-1** `components.js` `PrivacyShake` (`armPermission` retry, `_fire`,
`_startNative` / `_stopNative`), armed from `main.js` at boot;
`hiddenBalances.test.js` covers the refused first touch, a real refusal and
the native listener.

**PL-2** `store.js`: `CURRENCY_CODES` (149 codes), `isCurrencyCode`,
`regionCurrency`, `currencyName` / `currencyLabel`, `getCurrencySymbol`,
`currencyPrefix`, `moneySymbolPattern`, `_stripMoneySign`; `formatCurrency`
drops decimals for a currency without a minor unit. `components.js`:
`CurrencyList`, `CurrencyPicker`. Hosts: Settings (`views.js`), the account
form (a `#btn-acc-currency` row over the hidden select) and onboarding
(`main.js` `openPicker({currencies: true})`). `fitAmountSign` gives a word
sign its room in the opening-balance and budget fields. Tests:
`currencies.test.js`, `privacy_currencies.spec.js`.

Found on the way and fixed with it: an imported account in another currency
read as dollars everywhere; Settings named an unlisted base "USD — US
Dollar"; the Pro monthly price used `$` for any store currency outside the
five; the hide / show motion on Home only found `$ € ¥ £`.

Left as it was (accepted): bank and restore files still read amounts with two
decimals; `CNY` keeps its 0-decimal display; the store accepts any
three-capital account currency from a file (`ADD_ACCOUNT` is ungated).

**PL-3** `src/app-lock.js` (`window.AppLock`), the `appLock` slice in
`store.js`, the rows in `OthersView._renderAppLock` / `_attachAppLock`,
`Router.handleBack`, `main.js` (`boot` / `ready`), styles at the end of
`components.css`. 47 new strings × 5 languages. Tests: `appLock.test.js`,
`androidBack.test.js`, `privacy_currencies.spec.js`.

Accepted limits: a leave within 1.5 s of a system prompt of ours closing is
not stamped (the pause that trails the prompt cannot be told from a real
one); a phone restored from the system's own backup comes back locked with
the same PIN.

**PL-4** `plugins/stackd-privacy` (Java + Swift), wired by `npm install` and
`npx cap update android`; the `Podfile` line was added by hand.
`nativeWiring.test.js` has its block. The Android module compiles and the app
assembles.

**Checked on the Android emulator (API 36, 2026-11-13, debug build of 1.3.0):**
onboarding opens on ZAR with the app's region set to South Africa; the picker
search works with the keyboard up; Home shows `R15,420.75` / `CHF 2,500.00`;
PIN setup by taps; the real BiometricPrompt turns the fingerprint on and
unlocks after a cold launch ("Use PIN" falls back to the pad); a wrong PIN
counts; 10 s away does not lock, 65 s does; Forgot PIN through the phone's own
PIN (a wrong phone PIN keeps the prompt; the right one turns App lock off,
data kept, "App lock is off" sheet); the Recents card is blank once the app is
left; shake hides and shows on Home, also right after a cold launch. Found and
fixed there: a fingerprint unlock left the wrong-PIN count standing (b8b365e).

Accepted (A9): opening the app switcher straight from the open app shows its
live screen — Android draws the running task, not the saved thumbnail; only
`FLAG_SECURE` would hide it, and that blocks every screenshot.

**iOS:** 1.3 build 10212 is on TestFlight (2026-11-13); the Swift plugin
compiles, archives and signs. Still to check on an iPhone: Face ID / Touch ID,
the app-switcher cover, native shake from the first second after a launch.

**Not verified yet:** the lock delay against a trip to the photo picker and to
the bank's sign-in page.

**Security review (2026-11-13, 51b3c32..b8b365e):** one Medium finding, fixed.
Home keeps running under the lock screen, and a shake there turned Hide
balances off without the PIN; the phone widgets then showed real amounts.
`PrivacyShake._fire` now ignores shakes while `AppLock.isOpen()`, and
`StackdWidgets.sync` writes nothing while the app is locked (`AppLock._unlock`
schedules a catch-up). `appLock.test.js` covers both; checked on the
emulator (locked + shaken twice: Hide balances stays on). Rule: anything that
can change state without a tap (motion, timers, deep links) must check the lock.
