# Phone widgets — iOS and Android (1.2.2 HG-15, plan 2026-11-09)

Status: **plan agreed with the owner (§11); WG-1…WG-5 built (§12; iOS compiled and signed in CI, not yet seen on a phone), WG-6 to do.** It ships in
**1.2.2** (owner, Q10). Comment tag: `// 1.2.2 (HG-15)`. Sub-phases are named
WG-1…WG-6 (§8).

Stack'd's "widgets" so far are the cards inside Home (`window.Widgets`,
`docs/home-widgets-plan.md`). This plan is about **system widgets**: the ones a
user puts on the phone's Home Screen (and, on iOS, the Lock Screen), outside
the app.

## 1. How it has to work

A system widget is not web code:

- **iOS:** a **WidgetKit extension**, a small SwiftUI program inside the app
  bundle (`App.app/PlugIns/StackdWidgets.appex`).
- **Android:** an `AppWidgetProvider` inside the app, drawing with
  `RemoteViews`.

Neither can run the app's JavaScript, open the WebView or read its
`localStorage`, and neither can be shown on the LAN dev server.

The app hands the widgets a ready-made **snapshot**:

```
 Stack'd (WebView)                           Widgets (native)
 ─────────────────                           ────────────────
 Store change / app to background / midnight
   → StackdWidgets.buildSnapshot(state)      (pure JS, unit-tested)
   → Capacitor.Plugins.StackdWidgets.write({ json })
        iOS:     App Group group.com.stackd.finance/widgets/snapshot.json
                 + WidgetCenter.reloadAllTimelines()
        Android: files/widgets/snapshot.json
                 + AppWidgetManager.updateAppWidget(all ids)
                                             each widget reads the file and draws it
 Tap  ◀────────────────────────────────────  stackd://open?to=…  (§6)
```

Rules that follow from this:

- **The snapshot is the only thing the widgets know.** It holds finished,
  formatted, translated strings, plus a few numbers in the 0–1 range for
  rings, bars and the curve. All the rules stay in the JS store:
  exclude-never-convert, no unpaid or pre-opening rows, MTD vs EOM, locale
  formatting, category colours. Each figure comes from the function the
  matching in-app card uses. The widgets never do finance maths.
- **One way only.** The widgets never write data. Native code writing the
  ledger would bypass the journal and the native mirror (`StackdDB`,
  BUG-34). The Quick add buttons only *open* the app's own form.
- **Figures are only as fresh as the last time the app ran.** Data is local,
  and nothing refreshes it in the background. To cope:
  - Upcoming payments are stored **with their dates** (the next 35 days), so a
    widget drops past days and rolls "Tomorrow" to "Today" without the app.
  - A widget whose data is from an earlier day shows a quiet "Updated
    14:32" (Q6).
- **Nothing else leaves the app.** The file lives in the app's own sandbox on
  the device and is never sent to a server.

## 2. Widget catalogue (owner, 2026-11-09)

Sizes: **small** = the 2×2 square, **wide** = iOS `systemMedium` (4×2 on
Android). There is no Total balance widget: the total sits at the top of
Account balances and of Balance curve.

| Id | Widget | Sizes | Shows | Tap opens |
|---|---|---|---|---|
| W1 | **Account balances** | wide | Total balance at the top: the same total and accounts as Home's header, with exclude-never-convert for other currencies. Below it, the accounts in `orderedAccounts()` order: icon in its colour on the neutral circle (HG-9), name, balance. As many as fit (4), then "+N more". Other-currency accounts show their own currency. | Home |
| W2 | **Income vs Expenses** | small, wide | This month **to end of month** (EOM, like the in-app `incomeExpense` card), with an "End of month" caption: income, expenses, net. Wide adds two bars in the HG-6 bar style. | Analytics, this month |
| W3 | **Categories** | wide | This month's spending **so far** (MTD, like the in-app `categories` card): the ring at ≤ 6 slices (`CategoryRing.fold`, `CategoryPalette` colours) and a legend of the top 4 with amounts. | Analytics, this month |
| W4 | **Budget goals** | wide | This month's budgets, like the in-app `budgets` card (EOM): total spent of total limit, then the 3 categories closest to or over their limit, each with a bar (red only when over, HG-8). | Goals, this month |
| W5 | **Upcoming** | small, wide | Next unpaid or future payments: date, name, amount. Small shows 2, wide 4. Rolls day by day from the dated snapshot. | History, that day |
| W6 | **Balance curve** | wide | The balance curve of **all** primary-currency accounts, with the current total and the change over the range. Default range 1 month (Q11). Trend colour as on Home. | Home |
| W7 | **Quick add** | small | Three filled circles with white icons and **no labels and no caption** (version D, owner): red **−** Expense, green **+** Income, blue **⇄** Transfer (the transfer blue, `.text-transfer`). Each opens New log on that type. | `#add?type=expense / income / transfer` |
| L1 | **Quick add (Lock Screen)** | iOS round (`accessoryCircular`) | A **+** in iOS's own Lock Screen style. iOS asks for Face ID before the app opens. | `#add` (Expense, the form's default) |

Notes:

- **iOS 17 is what makes W7 possible.** Before it, a small widget had only one
  tap area. From iOS 17 each circle is its own `Button` with an App Intent
  that opens the app (`openAppWhenRun`) after saving the chosen target in the
  App Group; the app reads that target on launch or resume (§6). Android uses
  one `PendingIntent` per circle.
- **Accessibility:** VoiceOver and TalkBack still read "Expense", "Income",
  "Transfer"; labels only drop out of the picture.
- **Tinted and clear modes:** in iOS 18 tinted mode and iOS 26 clear mode,
  the system turns every widget one colour. The W7 circles then differ by
  icon alone, which is the reason the icons stay distinct.
- **Look:** each widget follows the app: neutral card, SF Pro / Roboto text,
  trend colours, red only for over budget. Lucide icons are exported as
  template images into the iOS asset catalogue and Android drawables.
  Charts are drawn with Swift Charts (curve, bars) and SwiftUI shapes (ring)
  on iOS, and as a `Bitmap` drawn on a `Canvas` set into an `ImageView` on
  Android, because `RemoteViews` cannot draw paths.

## 3. Privacy

No "Show on widgets" switch (owner, Q5): putting a widget on the screen is
the user's choice.

| Situation | Widget shows |
|---|---|
| Hidden balances on (`state.privacy.hide`) | Every amount as sign + symbol + `••••`, the same mask as `Store.MONEY_MASK`. Percentages, rings and bars stay, as in the app (HG-4). The app writes the masked strings itself, so the widgets have nothing to decide. The curve keeps its shape with no figures. |
| iPhone locked (StandBy, Lock Screen) | Amounts wrapped in `.privacySensitive()`: iOS blanks them while the phone is locked. Names and dates stay (owner, Q4). |
| `RESET_APP` | Snapshot deleted, widgets show "Open Stack'd". |
| Before the first launch, or no data | "Open Stack'd" placeholder from the widget's own strings (§5). |

On iOS the file is written with data protection
`completeUntilFirstUserAuthentication`, so a widget can read it after the
first unlock since boot. On Android it sits in the app's private `files/`.

## 4. Snapshot format (v1)

The file is `widgets/snapshot.json` and is written atomically by the plugin.
It is about 4–8 KB. It is rewritten only when its content changed: an FNV
hash is compared on the JS side, because iOS allows a widget only about
40–70 reloads a day.

```jsonc
{
  "v": 1,
  "generatedAt": "2026-11-09T14:32:05+01:00",
  "day": "2026-11-09",                 // local day the snapshot describes
  "masked": false,
  "labels": { "total": "Saldo totale", "income": "Entrate", "expense": "Uscite",
              "net": "Netto", "eom": "Fine mese", "upcoming": "In arrivo",
              "today": "Oggi", "tomorrow": "Domani", "more": "+{n} altri",
              "updated": "Aggiornato {time}", "open": "Apri Stack'd",
              "expenseBtn": "Uscita", "incomeBtn": "Entrata", "transferBtn": "Trasferimento" },
  "total":    { "text": "€ 12.480,20" },
  "accounts": [ { "name": "Main", "icon": "wallet", "color": "#3b82f6",
                  "text": "€ 3.210,00" } ],                       // ≤ 12
  "month":    { "title": "Novembre", "incomeText": "€ 2.100", "expenseText": "€ 1.340",
                "netText": "+€ 760", "netTrend": "up", "incomeBar": 1, "expenseBar": 0.64 },
  "categories": { "spentText": "€ 840", "slices": [ { "name": "Groceries",
                  "icon": "shopping-cart", "color": "#…", "share": 0.31, "text": "€ 260" } ] },
  "budgets":  { "spentText": "€ 840", "limitText": "€ 1.200", "ratio": 0.70,
                "rows": [ { "name": "Dining", "icon": "utensils", "ratio": 1.12,
                            "over": true, "text": "€ 112 / € 100" } ] },   // 3
  "upcoming": [ { "date": "2026-11-10", "dayText": "mar 10 nov", "name": "Rent",
                  "icon": "home", "text": "−€ 750,00", "kind": "expense" } ],  // 35 days, ≤ 20
  "curve":    { "range": "1m", "changeText": "+2,4 %", "trend": "up",
                "points": [0.12, 0.15] }                              // 0–1, ≤ 31
}
```

- `buildSnapshot(state)` is a **pure function** in a new global `StackdWidgets`
  (`src/widgets-native.js`, loaded after `widgets.js`; added to `index.html`
  with its `?v=`). It runs under vitest. Strings are drawn as native text,
  never markup, but they are still capped in length and stripped of control
  characters.
- Names are the user's stored data; default category names go through the
  app's label function, as on screen.
- The `labels` come from `I18n.t` keys `widget.native.*` in all five
  dictionaries (under the i18n test). The app's language therefore applies to
  the widgets after the next write.
- A widget that meets an unknown `v` shows the placeholder.

## 5. Native strings

The widget gallery shows each widget's name and description before the app
has written anything, and the placeholder appears before the first snapshot.
These come from the platforms' own resources, in en/fr/it/es/pt, about 20
strings:

- **iOS:** `Localizable.xcstrings` in the extension.
- **Android:** `res/values{,-fr,-it,-es,-pt}/widget_strings.xml`.

## 6. Deep links and the add-form type

- **Targets.** A fixed whitelist: `home`, `add?type=expense|income|transfer`,
  `analytics`, `budget`, `history?day=YYYY-MM-DD`. The type and the day are
  validated, and anything unknown opens Home. Nothing from the URL is ever
  used as markup or as a raw route.
- **How taps arrive:**
  - iOS: `widgetURL` / `Link` on the wide widgets. On the W7 circles, an App
    Intent stores `pendingOpen` in the App Group and opens the app; the
    plugin's `takePending()` reads and clears it on launch and on resume.
  - Android: a `PendingIntent` carrying the same `stackd://open?to=…` URI.
- **main.js.** Today `appUrlOpen` and `getLaunchUrl` are registered **only
  when Bank Connect is on**. HG-15 adds an always-on listener. A URL that
  `BankConnect.parseReturnUrl` recognises still goes to Bank Connect;
  `stackd://open` routes through `Router.leave`, so Back does not reopen it.
  On a cold launch, routing waits until the splash has gone.
- **The add form.** The New log form starts on Expense
  (`views.js` `initialType`, line 2525) and can already take a type from a
  draft. HG-15 lets `#add?type=` set it, through the same path.

## 7. Out of scope

- Interactive widgets that change data: mark paid, typing an amount in the
  widget. That would need its own plan (§1, "One way only").
- Configurable widgets (owner, Q8): picking accounts or categories per
  widget. Not in v1.
- Lock Screen widgets other than L1 (balance line, budget gauge, next
  payment): offered, not chosen.
- Live Activities, Control Center controls, Apple Watch, Wear OS.

## 8. Phases

| Phase | What | Where it is tested |
|---|---|---|
| **WG-1 Snapshot** | Build the snapshot and write it at the right moments; plugin call is a no-op on the web; `widget.native.*` keys. Unit tests as below. | Here: vitest, and the LAN server (snapshot logged in the console) |
| **WG-2 Deep links** | Always-on URL routing and `#add?type=` (§6). Unit tests plus e2e that calls the handler with a URL. | Here |
| **WG-3 Plugin** | `plugins/stackd-widgets`, same shape as `stackd-cloud`, with `write` / `clear` / `takePending`. iOS: Swift + App Group entitlement on the app target. Android: Java, private files + `updateAppWidget`. | Android emulator here; iOS through a CI dry run |
| **WG-4 Android widgets** | W1–W7 as `AppWidgetProvider`s (Java + `RemoteViews`, no Kotlin or Compose, matching the plugin's Java). XML layouts for small 2×2 and wide 4×2. Chart bitmaps. `widget_strings.xml` in 5 languages. Previews for the widget picker. `updatePeriodMillis` 30 min, plus an update at local midnight for the day roll. | Android emulator here (`docs` Android build notes), then the phone |
| **WG-5 iOS widgets** | `StackdWidgets` extension: W1–W7 + L1 in SwiftUI. TimelineProvider gives an entry now plus one at next midnight, policy `.after(midnight)`. App Intents for W7, `Localizable.xcstrings`, the extension's own `PrivacyInfo.xcprivacy`, App Group entitlement, deployment target **iOS 17**. | CI dry run (compile + sign), then the phone through one TestFlight build |
| **WG-6 Polish + store** | Stale stamp; dark, tinted and clear modes; Dynamic Type / font scale; VoiceOver and TalkBack labels. Store "What's new" and a screenshot with widgets on the Home Screen. | Phone (both) |

**WG-1 unit tests.** Every figure must match the matching in-app card. Also:
hidden balances, other-currency accounts, unpaid and pre-opening rows, MTD vs
EOM, the fold to 6 slices, dates rolling, size caps, the rewrite trigger and
`RESET_APP`.

**WG-1 write triggers.** `Store.subscribe` (debounced 2 s), `visibilitychange`
to hidden, the midnight roll (`ROLL_PERIODS`) and `RESET_APP`.

Android is fully testable on this Windows machine (emulator). iOS needs the
macOS CI runner. A **dry run** of `ios-testflight.yml` (upload unticked)
compiles and signs without sending anything to Apple. Seeing the iOS widgets
on the phone needs one TestFlight upload at the end.

## 9. The Xcode project without a Mac

The new iOS target cannot be added by clicking in Xcode, so:

1. `tools/ios/add-widget-target.rb` uses the `xcodeproj` Ruby gem, which ships
   with CocoaPods on the CI Mac. The script is idempotent. It:
   - creates the `StackdWidgets` app-extension target;
   - adds its sources and its Info.plist, entitlements, xcstrings and
     PrivacyInfo;
   - embeds it in `App` ("Embed Foundation Extensions");
   - sets bundle id `com.stackd.finance.widgets`, iOS 17, team `YA3DTZR26U`
     and automatic signing.
2. A one-off `workflow_dispatch` job runs the script and uploads the changed
   `project.pbxproj` as an artifact. The file is reviewed and committed, so
   the project in the repo is the real one; nothing is generated at build
   time.
3. Follow-ups:
   - **Version lines.** `tools/version.cjs` expects exactly 2
     `MARKETING_VERSION` and 2 `CURRENT_PROJECT_VERSION` lines; with the
     extension there are 4. The extension must carry the app's version, or
     App Store Connect rejects the build. Raise the count to 4 and update
     `versionSync.test.js`.
   - **IPA checks.** `ios-testflight.yml` "Check the signed .ipa" must also
     check that:
     - `PlugIns/StackdWidgets.appex` exists and is signed Apple Distribution;
     - both the app and the appex carry
       `com.apple.security.application-groups = group.com.stackd.finance`.
   - **CocoaPods.** The extension uses none, so the Podfile stays as it is.

## 10. Owner's tasks

**Apple Developer account** (before the first WG-3/WG-5 CI dry run):

1. Identifiers → App Groups → **+** `group.com.stackd.finance`.
2. Identifiers → `com.stackd.finance`: enable **App Groups** and tick that
   group. Associated Domains and iCloud stay as they are.
3. Identifiers → **+** App ID `com.stackd.finance.widgets` (explicit), with
   App Groups on and the same group ticked.
4. Profiles: nothing by hand. CI's cloud-managed automatic signing (ADMIN API
   key, `-allowProvisioningUpdates`) creates the extension's profile. If the
   first dry run fails on signing, check steps 1–3 first.

**Stores:** nothing new to create. Update "What's new" for 1.2.2 and,
optionally, add a widget screenshot.

## 11. Decisions (owner, 2026-11-09)

| # | Question | Answer |
|---|---|---|
| Q1 | Widgets in v1 | W1 Account balances (wide, with total) · W2 Income vs Expenses (small + wide, EOM, net) · W3 Categories (wide, this month) · W4 Budget goals (wide, this month) · W5 Upcoming (small + wide) · W6 Balance curve (wide, with the total of all accounts) · W7 Quick add (small, three filled circles − + ⇄, no labels) · L1 Lock Screen round + |
| Q2 | Minimum iOS for the widgets | iOS 17 (the app stays on 15.0; older phones don't list the widgets) |
| Q3 | Total balance widget | None. The total is shown in W1 and W6 |
| Q4 | Locked iPhone | Amounts hidden, names and dates stay |
| Q5 | "Show on widgets" switch | No switch |
| Q6 | "Updated 14:32" stamp | Only when the data is older than today |
| Q7 | Free or Pro | Free |
| Q8 | Configurable widgets | Not in v1 |
| Q9 | Android | Same round |
| Q10 | Version | Folded into 1.2.2 |
| Q11 | Balance curve range | **Proposed 1 month** (not yet confirmed) |

## 12. As built

### WG-1 Snapshot (2026-11-09)

- `src/widgets-native.js` → `window.StackdWidgets`, loaded right after
  `widgets.js` (`index.html`, `?v=1`). `buildSnapshot(state)` is a pure read:
  - **W1 Account balances, W2 Income vs Expenses, W3 Categories, W4 Budget
    goals, W5 Upcoming:** each calls the matching Home card's own data builder
    (`Widgets.registry.<type>._data / _buckets / _rows / _matches + _dedupe`)
    on a throwaway instance. `Widgets._passMemo` is swapped out for the call,
    so a Home render in progress keeps its memo.
  - **W6 Balance curve:** `Store.computeBalanceSeries({ range: '1m' })`.
- **Hidden balances.** `privacy.hide` masks every amount (sign + symbol +
  `MONEY_MASK`) whatever screen is open; texts otherwise use
  `formatCurrency(…, { plain: true })`.
- **Text.** All text goes through `_clip`, which replaces control characters
  and line separators by code point (no regex, see below) and caps the length.
  Icons pass `Store.isSafeIcon`, colours a hex check.
- **Shape changes from §4:**
  - `generatedAt` is epoch ms, plus a ready `updatedText` ("Updated Nov 9,
    14:32").
  - `accountCount`, with `moreOne` / `moreOther` templates holding `{n}`, so
    the native side counts the "+N more" itself.
  - `total` and `curve` carry `trend`; `curve` also carries `totalText` and
    `pctText`.
  - `budgets` carries `ofText`, `pctText` and `over`, overall and per row.
  - `empty: true` when there are no accounts, which also covers `RESET_APP`.
- **Writes.** `sync()` writes only through `Capacitor.Plugins.StackdWidgets.write
  ({ json })` on a native build. It is skipped when the content hash (FNV-1a,
  without `generatedAt` / `updatedText`) is unchanged, and it never throws.
  `start()` (called from `main.js` after the first render) subscribes with a
  2 s debounce and syncs on every `visibilitychange`. Without the plugin
  (the web build, and native until WG-3) nothing is registered.
- **i18n.** Most labels reuse existing keys. New in all five dictionaries:
  `widget.native.net / balance / tomorrow / open / updated /
  more.one / more.other`.
- **Tests.** `tests/unit/widgetsNative.test.js` (13): each figure against the
  Home rules (EOM vs MTD, other-currency account left out of the total, an
  over-limit budget, dated upcoming rows, 30 curve points), the mask on
  another screen, language, text clipping, and the write / skip / failure
  paths.
- **Line separators.** Literal U+2028 / U+2029 characters inside a regex
  literal broke the file: the editing tools turn the ` ` escape into the
  real character, which ends the line. `_clip` compares code points instead;
  never write those two escapes in `src/`.

### WG-2 Deep links (2026-11-09)

- **Parsing.** `StackdWidgets.parseOpenUrl(url)` accepts only
  `stackd://open[?…]` and returns `{ path, actions }`; any other URL gets
  `null`, so bank returns and Universal Links keep their owner. The targets:

  | Link | Opens |
  |---|---|
  | `to=add[&type=expense\|income\|transfer]` | `#add[?type=…]` (an unknown type opens plain `#add`) |
  | `to=analytics` | Analytics on this month (`UPDATE_FILTERS`) |
  | `to=budget` | Goals on this month (`SET_MONTH_FILTER`) |
  | `to=history&day=YYYY-MM-DD` | History on that one day (custom period), every other filter cleared; a day that is not a real date opens History as it was |
  | anything else | Home |

- **Opening.** `openUrl(url)` dispatches the target's actions, then
  `Router.navigate`s, so Back returns to the screen that was open. When the
  app already shows that path, it re-applies the route instead. It never
  throws.
- **`main.js`.** `appUrlOpen` and `getLaunchUrl` are now always registered
  on native. A widget URL goes to `StackdWidgets.openUrl`; any other URL goes
  to `BankConnect.handleReturn`, only when Bank Connect is on (as before).
- **iOS Quick add.** `consumePending()` reads `takePending()` from the plugin
  (WG-3) at start and on every return to the app.
- **New log.** `AddTransactionView` reads `?type=` for a new log only, before
  the draft (an add-category round trip keeps the user's own switch).
- **Tests.** `tests/unit/widgetLinks.test.js` (7) and
  `tests/e2e/widget_links.spec.js` (2: Income → Transfer → Back; History on
  one day).

### WG-3 Plugin (2026-11-09)

`plugins/stackd-widgets` is laid out like `stackd-cloud`. It is wired in
through `package.json` as `file:plugins/stackd-widgets`; the lockfile gained
only its two entries (a plain `npm install` would also bump unrelated
packages).

- **Android** (`com.stackd.widgets.StackdWidgetsPlugin`):
  - `write({json})` writes `files/widgets/snapshot.json` atomically (temp
    file + rename, 256 KB cap). It then sends one `ACTION_APPWIDGET_UPDATE`
    to every provider of the package that has placed widgets, so WG-4
    providers need no registration here.
  - `clear()` removes the file. `takePending()` answers `{}`, because Android
    taps arrive as intents.
  - `readSnapshot(Context)` is the providers' reader.
- **Intent filter.** `AndroidManifest.xml` gained the `stackd://open` filter
  (`VIEW`, `DEFAULT`, not `BROWSABLE`). Before, only `stackd://connect`
  resolved.
- **Checked on the emulator** (API 36.1):
  - first launch wrote the empty snapshot;
  - adding an account and a €42 expense rewrote it (total €958.00, Groceries
    1 slice);
  - `am start -d stackd://open?to=add&type=income` cold-started on New log /
    Income;
  - `…type=transfer` while the app was open switched it to Transfer.
- **iOS** (`ios/Sources/StackdWidgetsPlugin/StackdWidgetsPlugin.swift`):
  - `write` uses the App Group `group.com.stackd.finance`
    (`widgets/snapshot.json`, atomic, protection
    `completeUntilFirstUserAuthentication`), then
    `WidgetCenter.reloadAllTimelines()`.
  - `takePending()` reads and removes the `pendingOpen` key in the group's
    UserDefaults, and only hands back `stackd://open…`.
  - Without the App Group entitlement, `write` rejects, which the JS side
    treats as "try again on the next change".
  - Not compiled yet: it waits for the owner's Apple setup (§10) and a CI dry
    run together with WG-5.

### WG-4 Android widgets (2026-11-09)

All of this lives in `plugins/stackd-widgets/android` (package
`com.stackd.widgets`). Resources carry a `stackd_widget_` prefix so they never
clash with the app's.

- **Classes:**
  - `BaseWidget` (an `AppWidgetProvider`) loads `Snapshot` once per update,
    picks small or wide by `OPTION_APPWIDGET_MIN_WIDTH` (220 dp), and wraps
    every build in try/catch (a bad snapshot shows the placeholder).
  - Without data (or with `empty`), a widget shows "Open Stack'd" from the
    snapshot label or the resource. Quick add draws without data
    (`needsData()`).
  - A tap goes through `PendingIntent` `stackd://open?to=…` (package-scoped,
    immutable).
  - `Draw` makes the bitmaps: ring, bar, curve, and the round letter mark.
  - `Rows` holds the row ids.
- **The widgets:**

  | Widget | Size | Tap |
  |---|---|---|
  | `BalancesWidget` | wide | home |
  | `FlowWidget` | small + wide | analytics |
  | `CategoriesWidget` | wide | analytics |
  | `BudgetsWidget` | wide | budget |
  | `UpcomingWidget` | small 2 rows / wide 4 rows | each row: `history&day=` |
  | `CurveWidget` | wide | home |
  | `QuickAddWidget` | small, three circles | `add&type=` each |

  All are registered in the plugin's manifest with `updatePeriodMillis`
  30 min, so Upcoming drops past days and names Today / Tomorrow on its own.
- **Departure from §2: no Lucide icons on Android.** Rows wear the account /
  slice / category colour as a round mark with the name's first letter (the
  HG-9 "colour on a neutral circle" look). Exporting the Lucide set into
  drawables is left for later.
- **Look.** Colours follow `variables.css` light / dark
  (`values-night/stackd_widget_colors.xml`). Quick add's circle colours are
  the same in both themes.
- **Resources.**
  - Layouts are generated by `tools/widgets/android-layouts.cjs`; strings
    (picker names and descriptions, 5 languages) by
    `tools/widgets/android-strings.cjs`.
  - Picker previews are PNG renders of real widgets
    (`drawable-nodpi/stackd_widget_preview_*`, `previewImage`). A
    `previewLayout` of the live layouts drew blank cards, because they start
    empty.
- **RemoteViews limits.** A bare `<View>` is not allowed (the first
  Income vs Expenses layout failed to inflate; the spacer is a `FrameLayout`).
  Only `FrameLayout`, `LinearLayout`, `TextView` and `ImageView` are used.
- **Checked on the emulator** (API 36.1; light and dark):
  - Account balances and Budget goals were placed from the launcher's picker
    and drew the right figures: €7,728.00 = 2,848 + 5,200 − 320; Dining Out
    120 % red.
  - Every widget was also rendered offscreen at launcher size with a
    temporary debug method (removed before commit).
  - A tap on Budget goals opened `#budget` on 2026-11.
  - Not checked: a real Quick add tap from the launcher. Its intents are the
    same `stackd://open` URIs WG-3 tested.

### WG-5 iOS widgets (2026-11-09)

- **Owner's Apple setup done (§10).** The App Group `group.com.stackd.finance`
  exists ("Stackd Finance Widgets"), and both App IDs have App Groups with it
  ticked.
- **`ios/App/StackdWidgets/`:**
  - `StackdWidgets.swift`: the bundle and the 8 configurations (kinds
    `StackdBalances`, `StackdFlow`, `StackdCategories`, `StackdBudgets`,
    `StackdUpcoming`, `StackdCurve`, `StackdQuickAdd`,
    `StackdQuickAddLock`).
  - `Snapshot.swift`:
    - a `Decodable` with every field optional, so an older or newer app
      gives the placeholder, never a crash;
    - one `TimelineProvider` (now + next midnight, `.after(midnight)`);
    - the `Palette` (`variables.css` light / dark);
    - `Open.url`.
  - `Views.swift`: SwiftUI views; amounts are `.privacySensitive()`.
  - `QuickAddIntent.swift`: an App Intent, `openAppWhenRun`, that writes
    `pendingOpen` to the group's UserDefaults.
  - `Info.plist`, `StackdWidgets.entitlements`, `PrivacyInfo.xcprivacy`
    (1C8F.1), and `Localizable.xcstrings`.
- **Strings.** `tools/widgets/widget-strings.json` holds the gallery words
  for both platforms (`ios-strings.cjs` and `android-strings.cjs` write
  them).
- **Same look as Android:** letter marks instead of icons, and the same
  colours. Quick add uses SF Symbols minus / plus / arrow.left.arrow.right on
  the filled circles.
- **Taps:**
  - Wide widgets use `widgetURL`; each wide Upcoming row is a `Link` to
    `history&day=`.
  - Quick add's circles are `Button(intent:)` (iOS 17: a small widget has
    one tap area otherwise).
  - The app looks for the pending tap at start, on every return, and again
    0.9 s later (the intent may run just after the app comes forward).
- **App target:**
  - `App.entitlements` has the App Group, and its privacy manifest adds
    1C8F.1.
  - `QuickAddIntent.swift` is compiled into the app as well (an intent that
    opens the app may run in its process), with `AppIntents` weak-linked
    because the app stays on iOS 15.
- **The Xcode target** was created on GitHub's Mac by
  `tools/ios/add-widget-target.rb` (workflow "iOS widget target", run
  42711818314) and the `project.pbxproj` it returned is committed.
  - `tools/version.cjs` now expects 4 version lines of each kind.
  - `ios-testflight.yml` also checks that the appex is in the bundle, signed
    Apple Distribution, has the App Group (app and appex), has its privacy
    manifest and has the app's version.
- **CI dry run 42714183442: green.**
  - Archive and export pass, and the appex is signed "Apple Distribution:
    Eugenio Maria Calvaresi".
  - One harmless Xcode warning remains: the extension's own module "missing
    a dependency on" itself.
  - On the way, `debtView.test.js`'s storage-full sheet test, timing-bound,
    failed twice on the runner; it now waits for its end state.
- **Not yet seen on a phone.** That needs a TestFlight upload (owner's
  call).

### Phone check round 1 (2026-11-10)

The owner checked TestFlight 10207 on an iPhone: the widgets work. Two asks:

- **A bigger Account balances that lists every account.**
  - iOS: the widget also offers `.systemLarge`, which shows the total and up
    to 8 accounts (the medium size shows 2).
  - Android: the widget grows with its height. It lists 2 accounts at 4×2
    and up to 8 when resized taller, counted from the launcher's height
    (`BaseWidget.rowsFor`). Upcoming grows the same way.
- **Bigger text everywhere.**
  - iOS: titles at `.subheadline`, rows at `.subheadline`/`.body`, amounts
    through one `Amount` view that shrinks rather than cuts off (`minimumScaleFactor
    0.7`).
  - Android: titles 14 sp, rows 16 sp, headlines 26 sp; the list rows keep
    their own height instead of stretching.
  - To keep the medium/4×2 sizes readable, some show fewer rows:

    | Widget | Before | Now |
    |---|---|---|
    | Budget goals on iOS | 3 rows | 2 |
    | Categories legend on Android | 4 | 3 |
    | Account balances medium | 3 | 2 |

    The wide Upcoming on iOS shows each payment on one line.
- **Android picker previews** re-rendered. Each widget was checked off-screen
  at normal and tall heights on the emulator; the temporary renderer was
  removed again.
- **CI signing.** The archive is now signed ad hoc and only the export signs
  for the App Store (no new Development certificate per run; dry run
  42722052511 green).
