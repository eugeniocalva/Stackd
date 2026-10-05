import { test, expect } from '@playwright/test';

// 1.0.2 (BUG-50): #tx-amount was <input type="number">. Real Chromium keeps
// only one separator of a typed '1,234.56', so the form saved 1.23456. The
// field is now an inputmode=decimal text input read by Store.parseAmount.
// This is the only test faithful to the reported browser behaviour (jsdom
// sanitises differently), so it types key by key.
test.describe('Typed amounts with a thousands separator (1.0.2 BUG-50)', () => {
  const bootstrap = async (page) => {
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
    await page.evaluate(() => {
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 5000, openingDate: '2026-01-01' });
    });
  };

  test('typing 1,234.56 stores 1234.56 and History shows -€1,234.56', async ({ page }) => {
    await bootstrap(page);
    await page.evaluate(() => window.Router.navigate('#add'));
    await page.waitForSelector('#btn-save-tx');

    await expect(page.locator('#tx-amount')).toHaveAttribute('type', 'text');
    await expect(page.locator('#tx-amount')).toHaveAttribute('inputmode', 'decimal');
    await page.locator('#tx-amount').pressSequentially('1,234.56');
    await expect(page.locator('#tx-amount')).toHaveValue('1,234.56');
    await page.selectOption('#tx-category', { label: 'Groceries' });
    await page.click('#btn-save-tx');
    await expect(page).toHaveURL(/#transactions$/);

    const amounts = await page.evaluate(() =>
      window.Store.getState().transactions.filter(t => t.type === 'expense').map(t => t.amount));
    expect(amounts).toEqual([1234.56]);
    await expect(page.locator('.list-item[data-id]').first()).toContainText('€1,234.56');
  });

  test('an ambiguous 1.234 is refused inline with an example', async ({ page }) => {
    await bootstrap(page);
    await page.evaluate(() => window.Router.navigate('#add'));
    await page.waitForSelector('#btn-save-tx');

    await page.locator('#tx-amount').pressSequentially('1.234');
    await page.selectOption('#tx-category', { label: 'Groceries' });
    await page.click('#btn-save-tx');
    await expect(page.locator('#tx-amount-error')).toHaveText('Enter a valid amount, like 1,234.56.');
    await expect(page.locator('#tx-amount')).toBeFocused();
    const count = await page.evaluate(() =>
      window.Store.getState().transactions.filter(t => t.type === 'expense').length);
    expect(count).toBe(0);
  });

  test('a budget limit typed as 1,500.00 saves 1500', async ({ page }) => {
    await bootstrap(page);
    await page.click('a[data-view="budget"]');
    await page.click('.budget-cat-row >> text=Groceries');
    await page.locator('#bdg-amount').pressSequentially('1,500.00');
    await page.click('#btn-bdg-save');
    await expect(page.locator('.budget-cat-row:has-text("Groceries")')).toContainText('€1,500.00');
    const amount = await page.evaluate(() =>
      window.Store.getState().budgets.find(b => b.categoryId === 'cat_groceries').amount);
    expect(amount).toBe(1500);
  });
});
