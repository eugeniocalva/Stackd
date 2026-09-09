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

  // v1.14: at targetSdk 36 Android forces edge-to-edge with no opt-out, and
  // env(safe-area-inset-*) is unreliable on Android WebViews older than 140.
  // Capacitor 8's System Bars plugin injects --safe-area-inset-* with the real
  // values, so each token now prefers the injected variable and keeps env() as
  // the fallback for iOS and the web. Both halves must stay present: without
  // the injected value the bottom nav sits under the gesture bar on Android,
  // without env() the notch inset is lost on iOS.
  it('each safe-area token prefers the injected inset and falls back to env()', () => {
    const cssContent = read('src/styles/variables.css');
    for (const side of ['top', 'bottom', 'left', 'right']) {
      expect(cssContent).toContain(
        `--safe-${side}: var(--safe-area-inset-${side}, env(safe-area-inset-${side}, 0px))`
      );
    }
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
