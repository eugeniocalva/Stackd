import { test, expect } from '@playwright/test';

test.describe('Dynamic Account Balance Logic', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      window.location.reload();
    });
    // Wait for the app to initialize
    await page.waitForSelector('#bottom-nav');
  });

  test('should render opening balance and date without manual current balance input field', async ({ page }) => {
    // Setup Data Programmatically
    const accountId = await page.evaluate(() => {
      // Create Account with Opening Balance 100
      window.Store.dispatch('ADD_ACCOUNT', {
        name: 'SyncBank',
        openingBalance: 100,
        openingDate: '2026-04-09'
      });
      const accId = window.Store.getState().accounts[0].id;
      
      // Create Expense Transaction of 20
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense',
        amount: 20,
        accountId: accId,
        categoryId: 'cat_other',
        date: '2026-04-09',
        note: 'Test'
      });

      return accId;
    });

    // Navigate to Edit Account
    await page.goto(`/#edit-account?id=${accountId}`);

    // Wait for opening balance inputs
    await page.waitForSelector('#edit-acc-balance');
    await page.waitForSelector('#edit-acc-date');

    // Verify current balance input and warning are NOT present
    await expect(page.locator('#edit-acc-current-balance')).toHaveCount(0);
    await expect(page.locator('#current-balance-warning')).toHaveCount(0);

    // Verify initial values for opening balance and date
    await expect(page.locator('#edit-acc-balance')).toHaveValue(/100(\.00)?/);
    await expect(page.locator('#edit-acc-date')).toHaveValue('2026-04-09');

    // Verify present balance calculation dynamically via Store
    const computedBalance = await page.evaluate((id) => {
      return window.Store.getAccountBalance(id);
    }, accountId);
    expect(computedBalance).toBe(80);
  });
});
