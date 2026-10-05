import { test, expect } from '@playwright/test';

// 1.0.2 (BUG-34): at the localStorage quota a save used to fail silently —
// the row showed until the next launch and then vanished, and a new wallet
// could come back without its opening balance. A change that does not fit
// now lands nothing and a "Storage is full" sheet says so.
test.describe('Storage full (1.0.2, BUG-34)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store);
    // a fresh install with one account
    await page.evaluate(() => {
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' });
    });
  });

  // Fill localStorage with an unprefixed filler key to within `room`
  // characters of the quota (binary search on the largest value that fits).
  const fillStorage = (page, room) => page.evaluate((r) => {
    const key = 'zz_e2e_quota_filler';
    localStorage.removeItem(key);
    let lo = 0;
    let hi = 16 * 1024 * 1024;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      try { localStorage.setItem(key, 'x'.repeat(mid)); lo = mid; } catch (e) { hi = mid - 1; }
    }
    localStorage.setItem(key, 'x'.repeat(Math.max(0, lo - r)));
    return lo;
  }, room);

  const relaunch = async (page) => {
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && window.Store.getState().initialized);
  };

  test('an expense that does not fit shows the sheet and is never listed', async ({ page }) => {
    expect(await fillStorage(page, 150)).toBeGreaterThan(100000);

    await page.click('#nav-fab-toggle');
    await page.click('a[href="#add"]');
    await page.waitForSelector('#btn-save-tx');
    await page.click('#toggle-expense');
    await page.fill('#tx-amount', '12');
    await page.selectOption('#tx-account', { label: 'Main' });
    await page.selectOption('#tx-category', { label: 'Groceries' });
    await page.fill('#tx-comment', 'quota-row');
    await page.click('#btn-save-tx');

    const sheet = page.locator('#storage-full-modal');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Storage is full');
    await expect(page).toHaveURL(/#transactions$/);
    await expect(page.locator('#router-view')).not.toContainText('quota-row');
    expect(await page.evaluate(() => (localStorage.getItem('stackd_v1_transactions') || '').includes('quota-row'))).toBe(false);
    await page.click('#storage-full-modal-ok');
    await expect(sheet).toHaveCount(0);

    await relaunch(page);
    await page.goto('/#transactions');
    await page.waitForSelector('#router-view');
    await expect(page.locator('#router-view')).not.toContainText('quota-row');
    expect(await page.evaluate(() => window.Store.getState().transactions.some(t => t.comment === 'quota-row'))).toBe(false);
  });

  test('a new wallet that does not fit shows the sheet and is gone after a relaunch', async ({ page }) => {
    await page.goto('/#dashboard');
    await expect(page.locator('.wallet-card:has-text("Main")')).toBeVisible();
    expect(await fillStorage(page, 150)).toBeGreaterThan(100000);

    await page.click('#btn-dashboard-add-wallet');
    await page.fill('#edit-acc-name', 'Fund 1');
    await page.fill('#edit-acc-balance', '100000'); // the field's cents convention: 1,000.00
    await page.click('#btn-edit-acc-save');

    await expect(page.locator('#storage-full-modal')).toBeVisible();
    await expect(page.locator('#storage-full-modal')).toContainText('Storage is full');
    expect(await page.evaluate(() => window.Store.getState().accounts.some(a => a.name === 'Fund 1'))).toBe(false);
    await expect(page.locator('.wallet-card:has-text("Fund 1")')).toHaveCount(0);

    await relaunch(page);
    await page.goto('/#dashboard');
    await expect(page.locator('.wallet-card:has-text("Main")')).toBeVisible();
    await expect(page.locator('.wallet-card:has-text("Fund 1")')).toHaveCount(0);
    expect(await page.evaluate(() => (localStorage.getItem('stackd_v1_accounts') || '').includes('Fund 1'))).toBe(false);
  });
});
