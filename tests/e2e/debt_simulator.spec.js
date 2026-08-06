import { test, expect } from '@playwright/test';

// Rewritten for the current DebtView (src/views.js): the standalone
// "Simulate New Loan" form is gone. #debt is now a loan dashboard — summary
// tiles, an "Active Loans (n)" list of cards, and an add/edit modal
// (Components.Modal) reached from #btn-add-loan-header, #btn-add-loan-empty or
// a card's .btn-edit-loan. The old "Create Expense" payment-prefill flow no
// longer exists anywhere in src/, so it is not covered here.
test.describe('Debt Simulator E2E Flow', () => {
  const bootstrap = async (page) => {
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
  };

  // Modal.hide() empties #modal-container on a 300ms timer; wait it out so the
  // backdrop can't swallow the next click.
  const expectModalClosed = (page) => expect(page.locator('#active-modal')).toHaveCount(0);

  const fillLoanForm = async (page, { name, amount, tan, duration }) => {
    await page.waitForSelector('#loan-form');
    if (name !== undefined) await page.fill('#loan-name', name);
    if (amount !== undefined) await page.fill('#loan-amount', amount);
    if (tan !== undefined) await page.fill('#loan-tan', tan);
    if (duration !== undefined) await page.fill('#loan-duration', duration);
  };

  test('adds, edits and deletes a loan from the loan dashboard', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));

    await bootstrap(page);

    // 1. Navigate to the Debt Simulator via the FAB menu
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#debt"]');
    await expect(page).toHaveURL(/#debt$/);
    await expect(page.locator('h1', { hasText: 'Debt Simulator' })).toBeVisible();

    // 2. Empty state
    await expect(page.locator('h2', { hasText: 'Active Loans (0)' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'No Active Loans' })).toBeVisible();

    // 3. Add a loan from the empty state. Start date is left at the modal's
    // default (today), so no instalment has elapsed and the remaining
    // principal stays equal to the original amount.
    await page.click('#btn-add-loan-empty');
    await expect(page.locator('#modal-title')).toHaveText('Add New Loan');
    await fillLoanForm(page, {
      name: 'Test Student Loan',
      amount: '5000',
      tan: '4.5',
      duration: '24'
    });

    // Live PMT preview: 5000 @ 4.5% TAN over 24m = 218.24/mo
    await expect(page.locator('#loan-pmt-preview')).toHaveText('$218.24 / mo');

    await page.click('#modal-save-btn');
    await expectModalClosed(page);

    // 4. The loan card renders with the computed figures
    await expect(page.locator('h2', { hasText: 'Active Loans (1)' })).toBeVisible();
    const card = page.locator('.card', { hasText: 'Test Student Loan' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('4.5% TAN');
    await expect(card).toContainText('24 Months');
    await expect(card).toContainText('$5,000.00');      // remaining principal
    await expect(card).toContainText('$218.24 / mo');   // monthly payment

    // Summary tiles mirror the single loan
    await expect(page.locator('.card', { hasText: 'Total Remaining' })).toContainText('$5,000.00');
    await expect(page.locator('.card', { hasText: 'Monthly Total' })).toContainText('$218.24');

    // 5. Edit the loan — the modal opens prefilled
    await page.click('.btn-edit-loan');
    await expect(page.locator('#modal-title')).toHaveText('Edit Loan');
    await expect(page.locator('#loan-name')).toHaveValue('Test Student Loan');
    await expect(page.locator('#loan-amount')).toHaveValue('5000');
    await expect(page.locator('#loan-tan')).toHaveValue('4.5');
    await expect(page.locator('#loan-duration')).toHaveValue('24');

    // Double the principal: the payment recalculates to 436.48/mo
    await fillLoanForm(page, { name: 'Renegotiated Student Loan', amount: '10000' });
    await expect(page.locator('#loan-pmt-preview')).toHaveText('$436.48 / mo');
    await page.click('#modal-save-btn');
    await expectModalClosed(page);

    await expect(page.locator('h2', { hasText: 'Active Loans (1)' })).toBeVisible();
    const editedCard = page.locator('.card', { hasText: 'Renegotiated Student Loan' });
    await expect(editedCard).toBeVisible();
    await expect(editedCard).toContainText('$10,000.00');
    await expect(editedCard).toContainText('$436.48 / mo');

    // 6. Delete the loan via the confirmation modal's Delete button
    await page.click('.btn-delete-loan');
    await expect(page.locator('#modal-title')).toHaveText('Delete Loan?');
    await page.click('#modal-delete-btn');
    await expectModalClosed(page);

    // 7. Back to the empty state
    await expect(page.locator('h2', { hasText: 'Active Loans (0)' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'No Active Loans' })).toBeVisible();
    await expect(page.locator('#btn-add-loan-empty')).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('rejects an invalid loan and keeps the modal open', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));

    await bootstrap(page);
    await page.goto('#debt');
    await page.waitForSelector('#btn-add-loan-header');

    // A missing name / non-positive amount makes onSave bail out without
    // closing the modal, so nothing is persisted.
    await page.click('#btn-add-loan-header');
    await fillLoanForm(page, { name: '', amount: '0', tan: '3.5', duration: '24' });
    await page.click('#modal-save-btn');

    await expect(page.locator('#active-modal')).toBeVisible();
    expect(await page.evaluate(() => window.Store.getState().loans.length)).toBe(0);

    // Filling it in properly then saves and closes
    await fillLoanForm(page, { name: 'Car Loan', amount: '12000', duration: '48' });
    await page.click('#modal-save-btn');
    await expectModalClosed(page);

    await expect(page.locator('h2', { hasText: 'Active Loans (1)' })).toBeVisible();
    await expect(page.locator('.card', { hasText: 'Car Loan' })).toContainText('$12,000.00');

    expect(errors).toHaveLength(0);
  });
});
