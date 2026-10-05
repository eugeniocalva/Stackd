import { test, expect } from '@playwright/test';

// 1.0.2 (BUG-25): tapping an opening balance (the 'Adjustment' row) in
// History opens a read-only panel instead of the transaction form, whose
// untouched Update turned a -€450 opening balance into income +€450.
test.describe('Opening balance panel (1.0.2 BUG-25)', () => {
  test('History tap shows the panel; Edit Account keeps the stored sign', async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 9, 15, 12, 0, 0) });
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
      localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.Views);

    const ids = await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Visa Card', openingBalance: -450, openingDate: '2026-10-01' });
      const visa = S.getState().accounts[0].id;
      const ob = S.getState().transactions.find(t => t.accountId === visa && t.type === 'opening_balance');
      return { visa, ob: ob.id };
    });

    await page.evaluate(() => window.Router.navigate('#transactions'));
    await page.locator(`.list-item[data-id="${ids.ob}"]`).click();
    await expect(page.locator('#ob-panel')).toBeVisible();
    await expect(page.locator('#ob-panel')).toContainText('-€450.00');
    await expect(page.locator('#btn-save-tx')).toHaveCount(0);
    await expect(page.locator('#tx-amount')).toHaveCount(0);

    await page.click('#btn-ob-edit-account');
    await expect(page).toHaveURL(new RegExp('#edit-account\\?id=' + ids.visa + '$'));
    await expect(page.locator('#btn-ob-neg')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#edit-acc-balance')).toHaveValue('450.00');

    // The row is still an opening balance of -450.
    const row = await page.evaluate((id) => window.Store.getState().transactions.find(t => t.id === id), ids.ob);
    expect(row.type).toBe('opening_balance');
    expect(row.amount).toBe(-450);
  });
});
