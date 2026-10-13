// Captures real Stack'd screens from the running dev server into the marketing
// site's img/ folder, as WebP, seeded with example data — once per language.
//
//   npm run dev          # in this repo, must be serving :3000
//   node tools/site/screens.cjs              # all five languages
//   node tools/site/screens.cjs --lang it    # one
//
// English goes to ../StackdSite/img/, the others to ../StackdSite/img/<lang>/
// (tools/site/pages.cjs references them there). Only the four shots the site
// shows are taken: home dark + light, history dark, debt dark.
//
// The app translates its own interface; the example data is user data, which
// it never translates, so the account names and notes are localized here and
// handed to the shared seed. After a re-capture, check that the alt text in
// tools/site/strings/<lang>.cjs still matches the figures on screen.
//
// Re-run after a visible UI change so the site's phone shots stay honest.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const sharp = require('sharp');

const SITE_IMG = path.resolve(__dirname, '../../../StackdSite/img');
const BASE = 'http://localhost:3000';
const SEED = require('../seed.cjs');
const LANGS = ['en', 'fr', 'it', 'es', 'pt'];
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : null; };

// Example data per language ('Revolut', 'Esselunga', 'Carrefour', 'Trattoria'
// and 'Streaming' read the same everywhere).
const LOC = {
  en: null,
  fr: {
    accounts: { 'Main Bank': 'Banque principale', Cash: 'Espèces', Savings: 'Épargne' },
    notes: { Salary: 'Salaire', Rent: 'Loyer', 'Monthly pass': 'Pass mensuel', Clothes: 'Vêtements', Coffee: 'Café', Pharmacy: 'Pharmacie', 'Invoice #': 'Facture n° ', 'Monthly saving': 'Épargne du mois', 'Weekly shop': 'Courses de la semaine', 'Dinner out': 'Dîner au restaurant', Sneakers: 'Baskets' }
  },
  it: {
    accounts: { 'Main Bank': 'Banca principale', Cash: 'Contanti', Savings: 'Risparmi' },
    notes: { Salary: 'Stipendio', Rent: 'Affitto', 'Monthly pass': 'Abbonamento mensile', Clothes: 'Vestiti', Coffee: 'Caffè', Pharmacy: 'Farmacia', 'Invoice #': 'Fattura n. ', 'Monthly saving': 'Risparmio mensile', 'Weekly shop': 'Spesa settimanale', 'Dinner out': 'Cena fuori', Sneakers: 'Sneakers' }
  },
  es: {
    accounts: { 'Main Bank': 'Banco principal', Cash: 'Efectivo', Savings: 'Ahorros' },
    notes: { Salary: 'Nómina', Rent: 'Alquiler', 'Monthly pass': 'Abono mensual', Clothes: 'Ropa', Coffee: 'Café', Pharmacy: 'Farmacia', 'Invoice #': 'Factura n.º ', 'Monthly saving': 'Ahorro mensual', 'Weekly shop': 'Compra semanal', 'Dinner out': 'Cena fuera', Sneakers: 'Zapatillas' }
  },
  pt: {
    accounts: { 'Main Bank': 'Banco principal', Cash: 'Dinheiro', Savings: 'Poupança' },
    notes: { Salary: 'Salário', Rent: 'Renda', 'Monthly pass': 'Passe mensal', Clothes: 'Roupa', Coffee: 'Café', Pharmacy: 'Farmácia', 'Invoice #': 'Fatura n.º ', 'Monthly saving': 'Poupança mensal', 'Weekly shop': 'Compras da semana', 'Dinner out': 'Jantar fora', Sneakers: 'Ténis' }
  }
};

(async () => {
  const langs = arg('lang') ? [arg('lang')] : LANGS;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('pageerror', e.message));

  const settle = (ms) => page.waitForTimeout(ms);
  const go = async (hash) => { await page.evaluate(h => window.Router.navigate(h), hash); await settle(900); };

  for (const lang of langs) {
    const dir = lang === 'en' ? SITE_IMG : path.join(SITE_IMG, lang);
    fs.mkdirSync(dir, { recursive: true });

    // A fresh store per language: the seeded names differ.
    await page.goto(BASE + '/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
      localStorage.setItem('stackd_v1_theme', JSON.stringify('dark'));
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.Widgets);
    // Chart.js animates on every mount; a capture mid-animation shows a
    // half-drawn line. Same fix as tools/store/screens.cjs.
    await page.evaluate(() => {
      if (window.Chart && window.Chart.defaults) {
        window.Chart.defaults.animation = false;
        window.Chart.defaults.animations = {};
        if (window.Chart.defaults.transitions) window.Chart.defaults.transitions.active = { animation: { duration: 0 } };
      }
    });
    await page.evaluate(l => window.Store.dispatch('SET_LANGUAGE', l), lang);
    console.log(lang, 'seed', await page.evaluate(SEED, LOC[lang]));
    await settle(800);

    const shot = async (name) => {
      await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
      await settle(1200);
      const buf = await page.screenshot();
      await sharp(buf).webp({ quality: 84 }).toFile(path.join(dir, `${name}.webp`));
      console.log('  saved', path.relative(SITE_IMG, path.join(dir, `${name}.webp`)));
    };

    await go('#dashboard'); await shot('home-dark');

    await go('#transactions');
    // History restores its scroll position; start at the top.
    await settle(1200);
    await page.evaluate(() => {
      document.scrollingElement.scrollTop = 0;
      document.querySelectorAll('*').forEach(el => { if (el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== 'visible') el.scrollTop = 0; });
    });
    await shot('history-dark');

    // The simulator is driven through its real form, so the result screen is
    // what a user sees.
    await go('#debt-sim');
    await page.fill('#dsim-principal', '18000');
    await page.fill('#dsim-duration', '5');
    await page.fill('#dsim-rate', '4.05');
    await page.click('#btn-dsim-calculate');
    await page.waitForFunction(() => window.Store.getState().activeView === 'debt-results');
    await shot('debt-dark');

    await page.evaluate(() => window.Store.dispatch('SET_THEME', 'light'));
    await go('#dashboard'); await shot('home-light');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
