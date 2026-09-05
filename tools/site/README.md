# tools/site

Generators for the marketing site's images. They live here, not in the site
repo, because they need this repo's `playwright` and `sharp` — and because
Cloudflare Pages publishes every file in the site repo, so a build tool
committed there would be served as a stray page.

Both write into `../StackdSite/img/` and expect the site repo checked out
next to this one.

| Script | Produces |
|---|---|
| `screens.cjs` | `home-*.webp`, `history-*.webp`, `debt-*.webp` — real app screens at 390×844 @2x, light and dark |
| `make-og.cjs` | `og.png` — the 1200×630 link-preview image, rendered from `og.html` |

## Screenshots

Needs the dev server running in this repo:

```bash
npm run dev
```

```bash
node tools/site/screens.cjs
```

It clears local storage, seeds six months of example data through
`Store.dispatch`, walks the views in both themes, then converts the PNGs to
WebP. Re-run after a visible UI change so the site's phone shots stay honest.

Two things to know: the seed uses stable category ids (`cat_salary`,
`cat_groceries`, …) from `DEFAULT_CATEGORIES` in `src/store.js`, and it drives
the debt simulator through the real form (`#dsim-principal`, `#btn-dsim-calculate`)
rather than dispatching state, so the results screen matches what a user sees.

## Open Graph image

```bash
node tools/site/make-og.cjs
```

`og.html` is a fixed 1200×630 layout using the site's own fonts, palette and
`home-dark.webp`. It is rendered at 2x and downsampled so the type stays crisp.
Re-run it after a headline change or a new hero screenshot.
