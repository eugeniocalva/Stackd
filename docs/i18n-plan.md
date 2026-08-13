# Phase 8 — Internationalization (FR / IT / ES / PT)

**STATUS: COMPLETE — shipped v0.86 → v0.92 (2026-08-13).** The app runs
fully in English, French, Italian, Spanish and Portuguese. This document is
now the *record* of how it was done; read it before touching i18n code, and
read `CLAUDE.md` for the architecture and house rules.

Was the last item of [docs/refactor-plan.md](refactor-plan.md) (item 12b of
the 2026-08-11 screenshot review), split out because the work was far larger
than one session.

---

## Non-negotiables (read before writing any code)

- **Cache-busting.** Editing any `src/*.js` means bumping its `?v=` in
  `index.html`; co-dependent files bump together, or a stale cached file
  throws at runtime on native/`file://`. CSS files carry no `?v=`.
- **No bundler.** Files attach globals to `window` and load via ordered
  `<script defer>` tags. Load order is dependency order.
- **The build.** `npm run build` runs `build.cjs`, which flips `defer` →
  `type="module"`, runs Vite (singlefile, everything inlined), then restores
  `defer`. New `<script defer src=...>` tags are picked up by its regex
  automatically — no build changes needed.
- **Tests.** `npm run test` (Vitest, loads real src files via the
  `executeFile`/`new Function` pattern in index.html order — new i18n files
  must join that chain), `npx playwright test` (e2e), `npm run lint`.
- **Landing work.** Verify, then ask the user for approval before committing.
  One commit per sub-phase, with the `<title>` version bumped.
- **Device.** Web changes only reach the phone after `npm run build` +
  `npx cap sync android` and an APK rebuild.

## Current state (verified 2026-08-12, v0.85)

- **No i18n infrastructure exists.** No string table, no `t()`, no `I18n`
  global. Every user-facing string is a hardcoded English literal inside
  template literals.
- **The language setting is fully wired but dead**: `state.language`
  (default `'en'`, persisted at `stackd_v1_language`), a `SET_LANGUAGE`
  action that persists and emits, and two pickers (Settings + the
  first-launch Region Setup modal in `main.js`) offering English only. Its
  single consumer renders `'English'` either way.
- **Live switching is nearly free**: every dispatch re-renders the active
  view wholesale, so setting `I18n.lang` inside the `SET_LANGUAGE` case is
  enough — no subscription plumbing.
- **Dates already half-localize**: History day headers use the *device*
  locale (`toLocaleDateString(undefined, …)`), which is why an Italian phone
  shows `MAR 11 AGO`, while charts and currency are pinned to `'en-US'`.
  The app currently ships a mixed-locale experience.

### Measured scope (grep counts, 2026-08-12)

| Signal | Count | Where |
|---|---|---|
| `'en-US'` pinned literals | 19 | store 10, widgets 4, components 3, views 1, insights 1 |
| `toLocaleDateString` / `Intl.NumberFormat` sites | 27 (excl. vendored chart.js) | store 14, components 4, widgets 4, views 3, export 1, insights 1 |
| `aria-label=` attributes | 90 | components 46, views 33, widgets 8, main 2, insights 1 |
| Plural-by-concatenation sites (`${n} thing${n !== 1 ? 's' : ''}`) | 8 | views 7, components 1 |

Rough string volume: **views.js ~250–300**, **components.js ~300+** (but
~250 of those are FAQ/Manual/Terms prose), **widgets.js ~45**, **store.js
~45** (14 `DEFAULT_CATEGORIES` names + period labels), **main.js ~15**,
**insights.js ~8** (already isolated in its `STRINGS` table).

---

## Architecture

```
src/i18n.js          → window.I18n  (loaded AFTER db.js, BEFORE store.js)
src/i18n/en.js       → window.I18n.dicts.en = { ... }
src/i18n/fr.js       → window.I18n.dicts.fr = { ... }
src/i18n/it.js       → src/i18n/es.js → src/i18n/pt.js
```

`window.I18n` surface:

```js
window.I18n = {
  lang: 'en',
  dicts: {},
  locale(),                  // 'en' → 'en-US', 'it' → 'it-IT', …  (BCP 47)
  t(key, params),            // {var} interpolation; en fallback; key fallback
  setLang(code)
}
```

- **Plurals** via key variants (`tx.count.one` / `tx.count.other`, plus
  explicit `zero` where a language needs it) resolved with
  `Intl.PluralRules(I18n.locale())` — never suffix hacks. French treats 0 as
  singular; that is the reason the 8 concatenation sites must be restructured
  rather than wrapped.
- **Fallback chain**: requested lang → `en` → the key itself. A missing
  translation degrades to English, never to a blank or a crash, which is what
  makes incremental migration safe.
- **Load position** matters: `store.js` needs `t()` for period labels and
  currency formatting, so i18n loads before it.

---

## Sub-phases — ALL SHIPPED

Each sub-phase shipped independently, with its translations, on its own commit.

| Sub-phase | Shipped | What landed |
|---|---|---|
| P8a Foundation | v0.86 | `src/i18n.js` (`t()`, `locale()`, `setLang()`, plural variants, lang→en→key fallback) + five dictionaries; `I18n.lang` wired to `state.language` on boot, in `SET_LANGUAGE` and in the cross-tab storage handler; both pickers offer 5 languages. |
| P8b Locale formatting | v0.87 | All 27 date/number/currency sites route through `Store.getLocale()`. CSV headers and amounts stay English/dot-decimal, pinned by an export→import round-trip test under `language=it`. |
| P8c Core chrome | v0.88 | Bottom nav + FAB, Dashboard, History (selection bar, filter bar, delete + scope modals), New/Edit Log form. Plural sites restructured to `.one`/`.other`; the nav is rebuilt on language change because it mounts outside the render loop. |
| P8d Remaining views | v0.89 | Analytics, Budget/Goals, Debt (hub/sim/results), Settings, Edit Account, Categories, Tags, every shared modal, Region Setup. Calendar month/weekday names come from `Intl` via `I18n.monthNames()`/`weekdayInitials()`. |
| P8e Widgets, insights, store | v0.90 | All 8 widgets (registry `title`/`description` are GETTERS so live switching reaches the gallery), `insights.js` STRINGS table, store period labels. |
| P8f Support prose | v0.91 | FAQ, User Manual and Terms fully translated (182 keys/language). The three blocks are id-only structures resolved at render time, so the manual's **search runs over the localized corpus**. |
| P8g QA sweep | v0.92 | Straggler sweep (aria-labels, picker titles, recurring/tags modal copy, the PDF report); long-translation layout audit across all 5 languages, both themes. |

**Final state: 816 keys × 5 languages, parity enforced by
`tests/unit/i18n.test.js`** (key coverage, placeholder match, plural
completeness). 518 unit tests, 31 e2e.

### Conventions worth keeping

- Call sites use `window.I18n.t(...)` in full — deliberately **no bare `t`
  alias**, because `t` is already a heavily-used callback parameter in
  views.js/components.js.
- Anything that varies by count is a **whole-sentence key per variant**
  (`form.repeatsEvery.<freq>.one/.other`), never a `{unit}` placeholder —
  French gender agreement makes the placeholder form impossible.
- Data that is **stored** stays English (category names by user decision,
  account-type values, CSV headers); only its *label* is localized, by stable
  id (`Store.accountTypeLabel`, `_DebtShared.TYPES[x].label`).
- Month and weekday names are **derived from `Intl`**, never dictionary keys.
- Any structure that feeds `I18n.t` at render time (widget registry, FAQ /
  manual / terms) must expose a **getter**, not a plain property, or it
  freezes in the boot language.

### Known-acceptable truncation

Small widget cards are fixed-height and their title is one line with
`text-overflow: ellipsis` (a deliberate v0.73 decision — a wrapped title eats
a row of the body). English itself truncates at this size
("UPCOMING TRANSACTIONS" by 48px), so the translated titles sit within the
existing baseline; the two that were dramatically worse (es/pt "Budget goals")
were shortened to the name each language already uses for that screen.

---

## Translation conventions

- **Finance terms stay consistent** across screens — decide once per language:
  expense / income / balance / account (wallet) / transfer / budget / tag /
  recurring / paid.
- The app's own product nouns (**Stack'd**, **Wallets**, **Smart insights**)
  stay in English unless the user says otherwise.
- Keep keys semantic and namespaced by area (`history.selection.count`,
  `form.paid.subtitle.on`), not by English text.
- Prefer whole sentences with placeholders over concatenated fragments —
  word order differs across all four target languages.

## Open decisions — RESOLVED (user, 2026-08-12, P8a session)

1. **Support prose** (P8f): **full translation**. FAQ/Manual/Terms are
   translated into all four languages (~250–300 entries each);
   `ManualModal`'s search must search the *localized* corpus.
2. **Number formatting** (P8b): **follow the app language**. Dates, numbers,
   and currency all use `I18n.locale()`; CSV headers stay English.
3. **Default category names** (P8e): **leave as stored**. Category names
   always render exactly as stored — no display-time translation, defaults
   stay English in every language. (P8e shrinks to widgets/insights/period
   labels only.)
