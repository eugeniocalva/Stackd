import { test, expect } from '@playwright/test';

// 1.0.2 (BUG-36): an explicit selection that mixes currencies sums only the
// base-currency accounts (with the "excluded" caption) and formats in the
// selection's currency — instead of adding € and $ 1:1 into a € total.
// Written blind in the U8 worktree; run at integration.
test.describe('Mixed-currency totals', () => {
  const CAPTION = '1 account in another currency is excluded from these totals.';

  const bootstrap = async (page) => {
    await page.clock.install({ time: new Date(2026, 9, 4, 12, 0, 0) });
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
    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 2000, openingDate: '2026-09-01' });
      S.dispatch('ADD_ACCOUNT', { name: 'US Checking', openingBalance: 1000, openingDate: '2026-09-01', currency: 'USD' });
      const id = (n) => S.getState().accounts.find(a => a.name === n).id;
      S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 50, accountId: id('Main'), categoryId: 'cat_groceries', date: '2026-10-02' });
      S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 40, accountId: id('US Checking'), categoryId: 'cat_groceries', date: '2026-10-02' });
    });
  };

  const accId = (page, name) => page.evaluate((n) => window.Store.getState().accounts.find(a => a.name === n).id, name);

  test('Home: Select All + Save View keeps the € total and explains it', async ({ page }) => {
    await bootstrap(page);
    await page.evaluate(() => window.Router.navigate('#dashboard'));
    await page.waitForSelector('#chart-card-container');
    await page.locator('#chart-card-container').click();
    await page.waitForSelector('#expanded-graph-modal');
    await page.locator('#egm-filter').click();
    await page.locator('#egm-toggle-all-accounts').click();
    await page.locator('#egm-save-filters').click();
    await expect(page.locator('#expanded-graph-modal')).toContainText('€1,950.00');
    await expect(page.locator('#expanded-graph-modal')).toContainText(CAPTION);
    await page.locator('#egm-close').click();
    await expect(page.locator('#expanded-graph-modal')).toHaveCount(0);

    const header = page.locator('.header-title').first();
    await expect(header).toHaveText('€1,950.00');
    await expect(page.locator('#router-view')).toContainText(CAPTION);
  });

  test('History filtered to Main + US Checking sums only the € account', async ({ page }) => {
    await bootstrap(page);
    const main = await accId(page, 'Main');
    const us = await accId(page, 'US Checking');
    await page.evaluate(([a, b]) => {
      window.Store.dispatch('UPDATE_FILTERS', {
        page: 'history',
        filters: { accounts: [a, b], types: [], categories: [], tags: [], period: { type: 'month', value: '2026-10-04', start: '', end: '' } }
      });
      window.Router.navigate('#transactions');
    }, [main, us]);
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    const view = page.locator('#router-view');
    await expect(view).toContainText('€2,000.00');
    await expect(view).toContainText('€1,950.00');
    await expect(view).toContainText('sum: -€50.00');
    await expect(view).toContainText(CAPTION);
    // both rows stay listed, each in its own currency
    await expect(page.locator('.list-item[data-id]')).toHaveCount(2);
    await expect(page.locator('.list-item-value').filter({ hasText: '$40.00' })).toHaveCount(1);
  });

  test('the US Checking tile opens History in $', async ({ page }) => {
    await bootstrap(page);
    const us = await accId(page, 'US Checking');
    await page.evaluate(() => window.Router.navigate('#dashboard'));
    await page.waitForSelector(`.wallet-card[data-id="${us}"]`);
    await page.locator(`.wallet-card[data-id="${us}"]`).click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    const view = page.locator('#router-view');
    await expect(view).toContainText('$1,000.00');
    await expect(view).toContainText('$960.00');
    await expect(view).not.toContainText('€1,000.00');
  });
});
