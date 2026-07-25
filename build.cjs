/**
 * build.cjs — production build helper
 *
 * index.html uses `defer` so it can be opened directly via file://.
 * Vite's bundler requires `type="module"` to tree-shake and inline scripts.
 *
 * This script:
 *   1. Patches index.html: defer → type="module"
 *   2. Runs `vite build`
 *   3. Restores index.html: type="module" → defer
 *
 * Run via:  node build.cjs   (or  npm run build)
 */

const fs   = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const htmlPath = path.join(__dirname, 'index.html');
const original = fs.readFileSync(htmlPath, 'utf8');

// Patch: replace `defer src=` with `type="module" src=`
const patched = original
  .replace(/<script defer src=/g, '<script type="module" src=');

fs.writeFileSync(htmlPath, patched, 'utf8');
console.log('[build] Patched index.html → type="module" for Vite bundler');

try {
  execSync('npx vite build', { stdio: 'inherit' });
} finally {
  // Always restore, even if build fails
  fs.writeFileSync(htmlPath, original, 'utf8');
  console.log('[build] Restored index.html → defer (file:// compatible)');
}
