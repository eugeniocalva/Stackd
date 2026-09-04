import { test, expect } from '@playwright/test';

// v0.99 bank-statement CSV import (docs/bank-import-plan.md §3): the Others
// "Import CSV" button routes an arbitrary bank CSV to a column-mapping view
// (#import-map) and a review screen (#import-preview); Confirm dispatches
// BATCH_IMPORT_BANK_TRANSACTIONS (importKey-deduped) + SAVE_IMPORT_PRESET.
// Re-importing the same file must flag every row as already imported.
test.describe('Bank statement import E2E flow', () => {
  const ITALIAN_CSV = [
    'Data;Descrizione;Importo',
    '03/01/2026;SUPERMERCATO ROSSI;-45,90',
    '05/01/2026;STIPENDIO;1.850,00'
  ].join('\n');

  const bootstrap = async (page) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      // Deliberately-empty widget area (house convention: opts out of the
      // v0.72 fresh-install latest-widget seed).
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    // page.reload() is a real navigation barrier — #bottom-nav exists in the
    // static markup, so waiting for it after an in-page reload could resolve
    // against the pre-reload document.
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store);

    // One account: the bank flow needs a target account to import into.
    await page.evaluate(() => {
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2020-01-01' });
    });
  };

  const goToSettings = async (page) => {
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#settings"]');
    await page.waitForSelector('#btn-import-csv');
  };

  // The hidden file input is the real entry point — no button click needed;
  // setInputFiles fires the change handler that routes bank CSVs to #import-map.
  const uploadBankCsv = async (page) => {
    await page.setInputFiles('#import-csv-file', {
      name: 'bank.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(ITALIAN_CSV)
    });
    await page.waitForSelector('#import-map');
  };

  test('imports a bank CSV, then flags a re-import of the same file as all duplicates', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });

    await bootstrap(page);
    await goToSettings(page);

    // ── First pass: map ────────────────────────────────────────────────────
    await uploadBankCsv(page);

    // The analyzer guessed the Italian layout: date/description/amount, DMY.
    await expect(page.locator('#imap-col-date')).toHaveValue('0');
    await expect(page.locator('#imap-col-desc')).toHaveValue('1');
    await expect(page.locator('#imap-col-amount')).toHaveValue('2');
    await expect(page.locator('#imap-date-format')).toHaveValue('dmy');
    // No preset exists yet, so no "recognized layout" note.
    await expect(page.locator('#import-map')).not.toContainText('Recognized this layout');

    // Live preview parses the sample rows with signed formatted amounts.
    await expect(page.locator('#imap-preview')).toContainText('SUPERMERCATO ROSSI');
    await expect(page.locator('#imap-preview')).toContainText('-$45.90');
    await expect(page.locator('#imap-preview')).toContainText('+$1,850.00');
    await expect(page.locator('#imap-preview')).toContainText('2026-01-03');

    // ── First pass: preview ────────────────────────────────────────────────
    await page.click('#btn-imap-continue');
    await page.waitForSelector('#import-preview');

    await expect(page.locator('.import-row')).toHaveCount(2);
    await expect(page.locator('.import-row-check')).toHaveCount(2);
    await expect(page.locator('#iprev-selected-text')).toHaveText('2 transactions selected');
    await expect(page.locator('#btn-iprev-confirm')).toHaveText('Import 2 transactions');

    const rows = page.locator('.import-row');
    await expect(rows.nth(0)).toContainText('SUPERMERCATO ROSSI');
    await expect(rows.nth(0)).toContainText('2026-01-03');
    await expect(rows.nth(0)).toContainText('-$45.90');
    await expect(rows.nth(1)).toContainText('STIPENDIO');
    await expect(rows.nth(1)).toContainText('2026-01-05');
    await expect(rows.nth(1)).toContainText('+$1,850.00');

    // ── First pass: confirm ────────────────────────────────────────────────
    await page.click('#btn-iprev-confirm');
    await page.waitForSelector('#btn-import-csv'); // back on Settings
    expect(dialogs.some(m => m.includes('Imported 2 transactions'))).toBe(true);

    const imported = await page.evaluate(() => {
      const txs = window.Store.getState().transactions.filter(t => t.importKey);
      return {
        txs: txs.map(t => ({
          type: t.type, amount: t.amount, date: t.date,
          comment: t.comment, categoryId: t.categoryId, importKey: t.importKey
        })),
        presets: window.Store.getState().importPresets.map(p => p.signature)
      };
    });
    expect(imported.txs).toHaveLength(2);
    const expense = imported.txs.find(t => t.type === 'expense');
    const income = imported.txs.find(t => t.type === 'income');
    expect(expense).toMatchObject({
      amount: 45.9, date: '2026-01-03', comment: 'SUPERMERCATO ROSSI', categoryId: ''
    });
    expect(income).toMatchObject({
      amount: 1850, date: '2026-01-05', comment: 'STIPENDIO', categoryId: ''
    });
    imported.txs.forEach(t => expect(t.importKey.startsWith('fp:')).toBe(true));
    expect(imported.presets).toEqual(['data|descrizione|importo']);

    // ── Second pass: same file again ───────────────────────────────────────
    await uploadBankCsv(page);

    // The saved preset is recognized and pre-applied for this layout.
    await expect(page.locator('#import-map')).toContainText('Recognized this layout');
    await expect(page.locator('#imap-col-date')).toHaveValue('0');

    await page.click('#btn-imap-continue');
    await page.waitForSelector('#import-preview');

    // Both rows are flagged as already imported: dimmed, badged, no checkbox.
    await expect(page.locator('.import-row')).toHaveCount(2);
    await expect(page.locator('.import-row-muted')).toHaveCount(2);
    await expect(page.locator('.import-row-check')).toHaveCount(0);
    await expect(page.locator('.import-row-badge')).toHaveCount(2);
    await expect(page.locator('.import-row-badge').first()).toHaveText('Already imported');
    await expect(page.locator('#import-preview'))
      .toContainText('2 rows already imported — they will be skipped.');

    // The confirm button reports 0 to import, and confirming imports nothing.
    await expect(page.locator('#iprev-selected-text')).toHaveText('0 transactions selected');
    await expect(page.locator('#btn-iprev-confirm')).toHaveText('Import 0 transactions');

    await page.click('#btn-iprev-confirm');
    expect(dialogs[dialogs.length - 1]).toBe('Select at least one transaction to import.');
    expect(await page.evaluate(() =>
      window.Store.getState().transactions.filter(t => t.importKey).length
    )).toBe(2);

    expect(errors).toEqual([]);
  });
});
