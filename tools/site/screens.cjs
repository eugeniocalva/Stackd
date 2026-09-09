// Captures real Stack'd screens from the running dev server into the marketing
// site's img/ folder, as WebP, seeded with example data.
//
//   npm run dev          # in this repo, must be serving :3000
//   node tools/site/screens.cjs
//
// Re-run after a visible UI change so the site's phone shots stay honest.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const OUT_DIR = path.resolve(__dirname, '../../../StackdSite/img');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SEED = require('../seed.cjs');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.goto('http://localhost:3000/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('stackd_v1_setup_done', '1'); localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR')); localStorage.setItem('stackd_v1_theme', JSON.stringify('dark')); });
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store && !!window.Widgets);
  console.log('seed', await page.evaluate(SEED));
  await page.waitForTimeout(800);

  const shot = async (name) => {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT_DIR}/${name}.png` });
    console.log('saved', name);
  };
  const go = async (hash) => { await page.evaluate(h => window.Router.navigate(h), hash); await page.waitForTimeout(900); };
  const debt = async (name) => {
    await go('#debt-sim');
    await page.fill('#dsim-principal', '18000');
    await page.fill('#dsim-duration', '5');
    await page.fill('#dsim-rate', '4.05');
    await page.click('#btn-dsim-calculate');
    await page.waitForFunction(() => window.Store.getState().activeView === 'debt-results');
    await shot(name);
  };

  for (const theme of ['dark', 'light']) {
    await page.evaluate(t => window.Store.dispatch('SET_THEME', t), theme);
    await go('#dashboard'); await shot(`home-${theme}`);
    await go('#analytics'); await shot(`analytics-${theme}`);
    await go('#transactions'); await page.waitForTimeout(1200); await page.evaluate(() => { document.scrollingElement.scrollTop = 0; document.querySelectorAll('*').forEach(el => { if (el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== 'visible') el.scrollTop = 0; }); }); await page.waitForTimeout(1200); await shot(`history-${theme}`);
    await go('#budget'); await shot(`goals-${theme}`);
    await debt(`debt-${theme}`);
  }
  await browser.close();

  // PNG → WebP for the site; keep PNGs out of the repo.
  const sharp = require('sharp');
  for (const f of fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.png') && f !== 'icon.png')) {
    const src = `${OUT_DIR}/${f}`;
    await sharp(src).webp({ quality: 84 }).toFile(src.replace(/\.png$/, '.webp'));
    fs.unlinkSync(src);
  }
  console.log('webp done', fs.readdirSync(OUT_DIR).join(' '));
})().catch(e => { console.error(e); process.exit(1); });
