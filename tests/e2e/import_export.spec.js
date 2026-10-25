import { test, expect } from '@playwright/test';
import fs from 'fs';

// 1.1.0 (IE-6, docs/import-export-plan.md §4): Settings → Import and export →
// Import. The text is pasted or read from a file, Check reads it, and a
// ledger/QIF file goes to Review, where nothing is written until Import.
const MONEYSTATS = [
  '"Conto";"Data";"Ammontare";"Valuta";"Saldo";"Valuta";"Titolo";"Ricevente";"Uso";"Categoria";"Commento";"Hashtags";"Ammontare";"Valuta";"Tasso di cambio";"Stato del pagamento";"Marchio"',
  '"Cash";"01/11/2021";"0,00";"EUR";"313,60";"EUR";"Saldo";"";"";"";"";"";"0,00";"EUR";"1,00";"pagato";""',
  '"Bank";"01/11/2021";"-25,33";"EUR";"0,00";"EUR";"Shopping";"";"";"Shopping";"Vetri";"";"-25,33";"EUR";"1,00";"pagato";""',
  '"Bank";"02/11/2021";"-12,00";"EUR";"0,00";"EUR";"Pizza";"";"";"Ristoranti";"";"";"-12,00";"EUR";"1,00";"pagato";""',
  '"Cash";"14/11/2021";"50,00";"EUR";"0,00";"EUR";"Trasferimento";"";"";"Trasferimento";"";"";"50,00";"EUR";"1,00";"pagato";""',
  '"Bank";"14/11/2021";"-50,00";"EUR";"0,00";"EUR";"Trasferimento";"";"";"Trasferimento";"";"";"-50,00";"EUR";"1,00";"pagato";""'
].join('\n');

async function boot(page, { account = true } = {}) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', '[]');
  });
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store);
  if (account) {
    await page.evaluate(() => {
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2020-01-01' });
    });
  }
}

async function toImport(page) {
  await page.click('#nav-fab-toggle');
  await page.click('a.menu-action-item[href="#settings"]');
  await page.click('#btn-open-import-export');
  await page.waitForSelector('#import-export-sheet');
  await page.click('#ie-sheet-import');
  await page.waitForSelector('#import-view');
}

const watch = (page) => {
  const errors = [];
  const dialogs = [];
  page.on('pageerror', err => errors.push(err));
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  return { errors, dialogs };
};

test.describe('Import screen (IE-6)', () => {
  test('a pasted MoneyStats file is reviewed, then imported once', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    await toImport(page);
    await expect(page.locator('#btn-import-check')).toBeDisabled();
    await page.fill('#import-text', MONEYSTATS);
    await page.click('#btn-import-check');
    await page.waitForSelector('#review-accounts');

    // Check wrote nothing.
    expect(await page.evaluate(() => window.Store.getState().accounts.length)).toBe(1);
    await expect(page.locator('#review-accounts .review-account')).toHaveCount(2);
    await expect(page.locator('#review-transfers')).toContainText('1');
    // "Ristoranti" is suggested as the built-in Dining category (owner Q2).
    const dining = await page.evaluate(() => window.Store.getState().categories.find(c => c.id === 'cat_dining').name);
    await expect(page.locator('select.review-cat[data-name="Ristoranti"]')).toHaveValue(dining);

    const label = await page.locator('#btn-import-confirm').textContent();
    const n = Number(label.match(/\d+/)[0]);
    expect(n).toBeGreaterThan(0);
    const before = await page.evaluate(() => window.Store.getState().transactions.length);
    await page.click('#btn-import-confirm');
    await page.waitForSelector('#import-result-modal');
    const after = await page.evaluate(() => ({
      tx: window.Store.getState().transactions.length,
      accounts: window.Store.getState().accounts.map(a => a.name).sort(),
      pizza: window.Store.getState().transactions.find(t => t.comment === 'Pizza')
    }));
    expect(after.accounts).toEqual(['Bank', 'Cash', 'Main']);
    expect(after.tx - before).toBeGreaterThanOrEqual(n);
    expect(after.pizza && after.pizza.categoryId).toBe('cat_dining');
    expect(await page.evaluate(() => location.hash)).toBe('#settings');

    // The same text again: nothing new, Import is disabled.
    await page.click('#modal-cancel-btn, #import-result-modal .modal-btn-close, #import-result-modal [data-back-dismiss]');
    await page.click('#btn-open-import-export');
    await page.click('#ie-sheet-import');
    await page.fill('#import-text', MONEYSTATS);
    await page.click('#btn-import-check');
    await page.waitForSelector('#btn-import-confirm');
    await expect(page.locator('#btn-import-confirm')).toBeDisabled();
    expect(w.dialogs).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  test('a Tab-separated bank file reaches the column-mapping screen with its columns', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    await toImport(page);
    await page.setInputFiles('#import-file-input', {
      name: 'bank.txt', mimeType: 'text/plain',
      buffer: Buffer.from('Date\tDescription\tAmount\n03/02/2026\tCoffee\t-3,50\n04/02/2026\tSalary\t1200,00\n')
    });
    await page.waitForSelector('#import-file-line');
    await page.click('#btn-import-check');
    await page.waitForSelector('#import-map');
    expect(await page.locator('#imap-col-date option').count()).toBeGreaterThanOrEqual(3);
    expect(await page.evaluate(() => window.Views._ImportShared.draft.fileName)).toBe('bank.txt');
    expect(w.errors).toEqual([]);
  });

  test('a CR-only bank file is read as separate rows', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    await toImport(page);
    await page.setInputFiles('#import-file-input', {
      name: 'bank.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Date;Description;Amount\r03/02/2026;Coffee;-3,50\r04/02/2026;Salary;1200,00\r')
    });
    await page.waitForSelector('#import-file-line');
    await page.click('#btn-import-check');
    await page.waitForSelector('#import-map');
    expect(await page.locator('#imap-col-date option').count()).toBeGreaterThanOrEqual(3);
    expect(w.errors).toEqual([]);
  });

  test('a bank file with no account yet explains why', async ({ page }) => {
    await boot(page, { account: false });
    await toImport(page);
    await page.fill('#import-text', 'Date;Description;Amount\n03/02/2026;Coffee;-3,50');
    await page.click('#btn-import-check');
    await expect(page.locator('#import-check-error')).toBeVisible();
    await expect(page.locator('#import-map')).toHaveCount(0);
  });

  test('unrecognised text shows an error and stays on Import', async ({ page }) => {
    await boot(page);
    await toImport(page);
    await page.fill('#import-text', 'hello');
    await page.click('#btn-import-check');
    await expect(page.locator('#import-check-error')).toBeVisible();
    await expect(page.locator('#import-view')).toHaveCount(1);
  });

  test('a Stack\'d accounts backup is restored from Review', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    await toImport(page);
    await page.fill('#import-text', 'id,name,opening_balance,created_at,currency,type,icon,color,opening_date\nacc_sv,Savings,0,,USD,savings,,,2024-01-01');
    await page.click('#btn-import-check');
    await page.waitForSelector('#import-review');
    await page.click('#btn-import-confirm');
    await page.waitForSelector('#import-result-modal');
    expect(await page.evaluate(() => window.Store.getState().accounts.map(a => a.name).sort())).toEqual(['Main', 'Savings']);
    expect(w.errors).toEqual([]);
  });

  test('the import settings sheet saves a factor and marks the button', async ({ page }) => {
    await boot(page);
    await toImport(page);
    await page.click('#btn-import-settings');
    await page.fill('#iset-factor', '-1');
    await page.click('#iset-save');
    await expect(page.locator('#btn-import-settings')).toContainText('·');
    expect(await page.evaluate(() => window.Views._ImportDraft.overrides.factor)).toBe(-1);
  });
});

// 1.1.0 (IE-7, plan §5a): Settings → Import and export → Export.
test.describe('Export screen (IE-7)', () => {
  async function toExport(page) {
    await page.click('#nav-fab-toggle');
    await page.click('a.menu-action-item[href="#settings"]');
    await page.click('#btn-open-import-export');
    await page.waitForSelector('#import-export-sheet');
    await page.click('#ie-sheet-export');
    await page.waitForSelector('#export-view');
  }
  async function seed(page) {
    await page.evaluate(() => {
      window.Store.dispatch('SET_LANGUAGE', 'it');
      const id = window.Store.getState().accounts[0].id;
      window.Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 12.5, accountId: id, categoryId: 'cat_dining', date: '2024-03-05', comment: 'Pizza' });
      window.Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 40, accountId: id, categoryId: 'cat_groceries', date: '2099-01-10', isPaid: false });
    });
  }

  test('the downloaded file is the previewed Italian ledger', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    await seed(page);
    await toExport(page);
    const preview = await page.locator('#export-preview').inputValue();
    expect(preview.split('\n')[0]).toBe('"Conto";"Data";"Ammontare";"Valuta";"Saldo";"Valuta";"Titolo";"Ricevente";"Uso";"Categoria";"Commento";"Hashtags";"Ammontare";"Valuta";"Tasso di cambio";"Stato del pagamento";"Marchio"');
    expect(preview).toContain('"Main";"05/03/2024";"-12,50";"USD"');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-file')]);
    expect(download.suggestedFilename()).toMatch(/^Stackd_export_\d{14}\.csv$/);
    const bytes = fs.readFileSync(await download.path());
    expect(bytes.slice(0, 3).toString('hex')).toBe('efbbbf'); // BOM on by default
    const text = bytes.slice(3).toString('utf8');
    expect(text.split('\r\n').join('\n')).toBe(preview);
    await page.waitForSelector('#export-done-modal');
    expect(w.errors).toEqual([]);
  });

  test('settings, format and period change the file', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    await seed(page);
    await toExport(page);
    await page.click('#export-settings');
    await page.selectOption('#eset-date', 'yyyy-MM-dd');
    await page.selectOption('#eset-decimal', 'dot');
    await page.click('label:has(#eset-quote)');
    await page.click('#eset-save');
    await expect(page.locator('#export-preview')).toHaveValue(/Main;2024-03-05;-12\.50;USD/);
    expect(await page.evaluate(() => window.Store.getExportPrefs().dateFormat)).toBe('yyyy-MM-dd');

    await page.click('#export-format');
    await page.click('.list-picker-item[data-value="txt"]');
    await expect(page.locator('#export-preview')).toHaveValue(/Main\t2024-03-05\t-12\.50\tUSD/);

    // Planned rows are in by default; the Period sheet drops them.
    await expect(page.locator('#export-preview')).toHaveValue(/2099-01-10/);
    await page.click('#export-period');
    await page.click('label:has(#eper-planned)');
    await page.click('#eper-save');
    await expect(page.locator('#export-preview')).not.toHaveValue(/2099-01-10/);
    await expect(page.locator('#export-preview')).toHaveValue(/2024-03-05/);
    expect(w.errors).toEqual([]);
  });

  test('an exported file imports back with nothing new', async ({ page }) => {
    await boot(page);
    await seed(page);
    await toExport(page);
    const full = await page.evaluate(() => window.StackdExport.buildLedger(window.Store.getState(), {}).text);
    await page.click('#export-close');
    await page.click('#btn-open-import-export');
    await page.click('#ie-sheet-import');
    await page.fill('#import-text', full);
    await page.click('#btn-import-check');
    await page.waitForSelector('#btn-import-confirm');
    await expect(page.locator('#btn-import-confirm')).toBeDisabled();
  });
});
