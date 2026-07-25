const fs = require('fs');
const path = require('path');

// Set up minimal global environment
global.window = {
  location: { hash: '#portfolio' },
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] ?? null; },
    setItem(k, v) { this._data[k] = v; },
    removeItem(k) { delete this._data[k]; }
  },
  crypto: {
    subtle: {
      generateKey() { return Promise.resolve({}); },
      exportKey() { return Promise.resolve(new Uint8Array(32)); },
      importKey() { return Promise.resolve({}); },
      encrypt() { return Promise.resolve(new Uint8Array(16)); },
      decrypt() { return Promise.resolve(new Uint8Array(16)); }
    }
  },
  Router: { getParams: () => ({}) },
  StackdHydrateIcons: () => {}
};

global.document = {
  addEventListener() {},
  querySelector() { return null; }
};

// Mock DOM classes or helpers
global.window.Components = {};

// Read and execute files in global scope
const files = ['crypto.js', 'db.js', 'store.js', 'market.js', 'components.js', 'views.js'];
files.forEach(file => {
  const content = fs.readFileSync(path.resolve(__dirname, '../../../../Desktop/Projects/Stackd/src', file), 'utf8');
  eval(content);
});

// Bind globals that script registered on window
global.window.Store = window.Store;
global.window.StackdMarket = window.StackdMarket;
global.window.StackdDB = window.StackdDB;
global.window.Views = window.Views;

// Seed data in store
console.log('Initializing store...');
window.Store.init();

// Add a holding to store
console.log('Adding holding...');
window.Store.dispatch('ADD_HOLDING', {
  ticker: 'AAPL',
  name: 'Apple Inc.',
  assetType: 'stock',
  accountId: '',
  buyDate: '2026-07-15',
  quantity: 10,
  buyInPrice: 180,
  buyInCurrency: 'USD'
});

// Try to render PortfolioView
console.log('Rendering PortfolioView...');
try {
  const state = window.Store.getState();
  const html = window.Views.PortfolioView.render(state);
  console.log('Render Succeeded!');
  console.log('HTML Length:', html.length);
} catch (err) {
  console.error('RENDER CRASHED:');
  console.error(err);
}
