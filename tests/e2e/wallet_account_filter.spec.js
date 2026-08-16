import { test, expect } from '@playwright/test';

// v0.94 (docs/refactor-plan-2.md P2.1): tapping a wallet tile opens History
// with that account as the ONLY active filter. The ?account= deep-link used to
// MERGE into whatever filters were lying around, silently filtered Analytics
// too, and fired two dead dispatches on the way.
test.describe('Wallet tile → History account filter', () => {
  const bootstrap = async (page) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.Views);

    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'BPI', openingBalance: 1000, openingDate: '2024-01-01' });
      S.dispatch('ADD_ACCOUNT', { name: 'TR', openingBalance: 500, openingDate: '2024-01-01' });
      const [a, b] = S.getState().accounts.map(x => x.id);
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date();
      const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      S.dispatch('ADD_TRANSACTION', { accountId: a, categoryId: 'cat_groceries', type: 'expense', amount: 11, date: `${ym}-03` });
      S.dispatch('ADD_TRANSACTION', { accountId: b, categoryId: 'cat_dining', type: 'expense', amount: 22, date: `${ym}-04` });
    });
  };

  test('tap filters History to that account only, resets stray filters, leaves Analytics alone', async ({ page }) => {
    await bootstrap(page);

    // Simulate a previous session's leftovers on BOTH pages.
    await page.evaluate(() => {
      window.Store.dispatch('UPDATE_FILTERS', {
        page: 'history',
        filters: { tags: ['gym'], types: ['income'], period: { type: 'year', value: '2024-01-01', start: '', end: '' } }
      });
      window.Store.dispatch('UPDATE_FILTERS', { page: 'analytics', filters: { accounts: [] } });
    });

    await page.evaluate(() => window.Router.navigate('#dashboard'));
    await page.waitForSelector('.wallet-card[data-id]');
    const trId = await page.evaluate(() => window.Store.getState().accounts.find(a => a.name === 'TR').id);

    await page.locator(`.wallet-card[data-id="${trId}"]`).click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');

    const state = await page.evaluate(() => ({
      history: window.Store.getState().historyFilters,
      analyticsAccounts: window.Store.getState().analyticsFilters.accounts
    }));
    // The account is the ONLY filter: everything else back to defaults.
    expect(state.history.accounts).toEqual([trId]);
    expect(state.history.tags).toEqual([]);
    expect(state.history.types).toEqual([]);
    expect(state.history.categories).toEqual([]);
    expect(state.history.period.type).toBe('month');
    // Analytics is untouched by the wallet deep-link.
    expect(state.analyticsAccounts).toEqual([]);

    // Only TR rows are listed, and the tap-to-clear chip names the account.
    await expect(page.locator('.list-item[data-id]')).toHaveCount(1);
    const chip = page.locator('#history-account-filter-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('TR');

    // Clearing the chip restores the unfiltered list.
    await chip.click();
    await page.waitForFunction(() => window.Store.getState().historyFilters.accounts.length === 0);
    await expect(page.locator('.list-item[data-id]')).toHaveCount(2);
  });

  test('the three-dots trigger still opens Edit Account, not History', async ({ page }) => {
    await bootstrap(page);
    await page.evaluate(() => window.Router.navigate('#dashboard'));
    await page.waitForSelector('.wallet-card[data-id]');
    await page.locator('.wallet-card .account-edit-trigger').first().click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'edit-account');
    expect(await page.evaluate(() => window.Store.getState().historyFilters.accounts)).toEqual([]);
  });
});
