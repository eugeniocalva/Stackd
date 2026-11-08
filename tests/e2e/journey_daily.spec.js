import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

// User journey B2 — Marco, the daily logger (docs/user-journey/inventory.md,
// steps M1…M16). The automated baseline of that journey: every step drives
// the real UI (taps, forms, sheets, swipes and long presses through CDP
// touch) in the inventory's order and asserts what its "Test checks" column
// says. Each test() re-boots and re-seeds tools/seed.cjs (Main Bank, Revolut,
// Cash, Savings; six budgets; six months of rows) with Pro on, so nothing is
// locked. The clock is pinned to 15 Nov 2026 so the seed (which dates itself
// from `new Date()`) and the period labels are the same on every run.
//
// Steps whose inventory check does not hold with the seed are isolated in
// their own test() so the rest of the journey runs — see the report.
const require = createRequire(import.meta.url);
const SEED = require('../../tools/seed.cjs');

test.use({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true });

const TODAY = new Date(2026, 10, 15, 12, 0, 0); // Sunday 15 Nov 2026
const TODAY_YMD = '2026-11-15';
const THIS_MONTH = 'November 2026';
const PREV_MONTH = 'October 2026';
const NEXT_MONTH = 'December 2026';
const SERIES_END = '2027-05-15'; // "End Date in 6 months"
const SERIES_DATES = ['2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15', '2027-03-15', '2027-04-15', '2027-05-15'];

// ── boot + seed ─────────────────────────────────────────────────────────────
const boot = async (page) => {
  await page.clock.install({ time: TODAY });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
    // Pro on (a restored purchase): no account / category lock anywhere.
    localStorage.setItem('stackd_v1_pro', JSON.stringify({ active: true, productId: 'stackd_pro', platform: 'play', purchasedAt: '2026-09-01T00:00:00.000Z' }));
    // No stackd_v1_homeWidgets key: the boot seeds the wide Latest card and
    // the seed adds Categories, Income vs Expenses and Personal savings —
    // the inventory's widget list for Marco.
  });
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store && !!window.Views && !!window.Router && !!window.Widgets && !!window.Insights && !!window.Pro);
  await page.waitForSelector('#splash-screen', { state: 'detached' });
  await page.evaluate(() => window.Store.dispatch('SET_CURRENCY', 'EUR'));
  const seeded = await page.evaluate(SEED);
  expect(seeded.accounts).toBe(4);
  expect(await page.evaluate(() => window.Pro.isActive(window.Store.getState()))).toBe(true);
  await page.waitForSelector('.wallet-card');
  await page.waitForTimeout(300);
};

// ── store readers ───────────────────────────────────────────────────────────
const accountId = (page, name) => page.evaluate((n) => window.Store.getState().accounts.find(a => a.name === n).id, name);
const balanceOf = (page, name) => page.evaluate((n) => {
  const S = window.Store; const acc = S.getState().accounts.find(a => a.name === n);
  return Math.round(S.getAccountBalance(acc.id) * 100) / 100;
}, name);
const findTxId = (page, match) => page.evaluate((m) => {
  const t = window.Store.getState().transactions.find(x => Object.keys(m).every(k => x[k] === m[k]));
  return t ? t.id : null;
}, match);
// Marco's Streaming series (the seed's own "Streaming" rows are plain)
const readSeries = (page) => page.evaluate(() => {
  const members = window.Store.getState().transactions
    .filter(t => t.comment === 'Streaming' && t.recurrence && t.recurrence.seriesId)
    .sort((a, b) => a.date.localeCompare(b.date));
  return members.map(t => ({ id: t.id, date: t.date, amount: t.amount, isPaid: t.isPaid, armed: !!t.recurrence.nextDate }));
});
const activeView = (page) => page.evaluate(() => window.Store.getState().activeView);

// ── real touch (CDP runs Chromium's gesture pipeline) ───────────────────────
const cdpOf = (page) => page.context().newCDPSession(page);
const touch = (cdp, type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const tap = async (page, cdp, p) => {
  await touch(cdp, 'touchStart', p.x, p.y);
  await page.waitForTimeout(40);
  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(250);
};
const hold = async (page, cdp, p, ms = 650) => {
  await touch(cdp, 'touchStart', p.x, p.y);
  await page.waitForTimeout(ms);
  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(250);
};
// `pause` keeps the finger still before lifting: no fling. (Headless Chromium
// leaves a flung scroll-snap pager parked mid-snap and swallows the next tap
// as "stop scrolling" — a synthetic-fling artefact, not an app behaviour.)
const drag = async (page, cdp, [x0, y0], [x1, y1], steps = 12, pause = 0) => {
  await touch(cdp, 'touchStart', x0, y0);
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, 'touchMove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await page.waitForTimeout(16);
  }
  if (pause) await page.waitForTimeout(pause);
  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(450); // the snap animation
};
// the centre of an element, scrolled to the middle of the screen first
// (clear of the sticky header and the tab bar)
const centreOf = async (page, selector) => {
  const p = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, left: b.left, right: b.right, top: b.top, bottom: b.bottom };
  }, selector);
  expect(p, selector).not.toBeNull();
  await page.waitForTimeout(250); // a scroll closes open rows / settles
  return p;
};
const rowSel = (id) => `.swipe-content[data-id="${id}"]`;
const offsetOf = (page, id) => page.evaluate((i) => Number(document.querySelector(`.swipe-container[data-id="${i}"]`).dataset.offset || 0), id);

// ── UI drivers ──────────────────────────────────────────────────────────────
const goTab = async (page, hash, view) => {
  await page.click(`#bottom-nav a[href="${hash}"]`);
  await page.waitForFunction((v) => window.Store.getState().activeView === v, view);
};
const openHistory = async (page) => {
  await goTab(page, '#transactions', 'transactions');
  await page.waitForTimeout(900); // the entry scroll-to-today settles
};
// + → Add Log
const openAddLog = async (page) => {
  await page.click('#nav-fab-toggle');
  await page.click('#nav-action-menu a[href="#add"]');
  await page.waitForSelector('#btn-save-tx');
  await page.waitForTimeout(350); // the amount autofocus (+320 ms) lands first
};
// the Select Category sheet
const pickCategory = async (page, catId) => {
  await page.click('#tx-category');
  await page.locator(`#csm-category-list .category-select-item[data-id="${catId}"]`).click();
  await expect(page.locator('#tx-category')).toHaveValue(catId);
};
const saveTx = async (page) => {
  await page.click('#btn-save-tx');
  await expect(page).toHaveURL(/#transactions$/);
  await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
};

// M7 as a reusable driver (M8–M10 build on the series Marco created)
const logStreamingSeries = async (page) => {
  await openAddLog(page);
  await page.click('#toggle-expense');
  await page.fill('#tx-amount', '9.99');
  await page.selectOption('#tx-account', { label: 'Revolut' });
  await pickCategory(page, 'cat_entertainment');
  await page.fill('#tx-comment', 'Streaming');
  await expect(page.locator('#tx-recurrence-end-group')).toBeHidden();
  await page.locator('#group-recurring .toggle-switch').click();
  await expect(page.locator('#tx-is-recurrent')).toBeChecked();
  await expect(page.locator('#tx-recurrence-end-group')).toBeVisible();
  // the Repeats Every picker: 1 · months is where it opens; Done
  await page.click('#tx-recurrent-text');
  await expect(page.locator('#active-freq-picker')).toBeVisible();
  await expect(page.locator('#fp-title')).toHaveText('Repeats Every');
  await page.click('#fp-confirm');
  await expect(page.locator('#active-freq-picker')).toHaveCount(0);
  await expect(page.locator('#tx-recurrent-text')).toHaveText('Repeats every month');
  await page.fill('#tx-recurrence-end-date', SERIES_END);
  await saveTx(page);
};

// ════════════════════════════════════════════════════════════════════════════
test.describe('Journey B2 — Marco, the daily logger', () => {
  test('M1–M4: Home on a new day, the Monthly net pane, Revolut\'s History, the chip removed', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e));
    await boot(page);
    const cdp = await cdpOf(page);

    // M1 — Home: the total is the sum of the four balances; 4 cards; the two
    // deltas; the balance curve on the 1M chip; the four widgets.
    await expect(page.locator('.wallet-card')).toHaveCount(4);
    const expectedTotal = await page.evaluate(() => {
      const S = window.Store;
      const total = S.getState().accounts.reduce((sum, a) => sum + S.getAccountBalance(a.id), 0);
      return S.formatCurrency(total);
    });
    await expect(page.locator('#dash-total')).toHaveText(expectedTotal);
    await expect(page.locator('.dash-var-today')).toContainText('as of today');
    await expect(page.locator('.dash-var-eom')).toContainText('projected EOM');
    await page.locator('.home-range-chips [data-range="1m"]').click();
    await expect(page.locator('.home-range-chips [data-range="1m"]')).toHaveClass(/active/);
    await expect(page.locator('#home-pager canvas#balanceChart')).toHaveCount(1);
    expect(await page.evaluate(() => window.Store.getState().homeWidgets.map(w => w.type)))
      .toEqual(['latest', 'categories', 'incomeExpense', 'savings']);
    await expect(page.locator('#widgets-grid .widget-card')).toHaveCount(4);

    // M2 — a sideways swipe on the chips row (not the plot) pages the graph
    const chips = await page.locator('.home-range-chips').boundingBox();
    await drag(page, cdp, [chips.x + chips.width - 20, chips.y + chips.height / 2], [chips.x + 20, chips.y + chips.height / 2 + 2], 14, 300);
    await expect(page.locator('.home-pager-dot[data-pane="1"]')).toHaveClass(/is-active/);
    // the pager snapped onto the second pane
    await expect.poll(() => page.evaluate(() => { const r = document.getElementById('home-pager'); return Math.abs(r.scrollLeft - r.clientWidth) < 2; })).toBe(true);
    await expect(page.locator('.home-pager-dot[data-pane="1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.home-pager-dot[data-pane="0"]')).not.toHaveClass(/is-active/);
    await expect(page.locator('#netflow-pane .home-pane-head')).toContainText('Monthly net');
    await expect(page.locator('#netflow-pane .home-pane-head')).toContainText('End of month');
    expect(await page.evaluate(() => window.Views.DashboardView._netflowChart.data.datasets[0].data.length)).toBe(12);

    // M3 — the Revolut card → History on that account only
    const rev = await accountId(page, 'Revolut');
    // bring the card into the row (the row snaps: let it settle before the tap)
    const tile = await page.evaluate((id) => {
      const card = document.querySelector(`.wallet-card[data-id="${id}"]`);
      card.scrollIntoView({ block: 'center' });
      const wrap = card.closest('.wallets-scroll-wrapper');
      wrap.scrollLeft = Math.max(0, card.offsetLeft - 16);
      return card.dataset.id;
    }, rev);
    expect(tile).toBe(rev);
    await page.waitForTimeout(800);
    const tb = await page.locator(`.wallet-card[data-id="${rev}"] .wallet-card-name`).boundingBox();
    expect(tb.x).toBeGreaterThan(0);
    expect(tb.x + tb.width).toBeLessThan(390);
    await tap(page, cdp, { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 });
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    expect(await page.evaluate(() => location.hash)).toContain(`account=${rev}`);
    const accChip = page.locator('.period-bar [data-filter-kind="accounts"]');
    await expect(accChip).toHaveCount(1);
    await expect(accChip).toContainText('Revolut');
    expect(await page.evaluate(() => window.Store.getState().historyFilters.accounts)).toEqual([rev]);
    const rowAccounts = await page.evaluate(() => Array.from(document.querySelectorAll('#history-list .swipe-content .tx-item-account')).map(el => el.textContent.trim()));
    expect(rowAccounts.length).toBeGreaterThan(0);
    expect(rowAccounts.every(a => a === 'Revolut')).toBe(true);
    const rowIds = await page.evaluate(() => Array.from(document.querySelectorAll('#history-list .swipe-content[data-id]')).map(el => el.dataset.id));
    const rowAccountIds = await page.evaluate((ids) => ids.map(id => window.Store.getState().transactions.find(t => t.id === id).accountId), rowIds);
    expect(rowAccountIds.every(a => a === rev)).toBe(true);

    // M4 — the chip's ✕: all rows again, Start / End / Net Change
    await accChip.click();
    await expect(page.locator('.period-bar [data-filter-kind]')).toHaveCount(0);
    expect(await page.evaluate(() => window.Store.getState().historyFilters.accounts)).toEqual([]);
    const allAccounts = await page.evaluate(() => new Set(Array.from(document.querySelectorAll('#history-list .swipe-content .tx-item-account')).map(el => el.textContent.trim())).size);
    expect(allAccounts).toBeGreaterThan(1);
    await expect(page.getByText('Net Change', { exact: true })).toBeVisible();
    await expect(page.getByText('Start', { exact: true })).toBeVisible();
    await expect(page.getByText('End', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('M5–M7: a tagged Dining Out log, a transfer to Savings, a monthly Streaming series', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e));
    await boot(page);
    const rev = await accountId(page, 'Revolut');

    // M5 — Expense 46.00, Revolut, Dining Out; Tags → "friends" + ✓
    await openAddLog(page);
    await expect(page.locator('#tx-account')).toHaveValue(await accountId(page, 'Main Bank')); // the Default Wallet is preselected
    await page.click('#toggle-expense');
    await page.fill('#tx-amount', '46.00');
    await page.selectOption('#tx-account', { label: 'Revolut' });
    await pickCategory(page, 'cat_dining');
    await page.click('#tx-tags-input');
    const picker = page.locator('#tag-picker-sheet');
    await expect(picker).toBeVisible();
    await expect(picker.locator('#tps-title')).toHaveText('Tags');
    // the seed has no tags yet, so the sheet opens on its empty note; the new
    // tag lands in the "In Dining Out" section, checked
    await page.fill('#tps-search', 'friends');
    await page.click('#tps-add');
    await expect(picker.locator('#tps-section-category')).toBeVisible(); // "In Dining Out"
    await expect(picker.locator('#tps-section-category .tps-row[data-tag="friends"]')).toHaveAttribute('aria-checked', 'true');
    await page.click('#tps-apply');
    await expect(picker).toHaveCount(0);
    await expect(page.locator('#tx-tags-container .tag-chip')).toHaveCount(1);
    await expect(page.locator('#tx-tags-container .tag-chip')).toContainText('friends');
    await expect(page.locator('#tx-amount')).toHaveValue('46.00'); // the form was not re-rendered
    await saveTx(page);
    const tagged = await page.evaluate(() => {
      const st = window.Store.getState();
      const tx = st.transactions.find(t => Array.isArray(t.tags) && t.tags.includes('friends'));
      return tx && { amount: tx.amount, accountId: tx.accountId, categoryId: tx.categoryId, type: tx.type, tags: tx.tags, links: window.Store.getTagLinks('friends'), id: tx.id };
    });
    expect(tagged).toMatchObject({ amount: 46, accountId: rev, categoryId: 'cat_dining', type: 'expense', tags: ['friends'] });
    expect(tagged.links).toContain('cat_dining');
    await expect(page.locator(`${rowSel(tagged.id)} .tx-tag-pill`)).toHaveText('#friends');

    // M6 — Transfer 200.00 from Main Bank to Savings: a blue row, −200 / +200
    const bankBefore = await balanceOf(page, 'Main Bank');
    const savBefore = await balanceOf(page, 'Savings');
    await openAddLog(page);
    await page.click('#toggle-transfer');
    await expect(page.locator('#group-transfer-to')).toBeVisible();
    await page.fill('#tx-amount', '200.00');
    await page.selectOption('#tx-account', { label: 'Main Bank' });
    await page.selectOption('#tx-transfer-to', { label: 'Savings' });
    await saveTx(page);
    expect(await balanceOf(page, 'Main Bank')).toBeCloseTo(bankBefore - 200, 2);
    expect(await balanceOf(page, 'Savings')).toBeCloseTo(savBefore + 200, 2);
    const legs = await page.evaluate((d) => window.Store.getState().transactions
      .filter(t => t.transferRef && t.amount === 200 && t.date === d)
      .map(t => ({ id: t.id, type: t.type, accountId: t.accountId })), TODAY_YMD);
    expect(legs).toHaveLength(2);
    const expenseLeg = legs.find(l => l.type === 'expense');
    expect(expenseLeg.accountId).toBe(await accountId(page, 'Main Bank'));
    expect(legs.find(l => l.type === 'income').accountId).toBe(await accountId(page, 'Savings'));
    await expect(page.locator(`${rowSel(expenseLeg.id)} .list-item-value`)).toHaveClass(/text-transfer/);

    // M7 — Expense 9.99 Streaming, Recurrent on, every month, End Date in 6 months
    const revBefore = await balanceOf(page, 'Revolut');
    await logStreamingSeries(page);
    const series = await readSeries(page);
    expect(series.map(m => m.date)).toEqual(SERIES_DATES);          // members up to the end date
    expect(series.every(m => m.amount === 9.99)).toBe(true);
    expect(series.filter(m => m.armed)).toHaveLength(1);             // one generator
    // not counted: only today's member moves the balance
    expect(await balanceOf(page, 'Revolut')).toBeCloseTo(revBefore - 9.99, 2);
    await expect(page.locator(rowSel(series[0].id))).toBeVisible();   // today's member in History
    expect(errors).toEqual([]);
  });

  // M7: the future members of a new series carry no paid flag (paid is a
  // per-occurrence mark the user sets by hand, v0.82) and are not counted
  // in today's balances because they are dated after today.
  test('M7 (members): the future members are dated ahead, carry no paid mark, and do not move today\'s balance', async ({ page }) => {
    await boot(page);
    const before = await page.evaluate(() => window.Store.getAccountBalance(window.Store.getState().accounts.find(a => a.name === 'Revolut').id));
    await logStreamingSeries(page);
    const series = await readSeries(page);
    const future = series.filter(m => m.date > TODAY_YMD);
    expect(future).toHaveLength(6);
    expect(future.every(m => m.isPaid !== false)).toBe(true);
    const after = await page.evaluate(() => window.Store.getAccountBalance(window.Store.getState().accounts.find(a => a.name === 'Revolut').id));
    expect(Math.round((before - after) * 100)).toBe(999); // only today's 9.99
  });

  test('M8–M10: swipe Paid / actions, long-press selection delete, a scoped series edit', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e));
    await boot(page);
    await logStreamingSeries(page);
    const cdp = await cdpOf(page);
    const label = page.locator('#period-label-history');
    await expect(label).toContainText(THIS_MONTH);

    // M8 — next month holds the first future Streaming member
    await page.click('#period-next-history');
    await expect(label).toContainText(NEXT_MONTH);
    await page.waitForTimeout(900); // the new period opens at the top; let the list settle
    const dec = (await readSeries(page)).find(m => m.date === '2026-12-15');
    const paidBefore = (await readSeries(page)).map(m => ({ id: m.id, isPaid: m.isPaid }));
    // actions hidden at rest
    expect(await page.evaluate(() => Array.from(document.querySelectorAll('#history-list .swipe-actions')).every(a => getComputedStyle(a).visibility === 'hidden'))).toBe(true);
    let p = await centreOf(page, rowSel(dec.id));
    await drag(page, cdp, [p.left + 30, p.y], [p.left + 160, p.y + 3]);
    const decBox = page.locator(`.swipe-container[data-id="${dec.id}"]`);
    await expect(decBox).toHaveClass(/is-open/);
    expect(await offsetOf(page, dec.id)).toBe(70);
    const paidBtn = decBox.locator('.swipe-action-btn.paid');
    await expect(paidBtn).toBeVisible();
    const pb = await paidBtn.boundingBox();
    await tap(page, cdp, { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 });
    await expect.poll(async () => (await readSeries(page)).find(m => m.id === dec.id).isPaid).not.toBe(dec.isPaid);
    // toggled on that member only
    const paidAfter = (await readSeries(page)).map(m => ({ id: m.id, isPaid: m.isPaid }));
    expect(paidAfter.filter(m => m.id !== dec.id)).toEqual(paidBefore.filter(m => m.id !== dec.id));
    await expect(page.locator('#history-list .swipe-container.is-open')).toHaveCount(0); // the dispatch re-rendered the list at rest

    // another row, swiped left → Edit · Delete
    await page.click('#period-now-history');
    await expect(label).toContainText(THIS_MONTH);
    await page.waitForTimeout(900); // back to now scrolls to today: let it settle
    const sneakers = await findTxId(page, { comment: 'Sneakers' });
    p = await centreOf(page, rowSel(sneakers));
    await drag(page, cdp, [p.right - 30, p.y], [p.right - 200, p.y + 3]);
    const snBox = page.locator(`.swipe-container[data-id="${sneakers}"]`);
    await expect(snBox).toHaveClass(/is-open/);
    expect(await offsetOf(page, sneakers)).toBe(-110);
    await expect(snBox.locator('.swipe-action-btn.edit')).toBeVisible();
    await expect(snBox.locator('.swipe-action-btn.delete')).toBeVisible();
    // a tap on the open row only closes it
    await tap(page, cdp, await centreOf(page, rowSel(sneakers)));
    expect(await offsetOf(page, sneakers)).toBe(0);
    await page.waitForTimeout(400);
    await expect(snBox).not.toHaveClass(/is-open/);
    expect(await activeView(page)).toBe('transactions');

    // M9 — long press Sneakers, tap Pharmacy, Delete (2)
    const pharmacy = await findTxId(page, { comment: 'Pharmacy', date: '2026-11-12' });
    const idsBefore = await page.evaluate(() => window.Store.getState().transactions.map(t => t.id).sort());
    await hold(page, cdp, await centreOf(page, rowSel(sneakers)));
    expect(await page.evaluate(() => window.Store.getState().isSelectionMode)).toBe(true);
    await expect(page.locator(`${rowSel(sneakers)} .tx-icon-flip`)).toHaveClass(/is-selected/);
    await expect(page.locator('.contextual-header-bar')).toBeVisible();
    await expect(page.locator('.selection-count-label')).toHaveText('1 Selected');
    await tap(page, cdp, await centreOf(page, rowSel(pharmacy)));
    await expect(page.locator('.selection-count-label')).toHaveText('2 Selected');
    await expect(page.locator('#btn-cancel-selection')).toBeVisible();
    await expect(page.locator('#btn-toggle-select-all')).toBeVisible();
    await expect(page.locator('#btn-bulk-delete-header')).toHaveText(/Delete \(2\)/);
    await page.click('#btn-bulk-delete-header');
    await expect(page.locator('#active-modal')).toContainText('Delete these 2 transactions?');
    await page.click('#modal-delete-btn');
    await expect(page.locator('#active-modal')).toHaveCount(0);
    const idsAfter = await page.evaluate(() => window.Store.getState().transactions.map(t => t.id).sort());
    expect(idsAfter).toEqual(idsBefore.filter(id => id !== sneakers && id !== pharmacy)); // both gone, others intact
    await expect(page.locator(rowSel(sneakers))).toHaveCount(0);
    await expect(page.locator(rowSel(pharmacy))).toHaveCount(0);
    expect(await page.evaluate(() => window.Store.getState().isSelectionMode)).toBe(false);

    // M10 — the December member: 10.99 → This and future transactions
    await page.click('#period-next-history');
    await expect(label).toContainText(NEXT_MONTH);
    await page.waitForTimeout(900);
    await tap(page, cdp, await centreOf(page, rowSel(dec.id)));
    await page.waitForFunction(() => location.hash.startsWith('#edit'));
    await expect(page.locator('#tx-amount')).toHaveValue('9.99');
    await page.fill('#tx-amount', '10.99');
    await page.click('#btn-save-tx');
    const scope = page.locator('#recurring-update-modal');
    await expect(scope).toBeVisible();
    await expect(scope).toContainText('Recurring Transaction');
    await expect(scope.locator('#ru-only-this')).toBeVisible();
    await expect(scope.locator('#ru-this-future')).toHaveText(/This and future transactions/);
    await expect(scope.locator('#ru-all-series')).toBeVisible();
    expect((await readSeries(page)).every(m => m.amount === 9.99)).toBe(true); // nothing written yet
    await page.click('#ru-this-future');
    await page.waitForFunction(() => location.hash === '#transactions');
    const after = await readSeries(page);
    expect(after.map(m => m.date)).toEqual(SERIES_DATES);
    expect(after.filter(m => m.date >= '2026-12-15').map(m => m.amount)).toEqual([10.99, 10.99, 10.99, 10.99, 10.99, 10.99]);
    expect(after.find(m => m.date === TODAY_YMD).amount).toBe(9.99); // earlier unchanged
    expect(after.filter(m => m.armed)).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('M11: the previous month, then Filter and Sort → Groceries', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e));
    await boot(page);
    await openHistory(page);
    const label = page.locator('#period-label-history');
    await expect(label).toContainText(THIS_MONTH);
    await page.click('#period-prev-history');
    await expect(label).toContainText(PREV_MONTH);
    await expect(page.locator('#period-now-history')).toContainText('This month');
    expect(await page.locator('#router-view').evaluate(el => el.scrollTop)).toBe(0); // from the top

    await page.click('#btn-filter-history');
    const sheet = page.locator('#filter-advanced-modal');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('#afm-title')).toHaveText('Filter and Sort');
    await expect(sheet.locator('[data-sort="desc"]')).toBeVisible(); // Order at the top (History only)
    await sheet.locator('[data-cat="cat_groceries"]').click();
    await expect(sheet.locator('[data-cat="cat_groceries"]')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#afm-apply');
    await expect(sheet).toHaveCount(0);

    const catChip = page.locator('.period-bar [data-filter-kind="categories"]');
    await expect(catChip).toHaveCount(1);
    await expect(catChip).toContainText('Groceries');
    await expect(label).toContainText(PREV_MONTH); // the period stayed
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#history-list .swipe-content[data-id]'))
      .map(el => window.Store.getState().transactions.find(t => t.id === el.dataset.id)));
    expect(rows.length).toBe(2); // Esselunga (Main Bank) + Carrefour (Revolut)
    expect(rows.every(t => t.categoryId === 'cat_groceries' && t.date.startsWith('2026-10'))).toBe(true);
    // In / Out / Net for a category filter
    await expect(page.getByText('In', { exact: true })).toBeVisible();
    await expect(page.getByText('Out', { exact: true })).toBeVisible();
    await expect(page.getByText('Net', { exact: true })).toBeVisible();
    await expect(page.getByText('Net Change', { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('M12: Goals — the ring with Allocated, the rows, a slice tap shows its badge', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e));
    await boot(page);
    await goTab(page, '#budget', 'budget');
    const box = page.locator('#budget-ring-box');
    await expect(box).toBeVisible();
    await expect(page.locator('#budget-summary-card')).toContainText('Allocated');
    await expect(page.locator('#bdg-toggle-expense')).toBeVisible();
    await expect(page.locator('#bdg-toggle-income')).toBeVisible();
    const rows = page.locator('.budget-cat-row');
    expect(await rows.count()).toBeGreaterThanOrEqual(6);
    await expect(rows.filter({ hasText: 'Groceries' })).toContainText(/€[\d.,]+ of €320\.00/);
    await expect(rows.filter({ hasText: 'Dining Out' })).toContainText(/of €150\.00/);

    // a slice tap (the box's one hit test, at a slice button's point) → badge
    const btn = box.locator('.ring-arc-btn').first();
    const arcId = await btn.getAttribute('data-arc-id');
    const b = await btn.boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await expect(box).toHaveClass(/is-focused/);
    await expect(box.locator(`.ring-arc-btn[data-arc-id="${arcId}"]`)).toHaveAttribute('aria-pressed', 'true');
    const badge = box.locator('.ring-badge.is-on');
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveAttribute('data-arc-id', arcId);
    await expect(badge.locator('.ring-badge-icon svg, .ring-badge-icon i')).toHaveCount(1);
    await expect(badge.locator('.ring-badge-pct')).toHaveText(/%/);
    expect(errors).toEqual([]);
  });

  // M12: a dinner that puts Dining Out over its €150 limit; the row says
  // "Over by" (the shared seed alone stays under every limit).
  test('M12 (over budget): a Dining Out row over its limit reads "Over by"', async ({ page }) => {
    await boot(page);
    await page.evaluate((d) => {
      const S = window.Store; const rev = S.getState().accounts.find(a => a.name === 'Revolut');
      S.dispatch('ADD_TRANSACTION', { accountId: rev.id, categoryId: 'cat_dining', type: 'expense', amount: 100, date: d, comment: 'Birthday dinner' });
    }, TODAY_YMD);
    await goTab(page, '#budget', 'budget');
    const row = page.locator('.budget-cat-row[data-id="cat_dining"]');
    await expect(row).toContainText('Over by');
    await expect(row).toContainText('of €150.00');
  });

  test('M13–M14: Analytics hero and its Today / Nov 30 toggle; a Distribution row → History', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e));
    await boot(page);
    await goTab(page, '#analytics', 'analytics');
    const view = page.locator('#router-view');
    await expect(page.locator('#period-label-analytics')).toContainText(THIS_MONTH);
    await expect(view).toContainText('Total Net Balance · Today');
    await expect(view).toContainText(/vs /); // the change vs the previous period
    const toggle = page.locator('#balance-mode-toggle');
    await expect(toggle.locator('[data-mode="today"]')).toHaveText('Today');
    await expect(toggle.locator('[data-mode="today"]')).toHaveClass(/active/);
    await expect(toggle.locator('[data-mode="end"]')).toHaveText('Nov 30');
    await expect(page.locator('#netFlowChart')).toHaveCount(1);        // Net Flow Analysis
    await expect(page.locator('.category-donut-card')).toBeVisible();  // Distribution
    await expect(page.locator('.category-donut-card .chart-toggle-btn[data-type]')).toHaveCount(2); // Expenses / Income
    expect(await page.locator('.donut-legend-item').count()).toBeGreaterThan(0);

    // the end-of-period toggle
    await toggle.locator('[data-mode="end"]').click();
    await expect(page.locator('#balance-mode-toggle [data-mode="end"]')).toHaveClass(/active/);
    await expect(view).not.toContainText('Total Net Balance · Today');

    // M14 — the Groceries legend row: it opens its tag breakdown, "All n
    // transactions" lands on History filtered to Groceries this month
    const groceries = page.locator('.donut-legend-item[data-cat-id="cat_groceries"]');
    await groceries.scrollIntoViewIfNeeded();
    await groceries.click();
    await expect(groceries).toHaveAttribute('aria-expanded', 'true');
    await page.locator('.donut-tag-panel[data-tag-panel="cat_groceries"] .donut-tag-row--all').click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    await expect(page.locator('.period-bar [data-filter-kind="categories"]')).toContainText('Groceries');
    const f = await page.evaluate(() => window.Store.getState().historyFilters);
    expect(f.categories).toEqual(['cat_groceries']);
    await expect(page.locator('#period-label-history')).toContainText(THIS_MONTH);
    expect(errors).toEqual([]);
  });

  // M13: with a payment still to come this month, the hero says how many it
  // excludes and the Nov 30 toggle shows the projection.
  test('M13 (projection): an upcoming payment this month → "Excludes 1 upcoming" and "Projected Balance · Nov 30"', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const S = window.Store; const bank = S.getState().accounts.find(a => a.name === 'Main Bank');
      S.dispatch('ADD_TRANSACTION', { accountId: bank.id, categoryId: 'cat_transport', type: 'expense', amount: 120, date: '2026-11-28', comment: 'Car insurance' });
    });
    await goTab(page, '#analytics', 'analytics');
    await expect(page.locator('#router-view')).toContainText('Excludes 1 upcoming transaction');
    await page.locator('#balance-mode-toggle [data-mode="end"]').click();
    await expect(page.locator('#router-view')).toContainText('Projected Balance · Nov 30');
  });

  test('M15: Smart Insights — sections with cards; the first insight lands where its headline says', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e));
    await boot(page);
    await goTab(page, '#insights', 'insights');
    await expect(page.locator('#insights-page')).toBeVisible();
    await expect(page.locator('#insights-page .page-header-title')).toHaveText('Smart Insights');
    await expect(page.locator('#insights-starter')).toHaveCount(0); // six months of rows: no Getting started card
    const links = page.locator('#insights-page a[data-insight]');
    expect(await links.count()).toBeGreaterThan(0);
    expect(await page.locator('#insights-page .insights-sec').count()).toBeGreaterThan(0);
    const names = await page.evaluate(() => Array.from(document.querySelectorAll('#insights-page .insights-sec-title')).map(h => h.textContent.trim()));
    const known = ['Needs attention', 'This month', 'Trends', 'Accounts and loans', 'Tidy up', 'Unlocks with more data'];
    expect(names.every(n => known.includes(n))).toBe(true);

    const first = links.first();
    const href = await first.getAttribute('href');
    const popup = await first.getAttribute('aria-haspopup');
    const head = await first.locator('.insight-head').textContent();
    expect(head.trim().length).toBeGreaterThan(0);
    await first.scrollIntoViewIfNeeded();
    await first.click();
    if (popup === 'dialog') {
      // a sheet over the page (balance graph / recurring payments)
      await expect(page.locator('#expanded-graph-modal, #recurring-payments-sheet, #active-modal').first()).toBeVisible();
      expect(await activeView(page)).toBe('insights');
    } else {
      const expected = await page.evaluate((h) => window.Router.routes[h.split('?')[0]], href);
      expect(expected, `route for ${href}`).toBeTruthy();
      await expect.poll(() => activeView(page)).toBe(expected);
    }
    expect(errors).toEqual([]);
  });

  test('M16: Add → Account balances (Wide); long press → edit mode → × removes one; navigation clears edit mode', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e));
    await boot(page);
    const cdp = await cdpOf(page);
    const cards = page.locator('#widgets-grid .widget-card');
    await page.locator('#widgets-section').scrollIntoViewIfNeeded();
    await expect(cards).toHaveCount(4);

    // the gallery → detail (size rail on Wide) → Configure → Add
    await page.click('#btn-widgets-add');
    const modal = page.locator('#add-widget-modal');
    await expect(modal).toBeVisible();
    await page.click('.widget-gallery-card[data-widget-type="accountBalances"]');
    // Account balances comes wide only (registry sizes: ['large']): the rail
    // holds one slide and no size dots, so "Wide" is the only pick
    await expect(page.locator('.awm-size-slide')).toHaveCount(1);
    await expect(page.locator('.awm-size-slide.is-active')).toHaveAttribute('data-size', 'large');
    await expect(page.locator('.awm-size-slide.is-active .widget-card--large')).toHaveCount(1);
    await expect(page.locator('.widget-size-dot')).toHaveCount(0);
    await expect(page.locator('#awm-confirm')).toHaveText('Next');
    await page.click('#awm-confirm');
    await expect(page.locator('#awm-config')).toBeVisible();
    await expect(page.locator('#awm-confirm')).toHaveText('Add widget');
    await page.click('#awm-confirm');
    await expect(modal).toHaveCount(0);
    await expect(cards).toHaveCount(5); // +1
    const balances = page.locator('#widgets-grid .widget-card[data-widget-type="accountBalances"]');
    await expect(balances).toHaveClass(/widget-card--large/);
    await expect(balances).toContainText('Account balances');
    await expect(balances).toContainText('Revolut');

    // long press a widget → edit mode (× badges), × on Account balances → Remove
    await hold(page, cdp, await centreOf(page, '#widgets-grid .widget-card'), 700);
    await expect(page.locator('#widgets-grid')).toHaveClass(/is-editing/);
    expect(await page.evaluate(() => window.Store.getState().widgetEditMode)).toBe(true);
    await expect(page.locator('#widgets-grid [data-widget-action="remove"]')).toHaveCount(5);
    await expect(page.locator('#btn-widgets-edit')).toHaveText('Done');
    await balances.locator('[data-widget-action="remove"]').click();
    await expect(page.locator('#active-modal')).toContainText('Remove widget?');
    await page.click('#modal-delete-btn');
    await expect(page.locator('#active-modal')).toHaveCount(0);
    await expect(cards).toHaveCount(4); // −1
    await expect(page.locator('#widgets-grid .widget-card[data-widget-type="accountBalances"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.Store.getState().homeWidgets.map(w => w.type)))
      .toEqual(['latest', 'categories', 'incomeExpense', 'savings']);

    // edit mode does not survive leaving Home
    await goTab(page, '#transactions', 'transactions');
    await goTab(page, '#dashboard', 'dashboard');
    await page.waitForSelector('#widgets-grid');
    await expect(page.locator('#widgets-grid')).not.toHaveClass(/is-editing/);
    expect(await page.evaluate(() => window.Store.getState().widgetEditMode)).toBe(false);
    await expect(page.locator('#widgets-grid [data-widget-action="remove"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
