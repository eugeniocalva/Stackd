import { test, expect } from '@playwright/test';

// 1.0.2 (BUG-24): account, category and tag names typed in the app or carried
// by an imported CSV are text, never markup. Each payload carries an inline
// handler that bumps window.__xss; it must stay undefined on every screen.
// tests/unit/markupSafety.test.js and escapeGuard.test.js pin every sink in
// jsdom; this proves the real browser, the real render loop and a reload.
// Written blind (port 3000 is shared during the fix round): run at integration.
const XSS = 'x" onerror="window.__xss=(window.__xss||0)+1"';
const PAYLOAD = `Bob's "Big" <img src=x onerror="window.__xss=(window.__xss||0)+1"> ${XSS}`;

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

const freshInstall = async (page, { pro = false } = {}) => {
  await page.goto('/');
  await page.evaluate((isPro) => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', '[]');
    localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
    // Pro.isActive reads state.pro: the stub alone does not activate it
    // (seeded as pro_paywall.spec.js does).
    if (isPro) localStorage.setItem('stackd_v1_pro', JSON.stringify({ active: true, productId: 'stackd_pro', platform: 'play', purchasedAt: '2026-09-01T00:00:00.000Z' }));
  }, pro);
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store);
};

const noXss = async (page) => {
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
};

const visit = async (page, hash) => {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await page.waitForTimeout(250);
  await noXss(page);
};

test.describe('Markup safety (1.0.2 BUG-24)', () => {
  test('a wallet typed with markup in its name renders as text (free plan, before any import)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    await freshInstall(page);
    await page.click('#btn-dashboard-add-wallet');
    await page.waitForSelector('#edit-acc-name');
    await page.fill('#edit-acc-name', PAYLOAD);
    await page.fill('#edit-acc-balance', '1200.00');
    await page.click('#btn-edit-acc-save');
    const card = page.locator('.wallet-card .wallet-card-name').first();
    await expect(card).toHaveText(PAYLOAD);
    await noXss(page);
    for (const h of ['#transactions', '#add', '#settings', '#dashboard']) await visit(page, h);
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await expect(page.locator('.wallet-card .wallet-card-name').first()).toHaveText(PAYLOAD);
    await noXss(page);
    expect(errors).toEqual([]);
  });

  test('accounts and transactions CSVs with markup in every text cell render as text everywhere', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    await freshInstall(page);
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#settings"]');
    await page.waitForSelector('#btn-import-csv');

    const accounts = 'id,name,opening_balance,created_at,currency,type,icon,color,opening_date\n'
      + ['acc 1', PAYLOAD, '300', '2026-09-01T00:00:00.000Z', 'EUR', PAYLOAD, XSS, XSS, '2026-09-01'].map(csvCell).join(',') + '\n';
    const transactions = 'Date,Type,Amount,Account,Category,Note,Tags,SeriesId,Frequency,Interval,EndDate,AccountId,Id\n'
      + ['2026-10-01', 'expense', '12.50', PAYLOAD, PAYLOAD, PAYLOAD, 'trip|' + XSS, XSS, 'months', '1', '2026-12-01', 'acc 1', XSS].map(csvCell).join(',') + '\n';
    for (const [name, text] of [['accounts.csv', accounts], ['transactions.csv', transactions]]) {
      await page.setInputFiles('#import-csv-file', { name, mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8') });
      const sheet = page.locator('#import-result-modal');
      await expect(sheet).toBeVisible();
      await page.click('#import-result-modal-ok');
      await expect(sheet).toHaveCount(0);
      await noXss(page);
    }

    // stored ids, colours and icons are safe; names are kept verbatim
    const st = await page.evaluate(() => {
      const s = window.Store.getState();
      return {
        ids: s.accounts.map(a => a.id).concat(s.transactions.map(t => t.id), s.transactions.filter(t => t.recurrence).map(t => t.recurrence.seriesId)),
        colors: s.accounts.map(a => a.color),
        palette: window.Store.ACCOUNT_COLORS,
        icons: s.accounts.map(a => a.icon).concat(s.categories.map(c => c.icon)),
        names: s.accounts.map(a => a.name)
      };
    });
    st.ids.forEach(id => expect(id).toMatch(/^[A-Za-z0-9_.:-]{1,64}$/));
    st.colors.forEach(c => expect(st.palette).toContain(c));
    st.icons.forEach(i => expect(i).not.toMatch(/[\s<>"'&=]/));
    expect(st.names).toContain(PAYLOAD);

    for (const h of ['#dashboard', '#transactions', '#categories', '#budget', '#analytics', '#tags']) await visit(page, h);
    // Edit Log of the imported row, and its category picker
    const txId = await page.evaluate(() => window.Store.getState().transactions.find(t => t.type === 'expense').id);
    await visit(page, `#edit?id=${txId}`);
    // 1.0.2 (live-U1-N2): the picker opens from #tx-category itself; the old
    // locator matched nothing and the step was silently skipped.
    await page.click('#tx-category');
    const csm = page.locator('#category-selection-modal');
    await expect(csm).toBeVisible();
    await expect(csm.locator('#csm-category-list')).toContainText(PAYLOAD);
    await noXss(page);
    await page.click('#csm-close');
    await expect(csm).toHaveCount(0);
    // Settings → Manage accounts
    await visit(page, '#settings');
    await page.click('#btn-manage-accounts');
    await page.waitForTimeout(300);
    await noXss(page);

    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await noXss(page);
    await visit(page, '#dashboard'); // the reload lands on #settings, the last screen visited
    await expect(page.locator('.wallet-card .wallet-card-name', { hasText: 'Big' }).first()).toHaveText(PAYLOAD);
    expect(errors).toEqual([]);
  });

  test('Pro: a category added with "+ Add custom" renders as text', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    await freshInstall(page, { pro: true });
    await page.evaluate(() => window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' }));
    await visit(page, '#add');
    await page.click('#btn-add-category');
    await page.waitForSelector('#new-cat-name');
    await page.fill('#new-cat-name', PAYLOAD);
    await page.click('#modal-save-btn');
    await page.waitForTimeout(300);
    await noXss(page);
    expect(await page.evaluate((p) => window.Store.getState().categories.some(c => c.name === p), PAYLOAD)).toBe(true);
    for (const h of ['#categories', '#budget', '#add', '#dashboard']) await visit(page, h);
    expect(errors).toEqual([]);
  });
});
