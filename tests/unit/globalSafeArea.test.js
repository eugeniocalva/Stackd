import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// v0.73 safe-area model: the status-bar inset is owned by #app as opaque
// padding, so no in-flow content can render (or steal taps) under the status
// bar. Scrollers and sticky headers carry NO --safe-top terms and NO
// negative-margin compensation. Fixed overlays (modals) sit outside #app's
// padding: full-screen modal top bars opt into the inset via
// .modal-top-bar--safe; bottom sheets (top edge mid-screen) must not get it.

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

describe('Global Safe Area Implementation (v0.73 model)', () => {
  it('includes viewport-fit=cover in index.html', () => {
    expect(read('index.html')).toContain('viewport-fit=cover');
  });

  it('defines --safe-top, --safe-bottom, --safe-left, --safe-right in variables.css', () => {
    const cssContent = read('src/styles/variables.css');
    expect(cssContent).toContain('--safe-top: env(safe-area-inset-top');
    expect(cssContent).toContain('--safe-bottom: env(safe-area-inset-bottom');
    expect(cssContent).toContain('--safe-left: env(safe-area-inset-left');
    expect(cssContent).toContain('--safe-right: env(safe-area-inset-right');
  });

  it('#app owns the top inset; .view-container (the scroller) does not pad it', () => {
    const cssContent = read('src/styles/global.css');
    expect(cssContent).toMatch(/#app \{[^}]*padding-top: var\(--safe-top\)/s);
    expect(cssContent).not.toMatch(/\.view-container \{[^}]*padding-top: var\(--safe-top\)/s);
  });

  it('sticky headers carry no --safe-top terms and no negative-margin hacks', () => {
    const cssContent = read('src/styles/components.css');
    expect(cssContent).not.toContain('margin-top: calc(var(--safe-top) * -1)');
    expect(cssContent).toMatch(
      /\.history-header-sticky,\s*\.header-nav \{[^}]*padding-top: var\(--space-2\)/s
    );
  });

  it('modal top bars: base has no inset, --safe modifier adds it', () => {
    const cssContent = read('src/styles/components.css');
    expect(cssContent).toMatch(/\.modal-top-bar \{[^}]*padding: var\(--space-4\) var\(--space-5\)/s);
    expect(cssContent).not.toMatch(/\.modal-top-bar \{[^}]*--safe-top[^}]*\}/s);
    expect(cssContent).toMatch(
      /\.modal-top-bar--safe \{[^}]*padding-top: calc\(var\(--space-4\) \+ var\(--safe-top\)\)/s
    );
  });

  it('full-screen modals opt into the inset and no top bar overrides padding inline', () => {
    const jsContent = read('src/components.js');
    // The two full-screen modals: category selection + add-widget flow.
    const safeBars = jsContent.match(/modal-top-bar modal-top-bar--safe/g) || [];
    expect(safeBars.length).toBeGreaterThanOrEqual(2);
    // A full-screen top bar re-adding inline padding would silently kill the
    // inset again (the exact bug this model replaced).
    expect(jsContent).not.toMatch(/modal-top-bar modal-top-bar--safe" style="[^"]*padding/);
  });

  it('bottom sheet container still starts below the status bar', () => {
    const cssContent = read('src/styles/components.css');
    expect(cssContent).toContain('top: calc(40px + var(--safe-top))');
  });

  it('main.js exposes the ?safetop= desktop testing override', () => {
    const jsContent = read('src/main.js');
    expect(jsContent).toContain("get('safetop')");
    expect(jsContent).toContain("setProperty('--safe-top'");
  });
});
