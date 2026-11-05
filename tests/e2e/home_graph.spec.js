import { test, expect } from '@playwright/test';

// 1.2.0 (UX-1 / UX-3): the Home graph — a two-pane scroll-snap pager under
// the total (pane 0: the trend-coloured balance curve with range chips,
// pane 1: the monthly net bars), two dots, and the expand-on-tap sheet kept
// on #chart-card-container. Pixel 7 viewport, clock pinned.
test.use({ viewport: { width: 412, height: 839 }, hasTouch: true });

const boot = async (page) => {
  await page.clock.install({ time: new Date(2026, 9, 15, 12, 0, 0) });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', '[]');
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
      S.dispatch('ADD_TRANSACTION', { type: 'income', amount: 400, accountId: id, categoryId: 'cat_salary', date: ymd });
      S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 150, accountId: id, categoryId: 'cat_groceries', date: ymd });
    }
  });
  await page.waitForSelector('#home-pager');
};

const dotState = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.home-pager-dot')].map(d => ({
    active: d.classList.contains('is-active'),
    pressed: d.getAttribute('aria-pressed')
  })));

// Scroll the pager to a pane the way a swipe ends: set scrollLeft and let
// the (debounced) scroll listener read it.
const scrollToPane = (page, idx) => page.evaluate((i) => {
  const rail = document.getElementById('home-pager');
  rail.scrollLeft = i * rail.clientWidth;
  rail.dispatchEvent(new Event('scroll'));
}, idx);

test.describe('Home graph pager (1.2.0 UX-1/UX-3)', () => {
  test('renders the pager with two panes, two charts and two dots', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err));
    await boot(page);
    await expect(page.locator('#home-pager > .home-pane')).toHaveCount(2);
    await expect(page.locator('#home-pager #chart-card-container canvas#balanceChart')).toHaveCount(1);
    await expect(page.locator('#netflow-pane canvas#netflowChart')).toHaveCount(1);
    await expect(page.locator('.home-pager-dot')).toHaveCount(2);
    expect(await dotState(page)).toEqual([{ active: true, pressed: 'true' }, { active: false, pressed: 'false' }]);
    // both charts are live Chart.js instances on the view
    const ids = await page.evaluate(() => Object.values(window.Chart.instances).map(c => c.canvas && c.canvas.id).sort());
    expect(ids).toEqual(['balanceChart', 'netflowChart']);
    // each pane is one pager width (scroll-snap pages)
    const geo = await page.evaluate(() => {
      const rail = document.getElementById('home-pager');
      const panes = [...rail.querySelectorAll('.home-pane')];
      return { w: rail.clientWidth, sw: rail.scrollWidth, panes: panes.map(p => Math.round(p.getBoundingClientRect().width)) };
    });
    expect(geo.panes).toEqual([geo.w, geo.w]);
    expect(geo.sw).toBeGreaterThanOrEqual(geo.w * 2 - 1);
    expect(errors).toEqual([]);
  });

  test('scrolling the pager toggles the dots; a re-render keeps the pane', async ({ page }) => {
    await boot(page);
    await scrollToPane(page, 1);
    await expect(page.locator('.home-pager-dot[data-pane="1"]')).toHaveClass(/is-active/);
    await expect(page.locator('.home-pager-dot[data-pane="1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.home-pager-dot[data-pane="0"]')).not.toHaveClass(/is-active/);

    // a dispatch re-renders the whole dashboard: pane 2 stays visible
    await page.evaluate(() => window.Store.dispatch('TOGGLE_WIDGET_EDIT_MODE'));
    await page.waitForFunction(() => window.Store.getState().widgetEditMode === true);
    await expect(page.locator('.home-pager-dot[data-pane="1"]')).toHaveClass(/is-active/);
    const left = await page.evaluate(() => {
      const rail = document.getElementById('home-pager');
      return { left: rail.scrollLeft, w: rail.clientWidth };
    });
    expect(Math.abs(left.left - left.w)).toBeLessThan(2);

    await scrollToPane(page, 0);
    await expect(page.locator('.home-pager-dot[data-pane="0"]')).toHaveClass(/is-active/);
  });

  test('a dot tap moves the pager to its pane', async ({ page }) => {
    await boot(page);
    await page.locator('.home-pager-dot[data-pane="1"]').click();
    await expect(page.locator('.home-pager-dot[data-pane="1"]')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForFunction(() => {
      const rail = document.getElementById('home-pager');
      return Math.abs(rail.scrollLeft - rail.clientWidth) < 2;
    });
  });

  test('range chips switch the active state and redraw the curve without leaking charts', async ({ page }) => {
    await boot(page);
    const chip = (r) => page.locator(`.home-range-chips [data-range="${r}"]`);
    await expect(page.locator('.home-range-chips .chart-toggle-btn')).toHaveCount(6);
    await expect(chip('1y')).toHaveClass(/active/);
    const count = () => page.evaluate(() => Object.keys(window.Chart.instances).length);
    const baseline = await count();

    await chip('1m').click();
    await expect(chip('1m')).toHaveClass(/active/);
    await expect(chip('1m')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip('1y')).not.toHaveClass(/active/);
    expect(await page.evaluate(() => window.Views.DashboardView._balanceChart.data.datasets[0].data.length)).toBe(30);
    // the chip is not a tap on the graph
    await expect(page.locator('#expanded-graph-modal')).toHaveCount(0);

    await chip('1w').click();
    await expect(chip('1w')).toHaveClass(/active/);
    expect(await page.evaluate(() => window.Views.DashboardView._balanceChart.data.datasets[0].data.length)).toBe(7);
    expect(await count()).toBe(baseline);

    // a re-render keeps the chosen range
    await page.evaluate(() => window.Store.dispatch('TOGGLE_WIDGET_EDIT_MODE'));
    await page.waitForFunction(() => window.Store.getState().widgetEditMode === true);
    await expect(chip('1w')).toHaveClass(/active/);
    expect(await count()).toBe(baseline);

    // leaving Home releases both charts
    await page.evaluate(() => window.Router.navigate('#settings'));
    await page.waitForFunction(() => window.Store.getState().activeView === 'settings');
    expect(await count()).toBe(0);
  });

  test('clicking the curve still opens the expanded graph sheet', async ({ page }) => {
    await boot(page);
    await page.click('#chart-card-container');
    await expect(page.locator('#expanded-graph-modal')).toBeVisible();
    await page.click('#egm-close');
    await expect(page.locator('#expanded-graph-modal')).toHaveCount(0);
  });

  test('tapping the monthly net pane opens Analytics', async ({ page }) => {
    await boot(page);
    await page.locator('.home-pager-dot[data-pane="1"]').click();
    await page.waitForFunction(() => {
      const rail = document.getElementById('home-pager');
      return Math.abs(rail.scrollLeft - rail.clientWidth) < 2;
    });
    await page.locator('#netflow-pane .home-netflow-wrap').click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'analytics');
  });
});
