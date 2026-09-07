// Durable Objects (D-C1): OwnerDO = one per owner, jurisdiction 'eu', holds
// devices + entitlement + requisition refs (opaque ids only, never bank data).
// SystemDO = singleton: aggregator token cache, circuit breaker, global
// connection count. RateDO = per-key fixed-window counters for the
// unauthenticated endpoints.
//
// All three expose a tiny fetch-based internal API (https://do/<method>) so
// the worker talks to them through stubs and the test suite through in-memory
// fakes with the same surface (test/fakes.ts).
import type { Env } from './env';
import { GRACE_MS } from './env';

export interface DeviceRecord {
  hash: string;
  kind: 'native' | 'web';
  createdAt: string;
  lastSeenAt: string;
}

export interface Entitlement {
  active: boolean;
  platform?: string | null;
  productId?: string | null;
  expiresAt?: string | null;
  lastVerifiedAt?: string | null;
  lapsedAt?: string | null;
  // v1.09 B5: what the broker needs to re-check with the store later.
  purchaseToken?: string | null;         // Play
  originalTransactionId?: string | null; // App Store
  state?: string | null;                 // store-native state at the last check
}

export interface AccountRecord {
  id: string;
  ibanTail: string;
  currency: string | null;
  name: string | null;
}

// One "connection" = one aggregator authorization (→ session once the bank
// confirms). Status codes are the broker's own: CR created (bank not yet
// confirmed), LN linked, EX expired, RJ rejected/failed, UA user cancelled.
export interface ReqRecord {
  ref: string;
  authorizationId: string;
  sessionId: string | null;
  institutionId: string;
  institutionName: string;
  institutionLogo: string | null;
  createdAt: string;
  status: string;
  accounts: AccountRecord[] | null;
  historyDays: number;
  validityDays: number;
  expiresAt: string | null;
  linkedAt: string | null;
  lastError: string | null;
}

export interface OwnerRecord {
  ownerId: string;
  createdAt: string;
  devices: DeviceRecord[];
  entitlement: Entitlement;
  requisitions: Record<string, ReqRecord>;
}

interface RateWindow {
  windowStart: number;
  count: number;
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const readBody = async (request: Request): Promise<Record<string, unknown>> => {
  if (request.method !== 'POST') return {};
  try {
    return ((await request.json()) as Record<string, unknown>) || {};
  } catch {
    return {};
  }
};

// ── OwnerDO ────────────────────────────────────────────────────────────────

export class OwnerDO {
  constructor(private state: DurableObjectState, private env: Env) {}

  private load(): Promise<OwnerRecord | undefined> {
    return this.state.storage.get<OwnerRecord>('owner');
  }

  private save(r: OwnerRecord): Promise<void> {
    return this.state.storage.put('owner', r);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = await readBody(request);
    const nowIso = new Date().toISOString();

    switch (url.pathname) {
      case '/devices/add': {
        let r = await this.load();
        if (!r) {
          r = { ownerId: String(body.ownerId), createdAt: nowIso, devices: [], entitlement: { active: false }, requisitions: {} };
        }
        r.devices.push({ hash: String(body.hash), kind: body.kind === 'web' ? 'web' : 'native', createdAt: nowIso, lastSeenAt: nowIso });
        await this.save(r);
        return json({ ok: true, record: r });
      }

      case '/devices/verify': {
        const r = await this.load();
        if (!r) return json({ ok: false }, 401);
        const device = r.devices.find(d => d.hash === body.hash);
        if (!device) return json({ ok: false }, 401);
        // Per-owner rate limit rides on the verify call so every
        // authenticated request costs exactly one DO round-trip.
        const limit = Number(body.limit || 0);
        const windowMs = Number(body.windowMs || 3600000);
        if (limit > 0) {
          const now = Date.now();
          let rate = (await this.state.storage.get<RateWindow>('rate')) || { windowStart: now, count: 0 };
          if (now - rate.windowStart >= windowMs) rate = { windowStart: now, count: 0 };
          rate.count += 1;
          await this.state.storage.put('rate', rate);
          if (rate.count > limit) return json({ ok: false, rateLimited: true }, 429);
        }
        // lastSeenAt is coarse on purpose (one write per minute at most).
        if (Date.parse(nowIso) - Date.parse(device.lastSeenAt) > 60000) {
          device.lastSeenAt = nowIso;
          await this.save(r);
        }
        return json({ ok: true, record: r });
      }

      case '/entitlement/set': {
        const r = await this.load();
        if (!r) return json({ ok: false }, 404);
        const next = { ...r.entitlement, ...(body.entitlement as Entitlement) };
        // active → inactive starts the grace clock (revoke via alarm, D-C3).
        if (r.entitlement.active && !next.active) {
          next.lapsedAt = nowIso;
          await this.state.storage.setAlarm(Date.now() + GRACE_MS);
        }
        if (next.active) {
          next.lapsedAt = null;
          await this.state.storage.deleteAlarm();
        }
        r.entitlement = next;
        await this.save(r);
        return json({ ok: true, entitlement: r.entitlement });
      }

      case '/requisitions/add': {
        const r = await this.load();
        if (!r) return json({ ok: false }, 404);
        const req = body.req as ReqRecord;
        r.requisitions[req.ref] = req;
        await this.save(r);
        return json({ ok: true, count: Object.keys(r.requisitions).length });
      }

      case '/requisitions/update': {
        const r = await this.load();
        const ref = String(body.ref);
        if (!r || !r.requisitions[ref]) return json({ ok: false }, 404);
        r.requisitions[ref] = { ...r.requisitions[ref], ...(body.patch as Partial<ReqRecord>) };
        await this.save(r);
        return json({ ok: true, req: r.requisitions[ref] });
      }

      case '/requisitions/remove': {
        const r = await this.load();
        const ref = String(body.ref);
        if (!r || !r.requisitions[ref]) return json({ ok: false }, 404);
        delete r.requisitions[ref];
        await this.save(r);
        return json({ ok: true, count: Object.keys(r.requisitions).length });
      }

      case '/record': {
        const r = await this.load();
        return r ? json(r) : json({ error: 'not_found' }, 404);
      }

      default:
        return json({ error: 'unknown_method' }, 404);
    }
  }

  // Grace expiry (store mode): the subscription lapsed ≥ 14 days ago →
  // revoke every session at the aggregator so its billing stops.
  // Imported data on the device is untouched — the user owns it.
  async alarm(): Promise<void> {
    const r = await this.load();
    if (!r || this.env.ENTITLEMENT_MODE === 'open') return;
    if (r.entitlement.active || !r.entitlement.lapsedAt) return;
    if (Date.now() - Date.parse(r.entitlement.lapsedAt) < GRACE_MS) {
      await this.state.storage.setAlarm(Date.parse(r.entitlement.lapsedAt) + GRACE_MS);
      return;
    }
    const { EnableBanking } = await import('./enable-banking');
    const { parseConfig } = await import('./env');
    const agg = new EnableBanking(this.env, parseConfig(this.env), (i, init) => fetch(i, init));
    const system = new SystemClient(this.env);
    for (const ref of Object.keys(r.requisitions)) {
      try {
        const sessionId = r.requisitions[ref].sessionId;
        if (sessionId) await agg.deleteSession(sessionId);
        delete r.requisitions[ref];
        await system.release();
      } catch {
        // Try again next alarm; never lose the record over a transient error.
        await this.state.storage.setAlarm(Date.now() + 60 * 60 * 1000);
      }
    }
    await this.save(r);
  }
}

// ── SystemDO ───────────────────────────────────────────────────────────────

export class SystemDO {
  constructor(private state: DurableObjectState, _env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = await readBody(request);
    switch (url.pathname) {
      case '/token': {
        if (request.method === 'POST') {
          await this.state.storage.put('token', { access: body.access, expiresAt: Number(body.expiresAt) });
          return json({ ok: true });
        }
        return json((await this.state.storage.get('token')) || null);
      }
      case '/breaker': {
        if (request.method === 'POST') {
          await this.state.storage.put('breaker', { pausedUntil: Number(body.pausedUntil) || 0 });
          return json({ ok: true });
        }
        return json((await this.state.storage.get('breaker')) || { pausedUntil: 0 });
      }
      case '/connections/reserve': {
        const max = Number(body.max || 0);
        const count = (await this.state.storage.get<number>('connections')) || 0;
        if (max > 0 && count >= max) return json({ ok: false, count }, 409);
        await this.state.storage.put('connections', count + 1);
        return json({ ok: true, count: count + 1 });
      }
      case '/connections/release': {
        const count = (await this.state.storage.get<number>('connections')) || 0;
        const next = Math.max(0, count - 1);
        await this.state.storage.put('connections', next);
        return json({ ok: true, count: next });
      }
      case '/connections': {
        return json({ count: (await this.state.storage.get<number>('connections')) || 0 });
      }
      // v1.09 B5: small named caches (store access tokens). null value = delete.
      case '/cache': {
        const name = String(body.name || url.searchParams.get('name') || '');
        if (!name) return json({ error: 'name_required' }, 400);
        if (request.method === 'POST') {
          if (body.value === null || body.value === undefined) await this.state.storage.delete('cache:' + name);
          else await this.state.storage.put('cache:' + name, body.value);
          return json({ ok: true });
        }
        return json({ value: (await this.state.storage.get('cache:' + name)) ?? null });
      }
      default:
        return json({ error: 'unknown_method' }, 404);
    }
  }
}

// ── RateDO ─────────────────────────────────────────────────────────────────

export class RateDO {
  constructor(private state: DurableObjectState, _env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/hit') return json({ error: 'unknown_method' }, 404);
    const body = await readBody(request);
    const limit = Number(body.limit || 0);
    const windowMs = Number(body.windowMs || 60000);
    const now = Date.now();
    let w = (await this.state.storage.get<RateWindow>('w')) || { windowStart: now, count: 0 };
    if (now - w.windowStart >= windowMs) w = { windowStart: now, count: 0 };
    w.count += 1;
    await this.state.storage.put('w', w);
    return json({ allowed: limit === 0 || w.count <= limit, count: w.count, limit });
  }
}

// ── Typed clients used by the worker ───────────────────────────────────────

async function call<T>(stub: DurableObjectStub, path: string, body?: unknown, method?: string): Promise<{ status: number; data: T }> {
  const init: RequestInit = body === undefined
    ? { method: method || 'GET' }
    : { method: method || 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
  const res = await stub.fetch(`https://do${path}`, init);
  return { status: res.status, data: (await res.json()) as T };
}

// D-C1: the ownership store is EU-pinned. `wrangler dev` (local workerd) does
// not implement jurisdictions and throws a specific error; ONLY that case
// falls back to the unpinned namespace, so a deployed worker can never
// silently lose the pin. Logged once per isolate.
let jurisdictionWarned = false;
export function ownerNamespace(env: Env): DurableObjectNamespace {
  try {
    return env.OWNER_DO.jurisdiction('eu');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/not implemented/i.test(msg)) throw e;
    if (!jurisdictionWarned) {
      jurisdictionWarned = true;
      console.log(JSON.stringify({ level: 'warn', msg: 'jurisdiction(eu) unavailable in this runtime — local dev only', err: msg }));
    }
    return env.OWNER_DO;
  }
}

export class OwnerClient {
  private stub: DurableObjectStub;

  constructor(env: Env, public readonly ownerId: string) {
    const ns = ownerNamespace(env);
    this.stub = ns.get(ns.idFromName(ownerId));
  }

  async addDevice(hash: string, kind: 'native' | 'web'): Promise<OwnerRecord> {
    const { data } = await call<{ record: OwnerRecord }>(this.stub, '/devices/add', { ownerId: this.ownerId, hash, kind });
    return data.record;
  }

  async verify(hash: string, limit: number, windowMs: number): Promise<{ ok: boolean; rateLimited?: boolean; record?: OwnerRecord }> {
    const { status, data } = await call<{ ok: boolean; rateLimited?: boolean; record?: OwnerRecord }>(this.stub, '/devices/verify', { hash, limit, windowMs });
    if (status === 429) return { ok: false, rateLimited: true };
    return data;
  }

  async setEntitlement(entitlement: Entitlement): Promise<Entitlement> {
    const { data } = await call<{ entitlement: Entitlement }>(this.stub, '/entitlement/set', { entitlement });
    return data.entitlement;
  }

  async addRequisition(req: ReqRecord): Promise<void> {
    await call(this.stub, '/requisitions/add', { req });
  }

  async updateRequisition(ref: string, patch: Partial<ReqRecord>): Promise<void> {
    await call(this.stub, '/requisitions/update', { ref, patch });
  }

  async removeRequisition(ref: string): Promise<void> {
    await call(this.stub, '/requisitions/remove', { ref });
  }

  async record(): Promise<OwnerRecord | null> {
    const { status, data } = await call<OwnerRecord>(this.stub, '/record');
    return status === 200 ? data : null;
  }
}

export class SystemClient {
  private stub: DurableObjectStub;

  constructor(env: Env) {
    this.stub = env.SYSTEM_DO.get(env.SYSTEM_DO.idFromName('system'));
  }

  async getToken(): Promise<{ access: string; expiresAt: number } | null> {
    return (await call<{ access: string; expiresAt: number } | null>(this.stub, '/token')).data;
  }

  async putToken(t: { access: string; expiresAt: number }): Promise<void> {
    await call(this.stub, '/token', t);
  }

  async getBreaker(): Promise<{ pausedUntil: number }> {
    return (await call<{ pausedUntil: number }>(this.stub, '/breaker')).data;
  }

  async setBreaker(pausedUntil: number): Promise<void> {
    await call(this.stub, '/breaker', { pausedUntil });
  }

  async reserve(max: number): Promise<{ ok: boolean; count: number }> {
    return (await call<{ ok: boolean; count: number }>(this.stub, '/connections/reserve', { max })).data;
  }

  async release(): Promise<void> {
    await call(this.stub, '/connections/release', {});
  }

  async connections(): Promise<number> {
    return (await call<{ count: number }>(this.stub, '/connections')).data.count;
  }

  async cacheGet<T>(name: string): Promise<T | null> {
    return (await call<{ value: T | null }>(this.stub, '/cache?name=' + encodeURIComponent(name))).data.value;
  }

  async cachePut(name: string, value: unknown): Promise<void> {
    await call(this.stub, '/cache', { name, value });
  }
}

export class RateClient {
  constructor(private env: Env) {}

  async hit(key: string, limit: number, windowMs: number): Promise<boolean> {
    const stub = this.env.RATE_DO.get(this.env.RATE_DO.idFromName(key));
    const { data } = await call<{ allowed: boolean }>(stub, '/hit', { limit, windowMs });
    return data.allowed;
  }
}
