# Hidden balances — motion and haptics (1.2.2, HG-13)

Status: **BUILT 2026-11-08** — §7 is the as-built record.
Follows HG-4 (hidden balances, `CLAUDE.md` → "Hidden balances (HG-4)").

## 1. What the owner saw (2026-11-08, iPhone)

A shake on Home hides the balances, but:

- the haptic is **one** `impact MEDIUM`, fired in the middle of the shake, so
  the hand's own movement swallows it — it reads as "very small";
- there is **no motion**: `SET_PRIVACY` re-renders Home and every figure
  becomes `€••••` in the same frame.

Wanted: the balls visibly *cover* the figures while the phone vibrates.

## 2. How it works today

- `Components.PrivacyShake` (devicemotion, 3 jolts > 13 m/s² in 900 ms)
  → `DashboardView._wirePrivacy` → `Haptics.impact()` +
  `dispatch('SET_PRIVACY', {hide: !hide})`.
- Masking happens in `Store.formatCurrency` (sign + symbol + `MONEY_MASK`
  `••••`) when `isMoneyMasked()`. It returns a **string** that lands in
  markup, aria labels and Chart.js callbacks alike — so the animation cannot
  live in `formatCurrency`.
- Other ways in: Settings → Hide balances (Home not on screen, so nothing to
  animate), the "Balances hidden" pill → sheet → **Show** (on Home).

## 3. What others do (research, 2026-11-08)

- **Revolut** — "Hide balances" **blurs** the balance when you shake or flip
  the phone; on by default, Profile → Privacy. ([help](https://help.revolut.com/en-AU/help/profile-and-plan/security-and-personal-data/why-is-my-balance-blurry))
- **N26** — "Discreet mode": press the balance → button; hides the balance,
  every transaction amount and Spaces. No gesture or haptic documented.
  ([blog](https://n26.com/en-de/blog/discreet-mode))
- **Monzo** — no built-in mode; users ask for blurred amounts in the
  community forum.
- **Apple HIG, Playing haptics** — prefer short haptics tied to a discrete
  event; *match the haptic's intensity and sharpness to the animation it
  accompanies*; impact = "physical metaphor that complements a visual"
  (fits a ball landing), notification = outcome of a task; avoid overuse;
  keep it optional. ([HIG](https://developer.apple.com/design/human-interface-guidelines/playing-haptics))
- **Capacitor Haptics 8** (installed `^8.0.2`): `impact({style: LIGHT|MEDIUM|HEAVY})`,
  `notification({type})`, `vibrate({duration})` (iOS default 300 ms),
  `selectionStart/Changed/End`. No custom Core Haptics patterns — a
  sequence is built from timed calls.

Takeaways: nobody in the category does more than an instant swap or a blur,
so a short, physical "beads drop in" is a differentiator — but it must stay
short (≤ ~0.6 s), honour Reduce Motion, and the haptic must land **after**
the shake, not during it.

## 4. Proposed design

### 4a. Hide (shake, or any hide while Home is on screen)

1. **Shake detected** → nothing re-renders yet.
2. **Cover (≈ 480 ms).** Every amount on Home gets four balls laid over its
   digits. Balls pop in left → right (scale 0 → 1.15 → 1, 70 ms apart) while
   the digits under them blur and fade. Figures cascade top → bottom
   (total → today/EOM change → wallet tiles → widgets), 40 ms apart, so the
   screen "fills in" rather than flashing.
3. **Settle.** `SET_PRIVACY` dispatches; the re-render already shows
   `€••••`, so the swap is invisible. The "Balances hidden" pill slides in.
4. **Haptics, in step with the balls:** one `LIGHT` impact per ball
   (4 × 70 ms), then a firm `HEAVY` "seal" when the last ball lands — the
   whole pattern runs ~350 ms *after* detection, when the phone is settling.

### 4b. Reveal (shake again, or the sheet's Show)

Mirror, lighter: balls shrink out right → left, digits sharpen in (≈ 360 ms),
one `MEDIUM` impact. The pill slides out.
*Changed after the 10205 check (owner):* the reveal plays the hide's taps —
4 × `LIGHT` + the `HEAVY` seal on the hide's clock (same milliseconds).

### 4c. Reduce Motion / large text / web

- `prefers-reduced-motion`: no ball motion — a 150 ms cross-fade; haptics
  stay (they are not motion).
- Web: same animation; `Haptics` is already a no-op there.
- Screen readers: `Components.Announcer` says "Balances hidden" / "Balances
  shown" (keys exist: `privacy.hiddenTitle` …).

### 4d. How it is built (no store change)

- A DOM-only pass, `DashboardView._privacyMotion(container, 'hide'|'show')`:
  walks `#router-view` text nodes for amounts — a regex built from
  `Store.formatCurrency`'s own output for the base currency (sign, symbol,
  digits, separators) on the way in; `MONEY_MASK` on the way out — wraps each
  in a `<span class="money-cloak">` and lays a `.money-balls` overlay of
  four `<i>` over it. Canvas labels are not touched (Home's charts show no
  amounts on canvas; the scrub readout goes through the DOM header).
- Timers are tracked and cleared in `destroy()` and on any re-render; a
  second shake during the motion is ignored (the detector already has a
  1.5 s cooldown).
- `Haptics.sequence([{at, style}…])` added next to `impact()`.
- E2E: `privacy_motion.spec.js` — shake → balls present mid-animation →
  final state masked, store updated once; reduced motion → no `.money-balls`;
  unit test for the amount regex in five locales.

## 5. Not in scope

Masking screens other than Home (HG-4 decision), changing the shake
detector's sensitivity, sound.

## 6. Open questions for the owner

Asked and answered 2026-11-08 — the owner took every recommendation, so §4
is the design as written:

| | Decision |
|---|---|
| D1 animation | balls pop in one by one, left → right, digits blur away (~0.5 s) |
| D2 order | cascade top → bottom, ~40 ms per figure |
| D3 haptics | LIGHT tap per ball + HEAVY seal, after the shake |
| D4 reveal | mirror, lighter: balls shrink out right → left, digits sharpen in, one MEDIUM tap |

## 7. As built (2026-11-08)

- `DashboardView.setHidden(hide)` is the one entry on Home: the shake handler
  and the sheet's **Show** call it; off Home (Settings) it is a plain
  `SET_PRIVACY`. One motion at a time (`_motion`); `destroy()` lands a
  running motion's dispatch at once (`_flushMotion`).
- `_cloak(root, 'real'|'mask', {balls})` wraps the number part of every
  amount in `#router-view` (regex on `formatCurrency`'s shape: optional sign,
  `$ € ¥ £`, digits with `. , ' nbsp nnbsp thin-space` groups; or the
  symbol + `MONEY_MASK`). Returns `{el, y, visible}`; only visible figures
  animate. `_cascade(items, span)` sets `--d` by screen height (top = 0 ms,
  spread over ≤ `span`).
- Hide timing (`MOTION`): balls pop 200 ms, 60 ms apart, cascade ≤ 160 ms;
  then each cloak's width shrinks to the balls' (120 ms) so right-aligned
  figures slide into place; then the dispatch. Haptics: 4 × `LIGHT` at
  120 + 60 n ms, `HEAVY` at the end (~545 ms measured in WebKit).
- Show: `MEDIUM` at once, balls shrink 150 ms right → left (40 ms apart,
  cascade ≤ 100 ms), the dispatch lands halfway through the last ball, and the
  re-render's `_privacyAfter` sharpens the digits (blur 6 px → 0, 220 ms),
  then unwraps every cloak back to plain text (`_uncloak`).
- The pill row opens (`.is-entering`) after a hide and closes
  (`.is-leaving`) before a show, so the page slides instead of jumping.
- Reduce Motion (changed after TestFlight 10204): the same steps and taps,
  as fades — each ball fades in, the digits fade out, the pill row fades; no
  scale, blur or slide. Haptics run on their own timers, never cleared by the
  commit (10204 dropped every tap with Reduce Motion on: the immediate commit
  cleared them). 10203 also never received a shake: iOS needs
  `DeviceMotionEvent.requestPermission()` again after each launch
  (`PrivacyShake.armPermission`, first tap). `Announcer` says
  `privacy.hiddenTitle` / `privacy.shownAnnounce` (new key, 5 languages).
- Tests: `hiddenBalances.test.js` (shake → 4 LIGHT + HEAVY, one dispatch after
  the motion), e2e `hidden_balances.spec.js` › *the balls cover the figures…*
  (balls mid-motion, cascade delays, second request ignored, one dispatch each
  way, cloaks unwrapped). CSS block at the end of `components.css`.
- Not checked on a device yet: the haptic feel on iPhone / Android.
