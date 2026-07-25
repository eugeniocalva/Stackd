import { test, expect } from '@playwright/test';

test.describe('Stackd User Flow', () => {
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

  test('should complete the requested full user flow', async ({ page }) => {
    // 1. Create Account 1 (Main Bank)
    await page.click('#btn-dashboard-add-wallet');
    await page.fill('#edit-acc-name', 'Main Bank');
    await page.fill('#edit-acc-balance', '1000');
    await page.click('#btn-edit-acc-save');
    
    // Verify account 1 exists on dashboard
    await expect(page.locator('.wallet-card:has-text("Main Bank")')).toBeVisible();
    await expect(page.locator('.wallet-card:has-text("Main Bank") >> text=$1,000.00')).toBeVisible();

    // 2. Create Account 2 (Savings)
    await page.click('#btn-dashboard-add-wallet');
    await page.fill('#edit-acc-name', 'Savings');
    await page.fill('#edit-acc-balance', '500');
    await page.click('#btn-edit-acc-save');

    // Verify account 2 exists on dashboard
    await expect(page.locator('.wallet-card:has-text("Savings")')).toBeVisible();
    await expect(page.locator('.wallet-card:has-text("Savings") >> text=$500.00')).toBeVisible();

    // Verify Total Balance ($1500)
    await expect(page.locator('.header-title >> text=$1,500.00').first()).toBeVisible();

    // Helper to press keypad digits
    const pressAmount = async (digitsString) => {
      for (const char of digitsString) {
        await page.click(`.keypad-btn[data-key="${char}"]`);
      }
    };

    // 3. Register Income in Main Bank
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#add"]');
    await page.click('.log-type-tab[data-type="income"]');
    await pressAmount('20000'); // 200.00
    await page.click('#log-wallet-tile');
    await page.click('.account-opt:has-text("Main Bank")');
    await page.click('#log-category-tile');
    await page.click('.category-opt:has-text("Salary")');
    await page.click('#btn-save-log');
    await expect(page.locator('#tx-log-root')).toBeHidden();

    // 4. Register Expense in Main Bank
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#add"]');
    // Expense is default, no need to click type tab
    await pressAmount('5000'); // 50.00
    await page.click('#log-wallet-tile');
    await page.click('.account-opt:has-text("Main Bank")');
    await page.click('#log-category-tile');
    await page.click('.category-opt:has-text("Groceries")');
    await page.click('#btn-save-log');
    await expect(page.locator('#tx-log-root')).toBeHidden();

    // 5. Register Income in Savings
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#add"]');
    await page.click('.log-type-tab[data-type="income"]');
    await pressAmount('10000'); // 100.00
    await page.click('#log-wallet-tile');
    await page.click('.account-opt:has-text("Savings")');
    await page.click('#log-category-tile');
    await page.click('.category-opt:has-text("Freelance")');
    await page.click('#btn-save-log');
    await expect(page.locator('#tx-log-root')).toBeHidden();

    // 6. Register Expense in Savings
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#add"]');
    await pressAmount('3000'); // 30.00
    await page.click('#log-wallet-tile');
    await page.click('.account-opt:has-text("Savings")');
    await page.click('#log-category-tile');
    await page.click('.category-opt:has-text("Entertainment")');
    await page.click('#btn-save-log');
    await expect(page.locator('#tx-log-root')).toBeHidden();

    // 7. Verify New Balances
    // Main Bank: 1000 + 200 - 50 = 1150
    // Savings: 500 + 100 - 30 = 570
    // Total: 1720
    await page.goto('#dashboard'); // Ensure we are on dashboard
    await expect(page.locator('.header-title >> text=$1,720.00').first()).toBeVisible();
    await expect(page.locator('.wallet-card:has-text("Main Bank") >> text=$1,150.00')).toBeVisible();
    await expect(page.locator('.wallet-card:has-text("Savings") >> text=$570.00')).toBeVisible();

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

  test('should navigate to Edit Account via 3-dots menu on dashboard', async ({ page }) => {
    // 1. Create Account
    await page.click('#btn-dashboard-add-wallet');
    await page.fill('#edit-acc-name', 'Test Account');
    await page.fill('#edit-acc-balance', '100');
    await page.click('#btn-edit-acc-save');
    
    // Verify it exists
    await expect(page.locator('.wallet-card:has-text("Test Account")')).toBeVisible();

    // 2. Click the 3-dots menu on the Test Account card
    await page.click('.wallet-card:has-text("Test Account") .account-edit-trigger');

    // Verify it navigated to Edit Account page and the inputs are pre-filled
    await expect(page).toHaveURL(/.*#edit-account.*/);
    await expect(page.locator('#edit-acc-name')).toHaveValue('Test Account');
    await expect(page.locator('#edit-acc-balance')).toHaveValue('100');

    // 3. Edit name and save
    await page.fill('#edit-acc-name', 'Updated Test Account');
    await page.click('#btn-edit-acc-save');

    // Verify we are back on dashboard and the name is updated
    await expect(page.locator('.wallet-card:has-text("Updated Test Account")')).toBeVisible();
  });
});
