import { test, expect } from '@playwright/test';

// v1.01 category rules (docs/bank-import-plan.md §5): pick a category on a
// preview row → a "Remember" pill appears → tapping it saves a rule
// (ADD_IMPORT_RULE) and the NEXT import of the same merchant arrives
// pre-categorized. Rules are managed (and deletable) from Others & Settings.
test.describe('Import category rules E2E flow', () => {
  const JANUARY_CSV = [
    'Data;Descrizione;Importo',
    '03/01/2026;SUPERMERCATO ROSSI;-45,90',
    '05/01/2026;STIPENDIO;1.850,00'
  ].join('\n');
  // Same merchant, different rows — nothing dedups, the rule must do the work.
  const FEBRUARY_CSV = [
    'Data;Descrizione;Importo',
    '07/02/2026;SUPERMERCATO ROSSI;-52,10'
  ].join('\n');

  const bootstrap = async (page) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store);
    await page.evaluate(() => {
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 0 });
    });
  };

  const goToSettings = async (page) => {
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#settings"]');
    await page.waitForSelector('#btn-import-csv');
  };

  const uploadCsv = async (page, csv) => {
    await page.setInputFiles('#import-csv-file', {
      name: 'bank.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)
    });
    await page.waitForSelector('#import-map');
    await page.click('#btn-imap-continue');
    await page.waitForSelector('#import-preview');
  };

  test('teaches a rule from the preview and auto-categorizes the next import', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    page.on('dialog', d => d.accept());

    await bootstrap(page);
    await goToSettings(page);

    // ── January: rows arrive uncategorized ────────────────────────────────
    await uploadCsv(page, JANUARY_CSV);
    await expect(page.locator('.import-row-cat')).toHaveCount(2);
    await expect(page.locator('.import-row-cat').first()).toContainText('Choose category');

    // Pick Groceries for the supermarket row via the existing category picker.
    await page.locator('.import-row-cat').first().click();
    await page.waitForSelector('#category-selection-modal');
    await page.click('.category-select-item:has-text("Groceries")');

    // Chip updates in place and the transient "Remember" pill appears.
    await expect(page.locator('.import-row-cat').first()).toContainText('Groceries');
    await expect(page.locator('.import-row-rule')).toHaveCount(1);
    await expect(page.locator('.import-row-rule')).toContainText('supermercato rossi');

    // Teach the rule; the coalesced re-render drops the pill.
    await page.click('.import-row-rule');
    await expect(page.locator('.import-row-rule')).toHaveCount(0);
    const rule = await page.evaluate(() => window.Store.getState().importRules[0]);
    expect(rule).toMatchObject({ match: 'supermercato rossi' });

    // Import lands with the chosen category on the taught row only.
    await page.click('#btn-iprev-confirm');
    await page.waitForSelector('#btn-import-csv');
    const january = await page.evaluate(() => {
      const cats = Object.fromEntries(window.Store.getState().categories.map(c => [c.id, c.name]));
      return window.Store.getState().transactions
        .filter(t => t.importKey)
        .map(t => ({ comment: t.comment, category: cats[t.categoryId] || '' }));
    });
    expect(january.find(t => t.comment === 'SUPERMERCATO ROSSI').category).toBe('Groceries');
    expect(january.find(t => t.comment === 'STIPENDIO').category).toBe('');

    // ── February: the rule categorizes the new row before anyone touches it ─
    await uploadCsv(page, FEBRUARY_CSV);
    await expect(page.locator('.import-row-cat').first()).toContainText('Groceries');

    await page.click('#btn-iprev-confirm');
    await page.waitForSelector('#btn-import-csv');
    const february = await page.evaluate(() => {
      const s = window.Store.getState();
      const groceries = s.categories.find(c => c.name === 'Groceries');
      return s.transactions.filter(t => t.importKey && t.date === '2026-02-07')
        .map(t => t.categoryId === groceries.id);
    });
    expect(february).toEqual([true]);

    // ── Management sheet: the rule is listed and deletable ────────────────
    await page.click('#btn-import-rules');
    await page.waitForSelector('#import-rules-modal');
    await expect(page.locator('.irm-row')).toHaveCount(1);
    await expect(page.locator('.irm-row')).toContainText('supermercato rossi');
    await expect(page.locator('.irm-row')).toContainText('Groceries');

    await page.click('.irm-delete');
    await expect(page.locator('.irm-row')).toHaveCount(0);
    await expect(page.locator('#irm-empty')).toBeVisible();
    expect(await page.evaluate(() => window.Store.getState().importRules.length)).toBe(0);

    expect(errors).toEqual([]);
  });
});
