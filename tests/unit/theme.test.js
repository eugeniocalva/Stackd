import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to execute vanilla JS files in the global context
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', 'document', content);
  fn(global.window, global.window.localStorage, global.window.crypto, global.window.document);
};

describe('Theme State Management & Detection', () => {
  let mockStorage = {};
  let matchMediaListeners = [];
  let currentSystemMatches = false;

  beforeEach(() => {
    mockStorage = {};
    matchMediaListeners = [];
    currentSystemMatches = false;

    // Create mock DOM document element
    const attributes = {};
    const classListSet = new Set();

    const mockElement = {
      setAttribute: vi.fn((key, val) => { attributes[key] = val; }),
      getAttribute: vi.fn((key) => attributes[key] || null),
      classList: {
        add: vi.fn((cls) => classListSet.add(cls)),
        remove: vi.fn((cls) => classListSet.delete(cls)),
        contains: vi.fn((cls) => classListSet.has(cls))
      }
    };

    global.window = {
      crypto: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn((key) => mockStorage[key] || null),
        setItem: vi.fn((key, val) => { mockStorage[key] = val; }),
      },
      document: {
        documentElement: mockElement
      },
      matchMedia: vi.fn((query) => {
        return {
          matches: currentSystemMatches,
          media: query,
          addEventListener: vi.fn((evt, cb) => { matchMediaListeners.push(cb); }),
          removeEventListener: vi.fn((evt, cb) => {
            matchMediaListeners = matchMediaListeners.filter(l => l !== cb);
          }),
          addListener: vi.fn((cb) => { matchMediaListeners.push(cb); }),
          removeListener: vi.fn((cb) => {
            matchMediaListeners = matchMediaListeners.filter(l => l !== cb);
          })
        };
      }),
      addEventListener: vi.fn(),
    };

    global.localStorage = global.window.localStorage;
    global.document = global.window.document;

    // Load dependencies in order
    executeFile('db.js');
    executeFile('store.js');

    // Initialize store
    global.window.Store.init();
  });

  it('should initialize with default "system" theme and detect system preference', () => {
    const state = global.window.Store.getState();
    expect(state.theme).toBe('system');
    expect(state.activeTheme).toBe('light');
    expect(global.window.document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
  });

  it('should detect dark system preference when prefers-color-scheme: dark matches', () => {
    currentSystemMatches = true;
    expect(global.window.Store.getSystemTheme()).toBe('dark');

    global.window.Store.dispatch('SET_THEME', 'system');
    const state = global.window.Store.getState();
    expect(state.theme).toBe('system');
    expect(state.activeTheme).toBe('dark');
    expect(global.window.document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    expect(global.window.document.documentElement.classList.add).toHaveBeenCalledWith('dark');
  });

  it('should manually override theme to "dark" and securely persist in local storage', () => {
    global.window.Store.dispatch('SET_THEME', 'dark');
    const state = global.window.Store.getState();
    
    expect(state.theme).toBe('dark');
    expect(state.activeTheme).toBe('dark');
    expect(global.window.localStorage.setItem).toHaveBeenCalledWith('stackd_v1_theme', JSON.stringify('dark'));
    expect(global.window.document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    expect(global.window.document.documentElement.classList.add).toHaveBeenCalledWith('dark');
  });

  it('should manually override theme to "light" and update DOM attributes', () => {
    global.window.Store.dispatch('SET_THEME', 'light');
    const state = global.window.Store.getState();

    expect(state.theme).toBe('light');
    expect(state.activeTheme).toBe('light');
    expect(global.window.localStorage.setItem).toHaveBeenCalledWith('stackd_v1_theme', JSON.stringify('light'));
    expect(global.window.document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    expect(global.window.document.documentElement.classList.remove).toHaveBeenCalledWith('dark');
  });

  it('should fallback invalid theme input to "system"', () => {
    global.window.Store.dispatch('SET_THEME', 'invalid-theme-value');
    const state = global.window.Store.getState();
    expect(state.theme).toBe('system');
  });

  it('should dynamically update theme when system preference changes in "system" mode', () => {
    global.window.Store.dispatch('SET_THEME', 'system');
    expect(global.window.Store.getState().activeTheme).toBe('light');

    // Simulate system preference change event to dark
    currentSystemMatches = true;
    matchMediaListeners.forEach(listener => listener({ matches: true }));

    expect(global.window.Store.getState().activeTheme).toBe('dark');
    expect(global.window.document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
  });

  it('should NOT update theme on system preference change if manual override is set', () => {
    global.window.Store.dispatch('SET_THEME', 'light');
    expect(global.window.Store.getState().activeTheme).toBe('light');

    // Simulate system preference change event to dark
    currentSystemMatches = true;
    matchMediaListeners.forEach(listener => listener({ matches: true }));

    // Should remain light because manual override takes precedence
    expect(global.window.Store.getState().theme).toBe('light');
    expect(global.window.Store.getState().activeTheme).toBe('light');
  });
});
