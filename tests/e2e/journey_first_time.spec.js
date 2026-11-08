import { test, expect } from '@playwright/test';

// User journey B1 — Nora, first-time user (docs/user-journey/inventory.md).
// Steps N1–N15 driven through the real UI on a phone viewport, starting from
// an EMPTY install on the FREE plan (no setup_done, no Pro stub). Each test
// re-boots and replays the earlier steps through the same UI helpers, so the
// four groups stay independent.
test.describe('Journey B1 — Nora, first-time user', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // ── helpers (UI-driven; no Store.dispatch) ───────────────────────────────
  const bootEmpty = async (page) => {
    await page.goto('/');
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.Pro && !!window.Insights);
  };

  // N1 in one go: EUR, English, Get Started.
  const finishWelcome = async (page) => {
    await expect(page.locator('#active-modal')).toBeVisible();
    await page.click('#setup-row-currency');
    await page.locator('#setup-picker-sheet .setup-picker-opt[data-code="EUR"]').click();
    await expect(page.locator('#setup-currency-subtitle')).toHaveText('EUR — Euro');
    await page.click('#setup-row-language');
    await page.locator('#setup-picker-sheet .setup-picker-opt[data-code="en"]').click();
    await expect(page.locator('#setup-language-subtitle')).toHaveText('English');
    await page.click('#modal-save-btn');
    await expect(page.locator('#active-modal')).toBeHidden();
    await page.waitForSelector('#splash-screen', { state: 'detached' });
  };

  const openMenu = async (page) => {
    await page.click('#nav-fab-toggle');
    await expect(page.locator('#nav-fab-toggle')).toHaveAttribute('aria-expanded', 'true');
  };

  // The New Account form. `cents` is what you type into #edit-acc-balance
  // (digits-only, right-to-left decimal shift: '120000' → 1200.00).
  const createAccount = async (page, { name, type, cents, shown }) => {
    await expect(page.locator('#edit-acc-name')).toBeVisible();
    await page.fill('#edit-acc-name', name);
    await page.selectOption('#edit-acc-type', type);
    await page.fill('#edit-acc-balance', cents);
    await expect(page.locator('#edit-acc-balance')).toHaveValue(shown);
    await page.click('#btn-edit-acc-save');
    // Save leaves through Router.leave: Home may be the hash-less boot entry.
    await page.waitForFunction(() => window.Store.getState().activeView === 'dashboard');
    await expect(page.locator(`.wallet-card:has-text("${name}")`)).toBeVisible();
  };

  const createMainBank = async (page) => {
    await openMenu(page);
    await page.click('#nav-action-menu a[href="#edit-account"]');
    await createAccount(page, { name: 'Main Bank', type: 'Bank', cents: '120000', shown: '1200.00' });
  };

  // One expense through the New Log form, category picked in the sheet.
  const logExpense = async (page, { amount, categoryId, note }) => {
    await openMenu(page);
    await page.click('#nav-action-menu a[href="#add"]');
    await expect(page.locator('#btn-save-tx')).toBeVisible();
    await page.click('#toggle-expense');
    await page.fill('#tx-amount', amount);
    await page.click('#tx-category');
    await page.locator(`#csm-category-list .category-select-item[data-id="${categoryId}"]`).click();
    await expect(page.locator('#csm-category-list')).toHaveCount(0);
    if (note !== undefined) await page.fill('#tx-comment', note);
    await page.click('#btn-save-tx');
    await expect(page).toHaveURL(/#transactions$/);
  };

  // History's summary card has no ids: read the value under a label.
  const summaryValue = (page, label) => page.evaluate((lbl) => {
    const list = document.querySelector('#history-list');
    const cells = Array.from(list.querySelectorAll('div'));
    const labelEl = cells.find(d => d.children.length === 0 && d.textContent.trim() === lbl);
    return labelEl && labelEl.nextElementSibling ? labelEl.nextElementSibling.textContent.trim() : null;
  }, label);

  const todayYMD = (page) => page.evaluate(() => window.Store._todayYMD());

  const tabTo = async (page, view) => {
    await page.locator(`#bottom-nav a.nav-item[data-view="${view}"]`).click();
    await page.waitForFunction((v) => window.Store.getState().activeView === v, view);
  };

  // ── N1–N5 ────────────────────────────────────────────────────────────────
  test('N1–N5: Welcome sheet, empty Home, the quick-actions menu, the first account', async ({ page }) => {
    await bootEmpty(page);

    // N1 — the mandatory Welcome sheet.
    const sheet = page.locator('#active-modal');
    await expect(sheet).toBeVisible();
    await expect(page.locator('#modal-title')).toHaveText("Welcome to Stack'd 👋");
    await expect(page.locator('#setup-row-currency')).toBeVisible();
    await expect(page.locator('#setup-row-language')).toBeVisible();
    await expect(page.locator('#modal-save-btn')).toHaveText('Get Started');
    // A tap on the dimmed area above the sheet does not close it.
    await sheet.click({ position: { x: 20, y: 40 } });
    await expect(page.locator('#setup-row-currency')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('stackd_v1_setup_done'))).toBeNull();
    // Currency EUR, Language English, Get Started.
    await finishWelcome(page);
    expect(await page.evaluate(() => localStorage.getItem('stackd_v1_setup_done'))).toBe('1');
    expect(await page.evaluate(() => window.Store.getState().currency)).toBe('EUR');
    expect(await page.evaluate(() => window.Store.getState().language)).toBe('en');

    // N2 — Home, empty.
    await expect(page.locator('#dash-total')).toHaveText('€0.00');
    await expect(page.locator('.wallet-card')).toHaveCount(0);
    await expect(page.locator('#btn-dashboard-add-wallet')).toBeVisible();
    await expect(page.locator('#home-pager canvas').first()).toBeVisible();
    const latest = page.locator('.widget-card[data-widget-type="latest"]');
    await expect(latest).toHaveCount(1);
    await expect(latest.locator('.widget-card-title')).toHaveText('Latest transactions');
    await expect(latest.locator('.widget-empty')).toHaveText('No transactions yet');

    // N3 — the quick-actions menu.
    await openMenu(page);
    const items = page.locator('#nav-action-menu .menu-action-item');
    await expect(items).toHaveCount(5);
    await expect(items).toHaveText(['Add Log', 'Add Account', 'Debt', 'Add Category', 'Others & Settings']);
    await expect(page.locator('#nav-overlay')).toHaveCSS('opacity', '1');

    // N4 — New Account.
    await page.click('#nav-action-menu a[href="#edit-account"]');
    await expect(page.locator('h1.header-title')).toHaveText('New Account');
    await expect(page.locator('#btn-ob-pos')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#edit-acc-date')).toHaveValue(await todayYMD(page));
    await expect(page.locator('label[for="edit-acc-default"]')).toHaveText('Set as Default Wallet');
    await expect(page.locator('#btn-edit-acc-save')).toHaveText('Create Account');
    await createAccount(page, { name: 'Main Bank', type: 'Bank', cents: '120000', shown: '1200.00' });
    const card = page.locator('.wallet-card:has-text("Main Bank")');
    await expect(card.locator('.wallet-card-type')).toHaveText('Bank');
    await expect(card.locator('.wallet-card-balance')).toHaveText('€1,200.00');
    const { accounts, defaultAccountId } = await page.evaluate(() => {
      const s = window.Store.getState();
      return { accounts: s.accounts.map(a => ({ id: a.id, name: a.name, currency: a.currency })), defaultAccountId: s.defaultAccountId };
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0].currency).toBe('EUR');
    expect(defaultAccountId).toBe(accounts[0].id);

    // N5 — Home with one wallet.
    await expect(page.locator('#dash-total')).toHaveText('€1,200.00');
    await expect(page.locator('.wallet-card')).toHaveCount(1);
    await expect(page.locator('#home-pager canvas').first()).toBeVisible();
  });

  // ── N6–N9 ────────────────────────────────────────────────────────────────
  test('N6–N9: the first log, History, Edit Log, Home again', async ({ page }) => {
    await bootEmpty(page);
    await finishWelcome(page);
    await createMainBank(page);

    // N6 — New Log.
    await openMenu(page);
    await page.click('#nav-action-menu a[href="#add"]');
    await expect(page.locator('h1.header-title')).toHaveText('New Log');
    await expect(page.locator('#tx-account option:checked')).toHaveText('Main Bank');
    await page.click('#toggle-expense');
    await expect(page.locator('#tx-amount')).toHaveClass(/text-expense/);
    await page.fill('#tx-amount', '12.50');
    await page.click('#tx-category');
    await expect(page.locator('#csm-title')).toBeVisible();
    await page.locator('#csm-category-list .category-select-item[data-id="cat_groceries"]').click();
    await expect(page.locator('#tx-category')).toHaveValue('cat_groceries');
    await page.fill('#tx-comment', 'Weekly shop');
    await expect(page.locator('#btn-save-tx')).toHaveText('Save Transaction');
    await page.click('#btn-save-tx');
    await expect(page).toHaveURL(/#transactions$/);
    // History lists Main Bank's opening balance (dated today) as a row of its
    // own (A5: a read-only panel on tap), so the one LOG is the Groceries row.
    const allRows = page.locator('#history-list .list-item[data-id]');
    await expect(allRows).toHaveCount(2);
    const rows = page.locator('#history-list .list-item[data-id]', { has: page.locator('.tx-item-title-text', { hasText: /^Groceries$/ }) });
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator('.list-item-value')).toHaveText('-€12.50');
    await expect(rows.first().locator('.tx-item-account')).toHaveText('Main Bank');
    const openingRow = page.locator('#history-list .list-item[data-id]', { hasNot: page.locator('.tx-item-title-text', { hasText: /^Groceries$/ }) });
    await expect(openingRow.locator('.list-item-value')).toHaveText('+€1,200.00');
    const saved = await page.evaluate(() => {
      const s = window.Store.getState();
      const tx = s.transactions.find(t => t.type === 'expense');
      return { note: tx.comment, amount: tx.amount, categoryId: tx.categoryId, balance: window.Store.getAccountBalance(tx.accountId) };
    });
    expect(saved.note).toBe('Weekly shop');
    expect(saved.amount).toBe(12.5);
    expect(saved.categoryId).toBe('cat_groceries');
    expect(saved.balance).toBeCloseTo(1187.5, 2);

    // N7 — History.
    const today = await todayYMD(page);
    const dayLabel = await page.evaluate((d) => new Date(d + 'T00:00:00').toLocaleDateString(window.Store.getLocale(), { weekday: 'short', month: 'short', day: 'numeric' }), today);
    const group = page.locator(`#history-list #tx-${today}`);
    await expect(group).toHaveCount(1);
    await expect(group.locator('.date-group-header')).toHaveText(dayLabel);
    await expect(rows.first().locator('.list-item-value')).toHaveClass(/tx-amt-expense/);
    await expect(group.locator('.day-summary-footer')).toBeVisible();
    // The day sum and the Start / End / Net Change figures the inventory
    // expects are asserted in their own test below (N7 figures).

    // N8 — Edit Log.
    await rows.first().click();
    await expect(page).toHaveURL(/#edit\?id=/);
    await expect(page.locator('h1.header-title')).toHaveText('Edit Log');
    await expect(page.locator('#btn-delete-tx')).toHaveText('Delete Transaction');
    await expect(page.locator('#tx-comment')).toHaveValue('Weekly shop');
    await page.fill('#tx-comment', 'Weekly shop · Esselunga');
    await expect(page.locator('#btn-save-tx')).toHaveText('Update Transaction');
    await page.click('#btn-save-tx');
    await expect(page).toHaveURL(/#transactions$/);
    await expect(rows).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.Store.getState().transactions.find(t => t.type === 'expense').comment)).toBe('Weekly shop · Esselunga');

    // N9 — Home.
    await tabTo(page, 'dashboard');
    await expect(page.locator('#dash-total')).toHaveText('€1,187.50');
    await expect(page.locator('.wallet-card:has-text("Main Bank") .wallet-card-balance')).toHaveText('€1,187.50');
    const latest = page.locator('.widget-card[data-widget-type="latest"]');
    await expect(latest.locator('.widget-row')).toHaveCount(1);
    await expect(latest.locator('.widget-row-title')).toHaveText('Groceries');
    await expect(latest.locator('.widget-row-value')).toHaveText('-€12.50');
    await expect(page.locator('#home-pager canvas').first()).toBeVisible();
  });

  // N7's figures. Main Bank's opening balance is dated today as well, so it
  // is a row of this period: History lists it ("Adjustment +€1,200.00"), the
  // day sum includes it and Start is the balance before the period, €0.00.
  // The aggregate rule as documented; a design question for the journey page.
  test('N7 (figures): the day sum and Start / End / Net Change with the opening balance dated today', async ({ page }) => {
    await bootEmpty(page);
    await finishWelcome(page);
    await createMainBank(page);
    await logExpense(page, { amount: '12.50', categoryId: 'cat_groceries', note: 'Weekly shop' });
    const today = await todayYMD(page);
    const group = page.locator(`#history-list #tx-${today}`);
    await expect(group.locator('.day-summary-footer')).toBeVisible();
    const seen = {
      daySum: (await group.locator('.day-summary-footer').textContent()).trim(),
      start: await summaryValue(page, 'Start'),
      end: await summaryValue(page, 'End'),
      net: await summaryValue(page, 'Net Change')
    };
    expect(seen).toEqual({ daySum: 'sum: €1,187.50', start: '€0.00', end: '€1,187.50', net: '+€1,187.50' });
    await expect(group.locator('.swipe-content')).toHaveCount(2); // the opening balance row and the Groceries row
  });

  // ── N10–N11 ──────────────────────────────────────────────────────────────
  test('N10–N11: a Groceries limit in Goals, the second wallet', async ({ page }) => {
    await bootEmpty(page);
    await finishWelcome(page);
    await createMainBank(page);
    await logExpense(page, { amount: '12.50', categoryId: 'cat_groceries', note: 'Weekly shop' });

    // N10 — Goals: the limit editor, then the ring and the row.
    // The tab is "Goals" (nav.goals); the page's own title reads "Budget"
    // (budget.title) — noted in the journey report, not asserted here.
    await expect(page.locator('#bottom-nav a.nav-item[data-view="budget"]')).toHaveAttribute('aria-label', 'Goals');
    await tabTo(page, 'budget');
    await expect(page.locator('.page-header-title')).toBeVisible();
    const groceriesRow = page.locator('.budget-cat-row[data-id="cat_groceries"]');
    await expect(groceriesRow).toContainText('Groceries');
    await groceriesRow.click();
    await expect(page.locator('#bdg-amount')).toBeVisible();
    await expect(page.locator('label[for="bdg-amount"]')).toHaveText('Monthly Limit');
    await page.fill('#bdg-amount', '300');
    await page.click('#btn-bdg-save');
    await expect(page.locator('#bdg-amount')).toHaveCount(0);
    await expect(page.locator('#budget-summary-card .donut-total-label')).toHaveText('Allocated');
    await expect(page.locator('#budget-summary-card .donut-total-value')).toHaveText('€300.00');
    await expect(groceriesRow.locator('.list-item-subtitle')).toHaveText('€12.50 of €300.00');
    await expect(page.locator('#budget-summary-card')).toContainText('Total Spent');
    await expect(page.locator('#budget-summary-card')).toContainText('€12.50');
    await expect(page.locator('#budget-summary-card')).toContainText('Remaining');
    await expect(page.locator('#budget-summary-card')).toContainText('€287.50');
    expect(await page.evaluate(() => window.Store.getState().budgets.map(b => [b.categoryId, b.amount]))).toEqual([['cat_groceries', 300]]);

    // N11 — the second account from Home's Add Wallet tile.
    await tabTo(page, 'dashboard');
    await page.click('#btn-dashboard-add-wallet');
    await createAccount(page, { name: 'Cash', type: 'Cash', cents: '8000', shown: '80.00' });
    await expect(page.locator('.wallet-card')).toHaveCount(2);
    await expect(page.locator('.wallet-card .wallet-card-name')).toHaveText(['Main Bank', 'Cash']);
    await expect(page.locator('.wallet-card:has-text("Cash") .wallet-card-balance')).toHaveText('€80.00');
    await expect(page.locator('#dash-total')).toHaveText('€1,267.50');
  });

  // ── N12–N15 ──────────────────────────────────────────────────────────────
  const reachTwoWallets = async (page) => {
    await bootEmpty(page);
    await finishWelcome(page);
    await createMainBank(page);
    await logExpense(page, { amount: '12.50', categoryId: 'cat_groceries', note: 'Weekly shop' });
    await tabTo(page, 'dashboard');
    await page.click('#btn-dashboard-add-wallet');
    await createAccount(page, { name: 'Cash', type: 'Cash', cents: '8000', shown: '80.00' });
  };

  test('N12–N13, N15: the free-plan lock on a third wallet, In-app purchases, Others & Settings', async ({ page }) => {
    await reachTwoWallets(page);

    // N12 — Account limit reached (no form).
    await page.click('#btn-dashboard-add-wallet');
    const lock = page.locator('#pro-locked[data-feature="accounts"]');
    await expect(lock).toBeVisible();
    await expect(lock.locator('h2')).toHaveText('Account limit reached');
    await expect(lock).toContainText("The free plan includes 2 accounts. Unlock Stack'd Pro once to add as many as you need.");
    await expect(page.locator('#pro-locked-cta')).toHaveText("See Stack'd Pro");
    await expect(page.locator('#edit-acc-name')).toHaveCount(0);
    await expect(page.locator('#btn-edit-acc-save')).toHaveCount(0);

    // N13 — In-app purchases, one-time tab.
    await page.click('#pro-locked-cta');
    await expect(page).toHaveURL(/#purchases$/);
    await expect(page.locator('#purchases-panel')).toHaveAttribute('data-tab', 'once');
    await expect(page.locator('#pro-card')).toContainText("Stack'd Pro");
    await expect(page.locator('#pro-card')).toContainText('The free plan includes 2 accounts and the default categories.');
    // With a reachable store: the price button + Restore purchase. The web
    // build has no store, so the card says purchases live in the mobile app.
    // Redeem a code is a store-UI entry too (native only).
    const buy = page.locator('#pro-buy-btn');
    if (await buy.count()) {
      await expect(buy).toHaveText(/^(Unlock for .+|Unlock Stack'd Pro)$/);
      await expect(page.locator('#pro-restore-btn')).toHaveText('Restore purchase');
      await expect(page.locator('#redeem-code-btn')).toHaveText('Redeem a code');
    } else {
      await expect(page.locator('#pro-web-note')).toHaveText('Purchases are available in the mobile app.');
      await expect(page.locator('#pro-restore-btn, #redeem-code-btn')).toHaveCount(0);
    }
    await expect(page.locator('#pro-once-terms-link')).toHaveText('Terms of Use');
    await expect(page.locator('#pro-once-privacy-link')).toHaveText('Privacy Policy');

    // N15 — Others & Settings from the menu.
    await tabTo(page, 'dashboard');
    await openMenu(page);
    await page.click('#nav-action-menu a[href="#settings"]');
    await expect(page).toHaveURL(/#settings$/);
    await expect(page.locator('h1.header-title')).toHaveText('Others');
    await expect(page.locator('#btn-manage-accounts .list-item-subtitle')).toHaveText('2 accounts');
    await expect(page.locator('a[href="#categories"] .list-item-subtitle')).toHaveText('14 categories');
    await expect(page.locator('#purchases-settings-subtitle')).toHaveText('Free plan — up to 2 accounts and the default categories');
    const sections = page.locator('#router-view .section-title');
    for (const title of ['Manage', 'In-app purchases', 'Region Setting', 'Tab bar', 'Privacy', 'Appearance', 'Data', 'Support', 'Danger Zone']) {
      await expect(sections.filter({ hasText: new RegExp(`^${title}$`) }), `section "${title}"`).toHaveCount(1);
    }
  });

  test('N14: the Smart Insights starter card, and its button opens New Log', async ({ page }) => {
    await reachTwoWallets(page);
    await tabTo(page, 'insights');
    await expect(page.locator('#insights-page h1')).toHaveText('Smart Insights');
    const starter = page.locator('#insights-starter');
    await expect(starter).toBeVisible();
    await expect(starter.locator('.insight-eyebrow')).toHaveText('Getting started');
    await expect(starter.locator('.insight-head')).toHaveText('Log a few days of spending to unlock insights');
    await expect(starter.locator('a.insight-starter-btn')).toHaveText('Add a transaction');
    await starter.locator('a.insight-starter-btn').click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'add');
    await expect(page.locator('h1.header-title')).toHaveText('New Log');
  });

  // The starter card counts to Insights.STARTER_ROWS (5) entries.
  test('N14 (count): the starter card says "1 of 5 entries so far"', async ({ page }) => {
    await reachTwoWallets(page);
    await tabTo(page, 'insights');
    await expect(page.locator('#insights-starter .insight-body')).toHaveText('1 of 5 entries so far.');
  });
});
