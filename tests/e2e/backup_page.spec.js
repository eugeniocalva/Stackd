import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';

// 1.2.0 (UX-11, docs/ux-review-1.2-plan.md §E): the one-file backup on the
// web build. "Back up now" downloads ONE JSON bundle (format stackd-backup)
// holding the six backup CSV texts; a wiped install restores it through the
// same "Restore from a file" input, in one go, and lands the same ledger.
// tests/unit/backup.test.js covers the logic (one change, quota, daily run,
// destinations); this proves the page, the download and the restore sheet.
test.describe('Backup page E2E (1.2.0, UX-11)', () => {
  const freshInstall = async (page) => {
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
      localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store);
  };

  const goToBackup = async (page) => {
    await page.click('#nav-fab-toggle');
    await page.click('a.menu-action-item[href="#settings"]');
    await page.click('#btn-open-backup');
    await page.waitForSelector('#btn-backup-now');
  };

  const summary = (page) => page.evaluate(() => {
    const s = window.Store.getState();
    return {
      accounts: s.accounts
        .map(a => ({ name: a.name, balance: window.Store.getAccountBalance(a.id), currency: a.currency, type: a.type, icon: a.icon }))
        .sort((x, y) => x.name.localeCompare(y.name)),
      categories: s.categories.filter(c => !c.isDefault).map(c => c.name).sort(),
      transactions: s.transactions.length,
      budgets: s.budgets.filter(b => b.amount > 0).length,
      rules: s.importRules.length
    };
  });

  test('Back up now downloads a stackd-backup bundle; a wiped app restores it in one go', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });

    await page.goto('/');
    await freshInstall(page);
    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main Bank', type: 'Bank', icon: 'landmark', openingBalance: 1000, openingDate: '2026-01-01' });
      S.dispatch('ADD_ACCOUNT', { name: 'US Card', type: 'Card', icon: 'credit-card', currency: 'USD', openingBalance: -500, openingDate: '2026-01-15' });
      S.dispatch('ADD_CATEGORY', { name: 'Hobbies', icon: 'guitar', typeHint: 'expense' });
      const bank = S.getState().accounts.find(a => a.name === 'Main Bank');
      const card = S.getState().accounts.find(a => a.name === 'US Card');
      const hobbies = S.getState().categories.find(c => c.name === 'Hobbies');
      S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 40, accountId: bank.id, categoryId: 'cat_groceries', date: '2026-02-03' });
      S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 15, accountId: card.id, categoryId: hobbies.id, date: '2026-02-04' });
      S.dispatch('SAVE_BUDGET', { categoryId: hobbies.id, amount: 60, startDate: '2026-01', endDate: null, isCumulative: true });
      S.dispatch('ADD_IMPORT_RULE', { match: 'guitar shop', categoryId: hobbies.id });
    });
    const before = await summary(page);
    expect(before.accounts.find(a => a.name === 'Main Bank').balance).toBe(960);

    // ── Back up now: one JSON download ───────────────────────────────────
    await goToBackup(page);
    await expect(page.locator('#toggle-backup-daily')).toHaveCount(0); // web: download only
    await expect(page.locator('#backup-log-empty')).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#btn-backup-now')
    ]);
    const name = download.suggestedFilename();
    expect(name).toMatch(/^Stackd_backup_\d{8}_\d{6}\.json$/);
    const text = readFileSync(await download.path(), 'utf8');
    expect(text.charCodeAt(0)).not.toBe(0xFEFF);
    const bundle = JSON.parse(text);
    expect(bundle.format).toBe('stackd-backup');
    expect(bundle.version).toBe(1);
    expect(Object.keys(bundle.files)).toEqual(['accounts', 'categories', 'transactions', 'loans', 'budgets', 'importRules']);
    expect(bundle.files.transactions).toContain('Main Bank');

    const done = page.locator('#backup-result-modal');
    await expect(done).toContainText(name);
    await page.click('#backup-result-modal-ok');
    await expect(done).toHaveCount(0);
    await expect(page.locator('.backup-log-row')).toHaveCount(1);
    await expect(page.locator('.backup-log-row')).toContainText(name);

    // ── New phone ────────────────────────────────────────────────────────
    await freshInstall(page);
    expect(await page.evaluate(() => window.Store.getState().accounts.length)).toBe(0);
    await goToBackup(page);
    await page.setInputFiles('#import-csv-file', { name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
    const sheet = page.locator('#import-result-modal');
    await expect(sheet).toContainText('Backup restored');
    await expect(sheet).toContainText('Accounts: 2');
    await page.click('#import-result-modal-ok');
    await expect(sheet).toHaveCount(0);
    expect(page.url()).not.toContain('#import-map');

    expect(await summary(page)).toEqual(before);
    // The restore is in the log of the new install.
    await expect(page.locator('.backup-log-row')).toHaveCount(1);
    await expect(page.locator('.backup-log-row')).toContainText('Restore');

    // The same file again adds nothing.
    await page.setInputFiles('#import-csv-file', { name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
    await expect(sheet).toContainText('Backup restored');
    await page.click('#import-result-modal-ok');
    expect(await summary(page)).toEqual(before);

    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
  });
});
