import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Global Safe Area Implementation', () => {
  it('includes viewport-fit=cover in index.html', () => {
    const htmlPath = path.resolve(__dirname, '../../index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    expect(htmlContent).toContain('viewport-fit=cover');
  });

  it('defines --safe-top, --safe-bottom, --safe-left, --safe-right in variables.css', () => {
    const cssPath = path.resolve(__dirname, '../../src/styles/variables.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    expect(cssContent).toContain('--safe-top: env(safe-area-inset-top');
    expect(cssContent).toContain('--safe-bottom: env(safe-area-inset-bottom');
    expect(cssContent).toContain('--safe-left: env(safe-area-inset-left');
    expect(cssContent).toContain('--safe-right: env(safe-area-inset-right');
  });

  it('configures #app and .view-container safe area padding in global.css', () => {
    const cssPath = path.resolve(__dirname, '../../src/styles/global.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    expect(cssContent).toContain('padding-left: var(--safe-left)');
    expect(cssContent).toContain('padding-right: var(--safe-right)');
    expect(cssContent).toContain('padding-top: var(--safe-top)');
  });

  it('configures sticky headers (.history-header-sticky and .header-nav) safe top in components.css', () => {
    const cssPath = path.resolve(__dirname, '../../src/styles/components.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    expect(cssContent).toContain('margin-top: calc(var(--safe-top) * -1)');
    expect(cssContent).toContain('padding-top: calc(var(--space-4) + var(--safe-top))');
    expect(cssContent).toContain('margin-bottom: var(--safe-top)');
    expect(cssContent).toContain('.history-header-sticky');
    expect(cssContent).toContain('.header-nav');
  });

  it('configures modal top bar and bottom sheet safe areas in components.css', () => {
    const cssPath = path.resolve(__dirname, '../../src/styles/components.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    expect(cssContent).toContain('.modal-top-bar');
    expect(cssContent).toContain('padding: calc(var(--space-4) + var(--safe-top))');
    expect(cssContent).toContain('.sheet-container');
    expect(cssContent).toContain('top: calc(40px + var(--safe-top))');
  });
});
