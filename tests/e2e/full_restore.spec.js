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

    // 1.0.1 (BUG-21): each result is an in-app sheet (#import-result-modal),
    // not a system alert(). Dismiss it and wait for it to detach before the
    // next file, or a stale sheet would satisfy the next 'Imported' match.
    const importOne = async (file, expectedMessage) => {
      await page.setInputFiles('#import-csv-file', {
        name: file.name, mimeType: 'text/csv', buffer: Buffer.from(file.text, 'utf8')
      });
      const sheet = page.locator('#import-result-modal');
      await expect(sheet).toContainText(expectedMessage);
      await page.click('#import-result-modal-ok');
      await expect(sheet).toHaveCount(0);
      expect(page.url()).not.toContain('#import-map'); // restored, not sent to the bank mapping
    };
    await importOne(saved.transactions, 'Imported 2 transactions');
    await importOne(saved.loans, 'Imported 0 loans');
    await importOne(saved.rules, 'Imported 0');
    await importOne(saved.budgets, 'Imported 0 budgets');
    await importOne(saved.categories, 'Imported');
    await importOne(saved.accounts, 'Imported 2 accounts');

    expect(await summary(page)).toEqual(before);
    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
  });

  // ── 1.0.2 (BUG-30/31/32/33/78) ─────────────────────────────────────────────
  const backupThroughButtons = async (page, ids = ['accounts', 'transactions']) => {
    await goToSettings(page);
    const saved = {};
    for (const id of ids) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click(`#btn-export-${id}`)
      ]);
      saved[id] = { name: download.suggestedFilename(), text: readFileSync(await download.path(), 'utf8') };
    }
    return saved;
  };

  // Imports one file through the Settings button and returns the result
  // sheet's text, after dismissing it.
  const importThroughButton = async (page, file) => {
    await page.setInputFiles('#import-csv-file', {
      name: file.name, mimeType: 'text/csv', buffer: Buffer.from(file.text, 'utf8')
    });
    const sheet = page.locator('#import-result-modal');
    await expect(sheet).toBeVisible();
    const text = await sheet.innerText();
    await page.click('#import-result-modal-ok');
    await expect(sheet).toHaveCount(0);
    return text;
  };

  test('two wallets with the same name come back as two (BUG-30)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    await page.goto('/');
    await freshInstall(page);
    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Visa', type: 'Credit card', openingBalance: -300, openingDate: '2026-01-01' });
      S.dispatch('ADD_ACCOUNT', { name: 'Visa', type: 'Debit card', openingBalance: 1000, openingDate: '2026-01-01' });
      const credit = S.getState().accounts.find(a => a.type === 'Credit card');
      const debit = S.getState().accounts.find(a => a.type === 'Debit card');
      S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 45, accountId: credit.id, categoryId: 'cat_groceries', date: '2026-02-03' });
      S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 120, accountId: debit.id, categoryId: 'cat_groceries', date: '2026-02-05' });
    });
    const saved = await backupThroughButtons(page);

    await freshInstall(page);
    await goToSettings(page);
    await importThroughButton(page, saved.accounts);
    await importThroughButton(page, saved.transactions);

    const visas = await page.evaluate(() => window.Store.getState().accounts
      .filter(a => a.name === 'Visa')
      .map(a => ({ type: a.type, balance: window.Store.getAccountBalance(a.id) }))
      .sort((x, y) => x.balance - y.balance));
    expect(visas).toEqual([{ type: 'Credit card', balance: -345 }, { type: 'Debit card', balance: 880 }]);
    expect(errors).toEqual([]);
  });

  test('an EU spreadsheet file restores to the cent (BUG-31)', async ({ page }) => {
    await page.goto('/');
    await freshInstall(page);
    await goToSettings(page);
    const text = '\uFEFF' + [
      'Date;Type;Amount;Account;Category;Note',
      '03/01/2026;expense;12,50;Conto BPM;Spesa;Pane',
      '04/01/2026;expense;7,95;Conto BPM;Bar;Caffè',
      '05/01/2026;income;1.850,00;Conto BPM;Stipendio;Gennaio'
    ].join('\r\n');
    const sheet = await importThroughButton(page, { name: 'migration_eu.csv', text });
    expect(sheet).toContain('Imported 3 transactions');
    const total = await page.evaluate(() => {
      const a = window.Store.getState().accounts.find(x => x.name === 'Conto BPM');
      return Math.round(window.Store.getAccountBalance(a.id) * 100) / 100;
    });
    expect(total).toBe(1829.55);
  });

  test('multi-line bank notes survive a backup, and the statement still dedups (BUG-33, BUG-32)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    await page.goto('/');
    await freshInstall(page);
    // Rows as a camt import before 1.0.2 stored them: line breaks in the note.
    const statement = {
      format: 'camt', currency: 'EUR', openingBalance: null, closingBalance: null,
      entries: [
        { date: '2026-01-03', description: 'Supermercato\nRossi — Spesa', type: 'expense', amount: 54.3, bankRef: 'REF-001' },
        { date: '2026-01-04', description: 'Bolletta\nluce', type: 'expense', amount: 120, bankRef: 'REF-002' },
        { date: '2026-01-05', description: 'BONIFICO\nSTIPENDIO', type: 'income', amount: 1850, bankRef: '' }
      ]
    };
    await page.evaluate((st) => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 1000, openingDate: '2026-01-01' });
      const acc = S.getState().accounts[0];
      const { items } = window.StackdImport.buildStatementTransactions(st, acc.id);
      items.forEach((it, i) => { it.tx.comment = st.entries[i].description; });
      S.dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', { transactions: items.map(it => it.tx) });
      const bill = S.getState().transactions.find(t => t.amount === 120);
      S.dispatch('UPDATE_TRANSACTION', { ...bill, isPaid: false });
    }, statement);
    const before = await summary(page);
    const saved = await backupThroughButtons(page);
    expect(saved.transactions.text).toContain('"Supermercato\nRossi — Spesa"');

    await freshInstall(page);
    await goToSettings(page);
    const txSheet = await importThroughButton(page, saved.transactions);
    expect(txSheet).not.toContain('Skipped');
    await importThroughButton(page, saved.accounts);

    expect(await summary(page)).toEqual(before);
    const restored = await page.evaluate((st) => {
      const S = window.Store;
      const acc = S.getState().accounts.find(a => a.name === 'Main Bank');
      return {
        unpaid: S.getState().transactions.find(t => t.amount === 120).isPaid,
        note: S.getState().transactions.find(t => t.amount === 54.3).comment,
        reimport: window.StackdImport.buildStatementTransactions(st, acc.id).stats
      };
    }, statement);
    expect(restored.unpaid).toBe(false);
    expect(restored.note).toBe('Supermercato Rossi — Spesa');
    expect(restored.reimport).toMatchObject({ duplicates: 3, ok: 0 });
    expect(errors).toEqual([]);
  });

  test('the same transactions file twice adds nothing (BUG-78)', async ({ page }) => {
    await page.goto('/');
    await freshInstall(page);
    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 1000, openingDate: '2026-01-01' });
      const bank = S.getState().accounts[0];
      S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 40, accountId: bank.id, categoryId: 'cat_groceries', date: '2026-02-03' });
      S.dispatch('ADD_TRANSACTION', { type: 'income', amount: 120, accountId: bank.id, categoryId: 'cat_salary', date: '2026-02-10' });
    });
    const saved = await backupThroughButtons(page);

    await freshInstall(page);
    await goToSettings(page);
    await importThroughButton(page, saved.accounts);
    await importThroughButton(page, saved.transactions);
    const once = await summary(page);
    const count = () => page.evaluate(() => window.Store.getState().transactions.length);
    const n = await count();
    const sheet = await importThroughButton(page, saved.transactions);
    expect(sheet).toContain("already in Stack'd");
    expect(await summary(page)).toEqual(once);
    expect(await count()).toBe(n);
  });
});
