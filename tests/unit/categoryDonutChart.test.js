import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('CategoryDonutChart Distinct Colors', () => {
  beforeEach(() => {
    global.window = {
      crypto: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
      }
    };
    global.localStorage = global.window.localStorage;
    
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('components.js');

    global.window.Store.init();
  });

  it('assigns unique, distinct colors to top categories and slate to Others', () => {
    const rawData = [
      { id: 'cat_dining', name: 'Dining Out', amount: 500, icon: 'utensils', percentage: 50 },
      { id: 'cat_groceries', name: 'Groceries', amount: 250, icon: 'shopping-cart', percentage: 25 },
      { id: 'cat_rent', name: 'Rent', amount: 150, icon: 'home', percentage: 15 },
      { id: 'cat_entertainment', name: 'Entertainment', amount: 50, icon: 'clapperboard', percentage: 5 },
      { id: 'cat_shopping', name: 'Shopping', amount: 30, icon: 'shopping-bag', percentage: 3 },
      { id: 'cat_transport', name: 'Transport', amount: 20, icon: 'car', percentage: 2 }
    ];

    const capped = global.window.Components.CategoryDonutChart._capData(rawData);
    const assigned = global.window.Components.CategoryDonutChart._assignColors(capped);

    expect(assigned.length).toBe(6); // 5 top + Others

    const colors = assigned.map(item => item._color);
    const top5Colors = colors.slice(0, 5);
    const uniqueTop5Colors = new Set(top5Colors);

    // Ensure all 5 top category colors are distinct from each other
    expect(uniqueTop5Colors.size).toBe(5);

    // Ensure Others category (index 5) gets slate color #94a3b8
    expect(assigned[5].isOthers).toBe(true);
    expect(assigned[5]._color).toBe('#94a3b8');
  });

  it('renders matching legend indicator colors for assigned category colors', () => {
    const rawData = [
      { id: 'cat_dining', name: 'Dining Out', amount: 300, icon: 'utensils', percentage: 60 },
      { id: 'cat_groceries', name: 'Groceries', amount: 200, icon: 'shopping-cart', percentage: 40 }
    ];

    const html = global.window.Components.CategoryDonutChart.render(rawData, 'expense');
    
    // Check that style background contains the category colors
    expect(html).toContain('background: #f59e0b'); // Dining Out amber
    expect(html).toContain('background: #10b981'); // Groceries emerald
  });
});
