import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// v0.70: opening an existing transfer for editing must resolve the counterpart
// leg via the SHARED transferRef pair key, not by matching it against t.id.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// Pull the `selected` option out of a given <select id="...">
const selectedOptionOf = (html, selectId) => {
  const open = html.indexOf(`id="${selectId}"`);
  if (open === -1) return null;
  const end = html.indexOf('</select>', open);
  const block = html.slice(open, end);
  const match = block.match(/<option value="([^"]+)"\s+selected>/);
  return match ? match[1] : null;
};

describe('Transfer edit — counterpart lookup', () => {
  let bankId, savingsId, cashId;

  // ADD_ACCOUNT stamps its opening_balance transaction with today, and
  // getBalanceAtDate drops anything dated before it — so log the transfer today.
  const now = new Date();
  const TODAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const setupParams = (id) => {
    global.window.Router = { getParams: () => ({ id }) };
  };

  beforeEach(() => {
    global.window = {
      crypto: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn()
      },
      document: {
        getElementById: () => null,
        createElement: () => ({ style: {}, classList: { add: vi.fn() }, appendChild: vi.fn() })
      },
      requestAnimationFrame: (cb) => cb(),
      StackdHydrateIcons: vi.fn(),
      Components: {},
      Views: {},
      Router: { getParams: () => ({}) }
    };
    global.localStorage = global.window.localStorage;
    global.document = global.window.document;

    executeFile('db.js');
    executeFile('store.js');
    executeFile('views.js');

    global.window.Store.init();

    // Names chosen so the alphabetical fallback (Bank) differs from the real
    // "To" account (Savings) — that fallback was the visible symptom.
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 1000 });
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0 });
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Cash', openingBalance: 0 });

    const accounts = global.window.Store.getState().accounts;
    bankId = accounts.find(a => a.name === 'Bank').id;
    savingsId = accounts.find(a => a.name === 'Savings').id;
    cashId = accounts.find(a => a.name === 'Cash').id;

    global.window.Store.dispatch('ADD_TRANSFER', {
      amount: 250,
      expenseAccountId: bankId,
      incomeAccountId: savingsId,
      date: TODAY,
      note: 'To the rainy day pile'
    });
  });

  const legs = () => {
    const txs = global.window.Store.getState().transactions.filter(t => t.transferRef);
    return {
      expense: txs.find(t => t.type === 'expense'),
      income: txs.find(t => t.type === 'income')
    };
  };

  it('stamps both legs with the same transferRef (which is not either leg id)', () => {
    const { expense, income } = legs();
    expect(expense.transferRef).toBe(income.transferRef);
    expect(expense.transferRef).not.toBe(expense.id);
    expect(expense.transferRef).not.toBe(income.id);
  });

  it('opening the expense leg shows From = Bank, To = Savings', () => {
    const { expense } = legs();
    setupParams(expense.id);

    const html = global.window.Views.AddTransactionView.render(global.window.Store.getState());

    expect(selectedOptionOf(html, 'tx-account')).toBe(bankId);
    expect(selectedOptionOf(html, 'tx-transfer-to')).toBe(savingsId);
  });

  it('opening the income leg flips it: From = Bank (expense leg), To = Savings', () => {
    const { income } = legs();
    setupParams(income.id);

    const html = global.window.Views.AddTransactionView.render(global.window.Store.getState());

    expect(selectedOptionOf(html, 'tx-account')).toBe(bankId);
    expect(selectedOptionOf(html, 'tx-transfer-to')).toBe(savingsId);
    // The income leg's own account must never land in the "From" slot
    expect(selectedOptionOf(html, 'tx-account')).not.toBe(income.accountId);
  });

  it('never falls back to the first account alphabetically for "To Account"', () => {
    // Cash sorts before Savings; Bank sorts first overall. A broken lookup left
    // initialToAccount '' and the select defaulted to Bank == the From account.
    const { expense } = legs();
    setupParams(expense.id);

    const html = global.window.Views.AddTransactionView.render(global.window.Store.getState());
    const to = selectedOptionOf(html, 'tx-transfer-to');

    expect(to).not.toBe(null);
    expect(to).not.toBe(cashId);
    expect(to).not.toBe(selectedOptionOf(html, 'tx-account'));
  });

  it('re-saving an unmodified transfer round-trips to the same two accounts', () => {
    const { expense, income } = legs();
    setupParams(income.id);

    const html = global.window.Views.AddTransactionView.render(global.window.Store.getState());
    const from = selectedOptionOf(html, 'tx-account');
    const to = selectedOptionOf(html, 'tx-transfer-to');

    // The form guards against this before dispatching; with the bug both were Bank.
    expect(from).not.toBe(to);

    global.window.Store.dispatch('UPDATE_TRANSFER', {
      transferRef: expense.transferRef,
      amount: 250,
      expenseAccountId: from,
      incomeAccountId: to,
      date: TODAY,
      note: 'To the rainy day pile'
    });

    const after = legs();
    expect(after.expense.accountId).toBe(bankId);
    expect(after.income.accountId).toBe(savingsId);
    expect(global.window.Store.getAccountBalance(bankId)).toBe(750);
    expect(global.window.Store.getAccountBalance(savingsId)).toBe(250);
    // ids untouched — no leg was recreated
    expect(after.expense.id).toBe(expense.id);
    expect(after.income.id).toBe(income.id);
  });
});
