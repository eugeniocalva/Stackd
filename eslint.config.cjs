/**
 * ESLint flat config (ESLint 9+).
 *
 * This repo is deliberately bundler-free: `src/*.js` are plain <script defer>
 * files that attach singletons to `window` (see CLAUDE.md). That means:
 *   - sourceType is "script", not "module"
 *   - the app's own singletons (Store, Views, ...) are cross-file globals
 *   - `src/libs/` holds vendored third-party bundles and is not linted
 *
 * Rules are intentionally pragmatic: store.js / views.js / components.js are
 * large legacy monoliths, so style-ish rules that would produce thousands of
 * pre-existing hits are downgraded to warnings or off. The goal is for
 * `npm run lint` to surface real breakage, not to relitigate the whole file.
 */

const js = require('@eslint/js');

// Browser runtime globals used by the app. Listed explicitly instead of
// pulling in the `globals` package so this config has no extra dependency
// beyond eslint itself.
const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  history: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  crypto: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  queueMicrotask: 'readonly',
  matchMedia: 'readonly',
  getComputedStyle: 'readonly',
  scrollTo: 'readonly',
  addEventListener: 'readonly',
  removeEventListener: 'readonly',
  dispatchEvent: 'readonly',
  visualViewport: 'readonly',
  screen: 'readonly',
  performance: 'readonly',
  structuredClone: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  FormData: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Image: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  KeyboardEvent: 'readonly',
  MouseEvent: 'readonly',
  TouchEvent: 'readonly',
  PointerEvent: 'readonly',
  Element: 'readonly',
  HTMLElement: 'readonly',
  Node: 'readonly',
  NodeList: 'readonly',
  DOMParser: 'readonly',
  MutationObserver: 'readonly',
  ResizeObserver: 'readonly',
  IntersectionObserver: 'readonly',
  AbortController: 'readonly',
  Intl: 'readonly',
  ClipboardEvent: 'readonly',
  ImageData: 'readonly',
  OffscreenCanvas: 'readonly',
  Path2D: 'readonly',
};

// Cross-file singletons this app defines on `window` (db.js -> ... -> main.js),
// plus third-party globals loaded via <script> tags.
const appGlobals = {
  StackdDB: 'writable',
  Store: 'writable',
  Components: 'writable',
  Views: 'writable',
  Router: 'writable',
  StackdExport: 'writable',
  StackdImport: 'writable',
  StackdHydrateIcons: 'writable',
  ScrollUtils: 'writable',
  KeyboardManager: 'writable',
  lucide: 'readonly',
  Chart: 'readonly',
  Capacitor: 'readonly',
  jspdf: 'readonly',
};

module.exports = [
  {
    // Vendored bundles and build output are never linted.
    ignores: [
      'src/libs/**',
      'dist/**',
      'android/**',
      'mobile_apple/**',
      'node_modules/**',
      'scratch/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },

  // ---- App source: classic scripts on the browser globals ----
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...browserGlobals, ...appGlobals },
    },
    rules: {
      ...js.configs.recommended.rules,

      // Legacy monoliths: keep these visible but non-blocking.
      'no-unused-vars': ['warn', {
        args: 'none',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-prototype-builtins': 'off',
      'no-inner-declarations': 'off',
      'no-control-regex': 'off',
      // store.js's dispatch switch declares let/const directly in case blocks
      // throughout; flag it, don't fail the build over it.
      'no-case-declarations': 'warn',

      // Genuine-breakage rules stay as errors (from eslint:recommended):
      // no-undef, no-dupe-keys, no-unreachable, no-const-assign, etc.
      'no-console': 'off',
    },
  },

  // ---- Vitest unit tests (jsdom) ----
  {
    files: ['tests/unit/**/*.js', 'vitest.config.js', 'vite.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...browserGlobals,
        ...appGlobals,
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        global: 'readonly',
        globalThis: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // ---- Playwright e2e ----
  {
    files: ['tests/e2e/**/*.js', 'playwright.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...browserGlobals,
        ...appGlobals,
        process: 'readonly',
        __dirname: 'readonly',
        global: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // ---- Node-side build/tooling scripts (CommonJS) ----
  {
    files: ['*.cjs', 'build.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },
];
