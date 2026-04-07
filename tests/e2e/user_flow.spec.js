import { test, expect } from '@playwright/test';

test.describe('Stackd User Flow', () => {
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

  test('should complete the requested full user flow', async ({ page }) => {
    // 1. Create Account 1 (Main Bank)
    await page.click('#btn-create-account');
    await page.fill('#new-account-name', 'Main Bank');
    await page.fill('#new-account-balance', '1000');
    await page.click('#modal-save-btn');
    
    // Verify account 1 exists
    await expect(page.locator('.account-row >> text=Main Bank')).toBeVisible();
    await expect(page.locator('.account-row >> text=$1,000.00')).toBeVisible();

    // 2. Create Account 2 (Savings)
    await page.click('#btn-create-account');
    await page.fill('#new-account-name', 'Savings');
    await page.fill('#new-account-balance', '500');
    await page.click('#modal-save-btn');

    // Verify account 2 exists
    await expect(page.locator('.account-row >> text=Savings')).toBeVisible();
    await expect(page.locator('.account-row >> text=$500.00')).toBeVisible();

    // Verify Total Balance ($1500)
    await expect(page.locator('.header-title >> text=$1,500.00')).toBeVisible();

    // 3. Register Income in Main Bank
    await page.click('a[data-view="add"]');
    await page.click('#toggle-income');
    await page.fill('#tx-amount', '200');
    await page.selectOption('#tx-account', { label: 'Main Bank' });
    await page.selectOption('#tx-category', { label: '💰 Salary' });
    await page.click('#btn-save-tx');

    // 4. Register Expense in Main Bank
    await page.click('a[data-view="add"]');
    await page.click('#toggle-expense');
    await page.fill('#tx-amount', '50');
    await page.selectOption('#tx-account', { label: 'Main Bank' });
    await page.selectOption('#tx-category', { label: '🛒 Groceries' });
    await page.click('#btn-save-tx');

    // 5. Register Income in Savings
    await page.click('a[data-view="add"]');
    await page.click('#toggle-income');
    await page.fill('#tx-amount', '100');
    await page.selectOption('#tx-account', { label: 'Savings' });
    await page.selectOption('#tx-category', { label: '💻 Freelance' });
    await page.click('#btn-save-tx');

    // 6. Register Expense in Savings
    await page.click('a[data-view="add"]');
    await page.click('#toggle-expense');
    await page.fill('#tx-amount', '30');
    await page.selectOption('#tx-account', { label: 'Savings' });
    await page.selectOption('#tx-category', { label: '🎬 Entertainment' });
    await page.click('#btn-save-tx');

    // 7. Verify New Balances
    // Main Bank: 1000 + 200 - 50 = 1150
    // Savings: 500 + 100 - 30 = 570
    // Total: 1720
    await page.goto('#dashboard'); // Ensure we are on dashboard
    await expect(page.locator('.header-title >> text=$1,720.00')).toBeVisible();
    await expect(page.locator('.account-row >> text=Main Bank >> .. >> text=$1,150.00')).toBeVisible();
    await expect(page.locator('.account-row >> text=Savings >> .. >> text=$570.00')).toBeVisible();

    // 8. Create a Budget for Groceries
    await page.click('a[data-view="budget"]');
    await page.click('.budget-cat-row >> text=Groceries');
    await page.fill('#bdg-amount', '300');
    await page.click('#btn-bdg-save');

    // Verify budget is set
    await expect(page.locator('.budget-cat-row:has-text("Groceries") >> text=$300.00')).toBeVisible();
    // Spent should be $50.00
    await expect(page.locator('.budget-cat-row:has-text("Groceries") >> text=$50.00 of $300.00')).toBeVisible();
  });
});
