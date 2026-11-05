import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// 1.2.0 (UX-4 / UX-8 / UX-3): CSS contracts of Unit A, read from the
// stylesheets as text (the touchTargets.test.js `ruleFor` pattern).
const read = (f) => fs.readFileSync(path.resolve(__dirname, '../../src/styles', f), 'utf8');
const components = read('components.css');
const global_ = read('global.css');

// Declaration block of the FIRST rule whose selector list contains every
// given selector (comments stripped from the selector text).
const ruleIn = (css, selectors) => {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(s => s.trim());
    if (selectors.every(s => sel.includes(s))) return m[2].replace(/\/\*[\s\S]*?\*\//g, '');
  }
  return null;
};

describe('UX-4 — History swipe tray has no card-shaped backing', () => {
  it('.swipe-container is transparent but still clips the sliding row', () => {
    const body = ruleIn(components, ['.swipe-container']);
    expect(body).not.toBeNull();
    expect(body).toMatch(/background:\s*transparent/);
    expect(body).not.toMatch(/--bg-surface-sunken/);
    expect(body).toMatch(/position:\s*relative/);
    expect(body).toMatch(/overflow:\s*hidden/);
    expect(body).toMatch(/margin-bottom:\s*var\(--space-3\)/);
    expect(body).toMatch(/border-radius:\s*var\(--radius-lg\)/);
  });

  it('the edit button is surface-filled and keeps its border; buttons keep their shadow', () => {
    const edit = ruleIn(components, ['.swipe-action-btn.edit']);
    expect(edit).toMatch(/background:\s*var\(--bg-surface\)\s*;/);
    expect(edit).toMatch(/border:\s*1px solid var\(--color-border\)/);
    const btn = ruleIn(components, ['.swipe-action-btn']);
    expect(btn).toMatch(/box-shadow:\s*0 4px 12px/);
  });
});

describe('UX-8 — amount caret sits on the digits', () => {
  it('.amount-input has a tight line box and a visible caret', () => {
    const body = ruleIn(components, ['.amount-input']);
    expect(body).not.toBeNull();
    expect(body).toMatch(/line-height:\s*1\.15/);
    expect(body).toMatch(/padding:\s*0/);
    expect(body).toMatch(/height:\s*auto/);
    expect(body).toMatch(/caret-color:\s*currentColor/);
  });

  it('inputs and textareas are selectable despite body user-select: none', () => {
    const body = ruleIn(global_, ['input', 'textarea']);
    expect(body).not.toBeNull();
    expect(body).toMatch(/-webkit-user-select:\s*text/);
    expect(body).toMatch(/(^|[^-])user-select:\s*text/);
    // it comes right after the body rule, which still locks selection
    expect(global_.indexOf('input, textarea {')).toBeGreaterThan(global_.indexOf('body {'));
    const bodyRule = global_.match(/(^|\n)body \{([^}]*)\}/);
    expect(bodyRule && bodyRule[2]).toMatch(/user-select:\s*none/);
  });

  it('the new-log autofocus waits for the view transition', () => {
    const views = fs.readFileSync(path.resolve(__dirname, '../../src/views.js'), 'utf8');
    expect(views).toContain('setTimeout(() => amountInput.focus(), 320)');
    expect(views).not.toContain('setTimeout(() => amountInput.focus(), 100)');
  });
});

describe('UX-3 — Home pager CSS', () => {
  it('the pager snaps per pane and bleeds through the container gutters', () => {
    const body = ruleIn(components, ['.home-pager']);
    expect(body).not.toBeNull();
    expect(body).toMatch(/scroll-snap-type:\s*x mandatory/);
    expect(body).toMatch(/scrollbar-width:\s*none/);
    expect(body).toMatch(/margin-inline:\s*calc\(-1 \* var\(--container-pad-left/);
  });

  it('each pane is one snapport wide', () => {
    const body = ruleIn(components, ['.home-pane']);
    expect(body).toMatch(/flex:\s*0 0 100%/);
    expect(body).toMatch(/scroll-snap-align:\s*start/);
    expect(body).toMatch(/scroll-snap-stop:\s*always/);
    expect(body).toMatch(/min-width:\s*0/);
  });

  it('dots copy the size-dot geometry (8px → 22px pill, enlarged halo)', () => {
    expect(ruleIn(components, ['.home-pager-dot'])).toMatch(/width:\s*8px/);
    expect(ruleIn(components, ['.home-pager-dot.is-active'])).toMatch(/width:\s*22px/);
    expect(ruleIn(components, ['.home-pager-dot::after'])).toMatch(/inset:\s*-16px -12px/);
  });

  it('the pager rides the horizontal-scroll whitelist ([data-horizontal-scroll]) without its own overflow', () => {
    expect(components).toMatch(/\[data-horizontal-scroll\]/);
    expect(ruleIn(components, ['.home-pager'])).not.toMatch(/overflow-x/);
    expect(components).toContain('touch-action: pan-x pan-y !important;');
  });
});
