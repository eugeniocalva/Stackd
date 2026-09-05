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

const SEED = () => {
  const S = window.Store; const st = () => S.getState();
  const pad = n => String(n).padStart(2, '0');
  const today = new Date(); const y = today.getFullYear(), m = today.getMonth();
  const dOf = (mo, day) => { const d = new Date(y, m + mo, day, 12); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  S.dispatch('ADD_ACCOUNT', { name: 'Main Bank', type: 'Bank', icon: 'landmark', openingBalance: 4200, openingDate: dOf(-6, 1) });
  S.dispatch('ADD_ACCOUNT', { name: 'Revolut', type: 'Debit card', icon: 'credit-card', openingBalance: 860, openingDate: dOf(-6, 1) });
  S.dispatch('ADD_ACCOUNT', { name: 'Cash', type: 'Cash', icon: 'wallet', openingBalance: 120, openingDate: dOf(-6, 1) });
  S.dispatch('ADD_ACCOUNT', { name: 'Savings', type: 'Savings', icon: 'piggy-bank', openingBalance: 9500, openingDate: dOf(-6, 1) });
  const byName = n => st().accounts.find(a => a.name === n).id;
  const bank = byName('Main Bank'), rev = byName('Revolut'), cash = byName('Cash'), sav = byName('Savings');
  const first = dOf(0, 1);
  [['cat_groceries', 320], ['cat_dining', 150], ['cat_shopping', 120], ['cat_transport', 60], ['cat_entertainment', 40], ['cat_health', 80]].forEach(([categoryId, amount]) =>
    S.dispatch('SAVE_BUDGET', { categoryId, amount, startDate: first, endDate: null, isCumulative: false }));
  const add = (accountId, categoryId, type, amount, date, comment) => S.dispatch('ADD_TRANSACTION', { accountId, categoryId, type, amount, date, comment });
  for (let mo = -5; mo <= 0; mo++) {
    add(bank, 'cat_salary', 'income', 3250, dOf(mo, 1), 'Salary');
    add(bank, 'cat_rent', 'expense', 1150, dOf(mo, 3), 'Rent');
    if (mo < 0) {
      add(bank, 'cat_groceries', 'expense', 96.4, dOf(mo, 5), 'Esselunga');
      add(rev, 'cat_groceries', 'expense', 54.2, dOf(mo, 12), 'Carrefour');
      add(rev, 'cat_dining', 'expense', 38.5, dOf(mo, 9), 'Trattoria');
      add(rev, 'cat_transport', 'expense', 39, dOf(mo, 2), 'Monthly pass');
      add(rev, 'cat_entertainment', 'expense', 15.99, dOf(mo, 7), 'Streaming');
      add(rev, 'cat_shopping', 'expense', 72, dOf(mo, 18), 'Clothes');
      add(cash, 'cat_dining', 'expense', 12.5, dOf(mo, 20), 'Coffee');
      add(bank, 'cat_health', 'expense', 45, dOf(mo, 22), 'Pharmacy');
      add(bank, 'cat_freelance', 'income', 600, dOf(mo, 15), 'Invoice #' + (40 + mo));
      S.dispatch('ADD_TRANSFER', { fromAccountId: bank, toAccountId: sav, amount: 400, date: dOf(mo, 2), comment: 'Monthly saving' });
    }
  }
  const lim = Math.min(today.getDate(), 27);
  const cur = [['cat_groceries', 'expense', rev, 42.3, 4, 'Esselunga'], ['cat_transport', 'expense', rev, 39, 2, 'Monthly pass'], ['cat_dining', 'expense', cash, 9.8, 3, 'Coffee'], ['cat_entertainment', 'expense', rev, 15.99, 5, 'Streaming'], ['cat_groceries', 'expense', bank, 88.15, 6, 'Weekly shop'], ['cat_dining', 'expense', rev, 46, 8, 'Dinner out'], ['cat_shopping', 'expense', rev, 59.9, 10, 'Sneakers'], ['cat_health', 'expense', bank, 22, 12, 'Pharmacy'], ['cat_freelance', 'income', bank, 600, 15, 'Invoice #41']];
  cur.forEach(([c, t, a, amt, day, cm]) => { if (day <= lim) add(a, c, t, amt, dOf(0, day), cm); });
  S.dispatch('ADD_TRANSFER', { fromAccountId: bank, toAccountId: sav, amount: 400, date: dOf(0, Math.min(2, lim)), comment: 'Monthly saving' });
  // A second widget so the widgets area shows more than one card.
  try { S.dispatch('ADD_HOME_WIDGET', { type: 'categories', size: 'large', config: {} }); } catch (e) { /* optional */ }
  try { S.dispatch('ADD_HOME_WIDGET', { type: 'incomeExpense', size: 'small', config: {} }); } catch (e) { /* optional */ }
  try { S.dispatch('ADD_HOME_WIDGET', { type: 'savings', size: 'small', config: {} }); } catch (e) { /* optional */ }
  return { accounts: st().accounts.length, tx: st().transactions.length, widgets: st().homeWidgets.length };
};

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
