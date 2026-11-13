#!/usr/bin/env node
// 1.3.0 (PDF export fix, 2026-11-13): checks the BUILT app — dist/index.html,
// the single file the Android and iOS apps load — instead of the dev server
// the e2e suite uses. The dev server never bundles, so a bundler change that
// breaks the shipped app (the vendored pdf-lib lost window.PDFLib for weeks)
// is invisible to e2e. Run after `npm run build`:
//
//   node tools/check-bundle.cjs [path/to/dist/index.html]
//
// Exits non-zero on any failure. CI runs it (.github/workflows/ci.yml).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist', 'index.html'));

(async () => {
  if (!fs.existsSync(file)) throw new Error(`${file} not found — run npm run build first`);
  const html = fs.readFileSync(file);
  if (/<script[^>]+src="src\//.test(html.toString('utf8'))) throw new Error('the built file still loads a script from src/');
  // Served over http://localhost, like Capacitor's https://localhost.
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/?')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    res.writeHead(404); res.end();
  }).listen(0);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  const failed = [];
  page.on('requestfailed', r => failed.push(r.url()));
  try {
    const url = `http://localhost:${server.address().port}/`;
    await page.goto(url);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    await page.reload();
    await page.waitForFunction(() => window.Store && window.StackdExport && document.getElementById('bottom-nav'), null, { timeout: 20000 });

    const result = await page.evaluate(async () => {
      const out = {};
      // every global the app reads from a vendored library
      out.PDFLib = !!(window.PDFLib && window.PDFLib.PDFDocument);
      out.lucide = !!(window.lucide && typeof window.lucide.createIcons === 'function');
      out.Chart = typeof window.Chart === 'function';
      // the app's own globals
      out.app = ['StackdDB', 'I18n', 'Store', 'Components', 'Views', 'Router', 'StackdExport', 'StackdImport', 'Attachments', 'AppLock']
        .filter(g => !window[g]);
      // a real Receipts PDF: a transaction with a photo attached
      const S = window.Store;
      S.dispatch('SET_CURRENCY', 'EUR');
      S.dispatch('ADD_ACCOUNT', { name: 'Main', type: 'Bank', openingBalance: 100, openingDate: '2026-01-01' });
      const accountId = S.getState().accounts[0].id;
      const canvas = document.createElement('canvas');
      canvas.width = 80; canvas.height = 60;
      const g = canvas.getContext('2d');
      g.fillStyle = '#2b6cb0'; g.fillRect(0, 0, 80, 60);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
      const prepared = await window.Attachments.prepare(new File([blob], 'receipt.jpg', { type: 'image/jpeg' }));
      const txId = 'tx_check_bundle';
      const meta = prepared && !prepared.error ? await window.Attachments.add(txId, prepared) : null;
      out.attachment = !!meta;
      S.dispatch('ADD_TRANSACTION', { id: txId, type: 'expense', amount: 12.5, accountId, categoryId: 'cat_groceries', date: S._todayYMD(), attachments: meta ? [meta] : [] });
      const bytes = await window.StackdExport.buildReceiptsPdf(S.getState(), {});
      out.pdfBytes = bytes ? bytes.length : 0;
      out.pdfHeader = bytes ? String.fromCharCode(...bytes.slice(0, 5)) : '';
      // icons drawn through lucide, a chart drawn through Chart.js
      location.hash = '#dashboard';
      await new Promise(r => setTimeout(r, 800));
      out.icons = document.querySelectorAll('#router-view svg').length;
      out.canvases = document.querySelectorAll('#router-view canvas').length;
      return out;
    });

    const problems = [];
    if (!result.PDFLib) problems.push('window.PDFLib is missing (Receipts PDF export)');
    if (!result.lucide) problems.push('window.lucide is missing (icons)');
    if (!result.Chart) problems.push('window.Chart is missing (charts)');
    if (result.app.length) problems.push('app globals missing: ' + result.app.join(', '));
    if (!result.attachment) problems.push('could not store a test attachment');
    if (result.pdfHeader !== '%PDF-' || result.pdfBytes < 1000) problems.push(`Receipts PDF not produced (header "${result.pdfHeader}", ${result.pdfBytes} bytes)`);
    if (!result.icons) problems.push('no icons drawn on Home');
    if (!result.canvases) problems.push('no chart canvas on Home');
    if (errors.length) problems.push('console / page errors: ' + errors.join(' | '));
    if (failed.length) problems.push('requests that failed: ' + failed.join(', '));

    console.log(`[check-bundle] ${path.relative(process.cwd(), file)}: PDFLib=${result.PDFLib} lucide=${result.lucide} Chart=${result.Chart} ` +
      `receipts PDF=${result.pdfBytes} bytes, icons=${result.icons}, charts=${result.canvases}`);
    if (problems.length) {
      console.error('[check-bundle] FAILED:\n  - ' + problems.join('\n  - '));
      process.exitCode = 1;
    } else {
      console.log('[check-bundle] OK');
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error('[check-bundle] FAILED:', e.message); process.exit(1); });
