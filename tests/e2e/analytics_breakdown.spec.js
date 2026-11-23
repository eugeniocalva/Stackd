import { test, expect } from '@playwright/test';

// 1.3.2 (AB-1…AB-8, docs/analytics-breakdown-plan.md): Analytics lists every
// category (no Others), slices that have room carry their share, a row slides
// to Tags / Transactions, tags open under the row with count rings, a tag or
// the list opens a transaction sheet with a Σ total that pulls down to close,
// and a row of the sheet opens the form, which comes back to Analytics.
// Real touch through CDP where the gesture matters (as history_rows.spec).
test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

const CATS = [
  ['cat_rent', 1971.04, ['mortgage', 'power']], ['cat_shopping', 1009.64, ['gifts']], ['cat_health', 548, []],
  ['cat_transport', 460.25, []], ['cat_groceries', 258.38, ['market']], ['cat_dining', 180, []],
  ['cat_utilities', 140, []], ['cat_entertainment', 90, []], ['cat_other', 60, []], ['cat_debt', 9, []]
];

const boot = async (page) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 12, 0, 0) });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', '[]');
    localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
  });
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store && !!window.Views && !!window.Router);
  await page.evaluate((cats) => {
    const S = window.Store;
    S.dispatch('ADD_ACCOUNT', { name: 'Main', type: 'Bank', openingBalance: 9000, openingDate: '2026-01-01' });
    const acc = S.getState().accounts[0].id;
    cats.forEach(([cat, amount, tags]) => {
      const a = Math.round(amount * 60) / 100;
      S.dispatch('ADD_TRANSACTION', { accountId: acc, categoryId: cat, type: 'expense', amount: a, date: '2026-11-05', tags });
      S.dispatch('ADD_TRANSACTION', { accountId: acc, categoryId: cat, type: 'expense', amount: Math.round((amount - a) * 100) / 100, date: '2026-11-12', tags: tags.slice(0, 1) });
    });
    window.Router.navigate('#analytics');
  }, CATS);
  await page.waitForFunction(() => window.Store.getState().activeView === 'analytics');
  await page.waitForSelector('#splash-screen', { state: 'detached' });
  await page.waitForSelector('#analytics-cat-list .cat-swipe');
};

const watch = (page) => {
  const errors = [];
  const dialogs = [];
  page.on('pageerror', err => errors.push(err));
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  return { errors, dialogs };
};

const row = (page, id) => page.locator(`.cat-swipe[data-cat-id="${id}"]`);

const touchDrag = async (page, from, to, steps = 8) => {
  const cdp = await page.context().newCDPSession(page);
  const pt = (x, y) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from.x, from.y) });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * i / steps;
    const y = from.y + (to.y - from.y) * i / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x, y) });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

test.describe('Analytics breakdown (1.3.2)', () => {
  test('every category is listed and on the ring; only wide slices carry a share', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    await expect(page.locator('#analytics-cat-list .cat-swipe')).toHaveCount(CATS.length);
    await expect(page.locator('[data-cat-id="__others__"]')).toHaveCount(0);
    await expect(page.locator('#analytics-ring-box .ring-arc-btn')).toHaveCount(CATS.length);
    await expect(page.locator('#analytics-ring-box .ring-badge')).toHaveCount(0);
    const ring = await page.evaluate(() => {
      const ch = window.Components.CategoryDonutChart._chartInstance;
      const meta = ch.getDatasetMeta(0);
      const CR = window.Components.CategoryRing;
      return {
        n: ch.data.datasets[0].data.length,
        fits: meta.data.map((el, i) => !!CR.labelFit(el, ch.$ringLabels[i], ch.ctx)),
        texts: ch.$ringLabels.map(l => l.text),
        colours: new Set(ch.data.datasets[0].backgroundColor).size,
        width: document.getElementById('analytics-ring-box').getBoundingClientRect().width
      };
    });
    expect(ring.n).toBe(CATS.length);
    expect(ring.colours).toBe(CATS.length); // up to 12: all different
    expect(ring.texts[0]).toBe('42%');
    expect(ring.fits.slice(0, 4)).toEqual([true, true, true, true]); // the big slices have room
    expect(ring.fits[ring.fits.length - 1]).toBe(false); // a 0.2 % slice has none
    expect(ring.width).toBeGreaterThan(260);
    expect(w.errors).toEqual([]);
  });

  test('a tap opens Tags and List; Tags lists the tags under the row with count rings', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    const rent = row(page, 'cat_rent');
    await rent.locator('.cat-swipe-content').evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await expect(rent.locator('.cat-act[data-act="tags"]')).toBeHidden();
    await rent.locator('.cat-swipe-content').tap();
    await page.waitForTimeout(400); // the row slides open
    await expect(rent.locator('.cat-act[data-act="tags"]')).toBeVisible();
    await expect(rent.locator('.cat-act[data-act="list"]')).toBeVisible();
    await rent.locator('.cat-act[data-act="tags"]').tap();
    const panel = page.locator('[data-tag-panel="cat_rent"]');
    await expect(panel.locator('.donut-tag-row')).toHaveCount(2);
    await expect(panel.locator('.donut-tag-row').first().locator('.donut-tag-name')).toHaveText('#mortgage');
    await expect(panel.locator('.donut-tag-row').first().locator('.count-ring-text')).toHaveText('2');
    await expect(panel.locator('.donut-tag-row').first().locator('.donut-tag-pct')).toHaveText('100.0%');
    await expect(panel.locator('.donut-tag-row').nth(1).locator('.count-ring-text')).toHaveText('1');
    // the row closed its actions; a tap on the row closes the tag list
    // (it does not slide the row open again)
    await expect(rent.locator('.cat-act[data-act="tags"]')).toBeHidden();
    await rent.locator('.cat-swipe-content').tap();
    await expect(panel.locator('.donut-tag-row')).toHaveCount(0);
    await expect(rent.locator('.cat-swipe-content')).toHaveAttribute('aria-expanded', 'false');
    expect(w.errors).toEqual([]);
    expect(w.dialogs).toEqual([]);
  });

  test('a sideways swipe opens the row; a scroll closes it', async ({ page }) => {
    await boot(page);
    const shop = row(page, 'cat_shopping');
    await shop.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const b = await shop.locator('.cat-swipe-content').boundingBox();
    await touchDrag(page, { x: b.x + b.width - 30, y: b.y + b.height / 2 }, { x: b.x + b.width - 200, y: b.y + b.height / 2 });
    await expect(shop.locator('.cat-swipe-content')).toHaveAttribute('aria-expanded', 'true');
    await expect(shop.locator('.cat-act[data-act="list"]')).toBeVisible();
    await page.evaluate(() => { document.getElementById('router-view').scrollTop += 60; });
    await expect(shop.locator('.cat-swipe-content')).toHaveAttribute('aria-expanded', 'false');
  });

  test('a tag opens its transactions in a sheet with Σ; pulling it down closes it', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    const rent = row(page, 'cat_rent');
    await rent.locator('.cat-swipe-content').evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await rent.locator('.cat-swipe-content').tap();
    await page.waitForTimeout(400); // the row slides open
    await rent.locator('.cat-act[data-act="tags"]').tap();
    await page.locator('[data-tag-panel="cat_rent"] .donut-tag-row[data-tag-row="power"]').tap();
    const sheet = page.locator('#tx-list-sheet');
    await expect(sheet).toHaveClass(/open/);
    await expect(sheet.locator('.tx-sheet-title')).toHaveText('#power');
    await expect(sheet.locator('.tx-sheet-sub')).toHaveText('Rent · November 2026 · 1 transaction');
    await expect(sheet.locator('.tx-sheet-list .list-item')).toHaveCount(1);
    await expect(sheet.locator('.tx-sheet-total-amount')).toHaveText('€1,182.62');
    const h = await sheet.locator('.tx-sheet-title').boundingBox();
    await touchDrag(page, { x: h.x + 20, y: h.y }, { x: h.x + 20, y: h.y + 260 }, 10);
    await expect(page.locator('#tx-list-sheet')).toHaveCount(0);
    expect(w.errors).toEqual([]);
  });

  test('List opens the whole category; a row opens the form and saving comes back to Analytics', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    const health = row(page, 'cat_health');
    await health.locator('.cat-swipe-content').evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await health.locator('.cat-swipe-content').tap();
    await page.waitForTimeout(400); // the row slides open
    await health.locator('.cat-act[data-act="list"]').tap();
    const sheet = page.locator('#tx-list-sheet');
    await expect(sheet.locator('.tx-sheet-title')).toHaveText('Health');
    await expect(sheet.locator('.tx-sheet-list .list-item')).toHaveCount(2);
    await expect(sheet.locator('.tx-sheet-total-amount')).toHaveText('€548.00');
    await sheet.locator('.tx-sheet-list .list-item').first().tap();
    await page.waitForSelector('#tx-amount');
    expect(page.url()).toContain('from=analytics');
    await page.fill('#tx-amount', '300');
    await page.click('#btn-save-tx');
    await page.waitForFunction(() => window.Store.getState().activeView === 'analytics');
    expect(page.url()).toContain('#analytics');
    await expect(row(page, 'cat_health').locator('.donut-legend-amount')).toHaveText(/€628\.80/);
    expect(w.errors).toEqual([]);
    expect(w.dialogs).toEqual([]);
  });

  test('a slice tap focuses it and marks its row', async ({ page }) => {
    await boot(page);
    await page.locator('#analytics-ring-box .ring-arc-btn[data-arc-id="cat_groceries"]').evaluate(e => e.scrollIntoView({ block: 'center' }));
    const box = await page.locator('#analytics-ring-box').boundingBox();
    const pt = await page.evaluate(() => {
      const D = window.Components.CategoryDonutChart;
      const pass = D._ringPass;
      const i = pass.slices.findIndex(s => s.id === 'cat_groceries');
      return window.Components.CategoryRing.point(pass.ring.geo, pass.ring.geo.arcs[i].mid, (pass.ring.geo.outer + pass.ring.geo.inner) / 2);
    });
    await page.touchscreen.tap(box.x + pt.x, box.y + pt.y);
    await expect(page.locator('#analytics-ring-box .ring-focus-name')).toHaveText('Groceries');
    await expect(page.locator('.donut-legend-group[data-cat-group="cat_groceries"]')).toHaveClass(/is-marked/);
  });
});
