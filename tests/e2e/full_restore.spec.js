import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';

// v1.19 (A-17): back up through every Export button on Settings, wipe the app
// as if it were a new phone, and import each downloaded file through the one
// Import CSV button — the order a person would plausibly do it in, which is
// NOT the order that makes the job easy (transactions before accounts).
// tests/unit/fullRestore.test.js covers the logic and the orderings; this
// proves the buttons, the download, the routing and the result messages.
test.describe('Full restore E2E', () => {
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

  const goToSettings = async (page) => {
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#settings"]');
    await page.waitForSelector('#btn-import-csv');
  };

  const summary = (page) => page.evaluate(() => {
    const s = window.Store.getState();
    return s.accounts
      .map(a => ({ name: a.name, balance: window.Store.getAccountBalance(a.id), currency: a.currency, type: a.type, icon: a.icon }))
      .sort((x, y) => x.name.localeCompare(y.name));
  });

  test('every export button, a wiped app, every file back in', async ({ page }) => {
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
      const bank = S.getState().accounts.find(a => a.name === 'Main Bank');
      const card = S.getState().accounts.find(a => a.name === 'US Card');
      S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 40, accountId: bank.id, categoryId: 'cat_groceries', date: '2026-02-03' });
      S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 15, accountId: card.id, categoryId: 'cat_groceries', date: '2026-02-04' });
    });
    const before = await summary(page);
    expect(before.find(a => a.name === 'Main Bank').balance).toBe(960);
    expect(before.find(a => a.name === 'US Card').balance).toBe(-515);

    // ── Back up through the buttons ────────────────────────────────────────
    await goToSettings(page);
    const saved = {};
    for (const id of ['accounts', 'categories', 'transactions', 'loans', 'budgets', 'rules']) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click(`#btn-export-${id}`)
      ]);
      saved[id] = { name: download.suggestedFilename(), text: readFileSync(await download.path(), 'utf8') };
    }

    // ── New phone ──────────────────────────────────────────────────────────
    await freshInstall(page);
    expect(await page.evaluate(() => window.Store.getState().accounts.length)).toBe(0);
    await goToSettings(page);

    const importOne = async (file, expectedMessage) => {
      const n = dialogs.length;
      await page.setInputFiles('#import-csv-file', {
        name: file.name, mimeType: 'text/csv', buffer: Buffer.from(file.text, 'utf8')
      });
      await expect.poll(() => dialogs.length).toBe(n + 1);
      expect(dialogs[n]).toContain(expectedMessage);
      expect(page.url()).not.toContain('#import-map'); // restored, not sent to the bank mapping
    };
    await importOne(saved.transactions, 'Imported 2 transactions');
    await importOne(saved.loans, 'Imported 0 loans');
    await importOne(saved.rules, 'Imported 0');
    await importOne(saved.budgets, 'Imported 0 budgets');
    await importOne(saved.categories, 'Imported');
    await importOne(saved.accounts, 'Imported 2 accounts');

    expect(await summary(page)).toEqual(before);
    expect(errors).toEqual([]);
  });
});
