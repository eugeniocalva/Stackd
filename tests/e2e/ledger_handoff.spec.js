import { test, expect } from '@playwright/test';
// 1.1.0 (IE-5): the restore input lives on #backup, one tap from Settings.
const toBackup = async (page) => {
  if (await page.locator('#import-csv-file').count()) return;
  await page.click('#btn-open-backup');
  await page.waitForSelector('#btn-import-csv');
};

// 1.1.0 (IE-2, docs/import-export-plan.md §6a): the engine now recognises a
// MoneyStats export as a ledger file, but nothing from another app is written
// without the Review screen (IE-6). Until then a MoneyStats file picked on
// Settings must behave exactly as before: no rows written, the column-mapping
// screen opens.
test.describe('MoneyStats file on Settings (IE-2 hand-off)', () => {
  const MONEYSTATS = [
    '"Conto";"Data";"Ammontare";"Valuta";"Saldo";"Valuta";"Titolo";"Ricevente";"Uso";"Categoria";"Commento";"Hashtags";"Ammontare";"Valuta";"Tasso di cambio";"Stato del pagamento";"Marchio"',
    '"Cash";"01/11/2021";"0,00";"EUR";"313,60";"EUR";"Saldo";"";"";"";"";"";"0,00";"EUR";"1,00";"pagato";""',
    '"Bank";"01/11/2021";"-25,33";"EUR";"0,00";"EUR";"Shopping";"";"";"Shopping";"Vetri";"";"-25,33";"EUR";"1,00";"pagato";""',
    '"Cash";"14/11/2021";"50,00";"EUR";"0,00";"EUR";"Trasferimento";"";"";"Trasferimento";"";"";"50,00";"EUR";"1,00";"pagato";""',
    '"Bank";"14/11/2021";"-50,00";"EUR";"0,00";"EUR";"Trasferimento";"";"";"Trasferimento";"";"";"-50,00";"EUR";"1,00";"pagato";""'
  ].join('\n');

  test('opens the column-mapping screen and writes nothing', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });

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
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2020-01-01' });
    });

    await page.click('#nav-fab-toggle');
    await page.click('a.menu-action-item[href="#settings"]');
    await page.waitForSelector('#btn-open-backup');

    const before = await page.evaluate(() => ({
      tx: window.Store.getState().transactions.length,
      accounts: window.Store.getState().accounts.length
    }));
    await toBackup(page);
    await page.setInputFiles('#import-csv-file', {
      name: 'Export_MoneyStats.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(MONEYSTATS)
    });
    await page.waitForSelector('#import-map');

    const after = await page.evaluate(() => ({
      tx: window.Store.getState().transactions.length,
      accounts: window.Store.getState().accounts.length,
      draft: window.Views._ImportShared.draft && window.Views._ImportShared.draft.fileName
    }));
    expect(after.tx).toBe(before.tx);
    expect(after.accounts).toBe(before.accounts);
    expect(after.draft).toBe('Export_MoneyStats.csv');
    await expect(page.locator('#imap-col-date')).toHaveValue('1');
    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a Tab-separated MoneyStats file still fails as before on Settings', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
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
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2020-01-01' });
    });
    await page.click('#nav-fab-toggle');
    await page.click('a.menu-action-item[href="#settings"]');
    await page.waitForSelector('#btn-open-backup');

    await toBackup(page);
    await page.setInputFiles('#import-csv-file', {
      name: 'Export_MoneyStats.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(MONEYSTATS.replace(/"/g, '').replace(/;/g, '\t'))
    });
    await page.waitForSelector('#import-result-modal');
    await expect(page.locator('#import-result-modal-body')).toHaveText('unrecognised file');
    expect(await page.evaluate(() => window.Store.getState().transactions.length)).toBe(1); // the opening balance only
    await expect(page.locator('#import-map')).toHaveCount(0);
    expect(dialogs).toEqual([]);
  });
});
