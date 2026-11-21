import { test, expect } from '@playwright/test';

// 1.3.1, part 2 (docs/deep-test-fixes-1.3.1-part2-plan.md): the five
// leftovers of the 1.3 deep test, each through the UI.
//  BUG-179  an opening balance cannot be deleted or selected in History
//  BUG-75   the loan's Track form says what it tracks and asks on a mismatch
//  BUG-188  a backup restore asks "Add what is missing" or "Replace everything"
//  BUG-216  tags keep their accents and spaces through an import
//  BUG-217  Review says what happens to rows dated after today

const boot = async (page, now = new Date(2026, 9, 25, 12, 0, 0)) => {
  await page.clock.install({ time: now });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', '[]');
    localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
  });
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store && !!window.Views && !!window.Router);
  await page.waitForSelector('#splash-screen', { state: 'detached' });
};

const watch = (page) => {
  const errors = [];
  const dialogs = [];
  page.on('pageerror', err => errors.push(err));
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  return { errors, dialogs };
};

const noModal = (page) => expect(page.locator('#active-modal')).toHaveCount(0);

test.describe('1.3.1 part 2', () => {
  test('BUG-179: History shows the opening balance by name, with no bin, and never selects it', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Checking', type: 'Bank', openingBalance: 2500, openingDate: '2026-10-01' });
      const acc = S.getState().accounts[0].id;
      S.dispatch('ADD_TRANSACTION', { accountId: acc, categoryId: 'cat_groceries', type: 'expense', amount: 40, date: '2026-10-05' });
      window.Router.navigate('#transactions');
    });
    await page.waitForSelector('#history-list .swipe-container');
    const opening = page.locator('#history-list .swipe-container[data-opening="1"]');
    await expect(opening).toHaveCount(1);
    await expect(opening.locator('.tx-item-title-text')).toHaveText('Opening balance');
    await expect(opening.locator('.swipe-action-btn.delete')).toHaveCount(0);
    await expect(opening.locator('.swipe-action-btn.edit')).toHaveCount(1);
    await expect(page.locator('#history-list .swipe-container:not([data-opening]) .swipe-action-btn.delete')).toHaveCount(1);

    // a long press on the opening balance selects nothing
    const ob = await opening.locator('.swipe-content').boundingBox();
    await page.mouse.move(ob.x + ob.width / 2, ob.y + ob.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    expect(await page.evaluate(() => window.Store.getState().isSelectionMode)).toBe(false);
    // (the release was a tap: it opened the read-only panel — go back)
    await page.evaluate(() => window.Router.navigate('#transactions'));
    await page.waitForSelector('#history-list .swipe-container');

    // a long press on the expense starts selecting; Select All leaves the opening balance out
    const ex = await page.locator('#history-list .swipe-container:not([data-opening]) .swipe-content').boundingBox();
    await page.mouse.move(ex.x + ex.width / 2, ex.y + ex.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await page.waitForSelector('#btn-toggle-select-all');
    await page.click('#btn-toggle-select-all');
    await page.click('#btn-toggle-select-all'); // select all again
    await expect(page.locator('#btn-bulk-delete-header')).toContainText('(1)');
    // a tap on the opening balance while selecting adds nothing
    await page.locator('#history-list .swipe-container[data-opening="1"] .swipe-content').click();
    await expect(page.locator('#btn-bulk-delete-header')).toContainText('(1)');
    await page.click('#btn-bulk-delete-header');
    await page.click('#modal-delete-btn');
    await noModal(page);
    const left = await page.evaluate(() => {
      const S = window.Store;
      return { types: S.getState().transactions.map(t => t.type), balance: S.getAccountBalance(S.getState().accounts[0].id) };
    });
    expect(left).toEqual({ types: ['opening_balance'], balance: 2500 });
    expect(w.errors).toEqual([]);
    expect(w.dialogs).toEqual([]);
  });

  test('BUG-75: the Track form names its loan, asks on another amount, and Go Back keeps the form', async ({ page }) => {
    const w = watch(page);
    await boot(page, new Date(2026, 8, 15, 12, 0, 0));
    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main Checking', type: 'Bank', openingBalance: 5000, openingDate: '2026-01-01' });
      S.dispatch('ADD_LOAN', { name: 'Car loan', kind: 'active',
        config: { type: 'personal', principal: 10000, downPayment: 0, duration: 5, durationUnit: 'years', annualRate: 5, firstPaymentDate: '2026-10-04', amortization: 'french' } });
      window.Router.navigate('#debt');
    });
    await page.waitForSelector('#debt-hub');
    await page.click('.debt-loan-item');
    await page.waitForSelector('#btn-dres-track');
    await page.click('#btn-dres-track');
    await expect(page.locator('#modal-title')).toHaveText('Track this payment?');
    await page.click('#modal-save-btn');
    await page.waitForSelector('#tx-amount');
    await expect(page.locator('#tx-amount')).toHaveValue('188.71');
    await expect(page.locator('#tx-loan-track')).toContainText('Tracks Car loan: €188.71 every month');

    await page.fill('#tx-amount', '100');
    await page.click('#btn-save-tx');
    await page.waitForSelector('#loan-track-mismatch');
    await expect(page.locator('#modal-title')).toHaveText('This does not match the loan');
    await expect(page.locator('#loan-track-mismatch')).toContainText('Car loan expects €188.71 every month.');
    await expect(page.locator('#loan-track-mismatch')).toContainText('Your entry: €100.00');
    await expect(page.locator('#loan-track-mismatch')).toContainText('Repeats every month');
    await expect(page.locator('#modal-cancel-btn')).toHaveText('Go Back');
    expect(await page.evaluate(() => window.Store.getState().transactions.filter(t => t.type === 'expense').length)).toBe(0);

    await page.click('#modal-cancel-btn');
    await noModal(page);
    await expect(page.locator('#tx-amount')).toHaveValue('100');
    await expect(page.locator('#tx-loan-track')).toBeVisible();

    await page.click('#btn-save-tx');
    await page.waitForSelector('#loan-track-mismatch');
    await page.click('#modal-save-btn');
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    const linked = await page.evaluate(() => {
      const st = window.Store.getState();
      const loan = st.loans[0];
      const txs = window.Store.getLoanLinkedTransactions(loan) || [];
      return { linked: !!loan.linkedSeriesId, n: txs.length, amount: txs[0] && txs[0].amount, pending: st.pendingLoanLink };
    });
    expect(linked.linked).toBe(true);
    expect(linked.n).toBeGreaterThan(1);
    expect(linked.amount).toBe(100);
    expect(linked.pending).toBeNull();
    expect(w.errors).toEqual([]);
    expect(w.dialogs).toEqual([]);
  });

  test('BUG-188: a backup restore asks first — Add keeps what is here, Replace goes back to the backup', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    const text = await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Savings', type: 'Bank', openingBalance: 9500, openingDate: '2026-01-01' });
      const acc = S.getState().accounts[0].id;
      S.dispatch('ADD_TRANSACTION', { accountId: acc, categoryId: 'cat_groceries', type: 'expense', amount: 12.34, date: '2026-10-03', comment: 'Vet' });
      S.dispatch('ADD_TRANSACTION', { accountId: acc, categoryId: 'cat_dining', type: 'expense', amount: 20, date: '2026-10-04', comment: 'Lunch' });
      const bundle = JSON.stringify(window.StackdBackup.buildBundle(S.getState()));
      // after the backup: a rename + new opening balance, an edited entry, a deleted one, a new one
      S.dispatch('UPDATE_ACCOUNT', { id: acc, name: 'Savings B', type: 'Bank', openingBalance: 90, openingDate: '2026-01-01' });
      const vet = S.getState().transactions.find(t => t.comment === 'Vet');
      S.dispatch('UPDATE_TRANSACTION', { id: vet.id, amount: 99 });
      S.dispatch('DELETE_TRANSACTION', { id: S.getState().transactions.find(t => t.comment === 'Lunch').id });
      S.dispatch('ADD_TRANSACTION', { accountId: acc, categoryId: 'cat_groceries', type: 'expense', amount: 5, date: '2026-10-20', comment: 'Later' });
      window.Router.navigate('#backup');
      return bundle;
    });
    await page.waitForSelector('#btn-import-csv');
    const file = { name: 'Stackd_backup_20261020_090000.json', mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') };
    const facts = () => page.evaluate(() => {
      const S = window.Store;
      const st = S.getState();
      return {
        accounts: st.accounts.map(a => a.name),
        balance: S.getAccountBalance(st.accounts[0].id),
        notes: st.transactions.filter(t => t.type === 'expense').map(t => t.comment + ' ' + t.amount).sort()
      };
    });

    // Add what is missing
    await page.setInputFiles('#import-csv-file', file);
    await page.waitForSelector('#restore-choice-sheet.open');
    await expect(page.locator('#restore-choice-sheet-step1')).toContainText('Stackd_backup_20261020_090000.json');
    await expect(page.locator('#restore-choice-sheet-step1')).toContainText('Transactions in this backup: 3');
    await expect(page.locator('#restore-choice-sheet-step1')).toContainText('Transactions here now: 3');
    await page.click('#restore-choice-add');
    await page.waitForSelector('#import-result-modal');
    await expect(page.locator('#import-result-modal')).toContainText('Backup restored');
    await expect(page.locator('#import-result-modal')).toContainText('2 items here differ from the backup and were kept.');
    expect(await facts()).toEqual({
      accounts: ['Savings B'],
      balance: 90 - 99 - 20 - 5,
      notes: ['Later 5', 'Lunch 20', 'Vet 99']
    });
    await page.click('#import-result-modal-ok');
    await expect(page.locator('#import-result-modal')).toHaveCount(0);

    // Replace everything: a confirm first, a copy of the current data, then the backup as it was
    await page.setInputFiles('#import-csv-file', file);
    await page.waitForSelector('#restore-choice-sheet.open');
    await page.click('#restore-choice-replace');
    await expect(page.locator('#restore-choice-sheet-step2')).toBeVisible();
    await expect(page.locator('#restore-choice-sheet-step2')).toContainText('A copy of the current data is saved first.');
    await expect(page.locator('#restore-replace-back')).toBeFocused();
    const download = page.waitForEvent('download');
    await page.click('#restore-replace-confirm');
    const copy = await download;
    expect(copy.suggestedFilename()).toMatch(/^Stackd_before_restore_\d{8}_\d{6}\.json$/);
    await page.waitForSelector('#import-result-modal');
    await expect(page.locator('#import-result-modal')).toContainText('Everything was replaced by the backup.');
    await expect(page.locator('#import-result-modal')).toContainText(copy.suggestedFilename());
    expect(await facts()).toEqual({
      accounts: ['Savings'],
      balance: 9500 - 12.34 - 20,
      notes: ['Lunch 20', 'Vet 12.34']
    });
    const log = await page.evaluate(() => window.Store.getState().backupLog.map(e => e.kind));
    expect(log).toContain('before');
    expect(w.errors).toEqual([]);
    expect(w.dialogs).toEqual([]);
  });

  test('BUG-216 / BUG-217: Review keeps café as written and says future rows are planned payments', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    await page.evaluate(() => {
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2020-01-01' });
    });
    const LEDGER = [
      '"Conto";"Data";"Ammontare";"Valuta";"Saldo";"Valuta";"Titolo";"Ricevente";"Uso";"Categoria";"Commento";"Hashtags";"Ammontare";"Valuta";"Tasso di cambio";"Stato del pagamento";"Marchio"',
      '"Main";"03/10/2026";"-4,50";"EUR";"0,00";"EUR";"Ristoranti";"";"";"Ristoranti";"";"café | pranzo lavoro";"-4,50";"EUR";"1,00";"pagato";""',
      '"Main";"24/12/2026";"-30,00";"EUR";"0,00";"EUR";"Regali";"";"";"Regali";"";"";"-30,00";"EUR";"1,00";"pagato";""'
    ].join('\n');
    await page.click('#nav-fab-toggle');
    await page.click('a.menu-action-item[href="#settings"]');
    await page.click('#btn-open-import-export');
    await page.waitForSelector('#import-export-sheet');
    await page.click('#ie-sheet-import');
    await page.waitForSelector('#import-view');
    await page.fill('#import-text', LEDGER);
    await page.click('#btn-import-check');
    await page.waitForSelector('#review-heads-up');
    await expect(page.locator('#review-heads-up')).toContainText('1 transaction is dated after today. It is imported as a planned payment and counts on its date.');
    await expect(page.locator('#review-heads-up')).not.toContainText('unpaid');
    await expect(page.locator('#review-heads-up')).not.toContainText('renamed');
    await page.click('#btn-import-confirm');
    await page.waitForSelector('#import-result-modal');
    const got = await page.evaluate(() => {
      const txs = window.Store.getState().transactions;
      return {
        tags: (txs.find(t => t.amount === 4.5) || {}).tags,
        futurePaid: (txs.find(t => t.amount === 30) || {}).isPaid !== false
      };
    });
    expect(got).toEqual({ tags: ['café', 'pranzo lavoro'], futurePaid: true });
    expect(w.errors).toEqual([]);
    expect(w.dialogs).toEqual([]);
  });
});
