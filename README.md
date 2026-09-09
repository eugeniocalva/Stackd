# Stack'd

A privacy-first personal finance tracker. Wallets, transactions, budgets,
loans and tags live in the app's own storage on the device: no account to
create, no cloud sync, no analytics, no ads. It ships as a web app wrapped for
Android and iOS with Capacitor, in English, French, Italian, Spanish and
Portuguese.

Made by Stack'd Development Studio — <https://stackdplatform.com>

> **Not open source.** © 2026 Stack'd Development Studio. All rights reserved.
> The repository is public so the app's behaviour can be inspected — a finance
> app that claims your data never leaves your phone should be checkable — but
> no licence to use, copy or redistribute the code is granted.

## What is where

| | |
|---|---|
| `src/` | the whole app: plain JavaScript globals, no bundler, no framework |
| `index.html` | the load order, and the `?v=` cache keys that go with it |
| `docs/` | the design and build plans; each feature has one |
| `broker/` | the Bank Connect backend, a Cloudflare Worker (its own README) |
| `tools/` | generators for the marketing site, store screenshots and versions |
| `android/`, `ios/` | Capacitor wrappers |
| `tests/unit`, `tests/e2e` | Vitest and Playwright |
| `mobile_apple/` | an unused Expo scaffold, kept for reference only |

**`CLAUDE.md` is the architecture guide.** Read it before changing `src/` —
the app deliberately uses no module system, so load order and a handful of
conventions are load-bearing in ways the code does not announce.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run lint         # eslint
npm test             # Vitest, ~730 unit tests
npm run test:e2e     # Playwright, starts the dev server itself
npm run build        # single-file bundle into dist/
```

The build is not a plain `vite build`: `build.cjs` temporarily rewrites
`index.html`'s script tags so the same file works both over `file://` on a
device and through Vite's bundler. `CLAUDE.md` explains why.

Native builds:

```bash
npm run build && npx cap sync android   # then Android Studio, or gradlew
npm run build && npx cap sync ios       # needs a Mac
```

## Releasing

`docs/release-checklist.md` is the mechanical list; `docs/launch-plan.md` is
the plan for the first store release. The version lives in `package.json` and
nowhere else — `npm run version:sync` propagates it to the page title, the
Android gradle and the Xcode project, and a unit test fails if they drift.

## The parts worth knowing about

- **Balances are never stored.** An account's balance is the sum of its
  transactions, recomputed on read, so what you see always matches what was
  recorded.
- **Loan maths runs in integer cents** (`src/loan-engine.js`), so a schedule
  adds up exactly.
- **Statement import** reads CSV, camt.053 and MT940 entirely on the device,
  keeps the extracted rows and never the file.
- **Bank Connect** is the one optional feature that talks to a server. It is
  switched off at build time for the first release
  (`BankConnect.FEATURE_ENABLED`); see `docs/launch-plan.md`.
- **Native storage** is mirrored to real files, because iOS can evict a
  WebView's localStorage and that would mean silent total data loss.

## Security

Found something? Please email <hi@stackdplatform.com> rather than opening a
public issue. `broker/README.md` carries the server's threat model and
`docs/broker-runbook.md` the incident procedure.
