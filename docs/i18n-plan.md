# Phase 8 — Internationalization (FR / IT / ES / PT)

Sub-phase plan for the last item of [docs/refactor-plan.md](refactor-plan.md)
(item 12b of the 2026-08-11 screenshot review). Split out because the work is
far larger than one session: ~350 app-chrome strings plus ~250–300 lines of
Support prose, across five monolithic global-script files.

**This document is the entry point for a fresh session.** Read it, then read
`CLAUDE.md` for the architecture and house rules before touching code.

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

## Sub-phases

Each sub-phase is independently shippable, testable, and commits on its own.
Translations land **with** their slice (not in one giant pass at the end) so
the user can review real screens early.

### P8a — Foundation *(no visible change)*
Build `src/i18n.js` + `src/i18n/en.js`; wire `I18n.lang` from
`state.language` on boot and in the `SET_LANGUAGE` case; add the four
language files as empty dictionaries; expand both language pickers
(Settings + `main.js` Region Setup, dropping its "More languages coming
soon…" row) to the five languages. With only `en` populated, everything
falls back to English — the app must look **identical** when done.
*Done when:* unit tests cover interpolation, plural variants, `en` fallback,
missing-key fallback, and `locale()` mapping; switching language in Settings
persists and re-renders with no visual change.

### P8b — Locale-aware formatting *(highest regression risk — isolated on purpose)*
Route every date/number/currency site through `I18n.locale()`, replacing both
the `undefined` (device-locale) and `'en-US'` (pinned) arguments.
**Danger:** switching off `en-US` changes decimal separators to `1.234,56`
for IT/ES/PT — audit anything that *parses* formatted output, especially the
amount input in the transaction form. **CSV column headers must stay
English** or `import.js` stops matching them; pin that with a test.
*Done when:* a locale-matrix unit test covers currency/date output per
language, and a CSV export→import round-trip passes unchanged under a
non-English language.

### P8c — Core chrome *(the daily screens)*
Extract + translate Dashboard, Wallets, History (incl. the selection bar and
filter bar), the New/Edit Log form, and the bottom nav. Restructure the
plural-concatenation and assembled-sentence sites in these files into full
templates with placeholders.
*Done when:* those screens are fully translated in all four languages and the
e2e suite passes in at least one non-English language.

### P8d — Remaining views
Analytics (incl. the v0.85 tag drilldown), Budget/Goals, Debt (hub, simulator,
results), Settings, Categories, Tags, and the shared modals in
`components.js` (filter, recurring scope/delete, pickers, region setup).

### P8e — Widgets, insights, store labels
`widgets.js` (titles, descriptions, config labels, empty states),
`insights.js` (its `STRINGS` table is already the seam — swap it for `t()`
calls), and `store.js` period labels ("Today", "This Month", …).
**`DEFAULT_CATEGORIES` names live inside stored user data** — translate them
at *render* time by stable `cat_*` id for `isDefault` categories only; never
rewrite what is in localStorage, or a user's edits and CSV backups break.

### P8f — Support prose *(decision pending — recommend deferring)*
FAQ (~30 Q&A pairs), User Manual, and Terms in `components.js`: ~250–300
entries **per language**. Recommendation: ship English-first and revisit.
If translated, `ManualModal`'s search must search the *localized* corpus, not
the English source text.

### P8g — QA sweep
Hunt missed strings (the 90 `aria-label`s and `title` attributes are the
usual stragglers, plus `alert()`/`confirm()` text); check layout at longer
translations — French and Portuguese run ~20–30% longer than English, which
stresses the fixed-height widget cards (`--widget-h-small/large`), the
segmented pills, and the truncating list rows; verify both themes; rebuild
and check on device.

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

## Open decisions for the user

1. **Support prose** (P8f): English-first *(recommended)* or full translation?
2. **Number formatting** (P8b): follow the app language *(recommended)* or
   keep US formatting everywhere regardless of language?
3. **Default category names** (P8e): display-translate the seeded defaults
   *(recommended)* or leave them as stored?
