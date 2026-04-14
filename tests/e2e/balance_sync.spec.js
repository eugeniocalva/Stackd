import { test, expect } from '@playwright/test';

test.describe('Bidirectional Balance Sync Engine', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      window.location.reload();
    });
    // Wait for the app to initialize
    await page.waitForSelector('#bottom-nav');
  });

  test('should synchronize opening and current balance correctly', async ({ page }) => {
    // 1 & 2 Setup Data Programmatically
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

    // 3. Navigate to Edit Account
    await page.goto(`/#edit-account?id=${accountId}`);

    // Wait for inputs to be visible
    await page.waitForSelector('#edit-acc-balance');
    await page.waitForSelector('#edit-acc-current-balance');

    // 4. Verify initial values
    await expect(page.locator('#edit-acc-balance')).toHaveValue(/100(\.00)?/);
    await expect(page.locator('#edit-acc-current-balance')).toHaveValue(/80(\.00)?/);

    // 5. Scenario A: Edit Opening Balance -> Update Current Balance
    // Changing Opening Balance to 200. Current Balance should become 200 - 20 = 180.
    await page.fill('#edit-acc-balance', ''); 
    await page.type('#edit-acc-balance', '200');
    // Using type fires keyboard events properly
    
    await expect(page.locator('#edit-acc-current-balance')).toHaveValue(/180(\.00)?/);

    // 6. Scenario B: Edit Current Balance -> Update Opening Balance
    // Changing Current Balance to 500. Opening Balance should become 500 - (-20) = 520.
    
    // Warning should be hidden initially
    await expect(page.locator('#current-balance-warning')).toBeHidden();

    await page.fill('#edit-acc-current-balance', ''); 
    await page.type('#edit-acc-current-balance', '500');

    // Warning should now be visible
    await expect(page.locator('#current-balance-warning')).toBeVisible();

    await expect(page.locator('#edit-acc-balance')).toHaveValue(/520(\.00)?/);

    // 7. Save changes
    await page.click('#btn-edit-acc-save');
    await page.waitForTimeout(300); // Give JS time to persist

    // 8. Verify the updated opening balance is reflected in the Store
    const finalOb = await page.evaluate((id) => {
      const obTx = window.Store.getState().transactions.find(t => t.accountId === id && t.type === 'opening_balance');
      return obTx ? obTx.amount : 0;
    }, accountId);
    
    // According to math: 520
    expect(finalOb).toBe(520);
  });
});
