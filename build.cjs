/**
 * build.cjs — production build helper
 *
 * index.html uses `defer` so it can be opened directly via file://.
 * Vite's bundler requires `type="module"` to tree-shake and inline scripts.
 *
 * This script:
 *   1. Patches index.html: defer → type="module" (the app's own scripts)
 *   2. Runs `vite build`
 *   3. Restores index.html: type="module" → defer
 *   4. Inlines the vendored libraries (src/libs/*.js) into dist/index.html as
 *      plain classic scripts — see below
 *
 * Run via:  node build.cjs   (or  npm run build)
 *
 * 1.3.0 (PDF export fix, 2026-11-13): the vendored libraries are UMD files
 * (pdf-lib, lucide, Chart.js). Bundled as modules, the bundler rewrote their
 * `typeof exports == "object"` test to its own module object, so each one
 * exported into the bundle instead of setting window.PDFLib / window.lucide:
 * the built app (Android, iOS) had no PDFLib, and the Receipts PDF export
 * silently produced nothing. The dev server never bundles, so the e2e suite
 * could not see it. Every src/libs script is therefore kept OUT of the
 * bundler and written into the single file as a classic inline <script>, in
 * its original place — exactly how the dev server and file:// run them.
 * tools/check-bundle.cjs proves the globals exist in the built file (CI).
 */

const fs   = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const htmlPath = path.join(__dirname, 'index.html');
const distPath = path.join(__dirname, 'dist', 'index.html');
const original = fs.readFileSync(htmlPath, 'utf8');

const LIB_TAG = /<script defer src="(src\/libs\/[^"?]+\.js)(?:\?[^"]*)?"><\/script>/g;
const libs = [...original.matchAll(LIB_TAG)].map(m => m[1]);

// Patch: the app's own scripts become modules; the libraries keep `defer`
// (Vite leaves a classic script alone and does not bundle it).
const patched = original
  .replace(/<script defer src=(?!"src\/libs\/)/g, '<script type="module" src=');

fs.writeFileSync(htmlPath, patched, 'utf8');
console.log('[build] Patched index.html → type="module" for Vite bundler (libraries kept classic)');

try {
  execSync('npx vite build', { stdio: 'inherit' });
} finally {
  // Always restore, even if build fails
  fs.writeFileSync(htmlPath, original, 'utf8');
  console.log('[build] Restored index.html → defer (file:// compatible)');
}

// Inline each library where its tag was. Inline classic scripts run while the
// page is parsed, so every global exists before the app's module (which runs
// after parsing) starts.
let dist = fs.readFileSync(distPath, 'utf8');
for (const rel of libs) {
  const code = fs.readFileSync(path.join(__dirname, rel), 'utf8');
  if (/<\/script|<!--|<script/i.test(code)) {
    throw new Error(`[build] ${rel} contains a sequence that would break an inline <script>`);
  }
  const tag = new RegExp(`<script defer src="${rel.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?:\\?[^"]*)?"><\\/script>`);
  if (!tag.test(dist)) throw new Error(`[build] ${rel}: its <script> tag is missing from dist/index.html`);
  dist = dist.replace(tag, () => `<script>/* ${rel} */\n${code}\n</script>`);
}
if (/<script[^>]+src="src\//.test(dist)) throw new Error('[build] dist/index.html still points at a src/ file');
fs.writeFileSync(distPath, dist, 'utf8');
console.log(`[build] Inlined ${libs.length} libraries as classic scripts: ${libs.join(', ')}`);
