import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/index';
import { GoCardless } from '../src/gocardless';
import { makeEnv, fakeGoCardless, type FakeGc } from './fakes';
import type { Env } from '../src/env';

const BASE = 'https://broker.test';

interface ReqOpts {
  method?: string;
  body?: unknown;
  token?: string | null;
  ip?: string;
  client?: string | null;
  headers?: Record<string, string>;
}

let env: ReturnType<typeof makeEnv>;
let gc: FakeGc;
let app: ReturnType<typeof createApp>;
let clock: number;

const req = async (path: string, o: ReqOpts = {}) => {
  const headers: Record<string, string> = { 'cf-connecting-ip': o.ip || '203.0.113.1', ...(o.headers || {}) };
  if (o.client !== null) headers['x-stackd-client'] = o.client || 'stackd-web';
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  const res = await app.fetch(new Request(BASE + path, { method: o.method || (o.body !== undefined ? 'POST' : 'GET'), headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }), env as unknown as Env);
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* html / empty */ }
  return { status: res.status, data, headers: res.headers };
};

const mint = async (ip = '203.0.113.1') => {
  const r = await req('/v1/entitlement/verify', { body: {}, ip });
  expect(r.status).toBe(201);
  return r.data.deviceToken as string;
};

const start = async (token: string, over: Record<string, unknown> = {}) =>
  req('/v1/connect/start', { token, body: { country: 'IT', institutionId: 'BIGBANK_BIGBITMM', historyDays: 90, validityDays: 180, ...over } });

describe('Stack\'d broker', () => {
  beforeEach(() => {
    env = makeEnv();
    gc = fakeGoCardless();
    clock = Date.parse('2026-09-07T10:00:00.000Z');
    GoCardless.resetMemo();
    app = createApp({ fetch: gc.fetchImpl, now: () => clock });
  });

  describe('edge rules', () => {
    it('serves /healthz and refuses /v1 without the client id', async () => {
      expect((await req('/healthz')).data).toEqual({ ok: true, mode: 'open', service: 'stackd-broker' });
      expect((await req('/v1/institutions?country=IT', { client: null })).status).toBe(403);
      expect((await req('/v1/institutions?country=IT', { client: 'other' })).status).toBe(403);
      expect((await req('/nope')).status).toBe(404);
    });

    it('applies CORS only for allow-listed origins and answers preflights', async () => {
      const ok = await req('/healthz', { headers: { origin: 'http://localhost:3000' } });
      expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
      const no = await req('/healthz', { headers: { origin: 'https://evil.example' } });
      expect(no.headers.get('access-control-allow-origin')).toBeNull();
      const pre = await req('/v1/connect/start', { method: 'OPTIONS', headers: { origin: 'http://localhost:3000' } });
      expect(pre.status).toBe(204);
      expect(pre.headers.get('access-control-allow-headers')).toContain('authorization');
    });

    it('serves the App Links / Universal Links files from config', async () => {
      const al = await req('/.well-known/assetlinks.json');
      expect(al.data[0].target).toEqual({ namespace: 'android_app', package_name: 'com.stackd.finance', sha256_cert_fingerprints: ['AA:BB'] });
      const aasa = await req('/.well-known/apple-app-site-association');
      expect(aasa.data.applinks.details[0]).toEqual({ appID: 'TEAM123.com.stackd.finance', paths: ['/v1/connect/return*'] });
    });

    it('pins owners to the EU jurisdiction, falling back only when the runtime lacks the feature', async () => {
      const { ownerNamespace } = await import('../src/durable-objects');
      const calls: string[] = [];
      const pinned = { jurisdiction: (j: string) => { calls.push(j); return 'pinned'; } };
      expect(ownerNamespace({ OWNER_DO: pinned } as unknown as Env)).toBe('pinned');
      expect(calls).toEqual(['eu']);
      const local = { jurisdiction: () => { throw new Error('Jurisdiction restrictions are not implemented in workerd.'); } };
      expect(ownerNamespace({ OWNER_DO: local } as unknown as Env)).toBe(local);
      const broken = { jurisdiction: () => { throw new Error('boom'); } };
      expect(() => ownerNamespace({ OWNER_DO: broken } as unknown as Env)).toThrow('boom');
    });

    it('never runs open entitlement on the production host', async () => {
      env = makeEnv({ ENTITLEMENT_MODE: 'open', PUBLIC_URL: 'https://api.stackdplatform.com' });
      expect((await req('/healthz')).data.mode).toBe('store');
    });
  });

  describe('institutions', () => {
    it('proxies the country list trimmed to the picker fields', async () => {
      const r = await req('/v1/institutions?country=it');
      expect(r.status).toBe(200);
      expect(r.data).toHaveLength(2);
      expect(r.data[1]).toEqual({ id: 'BIGBANK_BIGBITMM', name: 'Big Bank', bic: 'BIGBITMM', logo: 'https://cdn.test/big.png', countries: ['IT'], transaction_total_days: '730', max_access_valid_for_days: '180' });
      expect(r.data[0].supported_features).toBeUndefined();
      expect(gc.calls.find(c => c.path.startsWith('/institutions/'))!.path).toBe('/institutions/?country=IT');
    });

    it('validates the country and rate-limits per IP', async () => {
      expect((await req('/v1/institutions')).status).toBe(400);
      expect((await req('/v1/institutions?country=ITA')).status).toBe(400);
      for (let i = 0; i < 120; i++) await req('/v1/institutions?country=GB', { ip: '198.51.100.9' });
      expect((await req('/v1/institutions?country=GB', { ip: '198.51.100.9' })).status).toBe(429);
      expect((await req('/v1/institutions?country=GB', { ip: '198.51.100.10' })).status).toBe(200);
    });
  });

  describe('aggregator token + breaker', () => {
    it('fetches the access token once and shares it through the SystemDO', async () => {
      await req('/v1/institutions?country=IT');
      GoCardless.resetMemo(); // a fresh isolate
      await req('/v1/institutions?country=GB');
      expect(gc.tokenCalls).toBe(1);
    });

    it('refreshes once on a 401 and passes the retry', async () => {
      await req('/v1/institutions?country=IT');
      gc.expireToken();
      const r = await req('/v1/institutions?country=GB');
      expect(r.status).toBe(200);
      expect(gc.tokenCalls).toBe(2);
    });

    it('opens the circuit for 10 minutes on an aggregator 429', async () => {
      gc.global429 = true;
      expect((await req('/v1/institutions?country=IT')).data).toEqual({ error: 'aggregator_rate_limited' });
      gc.global429 = false;
      expect((await req('/v1/institutions?country=IT')).data).toEqual({ error: 'aggregator_paused' });
      clock += 11 * 60 * 1000;
      expect((await req('/v1/institutions?country=IT')).status).toBe(200);
    });
  });

  describe('entitlement/verify', () => {
    it('mints an owner + device token on first contact and is entitled in open mode', async () => {
      const r = await req('/v1/entitlement/verify', { body: {} });
      expect(r.status).toBe(201);
      expect(r.data.deviceToken).toMatch(/^[0-9a-f]{16}\.[0-9a-f]{64}$/);
      expect(r.data.ownerId).toBe(r.data.deviceToken.split('.')[0]);
      expect(r.data.active).toBe(true);
      expect(r.data.mode).toBe('open');
      // The DO stores a hash, never the secret.
      const record = await env.owners.instance(r.data.ownerId).fetch(new Request('https://do/record')).then(x => x.json()) as any;
      expect(record.devices[0].hash).toHaveLength(64);
      expect(JSON.stringify(record)).not.toContain(r.data.deviceToken.split('.')[1]);
    });

    it('re-verifies an existing device without minting again, and rejects a forged token', async () => {
      const token = await mint();
      const again = await req('/v1/entitlement/verify', { body: {}, token });
      expect(again.status).toBe(200);
      expect(again.data.deviceToken).toBeUndefined();
      expect(again.data.ownerId).toBe(token.split('.')[0]);
      const forged = token.slice(0, -4) + 'ffff';
      expect((await req('/v1/entitlement/verify', { body: {}, token: forged })).status).toBe(401);
    });

    it('rate-limits token minting per IP', async () => {
      for (let i = 0; i < 10; i++) await mint('192.0.2.7');
      expect((await req('/v1/entitlement/verify', { body: {}, ip: '192.0.2.7' })).status).toBe(429);
    });

    it('store mode: not entitled by default, store receipts are a B5 501', async () => {
      env = makeEnv({ ENTITLEMENT_MODE: 'store' });
      const r = await req('/v1/entitlement/verify', { body: {} });
      expect(r.status).toBe(201);
      expect(r.data.active).toBe(false);
      const rec = await req('/v1/entitlement/verify', { body: { platform: 'play', purchaseToken: 'x' }, token: r.data.deviceToken });
      expect(rec.status).toBe(501);
    });
  });

  describe('connect', () => {
    it('requires a device token', async () => {
      expect((await start('')).status).toBe(401);
    });

    it('creates the agreement + requisition clamped to the institution and returns the bank link', async () => {
      const token = await mint();
      const r = await start(token, { historyDays: 5000, validityDays: 999 });
      expect(r.status).toBe(201);
      expect(r.data.ref).toMatch(new RegExp(`^${token.split('.')[0]}_[0-9a-f]{16}$`));
      expect(r.data.bankRedirectUrl).toMatch(/^https:\/\/ob\.gocardless\.com\/psd2\/start\/req_\d+\/BIGBANK_BIGBITMM$/);
      expect(r.data).toMatchObject({ historyDays: 730, validityDays: 180 });
      const agr = gc.calls.find(c => c.path === '/agreements/enduser/')!.body as any;
      expect(agr).toEqual({ institution_id: 'BIGBANK_BIGBITMM', max_historical_days: 730, access_valid_for_days: 180, access_scope: ['balances', 'details', 'transactions'] });
      const rq = gc.calls.find(c => c.path === '/requisitions/')!.body as any;
      expect(rq.redirect).toBe('https://broker.test/v1/connect/return');
      expect(rq.reference).toBe(r.data.ref);
      expect(rq.user_language).toBe('EN');
    });

    it('honours smaller requested windows and PUBLIC_URL for the redirect', async () => {
      env = makeEnv({ PUBLIC_URL: 'https://api.stackdplatform.com/' , ENTITLEMENT_MODE: 'open' });
      // production host forces store mode → seed entitlement directly
      const token = await mint();
      await env.owners.instance(token.split('.')[0]).fetch(new Request('https://do/entitlement/set', { method: 'POST', body: JSON.stringify({ entitlement: { active: true, expiresAt: '2999-01-01T00:00:00.000Z' } }) }));
      const r = await start(token, { historyDays: 30, validityDays: 90 });
      expect(r.status).toBe(201);
      expect(r.data).toMatchObject({ historyDays: 30, validityDays: 90 });
      expect((gc.calls.find(c => c.path === '/requisitions/')!.body as any).redirect).toBe('https://api.stackdplatform.com/v1/connect/return');
    });

    it('rejects unknown institutions and bad countries', async () => {
      const token = await mint();
      expect((await start(token, { institutionId: 'NOPE' })).data).toEqual({ error: 'unknown_institution' });
      expect((await start(token, { country: 'Italy' })).data).toEqual({ error: 'country_required' });
      expect(await new (await import('../src/durable-objects')).SystemClient(env as unknown as Env).connections()).toBe(0); // nothing reserved
    });

    it('enforces the per-owner cap (D-C9) and the global cap', async () => {
      const token = await mint();
      for (let i = 0; i < 3; i++) expect((await start(token)).status).toBe(201);
      expect((await start(token)).data).toEqual({ error: 'connection_limit' });

      env = makeEnv({ MAX_CONNECTIONS: '1' });
      const a = await mint('192.0.2.1');
      const b = await mint('192.0.2.2');
      expect((await start(a)).status).toBe(201);
      expect((await start(b)).data).toEqual({ error: 'capacity' });
    });

    it('releases the global reservation when the aggregator call fails', async () => {
      env = makeEnv({ MAX_CONNECTIONS: '1' });
      const token = await mint();
      gc.institutions.IT = [{ id: 'BIGBANK_BIGBITMM', name: 'Big Bank', transaction_total_days: '730', max_access_valid_for_days: '180' }];
      // Requisition creation blows up (fake returns 500 for an unhandled path when institution missing) — simulate via global 429 on the agreements call instead.
      gc.global429 = false;
      const original = gc.fetchImpl;
      gc.fetchImpl = async (i, init) => (i.endsWith('/requisitions/') ? new Response('{"detail":"boom"}', { status: 500 }) : original(i, init));
      app = createApp({ fetch: (i, init) => gc.fetchImpl(i, init), now: () => clock });
      expect((await start(token)).status).toBe(502);
      gc.fetchImpl = original;
      app = createApp({ fetch: gc.fetchImpl, now: () => clock });
      expect((await start(token)).status).toBe(201); // capacity was released
    });

    it('store mode: connect/start and data need a live entitlement (402)', async () => {
      env = makeEnv({ ENTITLEMENT_MODE: 'store' });
      const token = await mint();
      expect((await start(token)).data).toEqual({ error: 'subscription_required' });
      expect((await req('/v1/accounts/x/transactions', { token })).data).toEqual({ error: 'subscription_required' });
      await env.owners.instance(token.split('.')[0]).fetch(new Request('https://do/entitlement/set', { method: 'POST', body: JSON.stringify({ entitlement: { active: true, expiresAt: '2000-01-01T00:00:00.000Z' } }) }));
      expect((await start(token)).data).toEqual({ error: 'subscription_required' }); // expired
    });
  });

  describe('status + accounts', () => {
    const setup = async () => {
      const token = await mint();
      const s = await start(token);
      const requisitionId = (gc.calls.find(c => c.path === '/requisitions/') ? [...gc.requisitions.keys()].pop() : '') as string;
      gc.accounts.set('acc_1', { iban: 'IT60X0542811101000000123456', currency: 'EUR', name: 'Conto', balances: { balances: [{ balanceAmount: { amount: '1234.56', currency: 'EUR' }, balanceType: 'expected' }] }, transactions: { transactions: { booked: [{ transactionId: 't1', bookingDate: '2026-09-01', transactionAmount: { amount: '-45.90', currency: 'EUR' } }], pending: [] } } });
      gc.accounts.set('acc_2', { iban: 'IT60X0542811101000000654321', currency: 'EUR', name: 'Risparmio' });
      return { token, ref: s.data.ref as string, requisitionId };
    };

    it('reports CR before the bank confirms, then resolves accounts once on LN', async () => {
      const { token, ref, requisitionId } = await setup();
      let r = await req(`/v1/connect/status?ref=${ref}`, { token });
      expect(r.status).toBe(200);
      expect(r.data).toMatchObject({ ref, status: 'CR', accounts: [], institutionName: 'Big Bank', expiresAt: null });

      gc.link(requisitionId, ['acc_1', 'acc_2']);
      r = await req(`/v1/connect/status?ref=${ref}`, { token });
      expect(r.data.status).toBe('LN');
      expect(r.data.accounts).toEqual([
        { id: 'acc_1', ibanTail: '3456', currency: 'EUR', name: 'Conto' },
        { id: 'acc_2', ibanTail: '4321', currency: 'EUR', name: 'Risparmio' }
      ]);
      expect(r.data.expiresAt).toBe('2027-03-06T10:00:00.000Z'); // +180 days
      const detailCalls = () => gc.calls.filter(c => c.path.endsWith('/details/')).length;
      expect(detailCalls()).toBe(2);
      r = await req(`/v1/connect/status?ref=${ref}`, { token });
      expect(detailCalls()).toBe(2); // cached in the DO
      expect(r.data.accounts).toHaveLength(2);

      const list = await req('/v1/connections', { token });
      expect(list.data.connections).toHaveLength(1);
      expect(JSON.stringify(list.data)).not.toContain('IT60X'); // never the full IBAN
    });

    it('proxies balances and transactions for owned accounts only', async () => {
      const { token, ref, requisitionId } = await setup();
      expect((await req('/v1/accounts/acc_1/transactions', { token })).data).toEqual({ error: 'unknown_account' }); // not linked yet
      gc.link(requisitionId, ['acc_1']);
      await req(`/v1/connect/status?ref=${ref}`, { token });

      const tx = await req('/v1/accounts/acc_1/transactions?date_from=2026-06-01&date_to=2026-09-07', { token });
      expect(tx.status).toBe(200);
      expect(tx.data.transactions.booked[0].transactionId).toBe('t1');
      expect(gc.calls.at(-1)!.path).toBe('/accounts/acc_1/transactions/?date_from=2026-06-01&date_to=2026-09-07');
      expect((await req('/v1/accounts/acc_1/transactions?date_from=1/6/2026', { token })).data).toEqual({ error: 'invalid_date' });

      const bal = await req('/v1/accounts/acc_1/balances', { token });
      expect(bal.data.balances[0].balanceAmount.amount).toBe('1234.56');
      expect((await req('/v1/accounts/acc_2/balances', { token })).data).toEqual({ error: 'unknown_account' }); // exists at GC, not linked here
    });

    it('surfaces the bank\'s per-account daily limit as 429 without tripping the breaker', async () => {
      const { token, ref, requisitionId } = await setup();
      gc.link(requisitionId, ['acc_1']);
      await req(`/v1/connect/status?ref=${ref}`, { token });
      gc.accounts.get('acc_1')!.rate429 = true;
      expect((await req('/v1/accounts/acc_1/balances', { token })).data).toEqual({ error: 'account_rate_limited' });
      expect((await req('/v1/institutions?country=GB')).status).toBe(200); // breaker untouched
    });

    it('THE ownership test: owner B can read nothing of owner A', async () => {
      const a = await setup();
      gc.link(a.requisitionId, ['acc_1']);
      await req(`/v1/connect/status?ref=${a.ref}`, { token: a.token });

      const b = await mint('192.0.2.50');
      expect((await req(`/v1/connect/status?ref=${a.ref}`, { token: b })).status).toBe(404);
      expect((await req('/v1/accounts/acc_1/transactions', { token: b })).status).toBe(404);
      expect((await req('/v1/accounts/acc_1/balances', { token: b })).status).toBe(404);
      expect((await req(`/v1/connections/${a.ref}`, { token: b, method: 'DELETE' })).status).toBe(404);
      expect(gc.requisitions.has(a.requisitionId)).toBe(true);
      expect((await req('/v1/connections', { token: b })).data.connections).toEqual([]);
      // and A still can
      expect((await req('/v1/accounts/acc_1/balances', { token: a.token })).status).toBe(200);
    });

    it('revokes at the aggregator, forgets the ref and releases capacity', async () => {
      const { token, ref, requisitionId } = await setup();
      const { SystemClient } = await import('../src/durable-objects');
      expect(await new SystemClient(env as unknown as Env).connections()).toBe(1);
      const r = await req(`/v1/connections/${ref}`, { token, method: 'DELETE' });
      expect(r.data).toEqual({ ok: true, ref });
      expect(gc.requisitions.has(requisitionId)).toBe(false);
      expect((await req(`/v1/connect/status?ref=${ref}`, { token })).status).toBe(404);
      expect(await new SystemClient(env as unknown as Env).connections()).toBe(0);
      // idempotent when GoCardless already dropped it
      const s2 = await start(token);
      gc.requisitions.delete([...gc.requisitions.keys()].pop()!);
      expect((await req(`/v1/connections/${s2.data.ref}`, { token, method: 'DELETE' })).status).toBe(200);
    });
  });

  describe('return page', () => {
    it('hands off to the custom scheme with the ref, and escapes error text', async () => {
      const ok = await req('/v1/connect/return?ref=abc_123');
      expect(ok.status).toBe(200);
      expect(ok.headers.get('content-type')).toContain('text/html');
      expect(ok.headers.get('cache-control')).toBe('no-store');
      expect(ok.data).toContain('href="stackd://connect/return?ref=abc_123"');
      expect(ok.data).toContain('Your bank has confirmed');

      const bad = await req('/v1/connect/return?ref=abc&error=UserCancelledSession&details=<script>alert(1)</script>');
      expect(bad.data).not.toContain('<script>alert');
      expect(bad.data).toContain('&lt;script&gt;');
      expect(bad.data).toContain('did not complete');
    });
  });

  describe('grace alarm (store mode)', () => {
    it('revokes every requisition 14 days after a lapse, not before', async () => {
      env = makeEnv({ ENTITLEMENT_MODE: 'store' });
      const token = await mint();
      const ownerId = token.split('.')[0];
      const owner = env.owners.instance(ownerId);
      const set = (entitlement: unknown) => owner.fetch(new Request('https://do/entitlement/set', { method: 'POST', body: JSON.stringify({ entitlement }) }));
      await set({ active: true, expiresAt: '2999-01-01T00:00:00.000Z' });
      const s = await start(token);
      expect(s.status).toBe(201);
      const requisitionId = [...gc.requisitions.keys()].pop()!;

      await set({ active: false });
      const storage = env.owners.storages.get(ownerId)!;
      expect(storage.alarm).toBeGreaterThan(Date.now());
      await owner.alarm!(); // fires early → keeps everything, re-arms
      expect(gc.requisitions.has(requisitionId)).toBe(true);

      // Fast-forward the lapse timestamp instead of the wall clock.
      const rec = (await storage.get('owner')) as any;
      rec.entitlement.lapsedAt = new Date(Date.now() - 15 * 86400000).toISOString();
      await storage.put('owner', rec);
      // The alarm creates its own GoCardless client on the global fetch.
      const realFetch = globalThis.fetch;
      (globalThis as any).fetch = gc.fetchImpl;
      try { await owner.alarm!(); } finally { (globalThis as any).fetch = realFetch; }
      expect(gc.requisitions.has(requisitionId)).toBe(false);
      expect((await req('/v1/connections', { token })).data.connections).toEqual([]);
    });
  });
});
