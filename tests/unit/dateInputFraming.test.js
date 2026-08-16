import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// v0.95 (refactor-plan-2 P3.1): the original version of this suite asserted
// only the declarations that turned out to be INEFFECTIVE on iOS (the desktop
// ::-webkit-datetime-edit tree, min-width:0 in a block parent) — it stayed
// green while the overflow shipped. These assertions pin the load-bearing
// pieces of the real fix instead. String-matching CSS is crude, but the rules
// live in one hand-written file and every one of these was individually
// verified to be the difference between overflowing and not on iOS WebKit.
describe('Date Field Overflow Fix & Form Input Framing (v0.95)', () => {
  const css = () =>
    fs.readFileSync(path.resolve(__dirname, '../../src/styles/components.css'), 'utf8');

  it('strips the native appearance — iOS ignores width:100% without it', () => {
    const cssContent = css();
    const dateBlock = cssContent.slice(
      cssContent.indexOf('input[type="date"].form-control'),
      cssContent.indexOf('input[type="date"]::-webkit-date-and-time-value')
    );
    expect(dateBlock).toContain('-webkit-appearance: none');
    expect(dateBlock).toContain('appearance: none');
    // The old display:flex host made iOS fall back to intrinsic sizing —
    // the very overflow this file exists to prevent.
    expect(dateBlock).toContain('display: block');
    expect(dateBlock).not.toContain('display: flex');
  });

  it('styles the iOS value pseudo — the desktop-only shadow tree was the v0.6x fix-fail', () => {
    const cssContent = css();
    expect(cssContent).toContain('::-webkit-date-and-time-value');
    const valueBlock = cssContent.slice(
      cssContent.indexOf('input[type="date"]::-webkit-date-and-time-value')
    );
    expect(valueBlock.slice(0, 600)).toContain('text-align: left');
    expect(valueBlock.slice(0, 600)).toContain('width: 100%');
  });

  it('keeps the width clamps on the control itself', () => {
    const cssContent = css();
    expect(cssContent).toContain('input[type="date"].form-control');
    expect(cssContent).toContain('input[type="time"].form-control');
    expect(cssContent).toContain('max-width: 100%');
    expect(cssContent).toContain('box-sizing: border-box');
  });

  it('keeps the desktop shadow-tree rules (correct there) and the picker indicator', () => {
    const cssContent = css();
    expect(cssContent).toContain('::-webkit-datetime-edit');
    expect(cssContent).toContain('::-webkit-calendar-picker-indicator');
  });

  it('contains any future intrinsic-width leak at the card boundary', () => {
    const cssContent = css();
    const cardBlock = cssContent.slice(
      cssContent.indexOf('.card {'),
      cssContent.indexOf('.card-elevated')
    );
    expect(cardBlock).toContain('overflow-x: clip');
    expect(cardBlock).toContain('min-width: 0');
  });

  it('lets grid-item form groups shrink (budget month grid)', () => {
    const cssContent = css();
    const groupBlock = cssContent.slice(
      cssContent.indexOf('.form-group {'),
      cssContent.indexOf('.form-control {')
    );
    expect(groupBlock).toContain('min-width: 0');
  });

  it('defines --color-border and --border-color in variables.css', () => {
    const varsContent = fs.readFileSync(
      path.resolve(__dirname, '../../src/styles/variables.css'), 'utf8');
    expect(varsContent).toContain('--color-border:');
    expect(varsContent).toContain('--border-color: var(--color-border)');
  });
});
