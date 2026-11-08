import { test, expect } from '@playwright/test';

// 1.2.2 (HG-12 P1, docs/account-order-plan.md): Home's account tiles follow
// the user's order. REAL touch input (CDP Input.dispatchTouchEvent runs
// Chromium's gesture pipeline): a 0.45 s hold lifts a tile and a sideways
// drag moves it; a plain tap still opens the account; a quick swipe still
// scrolls the row and moves nothing. No DEFAULT chip.
test.use({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true });

const boot = async (page) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', '[]');
  });
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store && !!window.Views && !!window.Router);
  await page.waitForSelector('#splash-screen', { state: 'detached' });
  await page.evaluate(() => {
    const S = window.Store;
    ['Alpha', 'Bravo', 'Charlie', 'Delta'].forEach((name, i) =>
      S.dispatch('ADD_ACCOUNT', { id: 'acc_' + name.toLowerCase(), name, openingBalance: 100 * (i + 1), openingDate: '2026-01-01' }));
  });
  await page.waitForSelector('.wallet-card[data-id="acc_delta"]');
  await page.waitForTimeout(300);
};

const order = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.wallet-card')).map(c => c.dataset.id));
const saved = (page) => page.evaluate(() => window.Store.orderedAccounts().map(a => a.id));
const box = (page, id) => page.evaluate((i) => {
  const b = document.querySelector(`.wallet-card[data-id="${i}"]`).getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, left: b.left, right: b.right };
}, id);
const touch = (cdp, type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

test.describe('Home account order (1.2.2 HG-12)', () => {
  test('hold a tile, drag it past its neighbour: the order is saved and survives a reload', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e));
    await boot(page);
    expect(await order(page)).toEqual(['acc_alpha', 'acc_bravo', 'acc_charlie', 'acc_delta']);
    await expect(page.locator('.wallet-card-default-badge')).toHaveCount(0);
    await expect(page.locator('.wallet-card.is-default')).toHaveCount(0);

    const cdp = await page.context().newCDPSession(page);
    const a = await box(page, 'acc_alpha');
    await touch(cdp, 'touchStart', a.x, a.y);
    await page.waitForTimeout(600); // past the 0.45 s hold
    await expect(page.locator('.wallet-card[data-id="acc_alpha"]')).toHaveClass(/is-lifted/);
    // drag right by one and a bit tiles
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      await touch(cdp, 'touchMove', a.x + (a.w * 1.25 * i) / steps, a.y + 2);
      await page.waitForTimeout(16);
    }
    await touch(cdp, 'touchEnd');
    await page.waitForTimeout(300);

    expect(await saved(page)).toEqual(['acc_bravo', 'acc_alpha', 'acc_charlie', 'acc_delta']);
    expect(await order(page)).toEqual(['acc_bravo', 'acc_alpha', 'acc_charlie', 'acc_delta']);
    await expect(page.locator('.wallet-card.is-lifted')).toHaveCount(0);
    // the release did not open the account
    expect(await page.evaluate(() => location.hash)).not.toContain('transactions');

    await page.reload();
    await page.waitForSelector('#splash-screen', { state: 'detached' });
    await page.waitForSelector('.wallet-card[data-id="acc_delta"]');
    expect(await order(page)).toEqual(['acc_bravo', 'acc_alpha', 'acc_charlie', 'acc_delta']);
    expect(errors).toEqual([]);
  });

  test('held at the row\'s edge, the row scrolls by itself and the tile travels to the end', async ({ page }) => {
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    const a = await box(page, 'acc_alpha');
    await touch(cdp, 'touchStart', a.x, a.y);
    await page.waitForTimeout(600);
    const edge = 390 - 12;
    for (let i = 1; i <= 12; i++) {
      await touch(cdp, 'touchMove', a.x + ((edge - a.x) * i) / 12, a.y);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(1500); // the edge scroll carries it along
    await touch(cdp, 'touchEnd');
    await page.waitForTimeout(300);
    expect(await saved(page)).toEqual(['acc_bravo', 'acc_charlie', 'acc_delta', 'acc_alpha']);
  });

  test('Settings → Manage accounts: Move down reorders, and Home follows (P2)', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { location.hash = '#settings'; });
    await page.click('#btn-manage-accounts');
    const list = page.locator('#acc-order-list');
    await expect(list.locator('.acc-order-row')).toHaveCount(4);
    await expect(list.locator('.acc-order-row').first()).toContainText('Alpha');
    await expect(list.locator('.acc-order-row').first()).toContainText('Default wallet');
    await list.locator('button[data-acc-move="down"][data-acc-id="acc_alpha"]').click();
    await expect(list.locator('.acc-order-row').nth(1)).toContainText('Alpha');
    expect(await saved(page)).toEqual(['acc_bravo', 'acc_alpha', 'acc_charlie', 'acc_delta']);
    await page.click('#modal-save-btn');
    await page.evaluate(() => { location.hash = '#dashboard'; });
    await page.waitForSelector('.wallet-card[data-id="acc_delta"]');
    expect(await order(page)).toEqual(['acc_bravo', 'acc_alpha', 'acc_charlie', 'acc_delta']);
  });

  test('a plain tap still opens the account', async ({ page }) => {
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    const b = await box(page, 'acc_bravo');
    await touch(cdp, 'touchStart', b.x, b.y);
    await page.waitForTimeout(40);
    await touch(cdp, 'touchEnd');
    await page.waitForFunction(() => location.hash.includes('transactions') && location.hash.includes('acc_bravo'));
  });

  test('a quick swipe scrolls the row and moves nothing', async ({ page }) => {
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    const scroll0 = await page.evaluate(() => document.querySelector('.wallets-scroll-wrapper').scrollLeft);
    const b = await box(page, 'acc_bravo');
    await touch(cdp, 'touchStart', b.x, b.y);
    for (let i = 1; i <= 8; i++) {
      await touch(cdp, 'touchMove', b.x - 25 * i, b.y + 1);
      await page.waitForTimeout(16);
    }
    await touch(cdp, 'touchEnd');
    await page.waitForTimeout(700);
    const scroll1 = await page.evaluate(() => document.querySelector('.wallets-scroll-wrapper').scrollLeft);
    expect(scroll1).toBeGreaterThan(scroll0);
    expect(await saved(page)).toEqual(['acc_alpha', 'acc_bravo', 'acc_charlie', 'acc_delta']);
    await expect(page.locator('.wallet-card.is-lifted')).toHaveCount(0);
    expect(await page.evaluate(() => location.hash)).not.toContain('transactions');
  });
});
