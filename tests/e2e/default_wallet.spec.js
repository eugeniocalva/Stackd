import { test, expect } from '@playwright/test';

// 1.0.2 (BUG-39): a new log starts on the Default Wallet, not on the first
// account by name, and the amount's currency prefix follows it.
test.describe('New log preselects the Default Wallet (1.0.2 BUG-39)', () => {
  test('the default (second by name) is preselected with its currency', async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 9, 1, 12, 0, 0) });
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
      S.dispatch('ADD_ACCOUNT', { name: 'Zeta Bank', openingBalance: 100, openingDate: '2026-01-01' });
      S.dispatch('ADD_ACCOUNT', { name: 'Amex', openingBalance: 100, openingDate: '2026-01-01', currency: 'USD' });
      const zeta = S.getState().accounts.find(a => a.name === 'Zeta Bank').id;
      S.dispatch('SET_DEFAULT_ACCOUNT', zeta);
      return { zeta, def: S.getState().defaultAccountId };
    });
    expect(ids.def).toBe(ids.zeta);

    await page.evaluate(() => window.Router.navigate('#add'));
    await page.waitForSelector('#btn-save-tx');
    await expect(page.locator('#tx-account')).toHaveValue(ids.zeta);
    await expect(page.locator('#currency-symbol')).toHaveText('€');

    // Save without touching the account: the expense lands on the default.
    await page.fill('#tx-amount', '18.20');
    await page.selectOption('#tx-category', { label: 'Groceries' });
    await page.click('#btn-save-tx');
    await expect(page).toHaveURL(/#transactions$/);
    const saved = await page.evaluate(() =>
      window.Store.getState().transactions.find(t => t.type === 'expense').accountId);
    expect(saved).toBe(ids.zeta);
  });
});
