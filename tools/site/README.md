# tools/site

Generators for the marketing site (the separate StackdSite repo, checked out
next to this one). They live here, not in the site repo, because they need
this repo's `playwright`, `sharp` and dictionaries — and because Cloudflare
Pages publishes every file in the site repo, so a build tool committed there
would be served as a stray page.

The site is in the app's five languages (`docs/site-i18n-plan.md`). English
lives at the root (`/`, `/support`, `/privacy`, `/terms` — the store-listing
URLs), the others under `/fr/`, `/it/`, `/es/`, `/pt/`.

| Script | Produces |
|---|---|
| `pages.cjs` | `index.html`, `support.html`, `404.html` at the root and in each `<lang>/`, from `strings/<lang>.cjs` + `layout.cjs` |
| `legal.cjs` | `<lang>/privacy.html`, `<lang>/terms.html` from the app's dictionaries; also writes the shared header and footer into the hand-written English `privacy.html` / `terms.html` |
| `screens.cjs` | `img/{home-dark,home-light,history-dark,debt-dark}.webp` and the same under `img/<lang>/` — real app screens, 390×844 @2x |
| `make-og.cjs` | `img/og.png` — the 1200×630 link-preview image, rendered from `og.html` (English only, decision D7) |
| `sitemap.cjs` | `sitemap.xml` |
| `redirect-check.cjs` | nothing — tests the site's language redirect, `StackdSite/functions/_middleware.js` |

`layout.cjs` is shared: URLs, `<head>`, the header with the language menu, the
footer. `strings/<lang>.cjs` holds all site copy; every language has the same
keys as `en.cjs`, and `pages.cjs` refuses to finish otherwise.

## Changing the site's text

1. Edit `strings/en.cjs` and the same key in `fr`, `it`, `es`, `pt`. Button
   and screen names must match the app's dictionaries (`src/i18n/<lang>.js`).
2. Run, in this repo:

   ```bash
   node tools/site/pages.cjs
   ```

   ```bash
   node tools/site/legal.cjs
   ```

   Both print problems and exit non-zero: a missing key or placeholder, a
   string still in English, a link or image that does not exist, or English
   legal pages out of step with the app.
3. Commit the site repo, then run `sitemap.cjs` and commit again (its dates
   come from the site repo's commits).

Never hand-edit `index.html`, `support.html`, `404.html` or anything under
`<lang>/` in the site repo — the next run overwrites them. The English
`privacy.html` and `terms.html` stay hand-written between their header and
footer.

## Language redirect

`StackdSite/functions/_middleware.js` (a Cloudflare Pages Function) runs on
the four English root pages only (`StackdSite/_routes.json`). A visitor
arriving from another site whose browser prefers French, Italian, Spanish or
Portuguese is sent (302) to that language's page; a click from inside the site
is never redirected, which is how picking English in the menu sticks without a
cookie. Cloudflare does not apply `_headers` to a Function's responses, so the
function sets the same security headers itself. After changing it, or
`_headers`, run:

```bash
node tools/site/redirect-check.cjs
```

## Screenshots

Needs the dev server running in this repo:

```bash
npm run dev
```

```bash
node tools/site/screens.cjs
```

For each language it clears local storage, switches the app's language,
seeds six months of example data through `Store.dispatch` (`tools/seed.cjs`,
shared with the store screenshots) and captures the four shots the site uses.
The example account names and notes are localized here and passed to the
seed, because the app never translates user data; default category names stay
English, as in the app (i18n plan, decision 3). Re-run after a visible UI
change so the site's phone shots stay honest.

The seed is dated relative to today, so the balances on screen move between
captures. **After a re-capture, update the figures in the image descriptions**
(`home.hero.imgAlt` and the Debt entry of `home.screens.items` in every
`strings/<lang>.cjs`) to what the new shots show, in each language's own
number format.

The debt simulator is driven through the real form (`#dsim-principal`,
`#btn-dsim-calculate`) rather than by dispatching state, so the results screen
matches what a user sees.

## Open Graph image

```bash
node tools/site/make-og.cjs
```

`og.html` is a fixed 1200×630 layout using the site's own fonts, palette and
`home-dark.webp`. It is rendered at 2x and downsampled so the type stays crisp.
Re-run it after a headline change or a new hero screenshot.

## Sitemap

```bash
node tools/site/sitemap.cjs
```

Each `<lastmod>` is the commit date of that page in the site repo, so the dates
are true by construction. Google ignores `<priority>` and `<changefreq>` and
distrusts `<lastmod>` when it is wrong, so only `<lastmod>` is emitted. The URLs
are extensionless because Cloudflare Pages 308-redirects `/privacy.html` to
`/privacy`, and a folder's `index.html` is the folder (`/fr/`).

Run it after committing a content change, then commit the regenerated file.
