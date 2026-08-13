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

  // P8d (v0.89): the remaining views + shared modals.
  test('settings, categories, tags, goals and debt render in Italian', async ({ page }) => {
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#settings"]');
    await expect(page.locator('h1.header-title')).toHaveText('Altro');
    // Currency names are localized; the ISO code is not. USD is the store default.
    await expect(page.locator('#current-currency-display')).toHaveText('USD — Dollaro statunitense');
    await expect(page.locator('#label-theme-mode')).toHaveText('Preferenza tema');
    await expect(page.locator('text=Zona pericolosa')).toBeVisible();

    // Account types are a closed enum: the label is localized, the stored
    // value stays English.
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#edit-account"]');
    await expect(page.locator('h1.header-title')).toHaveText('Nuovo conto');
    await expect(page.locator('#edit-acc-type option[value="Credit card"]')).toHaveText('Carta di credito');
    await expect(page.locator('label[for="edit-acc-balance"]')).toHaveText('Saldo iniziale');

    // Categories
    await page.goto('/#categories');
    await expect(page.locator('.page-header-title')).toHaveText('Categorie');
    await expect(page.locator('text=Tutti i tipi')).toBeVisible();

    // Tags (empty state)
    await page.goto('/#tags');
    await expect(page.locator('text=Nessun tag per ora')).toBeVisible();

    // Goals / Budget
    await page.click('a[href="#budget"]');
    await expect(page.locator('.page-header-title')).toHaveText('Budget');
    await expect(page.locator('text=Totale speso')).toBeVisible();

    // Debt hub + simulator
    await page.goto('/#debt');
    await expect(page.locator('.page-header-title')).toHaveText('Prestiti');
    await expect(page.locator('.debt-type-tile:has-text("Mutuo")')).toBeVisible();
    await page.click('.debt-type-tile[data-type="mortgage"]');
    await expect(page.locator('h1.header-title')).toHaveText('Mutuo');
    await expect(page.locator('#btn-dsim-calculate')).toHaveText('Calcola');
  });

  test('the filter modal and custom range use localized month names', async ({ page }) => {
    await page.click('a[href="#transactions"]');
    await page.click('#btn-filter-history');
    await expect(page.locator('text=Filtra e ordina')).toBeVisible();
    await expect(page.locator('text=Tipo di movimento')).toBeVisible();
    await page.click('#afm-close');

    // Calendar month names come from Intl, not the dictionary.
    await page.click('#btn-calendar-history');
    await expect(page.locator('text=Intervallo personalizzato')).toBeVisible();
    await expect(page.locator('text=Scorciatoie')).toBeVisible();
    await expect(page.locator('.multi-select-chip:has-text("Ultimi 7 giorni")')).toBeVisible();
    const navTitle = await page.locator('.calendar-nav-title').first().textContent();
    const expected = new Date().toLocaleDateString('it-IT', { month: 'long' });
    expect(navTitle.toLowerCase()).toContain(expected.toLowerCase());
  });

  test('switching language in Settings re-renders live', async ({ page }) => {
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#settings"]');
    await expect(page.locator('#current-language-display')).toHaveText('Italiano');

    await page.click('#btn-open-language');
    // The picker attaches its row listeners on a 50ms timer after the modal
    // paints, so a click that lands earlier is silently dropped.
    const frOption = page.locator('.language-opt[data-code="fr"]');
    await expect(frOption).toBeVisible();
    await page.waitForTimeout(150);
    await frOption.click();

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
