// Durable Objects (D-C1): OwnerDO = one per owner, jurisdiction 'eu', holds
// devices + entitlement + requisition refs (opaque ids only, never bank data).
// SystemDO = singleton: aggregator token cache, circuit breaker, global
// connection count. RateDO = per-key fixed-window counters for the
// unauthenticated endpoints.
//
// All three expose a tiny fetch-based internal API (https://do/<method>) so
// the worker talks to them through stubs and the test suite through in-memory
// fakes with the same surface (test/fakes.ts).
import type { Env, Config } from './env';
import { GRACE_MS, parseConfig } from './env';

export interface DeviceRecord {
  hash: string;
  kind: 'native' | 'web';
  createdAt: string;
  lastSeenAt: string;
  // v1.11 B7 — web (cookie) devices only: hashed CSRF token, sliding expiry,
  // and a coarse browser/OS label for the phone's "paired browsers" list.
  csrfHash?: string | null;
  expiresAt?: string | null;
  label?: string | null;
}

// v1.11 B7: a pairing code minted by a native device, waiting to be claimed
// by a browser (UX plan §16.2). Hash only; single-use; 5-minute life.
export interface PairCode {
  hash: string;
  expiresAt: string;
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
  kind?: 'native' | 'web'; // v1.11 B7: which session started it → where the bank return lands
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
  pairCodes?: PairCode[]; // v1.11 B7 (absent on pre-B7 records)
  // 1.3.0 (GAP-4): set when a purge was due but a SystemDO/RateDO clean-up
  // failed; the alarm retries it.
  purgeRequestedAt?: string | null;
}

// ── Retention (1.3.0 GAP-4) ────────────────────────────────────────────────
// 1.3.0 (GAP-4) — the privacy policy says the owner record ("an opaque owner
// and device identifier", the linked banks, "your subscription status with
// the identifier the store issued for it") is kept until you disconnect and
// deleted "when you disconnect the bank or, after a subscription ends, 14
// days later". The exact rule implemented here:
//
//  1. Last disconnect. `DELETE /v1/connections/:ref` that removes the
//     owner's LAST connection purges the whole owner when no subscription
//     may be active: store mode and `entitlement.active === false` (the
//     store's latest verdict, or never subscribed). An entitlement still
//     marked active — even one whose expiry has passed, since the store may
//     have renewed it unseen — is kept and left to rule 2. Open mode
//     (staging) never purges.
//  2. 14 days after the end. Every entitlement write arms this owner's
//     alarm at `end + 14 days`, where `end` = `expiresAt` while marked
//     active, else the earlier of `expiresAt` and `lapsedAt` (the moment the
//     broker learned it ended). When the alarm fires and that moment has
//     passed, the broker first re-asks the store (skipped only when an
//     inactive verdict is under `recheckMinIntervalMs` old): a renewed
//     subscription re-arms and nothing is deleted; a store outage retries in
//     an hour; a store 4xx (receipt unknown / long expired) counts as ended.
//     Otherwise every remaining connection is revoked at Enable Banking (as
//     the DELETE route does, capacity released) and the owner is purged.
//  3. An owner abandoned by a receipt adoption (A-10) has no connections and
//     no subscription by construction; it is purged on the spot.
//
// A purge removes this OwnerDO's whole storage (devices + token hashes, web
// sessions + CSRF hashes, pairing codes, the entitlement with its purchase
// token / original transaction id, connections, the per-owner rate window),
// every SystemDO `receipt:*` and `pair:*` entry pointing at this owner, and
// the RateDO window `pair:<ownerId>`. A device of a purged owner then gets
// 401 `invalid_device_token` (bearer) or 401 `invalid_session` with the
// cookie cleared (web): the same answers as a token that never existed.
export const PURGE_RETRY_MS = 60 * 60 * 1000;
// Never fire sooner than this after an entitlement write, so the verify
// answer that armed it reaches the app before the record can go.
const MIN_ALARM_DELAY_MS = 60 * 60 * 1000;

const ms = (s: string | null | undefined): number => (s ? Date.parse(s) : NaN);

export function subscriptionEndedAt(e: Entitlement | undefined): number | null {
  if (!e) return null;
  const exp = ms(e.expiresAt);
  if (e.active) return Number.isFinite(exp) ? exp : null;
  const known = [exp, ms(e.lapsedAt)].filter(Number.isFinite);
  return known.length ? Math.min(...known) : null;
}

export function subscriptionMayBeActive(e: Entitlement | undefined, mode: Config['mode']): boolean {
  return mode === 'open' || !!(e && e.active);
}

const hasReceipt = (e: Entitlement): boolean => !!(e.platform && (e.purchaseToken || e.originalTransactionId));

interface RateWindow {
  windowStart: number;
  count: number;
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const deviceFromBody = (body: Record<string, unknown>, nowIso: string): DeviceRecord => {
  const d: DeviceRecord = { hash: String(body.hash), kind: body.kind === 'web' ? 'web' : 'native', createdAt: nowIso, lastSeenAt: nowIso };
  if (d.kind === 'web') {
    d.csrfHash = body.csrfHash ? String(body.csrfHash) : null;
    d.expiresAt = body.expiresAt ? String(body.expiresAt) : null;
    d.label = body.label ? String(body.label).slice(0, 60) : null;
  }
  return d;
};

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
        r.devices.push(deviceFromBody(body, nowIso));
        await this.save(r);
        return json({ ok: true, record: r });
      }

      // v1.11 B7: logout (own hash) and revoke-from-the-phone (16-char id).
      case '/devices/remove': {
        const r = await this.load();
        if (!r) return json({ ok: false }, 404);
        const hash = String(body.hash || '');
        const id = String(body.id || '');
        const before = r.devices.length;
        r.devices = r.devices.filter(d => !((hash && d.hash === hash) || (id && d.kind === 'web' && d.hash.slice(0, 16) === id)));
        if (r.devices.length !== before) await this.save(r);
        return json({ ok: true, removed: before - r.devices.length, record: r });
      }

      // v1.11 B7: sliding session (D-C19) + CSRF rotation on the boot check.
      case '/devices/touch': {
        const r = await this.load();
        const device = r && r.devices.find(d => d.hash === String(body.hash));
        if (!r || !device) return json({ ok: false }, 404);
        if (body.csrfHash !== undefined) device.csrfHash = body.csrfHash ? String(body.csrfHash) : null;
        if (body.expiresAt !== undefined) device.expiresAt = body.expiresAt ? String(body.expiresAt) : null;
        device.lastSeenAt = nowIso;
        await this.save(r);
        return json({ ok: true, record: r });
      }

      case '/pair/add': {
        const r = await this.load();
        if (!r) return json({ ok: false }, 404);
        const now = Number(body.now) || Date.now(); // the worker is the clock authority
        const live = (r.pairCodes || []).filter(pc => Date.parse(pc.expiresAt) > now);
        live.push({ hash: String(body.hash), expiresAt: String(body.expiresAt) });
        r.pairCodes = live.slice(-10);
        await this.save(r);
        return json({ ok: true, count: r.pairCodes.length });
      }

      // The owner record is the authority on its own codes: the SystemDO
      // lookup only routes the claim here, it cannot pair anyone by itself.
      case '/pair/claim': {
        const r = await this.load();
        if (!r) return json({ ok: false, reason: 'invalid_code' }, 404);
        const hash = String(body.hash || '');
        const codes = r.pairCodes || [];
        const hit = codes.find(pc => pc.hash === hash);
        if (!hit) return json({ ok: false, reason: 'invalid_code' }, 404);
        r.pairCodes = codes.filter(pc => pc !== hit); // single-use either way
        if (Date.parse(hit.expiresAt) <= (Number(body.now) || Date.now())) {
          await this.save(r);
          return json({ ok: false, reason: 'code_expired' }, 410);
        }
        r.devices.push(deviceFromBody((body.device as Record<string, unknown>) || {}, nowIso));
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
        // active → inactive starts the grace clock (D-C3). 1.3.0 (GAP-4): so
        // does a first inactive verdict on a receipt, so a subscription the
        // broker only ever saw ended still gets a deletion date.
        if (!next.active && !next.lapsedAt && (r.entitlement.active || hasReceipt(next))) next.lapsedAt = nowIso;
        if (next.active) {
          next.lapsedAt = null;
          r.purgeRequestedAt = null;
        }
        r.entitlement = next;
        await this.save(r);
        await this.arm(r);
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
        const count = Object.keys(r.requisitions).length;
        // 1.3.0 (GAP-4) rule 1: the last disconnect without a subscription.
        // Decided inside this DO turn, so no request can slip in between.
        if (body.purgeIfIdle && count === 0 && !subscriptionMayBeActive(r.entitlement, parseConfig(this.env).mode)) {
          return json({ ok: true, count, purged: await this.purge(r) });
        }
        await this.save(r);
        return json({ ok: true, count });
      }

      // 1.3.0 (GAP-4) rule 3 (receipt adoption), guarded like rule 1.
      case '/purge': {
        const r = await this.load();
        if (!r) return json({ ok: true, purged: false });
        if (Object.keys(r.requisitions).length || subscriptionMayBeActive(r.entitlement, parseConfig(this.env).mode)) {
          return json({ ok: false, purged: false }, 409);
        }
        return json({ ok: true, purged: await this.purge(r) });
      }

      case '/record': {
        const r = await this.load();
        return r ? json(r) : json({ error: 'not_found' }, 404);
      }

      default:
        return json({ error: 'unknown_method' }, 404);
    }
  }

  // 1.3.0 (GAP-4): one alarm per owner, at `end + 14 days` (the rule at the
  // top of this file). Cleared when there is no end date to wait for.
  private async arm(r: OwnerRecord): Promise<void> {
    if (r.purgeRequestedAt && !r.entitlement.active) {
      await this.state.storage.setAlarm(Date.now() + PURGE_RETRY_MS); // keep the pending retry
      return;
    }
    const ended = subscriptionEndedAt(r.entitlement);
    if (ended === null) {
      if (!r.purgeRequestedAt) await this.state.storage.deleteAlarm();
      return;
    }
    await this.state.storage.setAlarm(Math.max(ended + GRACE_MS, Date.now() + MIN_ALARM_DELAY_MS));
  }

  // Deletes the owner everywhere. False = a clean-up elsewhere failed: the
  // record is kept (marked) and the alarm retries, so nothing is half-gone.
  private async purge(r: OwnerRecord): Promise<boolean> {
    try {
      await new SystemClient(this.env).forgetOwner(r.ownerId);
      await new RateClient(this.env).clear(`pair:${r.ownerId}`);
    } catch {
      r.purgeRequestedAt = r.purgeRequestedAt || new Date().toISOString();
      await this.save(r);
      await this.state.storage.setAlarm(Date.now() + PURGE_RETRY_MS);
      return false;
    }
    await this.state.storage.deleteAlarm();
    await this.state.storage.deleteAll();
    return true;
  }

  // Before deleting anything on the strength of an end date, ask the store
  // whether the subscription really is over (it may have renewed without the
  // app telling us). 'retry' = the store could not answer.
  private async recheck(r: OwnerRecord, cfg: Config, now: number): Promise<'same' | 'changed' | 'retry'> {
    const e = r.entitlement;
    if (!hasReceipt(e)) return 'same';
    if (!e.active && now - (ms(e.lastVerifiedAt) || 0) < cfg.recheckMinIntervalMs) return 'same';
    const { verifyReceipt, StoreError } = await import('./store-verify');
    const input = e.platform === 'play'
      ? { platform: 'play' as const, purchaseToken: String(e.purchaseToken || ''), productId: String(e.productId || '') }
      : { platform: 'appstore' as const, originalTransactionId: String(e.originalTransactionId || ''), productId: String(e.productId || '') };
    try {
      const v = await verifyReceipt(this.env, cfg, (i, init) => fetch(i, init), input, now);
      const at = new Date(now).toISOString();
      r.entitlement = v.active
        ? { ...e, active: true, expiresAt: v.expiresAt, productId: v.productId, state: v.state, lastVerifiedAt: at, lapsedAt: null }
        : { ...e, active: false, expiresAt: v.expiresAt || e.expiresAt || null, state: v.state, lastVerifiedAt: at, lapsedAt: e.lapsedAt || at };
      await this.save(r);
      return 'changed';
    } catch (err) {
      // A 4xx is the store's verdict (receipt unknown, long expired, wrong
      // product): the subscription is not active.
      if (err instanceof StoreError && err.status >= 400 && err.status < 500) return 'same';
      return 'retry';
    }
  }

  // Grace expiry (store mode): the subscription ended ≥ 14 days ago →
  // revoke every session at the aggregator so its billing stops, then
  // (1.3.0 GAP-4) purge the owner. Imported data on the device is
  // untouched — the user owns it.
  async alarm(): Promise<void> {
    const r = await this.load();
    if (!r) return;
    const cfg = parseConfig(this.env);
    if (cfg.mode === 'open') return;
    const now = Date.now();
    if (r.purgeRequestedAt && !Object.keys(r.requisitions).length && !r.entitlement.active) {
      await this.purge(r); // a rule-1 purge whose clean-up failed earlier
      return;
    }
    let ended = subscriptionEndedAt(r.entitlement);
    if (ended === null) return;
    if (now < ended + GRACE_MS) {
      await this.state.storage.setAlarm(ended + GRACE_MS);
      return;
    }
    const checked = await this.recheck(r, cfg, now);
    if (checked === 'retry') {
      await this.state.storage.setAlarm(now + PURGE_RETRY_MS);
      return;
    }
    ended = subscriptionEndedAt(r.entitlement);
    if (r.entitlement.active || ended === null || now < ended + GRACE_MS) {
      await this.arm(r); // renewed at the store: nothing is deleted
      return;
    }
    const { EnableBanking } = await import('./enable-banking');
    const agg = new EnableBanking(this.env, cfg, (i, init) => fetch(i, init));
    const system = new SystemClient(this.env);
    let failed = false;
    for (const ref of Object.keys(r.requisitions)) {
      try {
        const sessionId = r.requisitions[ref].sessionId;
        if (sessionId) await agg.deleteSession(sessionId);
        delete r.requisitions[ref];
        await system.release();
      } catch {
        failed = true; // try again next alarm; never lose the record over a transient error
      }
    }
    if (failed) {
      await this.save(r);
      await this.state.storage.setAlarm(now + PURGE_RETRY_MS);
      return;
    }
    await this.purge(r);
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
      // v1.11 B7: pairing-code routing table, codeHash → ownerId. Take =
      // get + delete in one DO turn, so a code can only ever route once.
      case '/pair/put': {
        const now = Number(body.now) || Date.now();
        const stale = await this.state.storage.list<{ expiresAt: number }>({ prefix: 'pair:' });
        for (const [k, v] of stale) if (!v || v.expiresAt <= now) await this.state.storage.delete(k);
        await this.state.storage.put('pair:' + String(body.hash), { ownerId: String(body.ownerId), expiresAt: Number(body.expiresAt) });
        return json({ ok: true });
      }
      case '/pair/take': {
        const key = 'pair:' + String(body.hash);
        const v = await this.state.storage.get<{ ownerId: string; expiresAt: number }>(key);
        if (!v) return json({ ok: false }, 404);
        await this.state.storage.delete(key);
        return json({ ok: true, ownerId: v.ownerId, expiresAt: v.expiresAt });
      }
      // v1.16 A-11: operational counters, in hourly buckets. Only the
      // failures an operator can ACT on are counted (a wrong aggregator key,
      // store auth breaking, the breaker tripping) — never per-user 4xx like
      // a bad token, which would turn ordinary traffic into DO writes and
      // bury the signal. Buckets older than the retention window are pruned
      // on write, so this never grows without bound.
      case '/counters/bump': {
        const now = Number(body.now) || Date.now();
        const hour = new Date(now).toISOString().slice(0, 13);
        const key = 'ctr:' + hour;
        const bucket = (await this.state.storage.get<Record<string, number>>(key)) || {};
        for (const code of (body.codes as string[]) || []) bucket[code] = (bucket[code] || 0) + 1;
        await this.state.storage.put(key, bucket);
        const cutoff = new Date(now - (Number(body.keepMs) || 48 * 3600000)).toISOString().slice(0, 13);
        const all = await this.state.storage.list<Record<string, number>>({ prefix: 'ctr:' });
        for (const k of all.keys()) if (k.slice(4) < cutoff) await this.state.storage.delete(k);
        return json({ ok: true });
      }
      case '/counters': {
        const now = Number(body.now) || Date.now();
        const from = new Date(now - (Number(body.sinceMs) || 3600000)).toISOString().slice(0, 13);
        const all = await this.state.storage.list<Record<string, number>>({ prefix: 'ctr:' });
        const totals: Record<string, number> = {};
        for (const [k, v] of all) {
          if (k.slice(4) < from) continue;
          for (const [code, n] of Object.entries(v || {})) totals[code] = (totals[code] || 0) + n;
        }
        return json({ totals });
      }
      // Alert de-duplication: the last time each condition was reported, so a
      // persistent fault pages once rather than every cron tick.
      case '/alerts/state': {
        if (request.method === 'POST') {
          await this.state.storage.put('alerts', body.state || {});
          return json({ ok: true });
        }
        return json({ state: (await this.state.storage.get('alerts')) || {} });
      }
      // v1.15 A-10: receipt -> owner index. One store subscription belongs to
      // exactly ONE owner, so a restore on a second device joins the owner
      // that already holds it (and its linked banks) instead of minting a
      // second owner that the same receipt also entitles. Claim is
      // get-or-set in a single DO turn, so two devices restoring at the same
      // moment cannot each win.
      case '/receipt/claim': {
        const key = 'receipt:' + String(body.key);
        const existing = await this.state.storage.get<string>(key);
        if (existing) return json({ ownerId: existing, claimed: false });
        await this.state.storage.put(key, String(body.ownerId));
        return json({ ownerId: String(body.ownerId), claimed: true });
      }
      // 1.3.0 (GAP-4): a purged owner leaves no routing entry behind — every
      // receipt (older purchase tokens too) and pairing code pointing at it.
      case '/owner/forget': {
        const ownerId = String(body.ownerId || '');
        if (!ownerId) return json({ error: 'owner_required' }, 400);
        let removed = 0;
        for (const [k, v] of await this.state.storage.list<string>({ prefix: 'receipt:' })) {
          if (v === ownerId) { await this.state.storage.delete(k); removed++; }
        }
        for (const [k, v] of await this.state.storage.list<{ ownerId: string }>({ prefix: 'pair:' })) {
          if (v && v.ownerId === ownerId) { await this.state.storage.delete(k); removed++; }
        }
        return json({ ok: true, removed });
      }
      case '/receipt/set': {
        await this.state.storage.put('receipt:' + String(body.key), String(body.ownerId));
        return json({ ok: true });
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
    if (url.pathname === '/clear') { // 1.3.0 (GAP-4): owner purge
      await this.state.storage.deleteAll();
      return json({ ok: true });
    }
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

  async addDevice(hash: string, kind: 'native' | 'web', extra?: Partial<DeviceRecord>): Promise<OwnerRecord> {
    const { data } = await call<{ record: OwnerRecord }>(this.stub, '/devices/add', { ownerId: this.ownerId, hash, kind, ...(extra || {}) });
    return data.record;
  }

  // v1.11 B7
  async removeDevice(sel: { hash?: string; id?: string }): Promise<{ removed: number; record: OwnerRecord | null }> {
    const { status, data } = await call<{ removed?: number; record?: OwnerRecord }>(this.stub, '/devices/remove', sel);
    return { removed: status === 200 ? data.removed || 0 : 0, record: data.record || null };
  }

  async touchDevice(hash: string, patch: { csrfHash?: string | null; expiresAt?: string | null }): Promise<OwnerRecord | null> {
    const { status, data } = await call<{ record?: OwnerRecord }>(this.stub, '/devices/touch', { hash, ...patch });
    return status === 200 && data.record ? data.record : null;
  }

  async addPairCode(hash: string, expiresAt: string, now: number): Promise<void> {
    await call(this.stub, '/pair/add', { hash, expiresAt, now });
  }

  async claimPairCode(hash: string, device: Partial<DeviceRecord> & { hash: string }, now: number): Promise<{ ok: boolean; reason?: string; record?: OwnerRecord }> {
    const { data } = await call<{ ok: boolean; reason?: string; record?: OwnerRecord }>(this.stub, '/pair/claim', { hash, device: { ...device, kind: 'web' }, now });
    return data;
  }

  async verify(hash: string, limit: number, windowMs: number): Promise<{ ok: boolean; rateLimited?: boolean; record?: OwnerRecord }> {
    const { status, data } = await call<{ ok: boolean; rateLimited?: boolean; record?: OwnerRecord }>(this.stub, '/devices/verify', { hash, limit, windowMs });
    if (status === 429) return { ok: false, rateLimited: true };
    return data;
  }

  // Null = the owner no longer exists (1.3.0 GAP-4: purged meanwhile).
  async setEntitlement(entitlement: Entitlement): Promise<Entitlement | null> {
    const { status, data } = await call<{ entitlement: Entitlement }>(this.stub, '/entitlement/set', { entitlement });
    return status === 200 ? data.entitlement : null;
  }

  async addRequisition(req: ReqRecord): Promise<boolean> {
    const { status } = await call(this.stub, '/requisitions/add', { req });
    return status === 200;
  }

  async updateRequisition(ref: string, patch: Partial<ReqRecord>): Promise<void> {
    await call(this.stub, '/requisitions/update', { ref, patch });
  }

  // 1.3.0 (GAP-4): `purgeIfIdle` = the DELETE route; `purged` = the owner
  // went with its last connection.
  async removeRequisition(ref: string, purgeIfIdle = false): Promise<{ purged: boolean }> {
    const { data } = await call<{ purged?: boolean }>(this.stub, '/requisitions/remove', { ref, purgeIfIdle });
    return { purged: !!data.purged };
  }

  async purge(): Promise<boolean> {
    const { data } = await call<{ purged?: boolean }>(this.stub, '/purge', {});
    return !!data.purged;
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

  // v1.16 A-11
  async bump(codes: string[], now: number, keepMs?: number): Promise<void> {
    await call(this.stub, '/counters/bump', { codes, now, keepMs });
  }

  async counters(sinceMs: number, now: number): Promise<Record<string, number>> {
    return (await call<{ totals: Record<string, number> }>(this.stub, '/counters', { sinceMs, now })).data.totals;
  }

  async alertState(): Promise<Record<string, number>> {
    return (await call<{ state: Record<string, number> }>(this.stub, '/alerts/state')).data.state;
  }

  async setAlertState(state: Record<string, number>): Promise<void> {
    await call(this.stub, '/alerts/state', { state });
  }

  // v1.15 A-10: claim this receipt for `ownerId`, or learn who already owns
  // it. `claimed` false means the returned ownerId is someone else's.
  async receiptClaim(key: string, ownerId: string): Promise<{ ownerId: string; claimed: boolean }> {
    return (await call<{ ownerId: string; claimed: boolean }>(this.stub, '/receipt/claim', { key, ownerId })).data;
  }

  // 1.3.0 (GAP-4)
  async forgetOwner(ownerId: string): Promise<void> {
    const { status } = await call(this.stub, '/owner/forget', { ownerId });
    if (status !== 200) throw new Error('forget_failed');
  }

  async receiptSet(key: string, ownerId: string): Promise<void> {
    await call(this.stub, '/receipt/set', { key, ownerId });
  }

  // v1.11 B7
  async pairPut(hash: string, ownerId: string, expiresAt: number, now: number): Promise<void> {
    await call(this.stub, '/pair/put', { hash, ownerId, expiresAt, now });
  }

  async pairTake(hash: string): Promise<{ ownerId: string; expiresAt: number } | null> {
    const { status, data } = await call<{ ownerId: string; expiresAt: number }>(this.stub, '/pair/take', { hash });
    return status === 200 ? data : null;
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

  // 1.3.0 (GAP-4)
  async clear(key: string): Promise<void> {
    const stub = this.env.RATE_DO.get(this.env.RATE_DO.idFromName(key));
    await call(stub, '/clear', {});
  }
}
