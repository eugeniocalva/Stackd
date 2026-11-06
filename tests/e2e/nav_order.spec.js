import { test, expect } from '@playwright/test';

// 1.2.2 (HG-7 P2, docs/smart-insights-plan.md §3.5): Settings → Tab bar.
// Reordering without dragging (WCAG 2.5.7): keyboard only, focus stays on
// the moved row, a polite live region says where it went (4.1.3), the bar
// updates live, the order survives a reload and the app still opens on Home.
test.describe('Tab bar order', () => {
  const bootstrap = async (page) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store);
    await page.waitForSelector('#splash-screen', { state: 'detached' });
  };

  const tabs = (page) => page.locator('#bottom-nav .nav-pill a.nav-item').evaluateAll(els => els.map(e => e.dataset.view));

  test('keyboard only: move Smart Insights up twice, focus stays, the bar follows and the order survives a reload', async ({ page }) => {
    await bootstrap(page);
    await page.evaluate(() => { location.hash = '#settings'; });
    await page.waitForSelector('#nav-order-list');

    const up = page.locator('button[data-nav-move="up"][data-nav-view="insights"]');
    await up.focus();
    await page.keyboard.press('Enter');
    await expect(up).toBeFocused();
    await expect(page.locator('#sr-announcer')).toHaveText('Smart Insights is now in position 4 of 5.');
    await page.keyboard.press('Enter');
    await expect(up).toBeFocused();
    await expect(page.locator('#sr-announcer')).toHaveText('Smart Insights is now in position 3 of 5.');
    expect(await tabs(page)).toEqual(['dashboard', 'transactions', 'insights', 'budget', 'analytics']);
    await expect(page.locator('#sr-announcer')).toHaveAttribute('aria-live', 'polite');

    await page.reload();
    await page.waitForSelector('#bottom-nav .nav-item');
    await page.waitForSelector('#splash-screen', { state: 'detached' });
    expect(await tabs(page)).toEqual(['dashboard', 'transactions', 'insights', 'budget', 'analytics']);
    // Home is still the start screen
    await page.goto('/');
    await page.waitForSelector('#splash-screen', { state: 'detached' });
    await page.waitForFunction(() => window.Store.getState().activeView === 'dashboard');
  });

  test('every button is 44 × 44, the ends are disabled, and Restore puts the default back', async ({ page }) => {
    await bootstrap(page);
    await page.evaluate(() => { location.hash = '#settings'; });
    await page.waitForSelector('#nav-order-list');
    const sizes = await page.locator('.nav-order-btn').evaluateAll(els => els.map(e => {
      const r = e.getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height)];
    }));
    expect(sizes).toHaveLength(8);
    sizes.forEach(([w, h]) => { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); });
    await expect(page.locator('button[data-nav-move="up"][data-nav-view="transactions"]')).toBeDisabled();
    await expect(page.locator('button[data-nav-move="down"][data-nav-view="insights"]')).toBeDisabled();

    await page.locator('button[data-nav-move="down"][data-nav-view="transactions"]').click();
    expect(await tabs(page)).toEqual(['dashboard', 'budget', 'transactions', 'analytics', 'insights']);
    await page.locator('#btn-nav-order-reset').click();
    await expect(page.locator('#btn-nav-order-reset')).toHaveCount(0);
    expect(await tabs(page)).toEqual(['dashboard', 'transactions', 'budget', 'analytics', 'insights']);
    await expect(page.locator('#sr-announcer')).toHaveText('Default order restored.');
  });

  test('dragging the grip also reorders (optional path)', async ({ page }) => {
    await bootstrap(page);
    await page.evaluate(() => { location.hash = '#settings'; });
    await page.waitForSelector('#nav-order-list');
    const grip = page.locator('li[data-nav-view="insights"] .nav-order-grip');
    await grip.scrollIntoViewIfNeeded();
    const from = await grip.boundingBox();
    const to = await page.locator('li[data-nav-view="transactions"]').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => tabs(page)).toEqual(['dashboard', 'insights', 'transactions', 'budget', 'analytics']);
  });
});
