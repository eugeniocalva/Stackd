import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Graph X-Axis Label Scaling Implementation', () => {
  it('configures autoSkip, maxRotation: 45, and dynamic font sizing on Home page main graph in views.js', () => {
    const viewsPath = path.resolve(__dirname, '../../src/views.js');
    const viewsContent = fs.readFileSync(viewsPath, 'utf8');

    expect(viewsContent).toContain('autoSkip: true');
    expect(viewsContent).toContain('autoSkipPadding: 6');
    expect(viewsContent).toContain('maxRotation: 45');
    expect(viewsContent).toContain('minRotation: 0');
    expect(viewsContent).toContain('width < 360 ? 9 : 10');
  });

  it('configures autoSkip, maxRotation: 45, and dynamic font sizing on NetFlowChart & ExpandedGraphModal in components.js', () => {
    const componentsPath = path.resolve(__dirname, '../../src/components.js');
    const componentsContent = fs.readFileSync(componentsPath, 'utf8');

    expect(componentsContent).toContain('autoSkip: true');
    expect(componentsContent).toContain('autoSkipPadding: 6');
    expect(componentsContent).toContain('maxRotation: 45');
    expect(componentsContent).toContain('minRotation: 0');
    expect(componentsContent).toContain('width < 360 ? 9 : 10');
  });
});
