import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Global Horizontal Scroll Lock Implementation', () => {
  it('configures body and html overflow-x lock in reset.css', () => {
    const resetPath = path.resolve(__dirname, '../../src/styles/reset.css');
    const resetContent = fs.readFileSync(resetPath, 'utf8');

    expect(resetContent).toContain('max-width: 100vw;');
    expect(resetContent).toContain('overflow-x: hidden;');
  });

  it('configures body, #app, and .view-container horizontal lock & overscroll in global.css', () => {
    const globalPath = path.resolve(__dirname, '../../src/styles/global.css');
    const globalContent = fs.readFileSync(globalPath, 'utf8');

    expect(globalContent).toContain('overflow-x: hidden !important;');
    expect(globalContent).toContain('touch-action: pan-y;');
    expect(globalContent).toContain('overscroll-behavior-x: none !important;');
  });

  it('configures container layout overflow clipping in components.css', () => {
    const componentsPath = path.resolve(__dirname, '../../src/styles/components.css');
    const componentsContent = fs.readFileSync(componentsPath, 'utf8');

    // clip, not hidden: hidden would make .container a scroll container and
    // break position:sticky page headers (v0.63)
    expect(componentsContent).toContain('overflow-x: clip;');
  });

  it('allows explicit horizontal scroll exceptions for Home account tiles carousel (.wallets-scroll-wrapper)', () => {
    const componentsPath = path.resolve(__dirname, '../../src/styles/components.css');
    const componentsContent = fs.readFileSync(componentsPath, 'utf8');

    expect(componentsContent).toContain('.wallets-scroll-wrapper');
    expect(componentsContent).toContain('overflow-x: auto !important;');
    expect(componentsContent).toContain('touch-action: pan-x pan-y !important;');
    expect(componentsContent).toContain('overscroll-behavior-x: contain !important;');
  });
});
