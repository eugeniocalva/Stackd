import { test, expect } from '@playwright/test';

// 1.2.2 (HG-11 P1, docs/history-rows-plan.md): History's row gestures with
// REAL touch input (CDP Input.dispatchTouchEvent runs Chromium's gesture
// pipeline, so touch-action: pan-y and pointercancel behave as on a phone).
// No Select button: a long press starts selecting and turns the icon over;
// a tap toggles while selecting, opens the row otherwise; a sideways drag
// opens the actions, which are hidden at rest; a scroll closes an open row.
test.use({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true });

const boot = async (page) => {
  await page.clock.install({ time: new Date(2026, 9, 25, 12, 0, 0) });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', '[]');
  });
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store && !!window.Views && !!window.Router);
  await page.evaluate(() => {
    const S = window.Store;
    S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 5000, openingDate: '2020-01-01' });
    const accId = S.getState().accounts[0].id;
    for (let day = 1; day <= 25; day++) {
      const ymd = `2026-10-${String(day).padStart(2, '0')}`;
      S.dispatch('ADD_TRANSACTION', { accountId: accId, categoryId: 'cat_groceries', type: 'expense', amount: 10 + day, date: ymd });
      if (day % 3 === 0) S.dispatch('ADD_TRANSACTION', { accountId: accId, categoryId: 'cat_dining', type: 'expense', amount: 4 + day, date: ymd });
    }
    window.Router.navigate('#transactions');
  });
  await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
  await page.waitForSelector('#splash-screen', { state: 'detached' });
  await page.waitForTimeout(900); // the entry scroll-to-today settles
  // today sits at the end of the list: move to the middle so rows fill the screen
  await page.evaluate(() => { document.getElementById('router-view').scrollTop = 700; });
  await page.waitForTimeout(300);
};

const cdpOf = (page) => page.context().newCDPSession(page);

// the centre of the nth visible row card
const rowPoint = (page, n) => page.evaluate((i) => {
  const vh = window.innerHeight;
  const top = document.getElementById('history-sticky-header').getBoundingClientRect().bottom + 8;
  const rows = Array.from(document.querySelectorAll('#history-list .swipe-content')).filter(r => {
    const b = r.getBoundingClientRect();
    return b.top > top && b.bottom < vh - 110; // clear of the sticky bar and the tab bar
  });
  const r = rows[i];
  const b = r.getBoundingClientRect();
  return { id: r.dataset.id, x: b.left + b.width / 2, y: b.top + b.height / 2, left: b.left, right: b.right };
}, n);

const touch = (cdp, type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

const hold = async (page, cdp, p, ms = 650) => {
  await touch(cdp, 'touchStart', p.x, p.y);
  await page.waitForTimeout(ms);
  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(150);
};

const tap = async (page, cdp, p) => {
  await touch(cdp, 'touchStart', p.x, p.y);
  await page.waitForTimeout(40);
  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(200);
};

const drag = async (page, cdp, [x0, y0], [x1, y1], steps = 12) => {
  await touch(cdp, 'touchStart', x0, y0);
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, 'touchMove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await page.waitForTimeout(16);
  }
  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(400); // the snap animation
};

const offsetOf = (page, id) => page.evaluate((i) => Number(document.querySelector(`.swipe-container[data-id="${i}"]`).dataset.offset || 0), id);
const state = (page) => page.evaluate(() => ({ on: window.Store.getState().isSelectionMode, ids: window.Store.getState().selectedTransactionIds.slice(), hash: location.hash }));

test.describe('History rows (1.2.2 HG-11 P1)', () => {
  test('no Select button; a long press selects and turns the icon to a check', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e));
    await boot(page);
    await expect(page.locator('#btn-start-selection-mode')).toHaveCount(0);
    const cdp = await cdpOf(page);

    const p = await rowPoint(page, 0);
    await hold(page, cdp, p);
    // the release must not toggle the row straight back
    expect(await state(page)).toMatchObject({ on: true, ids: [p.id] });
    const row = page.locator(`.swipe-content[data-id="${p.id}"]`);
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await expect(row.locator('.tx-icon-flip')).toHaveClass(/is-selected/);
    await expect(row.locator('.tx-icon-flip')).toHaveClass(/tx-flip-in/);
    await expect(page.locator('.contextual-header-bar')).toBeVisible();
    await expect(page.locator('.selection-count-label')).toHaveText('1 Selected');
    // nothing slid: the card starts where it did
    const after = await rowPoint(page, 0);
    expect(Math.abs(after.left - p.left)).toBeLessThan(1);

    // a tap picks another row, a tap on a picked row drops it
    const q = await rowPoint(page, 1);
    await tap(page, cdp, q);
    expect((await state(page)).ids.sort()).toEqual([p.id, q.id].sort());
    await tap(page, cdp, await rowPoint(page, 0));
    expect((await state(page)).ids).toEqual([q.id]);
    await expect(page.locator(`.swipe-content[data-id="${p.id}"] .tx-icon-flip`)).toHaveClass(/tx-flip-out/);

    await page.click('#btn-cancel-selection');
    expect((await state(page)).on).toBe(false);
    expect(errors).toEqual([]);
  });

  test('the selection bar sits in full view at the top of a scrolled list, and stays there', async ({ page }) => {
    await boot(page);
    const cdp = await cdpOf(page);
    await hold(page, cdp, await rowPoint(page, 1));
    expect((await state(page)).on).toBe(true);
    const where = () => page.evaluate(() => {
      const view = document.getElementById('router-view').getBoundingClientRect();
      const bar = document.querySelector('.contextual-header-bar').getBoundingClientRect();
      return { viewTop: view.top, barTop: bar.top, barBottom: bar.bottom, page: document.scrollingElement.scrollTop, scroll: document.getElementById('router-view').scrollTop };
    });
    const a = await where();
    expect(a.scroll).toBeGreaterThan(300); // still down the list
    expect(a.page).toBe(0); // the page itself never scrolls, only the view
    expect(a.barTop).toBeGreaterThanOrEqual(a.viewTop);
    expect(a.barTop - a.viewTop).toBeLessThan(20);
    // scrolling on (both ways) keeps it pinned
    const q = await rowPoint(page, 2);
    await drag(page, cdp, [q.x, q.y + 80], [q.x, q.y - 200], 8);
    const b = await where();
    expect(b.scroll).not.toBe(a.scroll);
    expect(b.page).toBe(0);
    expect(Math.abs(b.barTop - a.barTop)).toBeLessThan(1);
    await drag(page, cdp, [q.x, q.y - 100], [q.x, q.y + 150], 8);
    const c = await where();
    expect(c.page).toBe(0);
    expect(Math.abs(c.barTop - a.barTop)).toBeLessThan(1);
    await expect(page.locator('#btn-bulk-delete-header')).toBeInViewport();
  });

  test('a plain tap opens the transaction', async ({ page }) => {
    await boot(page);
    const cdp = await cdpOf(page);
    const p = await rowPoint(page, 0);
    await tap(page, cdp, p);
    await page.waitForFunction(() => location.hash.startsWith('#edit'));
    expect((await state(page)).on).toBe(false);
  });

  test('the actions are hidden at rest and appear only on a swiped row', async ({ page }) => {
    await boot(page);
    const hidden = await page.evaluate(() => Array.from(document.querySelectorAll('#history-list .swipe-actions'))
      .every(a => getComputedStyle(a).visibility === 'hidden'));
    expect(hidden).toBe(true);

    const cdp = await cdpOf(page);
    const p = await rowPoint(page, 1);
    await drag(page, cdp, [p.right - 30, p.y], [p.right - 200, p.y + 4]);
    expect(await offsetOf(page, p.id)).toBe(-110);
    const box = page.locator(`.swipe-container[data-id="${p.id}"]`);
    await expect(box).toHaveClass(/is-open/);
    await expect(box.locator('.swipe-action-btn.delete')).toBeVisible();
    expect(await page.evaluate((i) => getComputedStyle(document.querySelector(`.swipe-container[data-id="${i}"] .swipe-actions.right`)).visibility, p.id)).toBe('visible');
    // a drag is not a tap: still on History, nothing selected
    expect(await state(page)).toMatchObject({ on: false, hash: '#transactions' });

    // a tap on the open row only closes it
    await tap(page, cdp, await rowPoint(page, 1));
    expect(await offsetOf(page, p.id)).toBe(0);
    expect((await state(page)).hash).toBe('#transactions');
    await page.waitForTimeout(400);
    await expect(box).not.toHaveClass(/is-open/);

    // a drag to the right shows Paid
    await drag(page, cdp, [p.left + 30, p.y], [p.left + 160, p.y + 3]);
    expect(await offsetOf(page, p.id)).toBe(70);
    await expect(box.locator('.swipe-action-btn.paid')).toBeVisible();
  });

  test('Delete answers the first tap after a swipe (Chromium ate it)', async ({ page }) => {
    await boot(page);
    const cdp = await cdpOf(page);
    const p = await rowPoint(page, 0);
    await drag(page, cdp, [p.right - 30, p.y], [p.right - 200, p.y + 2]);
    expect(await offsetOf(page, p.id)).toBe(-110);
    const del = await page.locator(`.swipe-container[data-id="${p.id}"] .swipe-action-btn.delete`).boundingBox();
    await tap(page, cdp, { x: del.x + del.width / 2, y: del.y + del.height / 2 });
    await expect(page.locator('#active-modal')).toBeVisible();
  });

  test('a scroll closes an open row, and a fast scroll selects or opens nothing', async ({ page }) => {
    await boot(page);
    const cdp = await cdpOf(page);
    const p = await rowPoint(page, 0);
    await drag(page, cdp, [p.right - 30, p.y], [p.right - 200, p.y]);
    expect(await offsetOf(page, p.id)).toBe(-110);

    const top0 = await page.evaluate(() => document.getElementById('router-view').scrollTop);
    const q = await rowPoint(page, 1);
    await drag(page, cdp, [q.x, q.y + 60], [q.x + 6, q.y - 220], 6); // a quick upward flick
    await page.waitForTimeout(300);
    const top1 = await page.evaluate(() => document.getElementById('router-view').scrollTop);
    expect(top1).not.toBe(top0);
    expect(await offsetOf(page, p.id)).toBe(0);
    const s = await state(page);
    expect(s.on).toBe(false);
    expect(s.hash).toBe('#transactions');
    expect(await page.locator('#history-list .swipe-container.is-open').count()).toBe(0);
  });
});
