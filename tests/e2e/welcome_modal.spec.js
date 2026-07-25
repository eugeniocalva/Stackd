import { test, expect } from '@playwright/test';

test.describe('Welcome Region Setup Modal', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to page, clear localStorage, and reload to trigger welcome modal
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      window.location.reload();
    });
  });

  test('should display welcome modal, select JPY and English, and dismiss modal on Get Started', async ({ page }) => {
    // 1. Verify modal is visible
    const modalBackdrop = page.locator('#active-modal');
    await expect(modalBackdrop).toBeVisible();

    // Verify Title and Content
    await expect(page.locator('#modal-title')).toHaveText("Welcome to Stack'd 👋");
    
    // Verify Cancel button is hidden
    const cancelBtn = page.locator('#modal-cancel-btn');
    await expect(cancelBtn).toBeHidden();

    // 2. Click Currency Row to open Picker
    const currencyRow = page.locator('#setup-row-currency');
    await expect(currencyRow).toBeVisible();
    await expect(page.locator('#setup-currency-subtitle')).toHaveText('EUR — Euro');
    await currencyRow.click();

    // Picker backdrop should slide up
    const pickerBackdrop = page.locator('#setup-picker-sheet');
    await expect(pickerBackdrop).toBeVisible();
    await expect(pickerBackdrop.locator('h2')).toHaveText('Currency');

    // Select JPY — Japanese Yen
    const jpyOption = pickerBackdrop.locator('.setup-picker-opt[data-code="JPY"]');
    await expect(jpyOption).toBeVisible();
    await jpyOption.click();

    // Picker should dismiss and subtitle should update to JPY
    await expect(pickerBackdrop).toBeHidden();
    await expect(page.locator('#setup-picker-sheet')).toHaveCount(0);
    await expect(page.locator('#setup-currency-subtitle')).toHaveText('JPY — Japanese Yen');

    // 3. Click Language Row to open Picker
    const languageRow = page.locator('#setup-row-language');
    await expect(languageRow).toBeVisible();
    await expect(page.locator('#setup-language-subtitle')).toHaveText('English');
    await languageRow.click();

    // Picker sheet should show for Language
    await expect(pickerBackdrop).toBeVisible();
    await expect(pickerBackdrop.locator('h2')).toHaveText('Language');

    // Select English
    const enOption = pickerBackdrop.locator('.setup-picker-opt[data-code="en"]');
    await expect(enOption).toBeVisible();
    await enOption.click();

    // Picker should dismiss
    await expect(pickerBackdrop).toBeHidden();
    await expect(page.locator('#setup-picker-sheet')).toHaveCount(0);

    // 4. Click Get Started to save and dismiss Welcome Modal
    const getStartedBtn = page.locator('#modal-save-btn');
    await expect(getStartedBtn).toBeVisible();
    await getStartedBtn.click();

    // Welcome modal should dismiss
    await expect(modalBackdrop).toBeHidden();

    // Verify localStorage has setup_done = '1'
    const setupDone = await page.evaluate(() => localStorage.getItem('stackd_v1_setup_done'));
    expect(setupDone).toBe('1');

    // Verify Store state currency is JPY
    const storeCurrency = await page.evaluate(() => window.Store.getState().currency);
    expect(storeCurrency).toBe('JPY');
  });
});
