// 1.3.0 (GAP-7): every Bank Connect request is bounded. On a dead or very
// slow network the call fails as 'network_timeout' (status 0) instead of
// leaving a sheet spinning; a normal answer and a keepalive request (the
// revoke before a factory-reset reload) are untouched.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let BC;

const boot = () => {
  global.window = {
    __STACKD_BANK_CONNECT__: true,
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
    StackdHydrateIcons: vi.fn(),
    location: { hash: '#settings' }
  };
  global.localStorage = global.window.localStorage;
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'bank-connect.js'].forEach(executeFile);
  global.window.Store.init();
  BC = global.window.BankConnect;
};

// a fetch that never answers until its signal aborts — a dead network
const hangingFetch = () => vi.fn((url, init) => new Promise((res, rej) => {
  if (init && init.signal) {
    init.signal.addEventListener('abort', () => {
      const e = new Error('The operation was aborted.');
      e.name = 'AbortError';
      rej(e);
    });
  }
}));

beforeEach(() => boot());
afterEach(() => { vi.unstubAllGlobals(); });

describe('Bank Connect request timeout (GAP-7)', () => {
  it('defaults to 20 s', () => {
    expect(BC.TIMEOUT_MS).toBe(20000);
  });

  it('a request with no answer fails as network_timeout', async () => {
    const f = hangingFetch();
    vi.stubGlobal('fetch', f);
    const err = await BC.request('/v1/institutions?country=PT', { auth: false, timeoutMs: 40 }).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('network_timeout');
    expect(err.status).toBe(0);
    expect(f.mock.calls[0][1].signal).toBeDefined();
  });

  it('a body that never finishes also times out', async () => {
    vi.stubGlobal('fetch', vi.fn((url, init) => Promise.resolve({
      ok: true,
      status: 200,
      json: () => new Promise((res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))))
    })));
    const err = await BC.request('/v1/institutions?country=PT', { auth: false, timeoutMs: 40 }).catch(e => e);
    expect(err.code).toBe('network_timeout');
  });

  it('a normal answer is returned and the timer is cleared', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => [{ id: 'B' }] })));
    await expect(BC.request('/v1/institutions?country=PT', { auth: false })).resolves.toEqual([{ id: 'B' }]);
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });

  it('an offline network error keeps its own error, not a timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const err = await BC.request('/v1/institutions?country=PT', { auth: false }).catch(e => e);
    expect(err).toBeInstanceOf(TypeError);
  });

  it('broker errors still map to their codes', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 429, json: async () => ({ error: 'rate_limited' }) })));
    const err = await BC.request('/v1/institutions?country=PT', { auth: false }).catch(e => e);
    expect(err.code).toBe('rate_limited');
    expect(err.status).toBe(429);
  });

  it('a keepalive request is never aborted', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: true, status: 204 }));
    vi.stubGlobal('fetch', f);
    await expect(BC.request('/v1/devices/x', { auth: false, method: 'DELETE', keepalive: true })).resolves.toBe(null);
    expect(f.mock.calls[0][1].signal).toBeUndefined();
  });
});
