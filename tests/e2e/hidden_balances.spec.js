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

// 1.2.2 (HG-13): with motion on, the balls cover the figures before the one
// dispatch, cascading; a reveal shrinks them out and the digits come back as
// plain text. Reduced motion (the suite default above) swaps with a fade.
test('the balls cover the figures, then one dispatch; a reveal brings plain digits back', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await boot(page);
  await go(page, '#dashboard', '#dash-total');
  await page.evaluate(() => {
    window.__privacyDispatches = 0;
    const d = window.Store.dispatch.bind(window.Store);
    window.Store.dispatch = (a, p) => { if (a === 'SET_PRIVACY') window.__privacyDispatches++; return d(a, p); };
  });

  await page.evaluate(() => window.Views.DashboardView.setHidden(true));
  // mid-motion: still shown in the store, four balls over the total's digits
  const mid = await page.evaluate(() => ({
    hide: window.Store.getPrivacy().hide,
    balls: document.querySelectorAll('#dash-total .money-cloak.is-covering .money-ball').length,
    delays: Array.from(document.querySelectorAll('.money-cloak.is-covering')).map(el => el.style.getPropertyValue('--d'))
  }));
  expect(mid.hide).toBe(false);
  expect(mid.balls).toBe(4);
  expect(mid.delays[0]).toBe('0ms');
  expect(new Set(mid.delays).size).toBeGreaterThan(1); // a cascade, not all at once
  // a second request while it runs is ignored
  await page.evaluate(() => window.Views.DashboardView.setHidden(false));

  await expect(page.locator('#dash-total')).toHaveText('€••••');
  await expect(page.locator('.privacy-pill-row.is-entering')).toHaveCount(1);
  expect(await page.evaluate(() => window.__privacyDispatches)).toBe(1);
  await expect(page.locator('#sr-announcer')).toHaveText('Balances hidden');

  await page.evaluate(() => window.Views.DashboardView.setHidden(false));
  await expect(page.locator('#dash-total .money-cloak.is-uncovering')).toHaveCount(1);
  await expect(page.locator('#dash-total')).toHaveText('€2,457.50');
  await expect(page.locator('#privacy-pill')).toHaveCount(0);
  await expect(page.locator('.money-cloak')).toHaveCount(0); // unwrapped once played
  expect(await page.evaluate(() => window.__privacyDispatches)).toBe(2);
});
