import { test, expect } from '@playwright/test';

// v1.03 match/link + transfer detection (docs/bank-import-plan.md §7): a bank
// row matching an existing manual entry defaults to LINK (the manual entry
// absorbs the importKey — no duplicate); a row mirroring an opposite entry in
// another account defaults to PAIR as a transfer (fresh shared transferRef).
test.describe('Import matching E2E flow', () => {
  const CSV = [
    'Data;Descrizione;Importo',
    '03/01/2026;SUPERMERCATO ROSSI;-45,90',   // matches the manual expense (±1 day)
    '05/01/2026;GIROCONTO USCITA;-200,00',    // mirrors the Savings income (±1 day)
    '10/01/2026;ACQUISTO NUOVO;-10,00'        // plain new row
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
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 0 });
      S.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0 });
      const accs = S.getState().accounts;
      const main = accs.find(a => a.name === 'Main').id;
      const savings = accs.find(a => a.name === 'Savings').id;
      S.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 45.9, accountId: main,
        categoryId: 'cat_groceries', date: '2026-01-02', comment: 'Groceries manual'
      });
      S.dispatch('ADD_TRANSACTION', {
        type: 'income', amount: 200, accountId: savings,
        categoryId: 'cat_salary', date: '2026-01-04', comment: 'Moved from checking'
      });
    });
  };

  const goToSettings = async (page) => {
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#settings"]');
    await page.waitForSelector('#btn-import-csv');
  };

  const uploadToPreview = async (page) => {
    await page.setInputFiles('#import-csv-file', {
      name: 'bank.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV)
    });
    await page.waitForSelector('#import-map');
    // the CSV flow imports into the first account (Main) by default
    await page.click('#btn-imap-continue');
    await page.waitForSelector('#import-preview');
  };

  test('links a matched row, pairs a transfer, imports the rest — then dedups', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });

    await bootstrap(page);
    await goToSettings(page);
    await uploadToPreview(page);

    // ── Suggestions render with their defaults ─────────────────────────────
    await expect(page.locator('.import-row-suggest')).toHaveCount(2);
    await expect(page.locator('#import-preview')).toContainText('Matches an existing entry: Groceries manual');
    await expect(page.locator('#import-preview')).toContainText('Looks like a transfer with Savings');
    await expect(page.locator('#import-preview')).toContainText('1 row matches an existing entry');
    await expect(page.locator('#import-preview')).toContainText('1 row looks like a transfer');

    const matchPill = page.locator('.import-row-action[data-kind="match"]');
    const pairPill = page.locator('.import-row-action[data-kind="transfer"]');
    await expect(matchPill).toHaveText('Link to existing');
    await expect(pairPill).toHaveText('Pair as transfer');

    // The pill cycles to "Import as new" and back without touching the checkbox.
    await matchPill.click();
    await expect(matchPill).toHaveText('Import as new');
    await matchPill.click();
    await expect(matchPill).toHaveText('Link to existing');
    await expect(page.locator('.import-row-check').first()).toBeChecked();

    // ── Confirm: 1 link + 1 pair + 1 plain insert ──────────────────────────
    await page.click('#btn-iprev-confirm');
    await page.waitForSelector('#btn-import-csv');

    const done = dialogs[dialogs.length - 1];
    expect(done).toContain('Imported 2 transactions'); // pair leg + plain row
    expect(done).toContain('Linked 1 row to an existing entry.');
    expect(done).toContain('Paired 1 row as a transfer.');

    const state = await page.evaluate(() => {
      const s = window.Store.getState();
      const manual = s.transactions.find(t => t.comment === 'Groceries manual');
      const savingsLeg = s.transactions.find(t => t.comment === 'Moved from checking');
      const bankLeg = s.transactions.find(t => t.comment === 'GIROCONTO USCITA');
      const plain = s.transactions.find(t => t.comment === 'ACQUISTO NUOVO');
      return {
        manualKey: manual && manual.importKey,
        manualCat: manual && manual.categoryId,
        savingsRef: savingsLeg && savingsLeg.transferRef,
        savingsCat: savingsLeg && savingsLeg.categoryId,
        bankRef: bankLeg && bankLeg.transferRef,
        bankCat: bankLeg && bankLeg.categoryId,
        plainKey: plain && plain.importKey,
        keyed: s.transactions.filter(t => t.importKey).length
      };
    });
    expect(state.manualKey).toBeTruthy();            // linked, not duplicated
    expect(state.manualCat).toBe('cat_groceries');   // category untouched by linking
    expect(state.savingsRef).toBeTruthy();
    expect(state.bankRef).toBe(state.savingsRef);    // shared transferRef
    expect(state.savingsCat).toBe('');               // both legs uncategorized
    expect(state.bankCat).toBe('');
    expect(state.plainKey).toBeTruthy();
    expect(state.keyed).toBe(3);                     // linked + pair leg + plain

    // ── Re-import: every row now dedups (incl. via the linked manual row) ──
    await uploadToPreview(page);
    await expect(page.locator('.import-row-muted')).toHaveCount(3);
    await expect(page.locator('.import-row-check')).toHaveCount(0);
    await expect(page.locator('#btn-iprev-confirm')).toHaveText('Import 0 transactions');
    expect(await page.evaluate(() =>
      window.Store.getState().transactions.filter(t => t.importKey).length
    )).toBe(3);

    expect(errors).toEqual([]);
  });
});
