import { test, expect } from '@playwright/test';

// 1.2.2 (HG-4): hidden balances. Settings → Privacy → Hide balances masks
// every amount on Home (and only on Home); the pill opens a sheet whose Done
// keeps them hidden and Show reveals them. With Shake to hide on, a shake on
// Home flips them (devicemotion events stand in for the phone).
test.use({ viewport: { width: 412, height: 860 } });

const boot = async (page) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', JSON.stringify([
      { id: 'w1', type: 'latest', size: 'large', config: {}, createdAt: 1 }
    ]));
  });
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.evaluate(() => {
    const S = window.Store;
    S.dispatch('SET_CURRENCY', 'EUR');
    S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 2500, openingDate: '2026-01-01' });
    const id = S.getState().accounts[0].id;
    S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 42.5, accountId: id, categoryId: 'cat_groceries', date: S._todayYMD() });
  });
  await page.waitForSelector('#splash-screen', { state: 'detached' });
};

const go = async (page, hash, sel) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForSelector(sel, { state: 'attached' });
};

const homeHasFigures = (page) => page.evaluate(() => /€\s?\d/.test(document.getElementById('router-view').innerText));

test('hide from Settings, read the pill, Done keeps, Show reveals', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err));
  await boot(page);
  await expect(page.locator('#dash-total')).toHaveText('€2,457.50');
  await expect(page.locator('#privacy-pill')).toHaveCount(0);

  await go(page, '#settings', '#toggle-hide-balances');
  await page.locator('label.toggle-switch:has(#toggle-hide-balances)').click();
  await expect(page.locator('#toggle-hide-balances')).toBeChecked();

  await go(page, '#dashboard', '#dash-total');
  await expect(page.locator('#dash-total')).toHaveText('€••••');
  await expect(page.locator('#privacy-pill')).toBeVisible();
  expect(await homeHasFigures(page)).toBe(false);

  // History is not Home: its figures stay
  await go(page, '#transactions', '#history-sticky-header');
  await expect.poll(() => page.evaluate(() => /€\s?\d/.test(document.getElementById('router-view').innerText))).toBe(true);

  await go(page, '#dashboard', '#privacy-pill');
  await page.locator('#privacy-pill').click();
  await expect(page.locator('#hidden-balances-sheet')).toBeVisible();
  await page.locator('#hidden-balances-sheet-done').click();
  await expect(page.locator('#hidden-balances-sheet')).toHaveCount(0);
  await expect(page.locator('#dash-total')).toHaveText('€••••');

  await page.locator('#privacy-pill').click();
  await page.locator('#hidden-balances-sheet-show').click();
  await expect(page.locator('#dash-total')).toHaveText('€2,457.50');
  await expect(page.locator('#privacy-pill')).toHaveCount(0);

  // a reload keeps the choice
  await page.evaluate(() => window.Store.dispatch('SET_PRIVACY', { hide: true }));
  await page.reload();
  await page.waitForSelector('#dash-total');
  await expect(page.locator('#dash-total')).toHaveText('€••••');
  expect(errors).toEqual([]);
});

test('with Shake to hide on, a shake on Home flips the balances both ways', async ({ page }) => {
  await boot(page);
  await go(page, '#settings', '#toggle-shake-to-hide');
  await page.locator('label.toggle-switch:has(#toggle-shake-to-hide)').click();
  await expect.poll(() => page.evaluate(() => window.Store.getPrivacy().shake)).toBe(true);
  await go(page, '#dashboard', '#dash-total');

  const shake = () => page.evaluate(async () => {
    for (const x of [20, -20, 20]) {
      const e = new Event('devicemotion');
      e.acceleration = { x, y: 0, z: 0 };
      window.dispatchEvent(e);
      await new Promise(r => setTimeout(r, 150));
    }
  });
  await shake();
  await expect(page.locator('#dash-total')).toHaveText('€••••');
  await expect(page.locator('#privacy-pill')).toBeVisible();
  await page.waitForTimeout(1600); // the cooldown
  await shake();
  await expect(page.locator('#dash-total')).toHaveText('€2,457.50');
});
