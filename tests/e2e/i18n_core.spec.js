import { test, expect } from '@playwright/test';

// P8c (v0.88): core chrome runs fully translated. The suite's other specs
// cover English; this one boots in Italian and walks the daily screens,
// then flips language live via the Settings picker.
test.describe('i18n core chrome (Italian)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_language', JSON.stringify('it'));
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store);
  });

  test('dashboard, FAB menu, log form and history render in Italian', async ({ page }) => {
    // Dashboard chrome
    await expect(page.locator('text=Saldo totale').first()).toBeVisible();
    await expect(page.locator('#btn-dashboard-add-wallet')).toContainText('Aggiungi wallet');

    // FAB action menu
    await page.click('#nav-fab-toggle');
    await expect(page.locator('.menu-action-item:has-text("Aggiungi movimento")')).toBeVisible();
    await expect(page.locator('.menu-action-item:has-text("Altro e impostazioni")')).toBeVisible();

    // Create an account, then log an expense through the Italian form
    await page.click('a[href="#edit-account"]');
    await page.fill('#edit-acc-name', 'Banca');
    await page.fill('#edit-acc-balance', '100000'); // 1000.00
    await page.click('#btn-edit-acc-save');
    await expect(page.locator('.wallet-card:has-text("Banca")')).toBeVisible();

    await page.click('#nav-fab-toggle');
    await page.click('a[href="#add"]');
    await page.waitForSelector('#btn-save-tx');
    await expect(page.locator('h1.header-title')).toHaveText('Nuovo movimento');
    await expect(page.locator('#toggle-expense')).toHaveText('Spesa');
    await expect(page.locator('#toggle-income')).toHaveText('Entrata');
    await expect(page.locator('#btn-save-tx')).toHaveText('Salva movimento');

    await page.click('#toggle-expense');
    await page.fill('#tx-amount', '25.50');
    await page.click('#btn-save-tx');

    // Lands on History, translated, with the day sum in Italian
    await expect(page.locator('.page-header-title')).toHaveText('Cronologia');
    await expect(page.locator('#btn-start-selection-mode')).toHaveText('Seleziona');
    await expect(page.locator('.day-summary-footer').first()).toContainText('somma:');

    // Selection bar plurals
    await page.click('#btn-start-selection-mode');
    await expect(page.locator('.selection-count-label')).toHaveText('0 selezionati');
    await expect(page.locator('#btn-toggle-select-all')).toHaveText('Seleziona tutto');
    await page.click('#btn-cancel-selection');
  });

  test('switching language in Settings re-renders live', async ({ page }) => {
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#settings"]');
    await expect(page.locator('#current-language-display')).toHaveText('Italiano');

    await page.click('#btn-open-language');
    await page.click('.language-opt[data-code="fr"]');

    // The dispatch re-renders Settings wholesale; the subtitle now shows French
    await expect(page.locator('#current-language-display')).toHaveText('Français');

    // And the dashboard is French now
    await page.click('a[href="#dashboard"]');
    await expect(page.locator('text=Solde total').first()).toBeVisible();

    // The bottom nav is mounted outside the view render loop — v0.88 rebuilds
    // it on language change, so its labels must be French too.
    await expect(page.locator('.nav-item[data-view="transactions"]')).toHaveAttribute('aria-label', 'Historique');
    await page.click('#nav-fab-toggle');
    await expect(page.locator('.menu-action-item:has-text("Ajouter une opération")')).toBeVisible();

    // The re-attached nav still navigates (no stacked listeners, no dead taps).
    // No account exists in this test, so #add shows the French empty state.
    await page.click('a[href="#add"]');
    await expect(page.locator("text=Créez d'abord un compte")).toBeVisible();
  });
});
