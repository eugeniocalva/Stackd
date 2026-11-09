import { test, expect } from '@playwright/test';

// 1.2.2 (HG-15 WG-2, docs/phone-widgets-plan.md §6): a phone widget's tap
// arrives as stackd://open?to=…; on a phone it comes through Capacitor's
// appUrlOpen, here the same handler is called directly.
test.describe('Phone widget links', () => {
  const boot = async (page) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.evaluate(() => {
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2020-01-01' });
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 50, openingDate: '2020-01-01' });
    });
  };

  test('Quick add opens New log on Income, then on Transfer', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => window.StackdWidgets.openUrl('stackd://open?to=add&type=income'))).toBe(true);
    await expect(page.locator('#toggle-income')).toHaveClass(/btn-income/);
    await page.evaluate(() => window.StackdWidgets.openUrl('stackd://open?to=add&type=transfer'));
    await expect(page.locator('#toggle-transfer')).toHaveClass(/btn-primary/);
    await page.goBack();
    await expect(page.locator('#toggle-income')).toHaveClass(/btn-income/);
  });

  test('Upcoming opens History on that day', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const id = window.Store.getState().accounts[0].id;
      window.Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 12, accountId: id, categoryId: 'cat_dining', date: '2026-10-07', notes: 'that day' });
      window.Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 9, accountId: id, categoryId: 'cat_dining', date: '2026-10-08', notes: 'next day' });
      window.StackdWidgets.openUrl('stackd://open?to=history&day=2026-10-07');
    });
    await expect(page).toHaveURL(/#transactions$/);
    await expect(page.locator('#router-view')).toContainText('-$12.00');
    await expect(page.locator('#router-view')).not.toContainText('-$9.00');
  });
});
