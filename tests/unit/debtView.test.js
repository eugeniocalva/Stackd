import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const executeFile = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '../../src', relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('DebtView Unit Tests', () => {
  beforeEach(() => {
    global.window = {
      crypto: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
      },
      StackdHydrateIcons: vi.fn()
    };
    global.localStorage = global.window.localStorage;
    global.document = {
      getElementById: vi.fn(),
      querySelector: vi.fn(),
      querySelectorAll: vi.fn(() => []),
      body: { appendChild: vi.fn() }
    };

    executeFile('db.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');

    global.window.Store.init();
  });

  it('renders empty DebtView state when no loans exist', () => {
    const state = global.window.Store.getState();
    const html = global.window.Views.DebtView.render(state);
    expect(html).toContain('Debt Simulator');
    expect(html).toContain('No Active Loans');
    expect(html).toContain('btn-add-loan-empty');
  });

  it('renders DebtView with loans list and calculates totals', () => {
    global.window.Store.dispatch('ADD_LOAN', {
      name: 'Car Loan',
      amount: 12000,
      tan: 3.5,
      durationMonths: 24,
      startDate: '2026-01-01',
      monthlyPayment: 518.42
    });

    const state = global.window.Store.getState();
    const html = global.window.Views.DebtView.render(state);

    expect(html).toContain('Car Loan');
    expect(html).toContain('3.5% TAN');
    expect(html).toContain('24 Months');
    expect(html).toContain('$518.42 / mo');
  });

  it('supports ADD_LOAN, UPDATE_LOAN, and DELETE_LOAN store actions', () => {
    global.window.Store.dispatch('ADD_LOAN', {
      name: 'Test Loan',
      amount: 5000,
      tan: 4.0,
      durationMonths: 12,
      startDate: '2026-01-01',
      monthlyPayment: 425.75
    });

    let loans = global.window.Store.getState().loans;
    expect(loans.length).toBe(1);
    expect(loans[0].name).toBe('Test Loan');

    const loanId = loans[0].id;
    global.window.Store.dispatch('UPDATE_LOAN', {
      id: loanId,
      name: 'Updated Home Loan'
    });

    loans = global.window.Store.getState().loans;
    expect(loans[0].name).toBe('Updated Home Loan');

    global.window.Store.dispatch('DELETE_LOAN', { id: loanId });
    loans = global.window.Store.getState().loans;
    expect(loans.length).toBe(0);
  });
});
