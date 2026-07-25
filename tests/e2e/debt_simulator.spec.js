import { test, expect } from '@playwright/test';

test.describe('Debt Simulator E2E Flow', () => {
  test('should simulate, save, prefill transaction, and delete a loan', async ({ page }) => {
    // Collect any page-level console errors
    const errors = [];
    page.on('pageerror', err => {
      console.log('BROWSER EXCEPTION:', err);
      errors.push(err);
    });
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('BROWSER CONSOLE ERROR:', msg.text());
      }
    });

    await page.goto('/');
    
    // Clear state and bypass welcome modal
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      window.location.reload();
    });

    // Wait for the app to initialize
    await page.waitForSelector('#bottom-nav');

    // Programmatically seed an account so the transaction logger has a valid wallet
    await page.evaluate(() => {
      window.Store.dispatch('ADD_ACCOUNT', {
        name: 'Main Bank',
        openingBalance: 1000,
        openingDate: '2026-07-15'
      });
    });

    // 1. Navigate to Debt Simulator via FAB menu
    const fabToggle = page.locator('#nav-fab-toggle');
    await expect(fabToggle).toBeVisible();
    await fabToggle.click();

    const debtMenuBtn = page.locator('a[href="#debt"]');
    await expect(debtMenuBtn).toBeVisible();
    await debtMenuBtn.click();

    // Verify navigation hash
    await page.waitForTimeout(1000);
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('#debt');

    // 2. Fill the simulator form
    const title = page.locator('h2 >> text=Simulate New Loan');
    await expect(title).toBeVisible();

    await page.fill('#loan-name-input', 'Test Student Loan');
    await page.fill('#loan-amount-input', '5000');
    await page.fill('#loan-tan-input', '4.5');
    await page.fill('#loan-duration-input', '24');
    await page.fill('#loan-start-date-input', '2026-07-15');

    // Trigger calculations
    await page.dispatchEvent('#loan-amount-input', 'input');

    // Verify calculated monthly payment results
    // PMT for 5000, 4.5%, 24m is exactly 218.24.
    const monthlyPaymentEl = page.locator('#calc-monthly-payment');
    await expect(monthlyPaymentEl).toContainText('218');

    // 3. Save the loan profile
    const saveBtn = page.locator('#btn-save-loan');
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Verify we transitioned to dashboard view showing the active loan
    await page.waitForTimeout(1000);
    const dashboardTitle = page.locator('h3 >> text=Your Active Loans');
    await expect(dashboardTitle).toBeVisible();

    const loanCardTitle = page.locator('h4 >> text=Test Student Loan');
    await expect(loanCardTitle).toBeVisible();

    // 4. Click "Create Expense" to trigger transaction prefill
    const createExpenseBtn = page.locator('.btn-log-payment').first();
    await expect(createExpenseBtn).toBeVisible();
    await createExpenseBtn.click();

    // Verify we navigated to #add and the log sheet shows prefilled monthly payment
    await page.waitForTimeout(1000);
    const addHash = await page.evaluate(() => window.location.hash);
    expect(addHash).toBe('#add');

    const amountVal = page.locator('#log-amount-val');
    // Prefilled amount should format to 218,24
    await expect(amountVal).toContainText('218,24');

    // 5. Navigate back to Debt Simulator dashboard
    await page.goto('#debt');
    await page.waitForTimeout(1000);

    // 6. Delete the loan
    const deleteBtn = page.locator('.btn-delete-loan').first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Confirm in modal
    const confirmBtn = page.locator('button:has-text("Delete")');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Verify it is deleted and we default back to the simulator page
    await page.waitForTimeout(1000);
    await expect(page.locator('h2 >> text=Simulate New Loan')).toBeVisible();

    // Ensure no runtime exceptions occurred
    expect(errors).toHaveLength(0);
  });

  test('should enforce 5-year cap on long loans and delete transaction via detail delete tile', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => {
      errors.push(err);
    });

    await page.goto('/');
    
    // Clear state and bypass welcome modal
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      window.location.reload();
    });

    await page.waitForSelector('#bottom-nav');

    // Seed account
    await page.evaluate(() => {
      window.Store.dispatch('ADD_ACCOUNT', {
        name: 'Main Bank',
        openingBalance: 10000,
        openingDate: '2026-07-15'
      });
    });

    // Navigate to #debt
    await page.goto('#debt');

    // Fill form for 10-year loan (120 months)
    await page.fill('#loan-name-input', '10-Year Home Loan');
    await page.fill('#loan-amount-input', '100000');
    await page.fill('#loan-tan-input', '5.0');
    await page.fill('#loan-duration-input', '120');
    await page.fill('#loan-start-date-input', '2026-07-15');

    // Trigger calculations and save
    await page.dispatchEvent('#loan-amount-input', 'input');
    await page.click('#btn-save-loan');

    // Click "Create Expense" to trigger transaction prefill
    await page.waitForSelector('.btn-log-payment');
    await page.click('.btn-log-payment');

    // Expect the cap alert modal
    const alertModal = page.locator('h2 >> text=Recurrence Capped');
    await expect(alertModal).toBeVisible();

    // Click "Continue" to proceed
    await page.click('button:has-text("Continue")');

    // Verify navigation to #add
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.location.hash)).toBe('#add');

    // Select a category to enable the save button
    await page.click('#log-category-tile');
    await page.click('.category-opt:has-text("Groceries")');

    // Save the transaction
    await page.click('#btn-save-log');

    // Wait for the transaction to save
    await page.waitForTimeout(500);

    // Go to History
    await page.goto('#transactions');

    // Find the saved transaction and click it to open edit sheet
    await page.click('.list-item-content >> text=Groceries');

    // We expect the RecurringUpdateModal since it's recurring. Choose 'only'
    await page.click('#ru-only-this');

    // Verify we are on #edit page
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.location.hash)).toContain('#edit');

    // Click the new Delete tile in the detail view
    const deleteTile = page.locator('#log-delete-tile');
    await expect(deleteTile).toBeVisible();
    await deleteTile.click();

    // Verify it triggers RecurringDeleteModal. Choose 'rdm-only-this'
    const confirmDeleteBtn = page.locator('#rdm-only-this');
    await expect(confirmDeleteBtn).toBeVisible();
    await confirmDeleteBtn.click();

    // Verify we navigated back to #transactions
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.location.hash)).toBe('#transactions');

    // Verify the transaction is deleted
    await expect(page.locator('.list-item-content >> text=Groceries')).toBeHidden();

    expect(errors).toHaveLength(0);
  });
});
