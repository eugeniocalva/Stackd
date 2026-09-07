import { test, expect } from '@playwright/test';

// v1.05 Bank Connect, phase B2 (docs/bank-connect-ux-plan.md §3.1–§3.5, §3.9):
// Settings → Online banking hub → consent toggle → disclosure → bank picker →
// paywall → (stub) purchase → connect start. The broker is replaced by
// window.__STACKD_BROKER_STUB__ (installed before any app script runs), so
// nothing here touches the network. The App-Link return + mapping are B3.
test.describe('Bank Connect (B2) E2E flow', () => {
  const installStub = () => {
    window.__STACKD_BROKER_STUB__ = {
      calls: [],
      opened: null,
      prices: { monthly: { price: '€2.99' }, yearly: { price: '€29.99', perMonth: '€2.50' } },
      linked: false,
      async request(path, opts) {
        this.calls.push({ path, opts });
        if (path.startsWith('/v1/institutions')) {
          return [
            { id: 'TEST_BANK', name: 'Test Bank', logo: '', transaction_total_days: 730, max_access_valid_for_days: 180 },
            { id: 'OTHER_BANK', name: 'Other Savings', logo: '', transaction_total_days: 90, max_access_valid_for_days: 90 }
          ];
        }
        if (path === '/v1/entitlement/verify') return { ownerId: 'owner_abcdefgh', deviceToken: 'stub.devicetoken', active: true, expiresAt: null };
        if (path === '/v1/connect/start') return { ref: 'req_e2e', bankRedirectUrl: 'https://bank.example/sca' };
        // v1.07 B3: the bank confirmed → the broker's connection record
        const connection = {
          ref: 'req_e2e', status: this.linked ? 'LN' : 'CR', institutionId: 'TEST_BANK', institutionName: 'Test Bank', institutionLogo: '',
          accounts: this.linked ? [
            { id: 'acc_1', ibanTail: '1234', currency: 'USD', name: 'Current' },
            { id: 'acc_2', ibanTail: '', currency: 'EUR', name: 'Savings' }
          ] : [],
          historyDays: 90, validityDays: 180, createdAt: '2026-09-07T10:00:00.000Z', linkedAt: this.linked ? '2026-09-07T10:01:00.000Z' : null,
          expiresAt: this.linked ? new Date(Date.now() + 180 * 86400000).toISOString() : null, lastError: null
        };
        if (path.startsWith('/v1/connect/status')) return connection;
        if (path === '/v1/connections') return { connections: this.linked ? [connection] : [] };
        if (path === '/v1/accounts/acc_1/balances') return { balances: [{ balance_amount: { amount: '2804.10', currency: 'USD' }, balance_type: 'CLBD', reference_date: '2026-09-06' }] };
        if (path === '/v1/connections/req_e2e' && (opts || {}).method === 'DELETE') { this.linked = false; return { ok: true, ref: 'req_e2e' }; }
        if (path.startsWith('/v1/accounts/acc_1/transactions')) {
          return { transactions: [
            { entry_reference: 'e1', booking_date: '2026-08-20', status: 'BOOK', credit_debit_indicator: 'DBIT', transaction_amount: { amount: '45.90', currency: 'USD' }, creditor: { name: 'SUPERMERCATO ROSSI' }, remittance_information: ['Card purchase'] },
            { entry_reference: 'e2', booking_date: '2026-08-27', status: 'BOOK', credit_debit_indicator: 'CRDT', transaction_amount: { amount: '1850.00', currency: 'USD' }, debtor: { name: 'ACME' }, remittance_information: ['Salary'] },
            { booking_date: '2026-09-06', status: 'PDNG', credit_debit_indicator: 'DBIT', transaction_amount: { amount: '9.99', currency: 'USD' } }
          ], truncated: false };
        }
        throw new Error('unexpected broker path ' + path);
      },
      async purchase(plan) {
        this.purchased = plan;
        return { active: true, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), ownerId: 'owner_abcdefgh' };
      },
      async restore() { return null; },
      async openSca(url) { this.opened = url; }
    };
  };

  const bootstrap = async (page) => {
    await page.addInitScript(installStub);
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.BankConnect);
    // v1.07 B3: mapping needs a same-currency target (the app default is USD).
    await page.evaluate(() => {
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2020-01-01' });
    });
  };

  const openHub = async (page) => {
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#settings"]');
    await page.waitForSelector('#btn-open-bank-connect');
    await page.click('#btn-open-bank-connect');
    await page.waitForSelector('#bank-connect');
  };

  test('consent toggle → disclosure → picker → paywall → purchase → connect start', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });

    await bootstrap(page);
    await openHub(page);

    // Off by default: explainer + disabled CTA, and the stub was never called.
    await expect(page.locator('#bank-explainer')).toBeVisible();
    await expect(page.locator('#bank-add')).toBeDisabled();
    expect(await page.evaluate(() => window.__STACKD_BROKER_STUB__.calls.length)).toBe(0);

    // "Not now" reverts the toggle without persisting anything.
    await page.click('label.toggle-switch');
    await page.waitForSelector('#bank-disclosure-modal.open');
    await page.click('#bank-disclosure-decline');
    await expect(page.locator('#bank-toggle')).not.toBeChecked();
    expect(await page.evaluate(() => window.Store.getState().bankConnect.enabled)).toBe(false);

    // Accepting records consent and enables the feature.
    await page.click('label.toggle-switch');
    await page.waitForSelector('#bank-disclosure-modal.open');
    await page.click('#bank-disclosure-accept');
    await expect(page.locator('#bank-empty')).toBeVisible();
    await expect(page.locator('#bank-add')).toBeEnabled();
    const prefs = await page.evaluate(() => window.Store.getState().bankConnect);
    expect(prefs.enabled).toBe(true);
    expect(prefs.consentAt).toBeTruthy();
    expect(prefs.consentVersion).toBeTruthy();

    // Picker: institutions load through the stub only after the toggle.
    await page.click('#bank-add');
    await page.waitForSelector('#bank-picker');
    await page.waitForSelector('.bank-inst-row');
    await expect(page.locator('.bank-inst-row')).toHaveCount(2);
    await expect(page.locator('#bank-connect-cta')).toBeDisabled();

    await page.fill('#bank-search', 'other');
    await expect(page.locator('.bank-inst-row')).toHaveCount(1);
    await page.fill('#bank-search', '');
    await page.click('.bank-inst-row[data-id="TEST_BANK"]');
    await expect(page.locator('#bank-connect-cta')).toBeEnabled();
    await expect(page.locator('#bank-connect-cta')).toHaveText('Connect Test Bank');

    // Not entitled → paywall names the bank; nothing was sent to connect/start.
    await page.click('#bank-connect-cta');
    await page.waitForSelector('#bank-paywall.open');
    await expect(page.locator('#bank-paywall-bank')).toHaveText('Works with Test Bank');
    await expect(page.locator('#bank-paywall-plans')).toBeVisible();
    expect(await page.evaluate(() => window.__STACKD_BROKER_STUB__.calls.some(c => c.path === '/v1/connect/start'))).toBe(false);

    // Stub purchase → entitlement cached → the connect leg starts at once.
    await page.click('.bank-plan[data-plan="monthly"]');
    await page.click('#bank-paywall-subscribe');
    await page.waitForFunction(() => window.__STACKD_BROKER_STUB__.opened === 'https://bank.example/sca');
    const after = await page.evaluate(() => ({
      purchased: window.__STACKD_BROKER_STUB__.purchased,
      start: window.__STACKD_BROKER_STUB__.calls.find(c => c.path === '/v1/connect/start').opts.body,
      prefs: window.Store.getState().bankConnect
    }));
    expect(after.purchased).toBe('monthly');
    expect(after.start).toEqual({ country: 'GB', institutionId: 'TEST_BANK', historyDays: 90, validityDays: 180 });
    expect(after.prefs.entitlement.active).toBe(true);
    expect(after.prefs.pendingRef).toBe('req_e2e');
    expect(after.prefs.ownerId).toBe('owner_abcdefgh');
    await expect(page.locator('#bank-paywall')).toHaveCount(0);

    // ── v1.07 B3: the bank confirms → return → mapping → first fetch ──────
    await page.evaluate(() => { window.__STACKD_BROKER_STUB__.linked = true; });
    await page.evaluate(() => window.BankConnect.handleReturn('stackd://connect/return?ref=req_e2e'));
    await page.waitForSelector('#bank-map');
    await expect(page.locator('.bank-map-row')).toHaveCount(2);
    const mainId = await page.evaluate(() => window.Store.getState().accounts.find(a => a.name === 'Main').id);
    await expect(page.locator('#bank-map-sel-0')).toHaveValue(mainId); // USD → the existing USD account
    await expect(page.locator('#bank-map-sel-1')).toHaveValue('new');  // EUR → nothing matches → Create
    expect(await page.evaluate(() => window.Store.getState().bankConnect.pendingRef)).toBeNull();
    await page.selectOption('#bank-map-sel-1', 'skip');
    await page.click('#bank-map-import');

    // The fetch lands in the statement details step, then the usual preview.
    await page.waitForSelector('#import-map');
    await expect(page.locator('#import-map')).toContainText('Online banking');
    await expect(page.locator('#import-map')).toContainText('Test Bank •••• 1234');
    await page.click('#btn-imap-continue');
    await page.waitForSelector('#import-preview');
    await expect(page.locator('.import-row')).toHaveCount(2); // the pending row is dropped (D-C4)
    await expect(page.locator('.import-row').nth(0)).toContainText('SUPERMERCATO ROSSI');
    await page.click('#btn-iprev-confirm');
    await page.waitForSelector('#import-success-modal.open');
    await expect(page.locator('#import-success-imported')).toContainText('Imported 2 transactions into Main');
    await expect(page.locator('#import-success-verdict')).toHaveAttribute('data-ok', 'true'); // 1000 − 45.90 + 1850 = 2804.10
    await page.click('#import-success-done');

    const imported = await page.evaluate(() => {
      const s = window.Store.getState();
      return {
        keys: s.transactions.filter(t => t.importKey).map(t => t.importKey).sort(),
        conn: s.bankConnections[0]
      };
    });
    // importKeys are account-scoped bank references: ref:<accountId>|<entry_reference>
    expect(imported.keys).toHaveLength(2);
    expect(imported.keys[0]).toBe(`ref:${mainId}|e1`);
    expect(imported.keys[1]).toBe(`ref:${mainId}|e2`);
    expect(imported.conn.accounts[0].stackdAccountId).toBe(mainId);
    expect(imported.conn.accounts[1].stackdAccountId).toBeNull();
    expect(imported.conn.lastFetchAt).toBeTruthy();

    // The hub card: synced line, Import on the mapped account, Link on the other.
    await page.evaluate(() => { location.hash = '#bank-connect'; });
    await page.waitForSelector('.bank-conn-card[data-ref="req_e2e"]');
    await expect(page.locator('.bank-conn-card')).toContainText('Last synced');
    await expect(page.locator('.bank-acc-import')).toHaveCount(1);
    await expect(page.locator('.bank-acc-link')).toHaveCount(1);
    await expect(page.locator('.bank-chip-active')).toBeVisible();

    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
  });

  // v1.08 B4: a linked device comes back — background refresh → insight →
  // Review → import; Refresh now; Manage → Disconnect.
  test('refresh lifecycle: background fetch → insight → review, Refresh now, disconnect', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });

    await bootstrap(page);
    await page.evaluate(() => {
      window.__STACKD_BROKER_STUB__.linked = true;
      localStorage.setItem('stackd_device_token', 'stub.devicetoken');
      const mainId = window.Store.getState().accounts.find(a => a.name === 'Main').id;
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true, consentAt: new Date().toISOString(), consentVersion: window.BankConnect.termsVersion(), entitlement: { active: true, expiresAt: null } });
      window.Store.dispatch('ADD_BANK_CONNECTION', {
        ref: 'req_e2e', institutionId: 'TEST_BANK', institutionName: 'Test Bank', logo: null,
        accounts: [{ bankAccountId: 'acc_1', stackdAccountId: mainId, ibanTail: '1234', currency: 'USD', name: 'Current' }],
        connectedAt: '2026-09-01T00:00:00.000Z', lastFetchAt: null, expiresAt: new Date(Date.now() + 100 * 86400000).toISOString(), historyLimitDays: 90, status: 'LN'
      });
    });

    // Background refresh (what refreshOnOpen does after boot) → the dashboard insight.
    const r = await page.evaluate(() => window.BankConnect.refreshDue(window.Store.getState()));
    expect(r).toEqual({ fetched: 1, newTotal: 2, failed: 0 });
    await page.evaluate(() => { location.hash = '#dashboard'; });
    await page.waitForSelector('.insight-card[data-insight="bankNew"]');
    await expect(page.locator('.insight-card[data-insight="bankNew"]')).toContainText('new transactions from');
    await expect(page.locator('.insight-card[data-insight="bankNew"] .insight-value')).toHaveText('2');
    await page.click('.insight-card[data-insight="bankNew"]');
    await page.waitForSelector('#bank-connect');
    await expect(page.locator('.bank-new-badge')).toHaveText('2 new');
    await expect(page.locator('.bank-acc-review')).toHaveText('Review 2 new');

    // Review → the cached statement lands in the pipeline (no second fetch).
    const callsBefore = await page.evaluate(() => window.__STACKD_BROKER_STUB__.calls.length);
    await page.click('.bank-acc-review');
    await page.waitForSelector('#import-map');
    expect(await page.evaluate(() => window.__STACKD_BROKER_STUB__.calls.length)).toBe(callsBefore);
    await page.click('#btn-imap-continue');
    await page.waitForSelector('#import-preview');
    await expect(page.locator('.import-row')).toHaveCount(2);
    await page.click('#btn-iprev-confirm');
    await page.waitForSelector('#import-success-modal.open');
    await page.click('#import-success-done');

    // Refresh now: everything is already imported → nothing new, "Up to date".
    await page.evaluate(() => { location.hash = '#bank-connect'; });
    await page.waitForSelector('.bank-conn-refresh');
    await expect(page.locator('.bank-new-badge')).toHaveCount(0);
    await page.click('.bank-conn-refresh');
    await expect(page.locator('.bank-conn-refresh')).toHaveText('Up to date');
    await expect(page.locator('.bank-acc-review')).toHaveCount(0);
    await expect(page.locator('.bank-acc-import')).toHaveCount(1);

    // Manage → Disconnect → confirm → revoked at the broker, card gone.
    await page.click('.bank-conn-manage');
    await page.waitForSelector('#bank-manage-modal.open');
    await expect(page.locator('#bank-manage-modal')).toContainText('1 account linked');
    await page.click('#bank-manage-disconnect');
    await page.waitForSelector('#active-modal.open');
    await expect(page.locator('#modal-title')).toHaveText('Disconnect Test Bank?');
    await page.click('#modal-delete-btn');
    await expect(page.locator('.bank-conn-card')).toHaveCount(0);
    await expect(page.locator('#bank-empty')).toBeVisible();
    expect(await page.evaluate(() => window.__STACKD_BROKER_STUB__.calls.some(c => c.path === '/v1/connections/req_e2e' && c.opts && c.opts.method === 'DELETE'))).toBe(true);
    expect(await page.evaluate(() => window.Store.getState().bankConnections.length)).toBe(0);

    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('bank settings sheet saves history depth, consent duration and import-from; Settings row shows status', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));

    await bootstrap(page);
    await page.evaluate(() => {
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true, consentAt: new Date().toISOString(), consentVersion: window.BankConnect.termsVersion(), ownerId: 'owner_12345678' });
    });
    await openHub(page);

    await page.click('#bank-open-settings');
    await page.waitForSelector('#bank-settings-modal.open');
    await expect(page.locator('#bank-set-sub')).toHaveText('Not subscribed');
    await expect(page.locator('#bank-set-support')).toContainText('12345678');
    await page.selectOption('#bank-set-history', '0');
    await page.selectOption('#bank-set-validity', '90');
    await page.fill('#bank-set-from', '2026-06-01');
    await page.click('#bank-set-save');
    await expect(page.locator('#bank-settings-modal')).toHaveCount(0);

    const prefs = await page.evaluate(() => window.Store.getState().bankConnect);
    expect(prefs.historyDays).toBe(0);
    expect(prefs.validityDays).toBe(90);
    expect(prefs.importFrom).toBe('2026-06-01');

    // Pausing with a live connection asks first; confirming flips the toggle.
    await page.evaluate(() => {
      window.Store.dispatch('ADD_BANK_CONNECTION', { ref: 'r1', institutionId: 'TEST_BANK', institutionName: 'Test Bank', accounts: [{ bankAccountId: 'x', stackdAccountId: null, ibanTail: '9876', currency: 'EUR' }] });
    });
    await expect(page.locator('.bank-conn-card[data-ref="r1"]')).toBeVisible();
    await page.click('label.toggle-switch');
    await page.waitForSelector('#active-modal.open');
    await expect(page.locator('#bank-toggle')).toBeChecked();
    await page.click('#modal-save-btn');
    await expect(page.locator('#bank-toggle')).not.toBeChecked();
    await expect(page.locator('.bank-chip-paused')).toBeVisible();

    // The Settings row reflects the paused state without opening the hub.
    await page.click('a[href="#settings"]');
    await page.waitForSelector('#bank-settings-subtitle');
    await expect(page.locator('#bank-settings-subtitle')).toHaveText('Paused');

    expect(errors).toEqual([]);
  });
});
