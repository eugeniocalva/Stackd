// User-journey screenshots (docs/user-journey-plan.md, UJ): one picture per
// step of docs/user-journey/inventory.md §B, driven through the running app.
//
//   npm run dev                       # this repo, serving :3000
//   node tools/journey/capture.cjs            # every persona
//   node tools/journey/capture.cjs --only nora   # nora | marco | lea
//
// Output: docs/user-journey/img/<shot>.webp (390×844 @2x, English, light,
// invented data) and docs/user-journey/img/manifest.json (shot → size, step).
// The page (build.cjs) inlines them. Deterministic: Chart.js animation off,
// reduced motion, the shared seed (tools/seed.cjs). A step that cannot be
// reached logs a warning and the run goes on — the manifest says what is
// missing.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const sharp = require('sharp');
const SEED = require('../seed.cjs');

const BASE = process.env.STACKD_URL || 'http://localhost:3000';
const OUT = path.resolve(__dirname, '../../docs/user-journey/img');
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : null; };
const only = arg('only');

const manifest = {};
const warnings = [];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light',
    reducedMotion: 'reduce', hasTouch: true, isMobile: true, acceptDownloads: true
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => warnings.push('pageerror: ' + e.message));
  const settle = (ms = 700) => page.waitForTimeout(ms);
  const go = async (hash, ms) => { await page.evaluate(h => window.Router.navigate(h), hash); await settle(ms || 900); };
  const S = (fn, ...args) => page.evaluate(fn, ...args);

  const shot = async (name, step, opts = {}) => {
    try {
      await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
      await settle(opts.settle || 600);
      const buf = await page.screenshot({ fullPage: false });
      const file = path.join(OUT, `${name}.webp`);
      await sharp(buf).webp({ quality: 86 }).toFile(file);
      manifest[name] = { step, w: 390, h: 844 };
      console.log('  shot', name);
    } catch (e) { warnings.push(`${name}: ${e.message}`); console.warn('  MISSED', name, e.message); }
  };
  // every step starts with no sheet or menu left over from the one before
  const closeSheets = async () => {
    await page.evaluate(() => {
      try { if (window.Components && window.Components.Modal && window.Components.Modal.hide) window.Components.Modal.hide(); } catch (e) { /* none */ }
      document.querySelectorAll('#modal-container > *, #active-list-picker, #active-freq-picker, #period-sheet, #tag-picker-sheet, #recurring-update-modal').forEach(el => el.remove());
      const f = document.getElementById('nav-fab-toggle');
      if (f && f.getAttribute('aria-expanded') === 'true') f.click();
    }).catch(() => {});
    await settle(250);
  };
  const tryStep = async (label, fn, opts = {}) => {
    if (!opts.keepSheets) await closeSheets(); // N1 photographs the Welcome sheet itself
    try { await fn(); } catch (e) {
      const lines = String(e.message).split('\n');
      const loc = lines.find(l => /waiting for locator/.test(l)) || '';
      const m = lines[0] + (loc ? ' ' + loc.trim() : '');
      warnings.push(`${label}: ${m}`); console.warn('  FAILED', label, m);
    }
  };
  const noAnim = () => page.evaluate(() => {
    if (window.Chart && window.Chart.defaults) {
      window.Chart.defaults.animation = false;
      window.Chart.defaults.animations = {};
      if (window.Chart.defaults.transitions) window.Chart.defaults.transitions.active = { animation: { duration: 0 } };
    }
  });
  const freshBoot = async ({ setupDone, widgets, pro }) => {
    if (pro) {
      await page.addInitScript(() => {
        window.__STACKD_PRO_STUB__ = { price: '€4.99', purchases: 0, async purchase() { this.purchases += 1; return { active: true }; }, async restore() { return null; } };
      });
    }
    await page.goto(BASE + '/');
    await page.evaluate(({ setupDone, widgets }) => {
      localStorage.clear();
      if (setupDone) localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
      localStorage.setItem('stackd_v1_language', JSON.stringify('en'));
      localStorage.setItem('stackd_v1_theme', JSON.stringify('light'));
      if (widgets !== undefined) localStorage.setItem('stackd_v1_homeWidgets', JSON.stringify(widgets));
    }, { setupDone, widgets });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.Widgets && !!window.Router);
    await page.waitForSelector('#splash-screen', { state: 'detached' }).catch(() => {});
    await noAnim();
    if (pro) await S(() => window.Store.dispatch('SET_PRO', { active: true, productId: 'stackd_pro', platform: 'stub' }));
    await settle(600);
  };
  const menuOpen = () => page.evaluate(() => { const f = document.getElementById('nav-fab-toggle'); return !!f && f.getAttribute('aria-expanded') === 'true'; });
  const closeMenu = async () => { if (await menuOpen()) { await page.mouse.click(195, 300); await settle(400); } if (await menuOpen()) { await page.evaluate(() => document.getElementById('nav-fab-toggle').click()); await settle(400); } };
  const openMenu = async () => { await closeMenu(); await page.click('#nav-fab-toggle'); await settle(500); };
  const menuGo = async (href) => { await openMenu(); await page.click(`#nav-action-menu a[href="${href}"]`); await settle(900); };
  const addAccount = async ({ name, type, cents, date }) => {
    await go('#edit-account');
    await page.fill('#edit-acc-name', name);
    if (type) await page.selectOption('#edit-acc-type', type).catch(() => {});
    if (cents) await page.fill('#edit-acc-balance', cents);
    if (date) await page.fill('#edit-acc-date', date).catch(() => {});
    await page.click('#btn-edit-acc-save');
    await settle(900);
  };
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = new Date();

  // ───────────────────────── Nora — first-time user ─────────────────────────
  if (!only || only === 'nora') {
    console.log('nora');
    await freshBoot({ setupDone: false });
    await tryStep('N1', async () => {
      await page.waitForSelector('#setup-row-currency', { timeout: 8000 });
      // pick EUR / English through the sheet's own rows when they are pickers
      await shot('n01-welcome', 'N1');
      await page.click('#modal-save-btn');
      await settle(700);
    }, { keepSheets: true });
    await tryStep('N2', async () => {
      await go('#dashboard');
      await shot('n02-home-empty', 'N2');
    });
    await tryStep('N3', async () => {
      await openMenu();
      await shot('n03-menu', 'N3');
      await closeMenu();
    });
    await tryStep('N4', async () => {
      await menuGo('#edit-account');
      await page.fill('#edit-acc-name', 'Main Bank');
      await page.selectOption('#edit-acc-type', 'Bank').catch(() => {});
      await page.fill('#edit-acc-balance', '120000');
      await shot('n04-new-account', 'N4');
      await page.click('#btn-edit-acc-save');
      await settle(900);
    });
    await tryStep('N5', async () => { await go('#dashboard'); await shot('n05-home-first-wallet', 'N5'); });
    await tryStep('N6', async () => {
      await menuGo('#add');
      await page.click('#toggle-expense');
      await page.fill('#tx-amount', '12.50');
      await page.selectOption('#tx-category', { label: 'Groceries' });
      await page.fill('#tx-comment', 'Weekly shop');
      await shot('n06-new-log', 'N6');
      await page.click('#btn-save-tx');
      await settle(900);
    });
    await tryStep('N7', async () => { await go('#transactions', 1200); await shot('n07-history-first', 'N7'); });
    await tryStep('N8', async () => {
      await page.click('#history-list .swipe-content:has-text("Groceries")');
      await settle(900);
      await page.fill('#tx-comment', 'Weekly shop · Esselunga');
      await shot('n08-edit-log', 'N8');
      await page.click('#btn-save-tx');
      await settle(900);
    });
    await tryStep('N9', async () => { await go('#dashboard'); await shot('n09-home-after-first-log', 'N9'); });
    await tryStep('N10', async () => {
      await go('#budget');
      await page.click('.budget-cat-row:has-text("Groceries")');
      await settle(700);
      await page.fill('#bdg-amount', '300');
      await shot('n10-goals-editor', 'N10');
      await page.click('#btn-bdg-save');
      await settle(900);
      await shot('n11-goals-set', 'N10');
    });
    await tryStep('N11', async () => {
      await addAccount({ name: 'Cash', type: 'Cash', cents: '8000' });
      await go('#dashboard');
      await shot('n12-home-two-wallets', 'N11');
    });
    await tryStep('N12', async () => {
      await page.click('#btn-dashboard-add-wallet');
      await settle(900);
      await shot('n13-pro-lock', 'N12');
    });
    await tryStep('N13', async () => {
      await go('#purchases');
      await shot('n14-purchases', 'N13');
    });
    await tryStep('N14', async () => { await go('#insights'); await shot('n15-insights-starter', 'N14'); });
    await tryStep('N15', async () => { await go('#settings'); await shot('n16-settings', 'N15'); });
  }

  // ───────────────────────── Marco — daily logger ──────────────────────────
  const seedMarco = async () => {
    await freshBoot({ setupDone: true, pro: true });
    await S(SEED, null);
    // two rows the shared seed lacks and the journey needs: a Dining Out
    // dinner that puts that budget over its limit (M12), and a payment later
    // this month so Analytics has an upcoming row (M13)
    await S(() => {
      const St = window.Store; const st = St.getState();
      const rev = st.accounts.find(a => a.name === 'Revolut'); const bank = st.accounts.find(a => a.name === 'Main Bank');
      const t = new Date(); const pad = n => String(n).padStart(2, '0');
      const ymdOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      if (rev) St.dispatch('ADD_TRANSACTION', { accountId: rev.id, categoryId: 'cat_dining', type: 'expense', amount: 100, date: ymdOf(t), comment: 'Birthday dinner' });
      const later = new Date(t.getFullYear(), t.getMonth() + 1, 0); // the month's last day
      if (bank && later.getDate() > t.getDate()) St.dispatch('ADD_TRANSACTION', { accountId: bank.id, categoryId: 'cat_transport', type: 'expense', amount: 120, date: ymdOf(later), comment: 'Car insurance' });
    });
    await settle(800);
  };
  if (!only || only === 'marco') {
    console.log('marco');
    await seedMarco();
    await tryStep('M1', async () => { await go('#dashboard'); await shot('m01-home', 'M1'); });
    await tryStep('M2', async () => {
      const pager = page.locator('#home-pager');
      const box = await pager.boundingBox();
      if (box) { await pager.evaluate(el => { el.scrollLeft = el.clientWidth; }); await settle(700); }
      await shot('m02-home-monthly-net', 'M2');
      await pager.evaluate(el => { el.scrollLeft = 0; }).catch(() => {});
    });
    await tryStep('M3', async () => {
      const rev = await S(() => (window.Store.getState().accounts.find(a => a.name === 'Revolut') || {}).id);
      await page.click(`.wallet-card[data-id="${rev}"]`);
      await settle(1200);
      await S(() => { document.getElementById('router-view').scrollTop = 0; });
      await shot('m03-history-account', 'M3');
      await page.click('.period-chip[data-filter-kind="accounts"]').catch(() => {});
      await settle(600);
    });
    await tryStep('M5', async () => {
      await menuGo('#add');
      await page.click('#toggle-expense');
      await page.fill('#tx-amount', '46.00');
      await page.selectOption('#tx-account', { label: 'Revolut' });
      await page.selectOption('#tx-category', { label: 'Dining Out' });
      await page.click('#tx-tags-container');
      await settle(600);
      await page.fill('#tps-search', 'friends');
      await settle(200);
      await page.click('#tps-add');
      await settle(300);
      await shot('m04-tag-picker', 'M5');
      await page.click('#tps-apply');
      await settle(500);
      await shot('m05-new-log-tagged', 'M5');
      await page.click('#btn-save-tx');
      await settle(900);
    });
    await tryStep('M6', async () => {
      await menuGo('#add');
      await page.click('#toggle-transfer');
      await page.fill('#tx-amount', '200.00');
      await page.selectOption('#tx-account', { label: 'Main Bank' });
      await page.selectOption('#tx-transfer-to', { label: 'Savings' });
      await shot('m06-transfer', 'M6');
      await page.click('#btn-save-tx');
      await settle(900);
    });
    await tryStep('M7', async () => {
      await menuGo('#add');
      await page.click('#toggle-expense');
      await page.fill('#tx-amount', '9.99');
      await page.selectOption('#tx-account', { label: 'Revolut' });
      await page.selectOption('#tx-category', { label: 'Entertainment' });
      await page.fill('#tx-comment', 'Streaming');
      await page.click('label.toggle-switch:has(#tx-is-recurrent)');
      await settle(500);
      await page.click('#tx-recurrent-text').catch(() => {});
      await settle(500);
      if (await page.locator('#active-freq-picker').count()) {
        await shot('m07-repeats-every', 'M7');
        await page.click('#fp-confirm');
        await settle(400);
      }
      const end = new Date(today); end.setMonth(end.getMonth() + 6);
      await page.fill('#tx-recurrence-end-date', ymd(end)).catch(() => {});
      await shot('m08-new-log-recurring', 'M7');
      await page.click('#btn-save-tx');
      await settle(1000);
    });
    await tryStep('M8', async () => {
      await go('#transactions', 1200);
      await S(() => { document.getElementById('router-view').scrollTop = 0; });
      await settle(300);
      // open the first row's actions as a swipe would (DOM state only)
      await S(() => {
        const box = document.querySelector('#history-list .swipe-container');
        const content = box && box.querySelector('.swipe-content');
        if (!box || !content) return;
        box.classList.add('is-open');
        box.dataset.offset = '-110';
        content.style.transition = 'none';
        content.style.transform = 'translateX(-110px)';
      });
      await shot('m09-swipe-left', 'M8');
      await S(() => { const b = document.querySelector('#history-list .swipe-container.is-open'); if (b) { b.classList.remove('is-open'); const c = b.querySelector('.swipe-content'); c.style.transform = ''; } });
    });
    await tryStep('M9', async () => {
      const ids = await S(() => Array.from(document.querySelectorAll('#history-list .swipe-content[data-id]')).slice(0, 2).map(e => e.dataset.id));
      await S((ids) => { const St = window.Store; St.dispatch('TOGGLE_SELECTION_MODE', { active: true }); ids.forEach(id => St.dispatch('TOGGLE_TRANSACTION_SELECTION', { id })); }, ids);
      await settle(700);
      await shot('m10-selection', 'M9');
      await page.click('#btn-bulk-delete-header');
      await settle(600);
      await shot('m11-delete-confirm', 'M9');
      await page.click('#modal-cancel-btn').catch(() => page.keyboard.press('Escape'));
      await settle(300);
      await S(() => window.Store.dispatch('TOGGLE_SELECTION_MODE', { active: false }));
      await settle(400);
    });
    await tryStep('M10', async () => {
      const id = await S(() => { const t = window.Store.getState().transactions.find(x => x.recurrence && x.comment === 'Streaming' && x.date > window.Store._todayYMD()); return t && t.id; });
      if (!id) throw new Error('no future Streaming member');
      await go(`#edit?id=${id}`);
      await page.fill('#tx-amount', '10.99');
      await page.click('#btn-save-tx');
      await settle(700);
      await shot('m12-recurring-scope', 'M10');
      await page.click('#ru-cancel').catch(() => page.keyboard.press('Escape'));
      await settle(300);
    });
    await tryStep('M11', async () => {
      await go('#transactions', 1000);
      await page.click('#period-prev-history');
      await settle(900);
      await shot('m13-period-prev', 'M11');
      await page.click('#btn-filter-history');
      await settle(600);
      await shot('m14-filter-sheet', 'M11');
      await page.click('#active-modal .multi-select-chip[data-cat]:has-text("Groceries"), #active-modal [data-cat]:has-text("Groceries")').catch(() => {});
      await page.click('#afm-apply');
      await settle(900);
      await shot('m15-history-filtered', 'M11');
      await page.click('#period-now-history').catch(() => {});
      await settle(500);
    });
    await tryStep('M12', async () => { await go('#budget'); await shot('m16-goals', 'M12'); });
    await tryStep('M13', async () => {
      await go('#analytics', 1200);
      await shot('m17-analytics', 'M13');
      await page.click('#balance-mode-toggle [data-mode="end"]').catch(() => {});
      await settle(700);
      await shot('m18-analytics-eom', 'M13');
    });
    await tryStep('M15', async () => { await go('#insights', 1000); await shot('m19-insights', 'M15'); });
    await tryStep('M16', async () => {
      await go('#dashboard');
      await S(() => { const b = document.getElementById('btn-widgets-add'); b.scrollIntoView({ block: 'center' }); b.click(); });
      await settle(800);
      await shot('m20-add-widget', 'M16');
      await page.click('#active-modal [data-widget-type="accountBalances"]').catch(() => {});
      await settle(800);
      await page.click('#awm-confirm').catch(() => {});
      await settle(800);
      await S(() => window.Store.dispatch('SET_WIDGET_EDIT_MODE', true)).catch(() => {});
      await S(() => { const b = document.getElementById('btn-widgets-edit'); if (b) { b.scrollIntoView({ block: 'center' }); b.click(); } });
      await settle(700);
      await S(() => { const w = document.querySelector('.widget-card'); if (w) w.scrollIntoView({ block: 'center' }); });
      await settle(400);
      await shot('m21-widget-edit-mode', 'M16');
      await go('#dashboard');
    });
  }

  // ───────────────────────── Lea — power user ───────────────────────────────
  if (!only || only === 'lea') {
    console.log('lea');
    await seedMarco();
    const csv = ['Data;Descrizione;Importo', '03/11/2026;ESSELUNGA MILANO;-54,30', '04/11/2026;BONIFICO STIPENDIO;1.850,00', '05/11/2026;FARMACIA CENTRALE;-18,90', '06/11/2026;ESSELUNGA MILANO;-23,15'].join('\n');
    await tryStep('L1', async () => {
      await go('#settings');
      await page.click('#btn-open-import-export');
      await settle(600);
      await shot('l01-import-export-sheet', 'L1');
      await page.click('#ie-sheet-import');
      await settle(900);
    });
    await tryStep('L2', async () => {
      if (!(await page.locator('#import-text').count())) await go('#import');
      await page.fill('#import-text', csv);
      await settle(300);
      await shot('l02-import', 'L2');
      await page.click('#btn-import-check');
      await settle(1200);
    });
    await tryStep('L3', async () => {
      await page.waitForSelector('#imap-account', { timeout: 6000 });
      await shot('l03-map-columns', 'L3');
      await page.click('#btn-imap-continue');
      await settle(1200);
    });
    await tryStep('L4', async () => {
      await page.waitForSelector('#iprev-list', { timeout: 6000 });
      await shot('l04-review-import', 'L4');
      await page.click('#btn-iprev-confirm');
      await settle(1200);
      await shot('l05-import-complete', 'L4');
      await page.click('#import-success-view').catch(() => {});
      await settle(800);
    });
    await tryStep('L5', async () => {
      await go('#import');
      await page.fill('#import-text', csv);
      await page.click('#btn-import-check');
      await settle(1200);
      await page.click('#btn-imap-continue').catch(() => {});
      await settle(1200);
      await shot('l06-import-duplicates', 'L5');
      await go('#settings');
    });
    await tryStep('L6', async () => {
      await page.click('#btn-import-rules');
      await settle(700);
      await shot('l07-import-rules', 'L6');
      await page.click('#modal-cancel-btn, #modal-save-btn, .modal-btn-close').catch(() => page.keyboard.press('Escape'));
      await settle(300);
    });
    await tryStep('L7', async () => {
      await go('#export', 1200);
      await shot('l08-export', 'L7');
      await page.click('#export-settings').catch(() => page.click('text=Export settings').catch(() => {}));
      await settle(700);
      await shot('l09-export-settings', 'L7');
      await page.click('#modal-cancel-btn, .modal-btn-close, #exs-cancel').catch(() => page.keyboard.press('Escape'));
      await settle(300);
    });
    await tryStep('L8', async () => {
      await go('#backup', 1000);
      await shot('l10-backup', 'L8');
      const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
      await page.click('#btn-backup-now');
      await dl;
      await settle(1200);
      await shot('l11-backup-saved', 'L8');
      await page.click('#modal-save-btn, #modal-cancel-btn').catch(() => page.keyboard.press('Escape'));
      await settle(300);
    });
    await tryStep('L9', async () => { await go('#debt', 900); await shot('l12-loans-hub', 'L9'); });
    await tryStep('L10', async () => {
      await page.click('#debt-hub [data-type="mortgage"]');
      await settle(900);
      await page.fill('#dsim-principal', '180000');
      await page.fill('#dsim-down', '30000').catch(() => {});
      await page.fill('#dsim-duration', '25');
      await page.fill('#dsim-rate', '3.2');
      const first = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      await page.fill('#dsim-first-date', ymd(first)).catch(() => {});
      await shot('l13-loan-simulator', 'L10');
      await page.click('#dsim-details-toggle');
      await settle(600);
      await S(() => { const d = document.getElementById('dsim-details-body'); if (d) d.scrollIntoView({ block: 'start' }); });
      await settle(300);
      await shot('l14-loan-details', 'L10');
      await page.click('#dsim-details-toggle');
    });
    await tryStep('L11', async () => {
      await page.click('#btn-dsim-calculate');
      await page.waitForFunction(() => window.Store.getState().activeView === 'debt-results', null, { timeout: 8000 });
      await settle(900);
      await shot('l15-loan-results', 'L11');
      await page.click('#dres-schedule-toggle').catch(() => {});
      await page.click('#dres-schedule-mode [data-mode="detailed"]').catch(() => {});
      await settle(600);
      await S(() => { const d = document.getElementById('dres-schedule-body'); if (d) d.scrollIntoView({ block: 'start' }); });
      await settle(300);
      await shot('l16-loan-schedule', 'L11');
      await S(() => { document.getElementById('router-view').scrollTop = 0; });
    });
    await tryStep('L12', async () => {
      await page.click('#btn-dres-promote');
      await page.waitForSelector('#loan-name-input', { timeout: 6000 });
      await page.fill('#loan-name-input', 'Home');
      await page.click('#modal-save-btn');
      // promoting lands on the hub and the "Track this payment?" sheet opens over it
      await page.waitForSelector('#debt-hub', { timeout: 6000 });
      await settle(900);
      await shot('l17-track-payment', 'L12');
      await page.click('#modal-save-btn'); // Add recurring expense → the prefilled New Log
      await settle(900);
      if (await page.locator('#btn-save-tx').count()) { await page.click('#btn-save-tx'); await settle(1000); }
      await go('#debt', 900);
      await page.click('#debt-hub [data-id]');
      await settle(1000);
      await S(() => { document.getElementById('router-view').scrollTop = 0; });
      await shot('l18-loan-tracked', 'L12');
    });
    await tryStep('L13', async () => {
      await page.click('#btn-dres-menu');
      await settle(400);
      await page.click('.dres-menu-opt[data-act="edit"]');
      await page.waitForSelector('#debt-sim-form', { timeout: 6000 });
      await page.fill('#dsim-rate', '2.9');
      await page.click('#btn-dsim-calculate');
      await page.waitForSelector('#debt-results-view', { timeout: 6000 });
      await settle(600);
      await page.click('#btn-dres-save'); // Save Changes on an edited active loan → Update linked payments?
      await page.waitForSelector('#modal-container #modal-title', { timeout: 6000 }).catch(() => {});
      await settle(500);
      if (await page.locator('#modal-container #modal-title').count()) await shot('l19-sync-payments', 'L13');
      await page.click('#modal-cancel-btn').catch(() => page.keyboard.press('Escape'));
      await settle(300);
    });
    await tryStep('L14', async () => {
      await go('#dashboard');
      const card = page.locator('.wallet-card').last();
      const b = await card.boundingBox();
      const cdp = await ctx.newCDPSession(page);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      await touch('touchStart', b.x + b.width / 2, b.y + b.height / 2);
      await settle(650);
      for (let i = 1; i <= 6; i++) { await touch('touchMove', b.x + b.width / 2 - i * 14, b.y + b.height / 2 + 1); await settle(16); }
      await settle(200);
      await shot('l20-tile-drag', 'L14');
      await touch('touchEnd');
      await settle(500);
    });
    await tryStep('L15', async () => {
      await go('#settings');
      await page.click('#btn-manage-accounts');
      await settle(600);
      await shot('l21-accounts-sheet', 'L15');
      await page.click('#modal-save-btn');
      await settle(300);
    });
    await tryStep('L16', async () => {
      await S(() => { const el = document.getElementById('nav-order-list'); if (el) el.scrollIntoView({ block: 'center' }); });
      await settle(400);
      await shot('l22-tab-bar', 'L16');
    });
    await tryStep('L17', async () => {
      await S(() => window.Store.dispatch('SET_PRIVACY', { hide: true }));
      await go('#dashboard');
      await shot('l23-home-hidden', 'L17');
      await page.click('#privacy-pill');
      await settle(600);
      await shot('l24-hidden-sheet', 'L17');
      await page.click('#modal-container button:has-text("Show")').catch(() => {});
      await settle(300);
      await S(() => window.Store.dispatch('SET_PRIVACY', { hide: false }));
    });
    await tryStep('L18', async () => {
      await go('#settings');
      await S(() => window.Store.dispatch('SET_LANGUAGE', 'it'));
      await settle(800);
      await S(() => { document.getElementById('router-view').scrollTop = 0; });
      await shot('l25-settings-italian', 'L18');
      await S(() => window.Store.dispatch('SET_LANGUAGE', 'en'));
      await settle(600);
    });
    await tryStep('L19', async () => {
      await page.click('#btn-open-currency');
      await settle(600);
      await page.click('.currency-opt[data-code="USD"]');
      await page.click('#modal-save-btn'); // Done → Switch to USD?
      await settle(700);
      await shot('l26-currency-switch', 'L19');
      await page.click('#modal-cancel-btn').catch(() => page.keyboard.press('Escape'));
      await settle(300);
      await page.click('#modal-cancel-btn, .modal-btn-close').catch(() => {});
      await settle(300);
    });
    await tryStep('L20', async () => {
      await go('#analytics', 1000);
      await page.click('#period-label-analytics');
      await settle(600);
      await page.click('#period-sheet .period-custom-row');
      await settle(600);
      await shot('l27-period-sheet-custom', 'L20');
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      await page.click(`#period-sheet [data-day="${y}-${m}-02"]`).catch(() => {});
      await page.click(`#period-sheet [data-day="${y}-${m}-07"]`).catch(() => {});
      await settle(300);
      await settle(1000);
      await shot('l28-analytics-custom', 'L20');
    });
    await tryStep('L21', async () => {
      await go('#categories', 900);
      await shot('l29-categories', 'L21');
      await go('#edit-category', 900);
      await page.fill('#edit-cat-name', 'Subscriptions');
      await shot('l30-new-category', 'L21');
      await page.click('#btn-save-category').catch(() => {});
      await settle(900);
      const cid = await S(() => (window.Store.getState().categories.find(c => c.name === 'Subscriptions') || {}).id);
      if (cid) { await go(`#category-detail?id=${cid}`, 900); await shot('l31-category-detail', 'L21'); }
    });
    await tryStep('L22', async () => { await go('#tags', 900); await shot('l32-tags', 'L22'); });
    await tryStep('L23', async () => {
      const cash = await S(() => (window.Store.getState().accounts.find(a => a.name === 'Cash') || {}).id);
      await go(`#edit-account?id=${cash}`, 900);
      await page.fill('#edit-acc-date', ymd(new Date(today.getFullYear(), today.getMonth(), 1)));
      await page.click('#btn-edit-acc-save');
      await settle(800);
      if (await page.locator('#opening-date-primary').count()) await shot('l33-opening-date-sheet', 'L23');
      await page.click('#opening-date-cancel').catch(() => {});
      await settle(400);
    });
    await tryStep('L24', async () => {
      const cash = await S(() => (window.Store.getState().accounts.find(a => a.name === 'Cash') || {}).id);
      await go(`#edit-account?id=${cash}`, 900);
      await page.click('#btn-edit-acc-delete');
      await settle(600);
      await shot('l34-delete-account', 'L24');
      await page.click('#modal-cancel-btn').catch(() => page.keyboard.press('Escape'));
      await settle(300);
    });
    await tryStep('L25', async () => {
      await go('#settings');
      await S(() => { const b = document.getElementById('btn-factory-reset'); if (b) b.scrollIntoView({ block: 'center' }); });
      await page.click('#btn-factory-reset');
      await settle(600);
      await shot('l35-factory-reset', 'L25');
      await page.click('#modal-delete-btn, #active-modal button:has-text("Reset")').catch(() => {});
      await settle(1500);
      await shot('l36-welcome-again', 'L25');
    });
  }

  const mf = path.join(OUT, 'manifest.json');
  let prev = { shots: {}, warnings: {} };
  try { prev = JSON.parse(fs.readFileSync(mf, 'utf8')); if (Array.isArray(prev.warnings)) prev.warnings = {}; } catch (e) { /* first run */ }
  const scope = only || 'all';
  const shots = Object.assign({}, prev.shots || {}, manifest);
  const warns = Object.assign({}, prev.warnings || {}, { [scope]: warnings });
  fs.writeFileSync(mf, JSON.stringify({ generated: new Date().toISOString(), shots, warnings: warns }, null, 2));
  console.log(`\n${Object.keys(manifest).length} shots; ${warnings.length} warnings`);
  warnings.forEach(w => console.log('  !', w));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
