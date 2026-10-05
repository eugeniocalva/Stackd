import { test, expect } from '@playwright/test';

test.describe('Welcome Region Setup Modal', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to page, clear localStorage, and reload to trigger welcome modal
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    // 1.0.1 (C-49): reload through Playwright, not from inside evaluate, so
    // the first assertion never races the old page.
    await page.reload();
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

  // 1.0.2 (BUG-40): the welcome sheet is mandatory. A tap on the dimmed area
  // or a swipe down used to close it unsaved (USD kept, setup_done never
  // written, a half-switched language). It now closes only through Get
  // started, and the language row goes through SET_LANGUAGE.
  test.describe('touch device', () => {
    // Touch/TouchEvent constructors only exist in a touch-enabled context.
    test.use({ hasTouch: true, viewport: { width: 412, height: 839 } });

    const swipeSheet = (page, dy) => page.evaluate((deltaY) => {
      const backdrop = document.querySelector('#active-modal');
      const content = backdrop.querySelector('.modal-content');
      const top = content.getBoundingClientRect().top + 10;
      const mk = (type, y) => {
        const touch = new Touch({ identifier: 1, target: content, clientX: 200, clientY: y });
        return new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [touch],
          changedTouches: [touch],
          bubbles: true
        });
      };
      content.dispatchEvent(mk('touchstart', top));
      content.dispatchEvent(mk('touchmove', top + deltaY));
      content.dispatchEvent(mk('touchend', top + deltaY));
    }, dy);

    test('a tap outside or a swipe never closes the welcome sheet', async ({ page }) => {
      await expect(page.locator('#active-modal')).toBeVisible();
      await expect(page.locator('#setup-row-currency')).toBeVisible();

      // A tap on the dimmed area above the sheet.
      await page.touchscreen.tap(200, 150);
      await page.waitForTimeout(400);
      await expect(page.locator('#setup-row-currency')).toBeVisible();

      // A 300 px swipe down from the sheet's top.
      await swipeSheet(page, 300);
      await page.waitForTimeout(400);
      await expect(page.locator('#setup-row-currency')).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem('stackd_v1_setup_done'))).toBeNull();

      // Picking Italiano switches the store, not only the sheet's copy.
      await page.click('#setup-row-language');
      await page.locator('#setup-picker-sheet .setup-picker-opt[data-code="it"]').click();
      await expect.poll(() => page.evaluate(() => window.Store.getState().language)).toBe('it');
      await expect(page.locator('#setup-language-subtitle')).toHaveText('Italiano');

      // Inizia (Get started) finishes onboarding in EUR.
      await expect(page.locator('#modal-save-btn')).toHaveText('Inizia');
      await page.click('#modal-save-btn');
      await expect(page.locator('#active-modal')).toBeHidden();
      expect(await page.evaluate(() => localStorage.getItem('stackd_v1_setup_done'))).toBe('1');
      expect(await page.evaluate(() => window.Store.getState().currency)).toBe('EUR');
      expect(await page.evaluate(() => window.Store.getState().language)).toBe('it');
    });
  });
});
