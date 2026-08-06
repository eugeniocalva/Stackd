import { test, expect } from '@playwright/test';

test.describe('Stackd User Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
    });
    // page.reload() (not an in-page location.reload) is a real navigation
    // barrier — #bottom-nav exists in the static markup, so waiting for it
    // after an in-page reload can resolve against the pre-reload document.
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store);
  });

  // #edit-acc-balance is a strict digits-only, right-to-left decimal-shift field
  // (same convention as the transaction keypad): the digits you enter are cents,
  // so '100000' means $1,000.00 and the input reformats itself to '1000.00'.
  test('should complete the requested full user flow', async ({ page }) => {
    // 1. Create Account 1 (Main Bank)
    await page.click('#btn-dashboard-add-wallet');
    await page.fill('#edit-acc-name', 'Main Bank');
    await page.fill('#edit-acc-balance', '100000'); // 1000.00
    await expect(page.locator('#edit-acc-balance')).toHaveValue('1000.00');
    await page.click('#btn-edit-acc-save');
    
    // Verify account 1 exists on dashboard
    await expect(page.locator('.wallet-card:has-text("Main Bank")')).toBeVisible();
    await expect(page.locator('.wallet-card:has-text("Main Bank") >> text=$1,000.00')).toBeVisible();

    // 2. Create Account 2 (Savings)
    await page.click('#btn-dashboard-add-wallet');
    await page.fill('#edit-acc-name', 'Savings');
    await page.fill('#edit-acc-balance', '50000'); // 500.00
    await page.click('#btn-edit-acc-save');

    // Verify account 2 exists on dashboard
    await expect(page.locator('.wallet-card:has-text("Savings")')).toBeVisible();
    await expect(page.locator('.wallet-card:has-text("Savings") >> text=$500.00')).toBeVisible();

    // Verify Total Balance ($1500)
    await expect(page.locator('.header-title >> text=$1,500.00').first()).toBeVisible();

    // Helper: log one transaction through the #add form.
    // The keypad log-sheet (#tx-log-root / .keypad-btn / #btn-save-log) is gone —
    // #add is now a plain form: type toggle, #tx-amount (decimal), and two
    // <select>s. Type must be chosen before the category, because switching
    // type repopulates #tx-category from the type-filtered category list.
    const logTransaction = async ({ type, amount, account, category }) => {
      await page.click('#nav-fab-toggle');
      await page.click('a[href="#add"]');
      await page.waitForSelector('#btn-save-tx');

      await page.click(`#toggle-${type}`);
      await page.fill('#tx-amount', amount);
      await page.selectOption('#tx-account', { label: account });
      await page.selectOption('#tx-category', { label: category });
      await page.click('#btn-save-tx');

      // Saving always routes to the history view
      await expect(page).toHaveURL(/#transactions$/);
    };

    // 3. Register Income in Main Bank
    await logTransaction({ type: 'income', amount: '200', account: 'Main Bank', category: 'Salary' });

    // 4. Register Expense in Main Bank
    await logTransaction({ type: 'expense', amount: '50', account: 'Main Bank', category: 'Groceries' });

    // 5. Register Income in Savings
    await logTransaction({ type: 'income', amount: '100', account: 'Savings', category: 'Freelance' });

    // 6. Register Expense in Savings
    await logTransaction({ type: 'expense', amount: '30', account: 'Savings', category: 'Entertainment' });

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
    await page.fill('#edit-acc-balance', '10000'); // 100.00
    await page.click('#btn-edit-acc-save');
    
    // Verify it exists
    await expect(page.locator('.wallet-card:has-text("Test Account")')).toBeVisible();

    // 2. Click the 3-dots menu on the Test Account card
    await page.click('.wallet-card:has-text("Test Account") .account-edit-trigger');

    // Verify it navigated to Edit Account page and the inputs are pre-filled
    await expect(page).toHaveURL(/.*#edit-account.*/);
    await expect(page.locator('#edit-acc-name')).toHaveValue('Test Account');
    // Rendered back from the stored opening balance, always 2dp
    await expect(page.locator('#edit-acc-balance')).toHaveValue('100.00');

    // 3. Edit name and save
    await page.fill('#edit-acc-name', 'Updated Test Account');
    await page.click('#btn-edit-acc-save');

    // Verify we are back on dashboard and the name is updated
    await expect(page.locator('.wallet-card:has-text("Updated Test Account")')).toBeVisible();
  });
});
