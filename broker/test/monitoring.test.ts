import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, evaluate, runScheduled } from '../src/index';
import { SystemClient } from '../src/durable-objects';
import { parseConfig } from '../src/env';
import { makeEnv, fakeEnableBanking, testKeys, type TestKeys } from './fakes';
import type { Env } from '../src/env';

// v1.16 A-11. Cloudflare Workers Logs have no alerting and keep 3 days on the
// free plan, so nothing told the owner that the aggregator key had expired or
// that purchases were failing - both of which are total outages of a feature,
// not degradations. The cron watches the faults an operator can act on.
//
// It deliberately does NOT try to be an uptime check: if the Worker is down
// the cron is down too. That job belongs to an external pinger on /healthz,
// which is an owner task in the README.

let keys: TestKeys;
let env: ReturnType<typeof makeEnv>;
let clock: number;

const HOUR = 3600000;

beforeEach(async () => {
  keys = keys || (await testKeys());
  clock = Date.parse('2026-09-09T12:00:00.000Z');
  env = makeEnv(keys, { ENTITLEMENT_MODE: 'store' });
});

const cfgOf = () => parseConfig(env as unknown as Env);
const bump = async (codes: string[], times = 1) => {
  const sys = new SystemClient(env as unknown as Env);
  for (let i = 0; i < times; i++) await sys.bump(codes, clock);
};

describe('broker monitoring (A-11)', () => {
  describe('what counts as a fault worth reporting', () => {
    // A function: `clock` is only set in beforeEach, and a const here would
    // be evaluated at collection time, before it exists.
    const base = () => ({ mode: 'store', at: new Date(clock).toISOString(), breakerPausedUntil: 0, connections: 0, maxConnections: 500 });

    it('stays silent when nothing is wrong', () => {
      expect(evaluate({ ...base(), counters: {} }, cfgOf())).toEqual([]);
    });

    it('reports a broken aggregator key immediately — every bank connect is failing', () => {
      const out = evaluate({ ...base(), counters: { aggregator_key_invalid: 1 } }, cfgOf());
      expect(out.map(c => c.code)).toEqual(['aggregator_key_invalid']);
    });

    it('tolerates a couple of transient aggregator auth failures, then reports', () => {
      expect(evaluate({ ...base(), counters: { aggregator_auth_failed: 2 } }, cfgOf())).toEqual([]);
      expect(evaluate({ ...base(), counters: { aggregator_auth_failed: 3 } }, cfgOf()).map(c => c.code))
        .toEqual(['aggregator_auth_failed']);
    });

    it('reports store auth failures — the store has already charged those users', () => {
      const out = evaluate({ ...base(), counters: { store_auth_failed: 3 } }, cfgOf());
      expect(out[0].detail).toMatch(/3 in the last hour/);
    });

    it('reports an open circuit breaker while it is still open, not after', () => {
      expect(evaluate({ ...base(), counters: {}, breakerPausedUntil: clock + 60000 }, cfgOf()).map(c => c.code))
        .toEqual(['breaker_open']);
      expect(evaluate({ ...base(), counters: {}, breakerPausedUntil: clock - 60000 }, cfgOf())).toEqual([]);
    });

    it('warns before the global connection cap is actually hit', () => {
      expect(evaluate({ ...base(), counters: {}, connections: 449 }, cfgOf())).toEqual([]);
      expect(evaluate({ ...base(), counters: {}, connections: 450 }, cfgOf()).map(c => c.code)).toEqual(['capacity_high']);
    });
  });

  describe('counters', () => {
    it('aggregates the last hour and ignores older buckets', async () => {
      const sys = new SystemClient(env as unknown as Env);
      await sys.bump(['store_auth_failed'], clock - 5 * HOUR); // yesterday's problem
      await sys.bump(['store_auth_failed', 'internal'], clock);
      await sys.bump(['internal'], clock);
      const totals = await sys.counters(HOUR, clock);
      expect(totals).toEqual({ store_auth_failed: 1, internal: 2 });
    });

    it('prunes buckets past the retention window', async () => {
      const sys = new SystemClient(env as unknown as Env);
      await sys.bump(['internal'], clock - 72 * HOUR);
      await sys.bump(['internal'], clock, 48 * HOUR);
      expect(await sys.counters(96 * HOUR, clock)).toEqual({ internal: 1 });
    });
  });

  describe('the cron', () => {
    const runWith = async (webhook: string | null) => {
      const posts: { url: string; body: any }[] = [];
      const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
        posts.push({ url, body: JSON.parse(String(init?.body || '{}')) });
        return new Response('{}', { status: 200 });
      });
      if (webhook) (env as any).ALERT_WEBHOOK_URL = webhook;
      const snap = await runScheduled(env as unknown as Env, fetchImpl as unknown as typeof fetch, clock);
      return { posts, snap };
    };

    it('posts once for a fault, then stays quiet while it persists', async () => {
      await bump(['store_auth_failed'], 3);
      const first = await runWith('https://alert.test/hook');
      expect(first.posts).toHaveLength(1);
      expect(first.posts[0].body).toMatchObject({ service: 'stackd-broker', mode: 'store' });
      expect(first.posts[0].body.conditions[0].code).toBe('store_auth_failed');

      // Same fault, next tick: already reported.
      const second = await runWith('https://alert.test/hook');
      expect(second.posts).toHaveLength(0);
    });

    it('reports again once the repeat window has passed', async () => {
      await bump(['store_auth_failed'], 3);
      expect((await runWith('https://alert.test/hook')).posts).toHaveLength(1);
      clock += 7 * HOUR;               // past alertRepeatMs (6h)
      await bump(['store_auth_failed'], 3); // still failing in the new hour
      expect((await runWith('https://alert.test/hook')).posts).toHaveLength(1);
    });

    it('sends nothing when there is no fault', async () => {
      expect((await runWith('https://alert.test/hook')).posts).toHaveLength(0);
    });

    it('keeps counting when no webhook is configured', async () => {
      await bump(['internal'], 10);
      const { posts, snap } = await runWith(null);
      expect(posts).toHaveLength(0);
      expect(snap.conditions.map(c => c.code)).toEqual(['internal']);
    });

    it('a webhook outage does not throw out of the cron', async () => {
      await bump(['internal'], 10);
      (env as any).ALERT_WEBHOOK_URL = 'https://alert.test/hook';
      const failing = vi.fn(async () => { throw new Error('webhook down'); });
      await expect(runScheduled(env as unknown as Env, failing as unknown as typeof fetch, clock)).resolves.toBeTruthy();
      // Not marked as reported, so the next tick tries again.
      const posts: any[] = [];
      const ok = vi.fn(async (url: string, init?: RequestInit) => { posts.push(JSON.parse(String(init?.body))); return new Response('{}'); });
      await runScheduled(env as unknown as Env, ok as unknown as typeof fetch, clock);
      expect(posts).toHaveLength(1);
    });
  });

  describe('/v1/ops/status', () => {
    const get = (token?: string) => {
      const app = createApp({ fetch: fakeEnableBanking(keys).fetch as unknown as typeof fetch, now: () => clock });
      const headers: Record<string, string> = { 'x-stackd-client': 'stackd-web', 'cf-connecting-ip': '203.0.113.9' };
      if (token) headers.authorization = `Bearer ${token}`;
      return app.fetch(new Request('https://broker.test/v1/ops/status', { headers }), env as unknown as Env);
    };

    it('does not exist unless OPS_TOKEN is set', async () => {
      const r = await get('anything');
      expect(r.status).toBe(404);
    });

    it('rejects a wrong token and accepts the right one', async () => {
      (env as any).OPS_TOKEN = 's3cret';
      expect((await get('nope')).status).toBe(401);
      expect((await get()).status).toBe(401);
      const ok = await get('s3cret');
      expect(ok.status).toBe(200);
      const body = await ok.json() as any;
      expect(body).toMatchObject({ mode: 'store', maxConnections: cfgOf().maxConnections });
      expect(Array.isArray(body.conditions)).toBe(true);
    });

    it('shows the same conditions the cron would alert on', async () => {
      (env as any).OPS_TOKEN = 's3cret';
      await bump(['aggregator_key_invalid']);
      const body = await (await get('s3cret')).json() as any;
      expect(body.conditions.map((c: any) => c.code)).toEqual(['aggregator_key_invalid']);
      expect(body.counters.aggregator_key_invalid).toBe(1);
    });
  });
});
