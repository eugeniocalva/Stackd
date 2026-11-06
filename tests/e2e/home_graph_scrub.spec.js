import { test, expect } from '@playwright/test';

// 1.2.2 (HG-1): drag-to-read on the Home graphs, with REAL touch input (CDP
// Input.dispatchTouchEvent goes through Chromium's gesture pipeline, so
// touch-action and cancelled touchmoves decide whether the pager scrolls).
// A sideways drag on the plot reads values and never pages; the same swipe
// on the axis labels or the range chips still pages; a vertical drag on the
// plot scrolls Home. Pixel 7 width, clock pinned.
test.use({ viewport: { width: 412, height: 700 }, hasTouch: true, isMobile: true });

const boot = async (page) => {
  await page.clock.install({ time: new Date(2026, 9, 15, 12, 0, 0) });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', JSON.stringify([
      { id: 'w1', type: 'latest', size: 'large', config: {}, createdAt: 1 },
      { id: 'w2', type: 'categories', size: 'large', config: {}, createdAt: 2 }
    ]));
    localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
  });
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store && !!window.Router && !!window.Views && !!window.Chart);
  await page.evaluate(() => {
    const S = window.Store;
    S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2025-06-01' });
    const id = S.getState().accounts[0].id;
    for (let m = 0; m < 12; m++) {
      const d = new Date(2025, 10 + m, 3, 12);
      if (d > new Date(2026, 9, 15)) break;
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-03`;
      S.dispatch('ADD_TRANSACTION', { type: 'income', amount: 400 + m * 10, accountId: id, categoryId: 'cat_salary', date: ymd });
      S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 150, accountId: id, categoryId: 'cat_groceries', date: ymd });
    }
  });
  await page.waitForSelector('#home-pager');
  // real touches hit whatever is on top: the boot splash must be gone
  await page.waitForSelector('#splash-screen', { state: 'detached' });
  // the zone is placed on the plot area once Chart.js has laid out
  await page.waitForFunction(() => {
    const z = document.getElementById('balance-scrub-zone');
    return z && z.style.width && parseFloat(z.style.width) > 100;
  });
};

const rect = (page, sel) => page.evaluate((s) => {
  const r = document.querySelector(s).getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}, sel);

const pagerLeft = (page) => page.evaluate(() => document.getElementById('home-pager').scrollLeft);

const head = (page) => page.evaluate(() => ({
  total: document.getElementById('dash-total').textContent,
  cap: document.querySelector('.dash-var-today .dash-var-cap').textContent,
  scrubbing: document.getElementById('dash-head').classList.contains('is-scrubbing')
}));

// A finger drag from (x0,y0) to (x1,y1); `during` runs before the release.
const drag = async (page, cdp, [x0, y0], [x1, y1], { steps = 14, during } = {}) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(16);
  }
  let seen;
  if (during) seen = await during();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250); // let snap / debounce settle
  return seen;
};

test.describe('Home graph drag-to-read (1.2.2 HG-1)', () => {
  test('a sideways drag on the curve reads months into the header and never pages', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err));
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    const before = await head(page);
    const z = await rect(page, '#balance-scrub-zone');
    const y = z.top + z.height / 2;

    const mid = await drag(page, cdp, [z.right - 10, y], [z.left + z.width * 0.3, y], {
      during: () => head(page)
    });
    expect(mid.scrubbing).toBe(true);
    expect(mid.total).not.toBe(before.total);
    expect(mid.cap).not.toBe(before.cap);
    expect(await pagerLeft(page)).toBe(0);
    expect(await head(page)).toEqual(before); // release = back to today
    await expect(page.locator('.home-pager-dot[data-pane="0"]')).toHaveClass(/is-active/);
    // a drag is not a tap: the expanded sheet stays shut
    await expect(page.locator('#expanded-graph-modal')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('the same swipe on the axis labels pages to the monthly net', async ({ page }) => {
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    const z = await rect(page, '#balance-scrub-zone');
    const c = await rect(page, '#chart-card-container');
    const y = (z.bottom + c.bottom) / 2; // the label strip under the plot
    expect(c.bottom - z.bottom).toBeGreaterThan(10);
    await drag(page, cdp, [c.right - 20, y], [c.left + 20, y]);
    await expect(page.locator('.home-pager-dot[data-pane="1"]')).toHaveClass(/is-active/);
    expect(await pagerLeft(page)).toBeGreaterThan(100);
    expect((await head(page)).scrubbing).toBe(false);
  });

  test('the same swipe on the range chips pages too', async ({ page }) => {
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    const chips = await rect(page, '.home-range-chips');
    const y = chips.top + chips.height / 2;
    await drag(page, cdp, [chips.right - 20, y], [chips.left + 20, y]);
    await expect(page.locator('.home-pager-dot[data-pane="1"]')).toHaveClass(/is-active/);
    // the chip under the finger was not tapped
    await expect(page.locator('.home-range-chips [data-range="1y"]')).toHaveClass(/active/);
  });

  test('a vertical drag on the curve scrolls Home', async ({ page }) => {
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    const z = await rect(page, '#balance-scrub-zone');
    const x = z.left + z.width / 2;
    await drag(page, cdp, [x, z.bottom - 5], [x + 4, z.bottom - 5 - 160]);
    const after = await rect(page, '#balance-scrub-zone');
    expect(after.top).toBeLessThan(z.top - 40);
    expect(await pagerLeft(page)).toBe(0);
    expect((await head(page)).scrubbing).toBe(false);
  });

  test('a drag on the bars reads the month into the pane head and does not open Analytics', async ({ page }) => {
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    await page.locator('.home-pager-dot[data-pane="1"]').click();
    await page.waitForFunction(() => {
      const rail = document.getElementById('home-pager');
      return Math.abs(rail.scrollLeft - rail.clientWidth) < 2;
    });
    await page.waitForFunction(() => {
      const z = document.getElementById('netflow-scrub-zone');
      return z && parseFloat(z.style.width) > 100;
    });
    const capSel = '#netflow-pane .home-pane-head .widget-card-caption';
    const before = await page.locator(capSel).textContent();
    const z = await rect(page, '#netflow-scrub-zone');
    const y = z.top + z.height / 2;
    const mid = await drag(page, cdp, [z.left + 10, y], [z.right - 10, y], {
      during: () => page.locator(capSel).textContent()
    });
    expect(mid).toMatch(/ · [+−-]?€/);
    expect(await page.locator(capSel).textContent()).toBe(before);
    expect(await page.evaluate(() => location.hash)).not.toContain('analytics');
    await expect(page.locator('.home-pager-dot[data-pane="1"]')).toHaveClass(/is-active/);
  });

  test('a plain tap on the curve still opens the expanded sheet', async ({ page }) => {
    await boot(page);
    const z = await rect(page, '#balance-scrub-zone');
    await page.touchscreen.tap(z.left + z.width / 2, z.top + z.height / 2);
    await expect(page.locator('#expanded-graph-modal')).toHaveCount(1);
  });
});
