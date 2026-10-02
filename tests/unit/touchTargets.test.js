import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// 1.0.1 (BUG-22): compact controls (28-31px pills/toggles, the 23px budget
// month label, the 21px "+ Add custom" text button) get a 48px tap area with
// their visuals unchanged (D2): a vertical-only transparent ::after halo of
// var(--target-size), or, for the text button, padding offset by a negative
// margin.
const executeFile = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '../../src', relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const css = fs.readFileSync(path.resolve(__dirname, '../../src/styles/components.css'), 'utf8');

// Return the declaration block of the first rule whose selector list contains every given selector.
const ruleFor = (selectors) => {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(s => s.trim());
    if (selectors.every(s => sel.includes(s))) return m[2];
  }
  return null;
};

describe('Hit-target halo CSS (BUG-22)', () => {
  it('defines a 48px vertical-only ::after halo for .hit-target, chart toggles and widget pills', () => {
    const body = ruleFor(['.hit-target::after', '.chart-toggle-btn::after', '.widget-pill-btn::after']);
    expect(body).not.toBeNull();
    expect(body).toMatch(/content:\s*''/);
    expect(body).toMatch(/position:\s*absolute/);
    expect(body).toMatch(/height:\s*var\(--target-size\)/);
    expect(body).toMatch(/top:\s*calc\(50% - var\(--target-size\) \/ 2\)/);
    // horizontally the halo is exactly the control's own width
    expect(body).toMatch(/left:\s*0/);
    expect(body).toMatch(/right:\s*0/);
  });

  it('makes the hosts containing blocks for the halo', () => {
    const body = ruleFor(['.hit-target', '.chart-toggle-btn', '.widget-pill-btn']);
    expect(body).not.toBeNull();
    expect(body).toMatch(/position:\s*relative/);
  });

  it('--target-size is still 48px', () => {
    const vars = fs.readFileSync(path.resolve(__dirname, '../../src/styles/variables.css'), 'utf8');
    expect(vars).toMatch(/--target-size:\s*48px/);
  });
});

describe('Compact controls carry the hit target (BUG-22)', () => {
  let mem;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    mem = { stackd_v1_homeWidgets: '[]' };
    document.body.innerHTML = '<div id="modal-container"></div><div id="router-view"></div>';
    global.window.localStorage = {
      getItem: vi.fn((k) => (k in mem ? mem[k] : null)),
      setItem: vi.fn((k, v) => { mem[k] = String(v); }),
      removeItem: vi.fn((k) => { delete mem[k]; })
    };
    global.window.StackdHydrateIcons = vi.fn();
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');
    window.Store.init();
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Checking' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderInto = (html) => {
    const root = document.getElementById('router-view');
    root.innerHTML = html;
    return root;
  };

  it('Others: theme and history-sort toggles', () => {
    const root = renderInto(window.Views.OthersView.render(window.Store.getState()));
    ['btn-theme-light', 'btn-theme-dark', 'btn-theme-system', 'btn-sort-desc', 'btn-sort-asc'].forEach(id => {
      const el = root.querySelector('#' + id);
      expect(el, id).not.toBeNull();
      expect(el.classList.contains('hit-target'), id).toBe(true);
      // visuals unchanged: still the compact 28px pill
      expect(el.style.height, id).toBe('28px');
    });
  });

  it('Budget: month label stretches to the pill row and has the halo', () => {
    const root = renderInto(window.Views.BudgetView.render(window.Store.getState()));
    const el = root.querySelector('#bdg-month-picker-btn');
    expect(el).not.toBeNull();
    expect(el.classList.contains('hit-target')).toBe(true);
    expect(el.style.alignSelf).toBe('stretch');
  });

  it('Transaction form: "+ Add custom" grows its box without moving the row', () => {
    const root = renderInto(window.Views.AddTransactionView.render(window.Store.getState()));
    const el = root.querySelector('#btn-add-category');
    expect(el).not.toBeNull();
    expect(el.style.padding).toBe('16px 0px 8px');
    expect(el.style.margin).toBe('-16px 0px -8px');
  });

  it('Recurring settings OFF/ON toggles carry the halo', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/components.js'), 'utf8');
    expect(src).toMatch(/id="rs-toggle-off" class="btn hit-target"/);
    expect(src).toMatch(/id="rs-toggle-on" class="btn hit-target"/);
  });
});
