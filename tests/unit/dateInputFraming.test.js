import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Date Field Overflow Fix & Form Input Framing', () => {
  it('configures date and time input overflow containment in components.css', () => {
    const cssPath = path.resolve(__dirname, '../../src/styles/components.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    expect(cssContent).toContain('input[type="date"].form-control');
    expect(cssContent).toContain('input[type="time"].form-control');
    expect(cssContent).toContain('max-width: 100%');
    expect(cssContent).toContain('min-width: 0');
    expect(cssContent).toContain('box-sizing: border-box');
    expect(cssContent).toContain('::-webkit-calendar-picker-indicator');
  });

  it('configures form-group and form-control width framing in components.css', () => {
    const cssPath = path.resolve(__dirname, '../../src/styles/components.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    expect(cssContent).toContain('.form-group');
    expect(cssContent).toContain('.form-control');
    expect(cssContent).toContain('border: 1px solid var(--color-border)');
  });

  it('defines --color-border and --border-color in variables.css', () => {
    const varsPath = path.resolve(__dirname, '../../src/styles/variables.css');
    const varsContent = fs.readFileSync(varsPath, 'utf8');

    expect(varsContent).toContain('--color-border:');
    expect(varsContent).toContain('--border-color: var(--color-border)');
  });
});
