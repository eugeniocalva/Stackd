// In-app purchase REVIEW screenshot for App Store Connect (launch-plan O-19).
//
//   npm run dev                          # this repo, serving :3000
//   node tools/store/iap-review.cjs
//
// Output: tools/store/out/iap-review/stackd_pro-en.png (gitignored).
//
// This is a different artefact from tools/store/screens.cjs, and the two
// follow opposite rules on purpose. Listing screenshots are PUBLIC and shown
// in every storefront, so screens.cjs deliberately never shows the purchases
// screen — a hard-coded price would be wrong in every other currency. This one
// is seen ONLY by App Review, attached to the product itself, and its whole
// job is to show the reviewer where the purchase lives and what it costs. So
// here the price and the Buy button are the point.
//
// Apple requires the review screenshot to show the in-app purchase inside the
// app, at least 640x920. 1290x2796 (iPhone 6.9", 430x932 @3x) clears that and
// matches the listing set. English only: the review notes are in English and
// a single screenshot is attached per product, not per locale.
//
// The web build has no store, so the Purchases screen would render its
// "available in the mobile app" fallback. window.__STACKD_PRO_STUB__ (the same
// stub tests/e2e/pro_paywall.spec.js uses) stands in for StoreKit and supplies
// the base-storefront price, which is exactly what the reviewer will see.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BASE = process.env.STACKD_URL || 'http://localhost:3000';
const OUT = path.resolve(__dirname, 'out', 'iap-review');
const THEME = process.env.STACKD_SHOT_THEME === 'light' ? 'light' : 'dark';
const BG = THEME === 'dark' ? '#0b0f19' : '#f4f7f9';

(async () => {
  const sharp = require('sharp');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    colorScheme: THEME,
    reducedMotion: 'reduce'
  });
  // Installed before any app script runs, so Pro sees a store from boot.
  await ctx.addInitScript(() => {
    window.__STACKD_PRO_STUB__ = {
      price: '€4.99',
      async purchase() { return { active: true }; },
      async restore() { return null; }
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(BASE + '/');
  await page.evaluate((theme) => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', '[]');
    localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
    localStorage.setItem('stackd_v1_language', JSON.stringify('en'));
    localStorage.setItem('stackd_v1_theme', JSON.stringify(theme));
  }, THEME);
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store && !!window.Router && !!window.Pro);

  await page.evaluate(() => window.Router.navigate('#purchases'));
  await page.waitForFunction(() => window.Store.getState().activeView === 'purchases');
  await page.waitForTimeout(900);
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });

  // Refuse to write a screenshot that would mislead the reviewer: it must be
  // the purchasable state, with a price and a Buy button, not the web
  // fallback and not an already-owned state.
  const facts = await page.evaluate(() => {
    const txt = (document.getElementById('router-view') || document.body).innerText;
    return {
      hasPrice: txt.includes('4.99'),
      fallback: /available in the mobile app/i.test(txt),
      owned: !!(window.Store.getState().pro && window.Store.getState().pro.active)
    };
  });
  if (!facts.hasPrice || facts.fallback || facts.owned) {
    throw new Error('Purchases screen is not in the purchasable state: ' + JSON.stringify(facts));
  }

  const file = path.join(OUT, 'stackd_pro-en.png');
  const buf = await page.screenshot();
  await sharp(buf).flatten({ background: BG }).png({ compressionLevel: 9 }).toFile(file);
  await browser.close();

  const meta = await sharp(file).metadata();
  console.log(`${file}\n${meta.width}x${meta.height}, alpha: ${meta.hasAlpha}`);
  if (errors.length) { console.error('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
