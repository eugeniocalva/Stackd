// Stack'd Bank Connect broker — worker entry (docs/bank-connect-plan.md §2).
//
// Pass-through by design: nothing that comes back from the aggregator is
// stored or logged; only ownership + entitlement state lives in the Durable
// Objects. Every data endpoint is ownership-checked against the caller's
// owner record, and unknown refs/accounts are 404 — never 403 — so a probe
// cannot distinguish "not yours" from "does not exist".
//
// Aggregator = Enable Banking (src/enable-banking.ts, the only file that
// knows about it). The bank redirects the user to /v1/connect/return with
// `code` + `state`; the broker exchanges the code for a session right there,
// so the app's later /v1/connect/status is a read of the owner record.
//
// v1.11 B7 (UX plan §16): a browser becomes a `web` device on the SAME owner
// record as the phone, through a pairing code the phone mints; it is
// authenticated by an HttpOnly cookie (+ a CSRF header on mutations)
// instead of a bearer. Everything below `requireDevice` is auth-agnostic.
import type { Env, Config } from './env';
import { parseConfig } from './env';
import { EnableBanking, AggregatorError, type Institution, type PsuContext } from './enable-banking';
import { mintToken, parseBearer, parseSessionCookie, sessionCookie, clearSessionCookie, randomPairCode, normalizePairCode, sha256Hex, randomHex } from './auth';
import { OwnerClient, SystemClient, RateClient, type OwnerRecord, type ReqRecord, type Entitlement, type DeviceRecord } from './durable-objects';
import { returnPage } from './html';
import { verifyReceipt, StoreError, type VerifyInput } from './store-verify';

export { OwnerDO, SystemDO, RateDO } from './durable-objects';

export interface Deps {
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
}

class HttpError extends Error {
  headers?: Record<string, string>;
  constructor(public status: number, public code: string, message?: string, headers?: Record<string, string>) {
    super(message || code);
    this.headers = headers;
  }
}

interface Session {
  ownerId: string;
  record: OwnerRecord;
  owner: OwnerClient;
  kind: 'native' | 'web'; // v1.11 B7: how the caller authenticated
  device: DeviceRecord;
}

interface Ctx {
  env: Env;
  cfg: Config;
  agg: EnableBanking;
  system: SystemClient;
  rate: RateClient;
  now: () => number;
  ip: string;
  origin: string;
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
}

const json = (data: unknown, status = 200, extra?: Record<string, string>): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(extra || {}) } });

const iso = (ms: number): string => new Date(ms).toISOString();
const DAY_MS = 86400000;
const REF_RE = /^([0-9a-f]{16})_[0-9a-f]{16}$/;

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (!text) return {};
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

// v1.11 B7: the web build sends the session cookie (`credentials:
// 'include'`), which CORS only permits with an exact origin echo and the
// credentials flag — never `*`. The list is the allow-list, unchanged.
function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-stackd-client,x-stackd-attest,x-stackd-csrf',
    'access-control-max-age': '600',
    vary: 'origin'
  };
}

// ── Entitlement ────────────────────────────────────────────────────────────

function isEntitled(record: OwnerRecord, cfg: Config, now: number): boolean {
  if (cfg.mode === 'open') return true;
  const e = record.entitlement;
  if (!e || !e.active) return false;
  return !e.expiresAt || Date.parse(e.expiresAt) > now;
}

function requireEntitled(session: Session, c: Ctx): void {
  if (!isEntitled(session.record, c.cfg, c.now())) throw new HttpError(402, 'subscription_required');
}

// ── Sessions ───────────────────────────────────────────────────────────────

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Bearer first, else the cookie (v1.11 B7). A cookie session must also carry
// X-Stackd-CSRF on anything that is not a safe method — Lax cookies ride on
// top-level cross-site navigations, the header cannot. Null = no credentials
// at all (only /v1/entitlement/verify treats that as "mint me one").
async function resolveSession(request: Request, c: Ctx): Promise<Session | null> {
  const bearer = parseBearer(request.headers.get('authorization'));
  const cookie = bearer ? null : parseSessionCookie(request.headers.get('cookie'));
  const parsed = bearer || cookie;
  if (!parsed) return null;
  const owner = new OwnerClient(c.env, parsed.ownerId);
  const hash = await sha256Hex(parsed.secret);
  const v = await owner.verify(hash, c.cfg.ownerPerHour, 3600000);
  if (v.rateLimited) throw new HttpError(429, 'rate_limited');
  const device = v.ok && v.record ? v.record.devices.find(d => d.hash === hash) : undefined;
  if (!v.ok || !v.record || !device) {
    if (bearer) throw new HttpError(401, 'invalid_device_token');
    throw new HttpError(401, 'invalid_session', undefined, { 'set-cookie': clearSessionCookie() });
  }
  if (bearer) return { ownerId: parsed.ownerId, record: v.record, owner, kind: 'native', device };
  if (device.kind !== 'web') throw new HttpError(401, 'invalid_session', undefined, { 'set-cookie': clearSessionCookie() });
  if (device.expiresAt && Date.parse(device.expiresAt) <= c.now()) {
    await owner.removeDevice({ hash });
    throw new HttpError(401, 'session_expired', undefined, { 'set-cookie': clearSessionCookie() });
  }
  if (!SAFE_METHODS.has(request.method.toUpperCase())) {
    const csrf = request.headers.get('x-stackd-csrf') || '';
    if (!csrf) throw new HttpError(403, 'csrf_required');
    if (!device.csrfHash || (await sha256Hex(csrf)) !== device.csrfHash) throw new HttpError(403, 'csrf_invalid');
  }
  return { ownerId: parsed.ownerId, record: v.record, owner, kind: 'web', device };
}

async function requireDevice(request: Request, c: Ctx): Promise<Session> {
  const s = await resolveSession(request, c);
  if (!s) throw new HttpError(401, 'device_token_required');
  return s;
}

// ── Web session + pairing (v1.11 B7, UX plan §16) ─────────────────────────

// Coarse, for the phone's "paired browsers" list. Never the raw UA.
function uaLabel(ua: string | null): string {
  const s = ua || '';
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Browser';
  const os = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone|iPad/.test(s) ? 'iOS' : /Mac OS/.test(s) ? 'macOS' : /CrOS/.test(s) ? 'ChromeOS' : /Linux/.test(s) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

function sessionBody(session: Session, csrf: string, c: Ctx): Record<string, unknown> {
  const e = session.record.entitlement;
  return {
    ownerId: session.ownerId,
    active: isEntitled(session.record, c.cfg, c.now()),
    expiresAt: e.expiresAt || null,
    platform: e.platform || null,
    productId: e.productId || null,
    mode: c.cfg.mode,
    csrf,
    sessionExpiresAt: session.device.expiresAt || null
  };
}

// Native, entitled: mint a code the browser can claim within 5 minutes.
async function handlePairCode(session: Session, c: Ctx): Promise<Response> {
  if (session.kind !== 'native') throw new HttpError(403, 'native_only');
  requireEntitled(session, c);
  if (!(await c.rate.hit(`pair:${session.ownerId}`, c.cfg.pairPerHour, 3600000))) throw new HttpError(429, 'rate_limited');
  const code = randomPairCode();
  const hash = await sha256Hex(code);
  const expiresAt = c.now() + c.cfg.pairCodeTtlMs;
  await session.owner.addPairCode(hash, iso(expiresAt), c.now());
  await c.system.pairPut(hash, session.ownerId, expiresAt, c.now());
  return json({ code, expiresAt: iso(expiresAt) }, 201);
}

// Web, unauthenticated: the code routes to the owner (SystemDO), the owner
// record confirms and burns it, and the browser becomes a web device with a
// cookie + CSRF token. A wrong code costs an attempt, nothing else.
async function handlePairClaim(request: Request, c: Ctx): Promise<Response> {
  if (!(await c.rate.hit(`claim:${c.ip}`, c.cfg.claimPerHour, 3600000))) throw new HttpError(429, 'rate_limited');
  const body = await readJson(request);
  const code = normalizePairCode(body.code);
  if (!code) throw new HttpError(400, 'invalid_code');
  const hash = await sha256Hex(code);
  const routed = await c.system.pairTake(hash);
  if (!routed) throw new HttpError(400, 'invalid_code');
  if (routed.expiresAt <= c.now()) throw new HttpError(410, 'code_expired');
  const owner = new OwnerClient(c.env, routed.ownerId);
  const secret = randomHex(32);
  const csrf = randomHex(16);
  const expiresAt = iso(c.now() + c.cfg.sessionMaxAgeMs);
  const claimed = await owner.claimPairCode(hash, {
    hash: await sha256Hex(secret),
    csrfHash: await sha256Hex(csrf),
    expiresAt,
    label: uaLabel(request.headers.get('user-agent'))
  }, c.now());
  if (!claimed.ok || !claimed.record) throw new HttpError(claimed.reason === 'code_expired' ? 410 : 400, claimed.reason || 'invalid_code');
  const device = claimed.record.devices[claimed.record.devices.length - 1];
  const session: Session = { ownerId: routed.ownerId, record: claimed.record, owner, kind: 'web', device };
  return json(sessionBody(session, csrf, c), 201, { 'set-cookie': sessionCookie(`${routed.ownerId}.${secret}`, c.cfg.sessionMaxAgeMs) });
}

// The app's boot check on web. Sliding 90 days (D-C19): every check extends
// the device and re-issues the cookie; the CSRF token rotates with it.
async function handleSession(request: Request, c: Ctx): Promise<Response> {
  const session = await resolveSession(request, c);
  if (!session) throw new HttpError(401, 'no_session');
  if (session.kind !== 'web') throw new HttpError(400, 'web_only');
  const csrf = randomHex(16);
  const expiresAt = iso(c.now() + c.cfg.sessionMaxAgeMs);
  const record = await session.owner.touchDevice(session.device.hash, { csrfHash: await sha256Hex(csrf), expiresAt });
  if (record) session.record = record;
  session.device = { ...session.device, expiresAt };
  const token = parseSessionCookie(request.headers.get('cookie'))!;
  return json(sessionBody(session, csrf, c), 200, { 'set-cookie': sessionCookie(`${token.ownerId}.${token.secret}`, c.cfg.sessionMaxAgeMs) });
}

async function handleLogout(session: Session, c: Ctx): Promise<Response> {
  if (session.kind !== 'web') throw new HttpError(400, 'web_only');
  await session.owner.removeDevice({ hash: session.device.hash });
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
}

// D-C20: the phone (or any device) lists the owner's web sessions and can
// revoke one. Ids are the first 16 hex of the stored hash — enough to pick
// one, useless to authenticate.
function publicDevice(d: DeviceRecord, current: DeviceRecord): Record<string, unknown> {
  return { id: d.hash.slice(0, 16), kind: d.kind, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt, label: d.label || null, expiresAt: d.expiresAt || null, current: d.hash === current.hash };
}

function handleDevices(session: Session): Response {
  return json({ devices: session.record.devices.filter(d => d.kind === 'web').map(d => publicDevice(d, session.device)) });
}

async function handleDeviceRevoke(id: string, session: Session): Promise<Response> {
  if (!/^[0-9a-f]{16}$/.test(id)) throw new HttpError(404, 'unknown_device');
  const { removed } = await session.owner.removeDevice({ id });
  if (!removed) throw new HttpError(404, 'unknown_device');
  return json({ ok: true, id });
}

// ── Institutions ───────────────────────────────────────────────────────────

const COUNTRY_RE = /^[A-Za-z]{2}$/;

async function institutionsFor(country: string, c: Ctx): Promise<Institution[]> {
  const key = `${c.origin}/v1/institutions?country=${country}`;
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return (await hit.json()) as Institution[];
  }
  const list = await c.agg.institutions(country);
  if (cache && list.length) {
    await cache.put(key, new Response(JSON.stringify(list), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } }));
  }
  return list;
}

async function handleInstitutions(url: URL, c: Ctx): Promise<Response> {
  const country = (url.searchParams.get('country') || '').toUpperCase();
  if (!COUNTRY_RE.test(country)) throw new HttpError(400, 'country_required');
  if (!(await c.rate.hit(`inst:${c.ip}`, c.cfg.institutionsPerMinute, 60000))) throw new HttpError(429, 'rate_limited');
  const list = await institutionsFor(country, c);
  return json(list, 200, { 'cache-control': 'public, max-age=3600' });
}

// ── Entitlement verify (+ first-contact device mint) ───────────────────────

async function handleEntitlementVerify(request: Request, c: Ctx): Promise<Response> {
  const body = await readJson(request);
  const existing = await resolveSession(request, c); // bearer or cookie (B7)
  let ownerId: string;
  let owner: OwnerClient;
  let record: OwnerRecord;
  let deviceToken: string | null = null;

  if (existing) {
    owner = existing.owner;
    ownerId = existing.ownerId;
    record = existing.record;
  } else {
    if (!(await c.rate.hit(`mint:${c.ip}`, c.cfg.mintPerHour, 3600000))) throw new HttpError(429, 'rate_limited');
    const minted = mintToken();
    ownerId = minted.ownerId;
    owner = new OwnerClient(c.env, ownerId);
    // v1.11 B7: `kind` is the auth mode — a bearer device is always native;
    // `web` devices only ever come from a pairing claim (cookie session).
    // The app's body.kind is ignored: the dev-server web build used to mint
    // a 'web' bearer device that then listed itself as a paired browser.
    record = await owner.addDevice(await sha256Hex(minted.secret), 'native');
    deviceToken = minted.token;
  }

  let entitlement: Entitlement;
  let reason: string | null = null;
  if (c.cfg.mode === 'open') {
    entitlement = await owner.setEntitlement({
      active: true,
      platform: 'open',
      productId: 'staging',
      expiresAt: iso(c.now() + 365 * DAY_MS),
      lastVerifiedAt: iso(c.now())
    });
  } else {
    // v1.09 B5: a receipt in the body → verify with the store now; no receipt
    // → re-check a stored one when it is near expiry or lapsed (throttled).
    const input = receiptFromBody(body, record.entitlement);
    const fresh = !!(body.platform && (body.purchaseToken || body.originalTransactionId || body.transactionId));
    if (fresh && !input) throw new HttpError(400, 'platform_unknown');
    if (fresh || (input && shouldRecheck(record.entitlement, c))) {
      try {
        const v = await verifyReceipt(c.env, c.cfg, c.fetchImpl, input as VerifyInput, c.now());
        // v1.15 A-10: one store subscription belongs to ONE owner. Before
        // writing the entitlement, find out whether this receipt is already
        // held elsewhere — a restore on a second device otherwise leaves two
        // owners entitled by the same purchase, each with its own connection
        // allowance, and the restored device staring at an empty hub because
        // the banks live on the first owner.
        const adopted = v.active ? await adoptReceiptOwner(v, ownerId, owner, record, c) : null;
        if (adopted) {
          ownerId = adopted.ownerId;
          owner = adopted.owner;
          record = adopted.record;
          deviceToken = adopted.deviceToken;
        }
        entitlement = await owner.setEntitlement({
          active: v.active,
          platform: v.platform,
          productId: v.productId,
          expiresAt: v.expiresAt,
          lastVerifiedAt: iso(c.now()),
          purchaseToken: v.purchaseToken || null,
          originalTransactionId: v.originalTransactionId || null,
          state: v.state
        });
        if (adopted) record = { ...record, entitlement };
        if (!v.active) reason = 'store_' + v.state.toLowerCase();
        if (adopted) reason = 'adopted';
      } catch (e) {
        if (fresh) throw e; // the user is watching: surface receipt_invalid & co.
        entitlement = record.entitlement; // silent re-check failed: keep what we had
      }
    } else {
      entitlement = record.entitlement;
    }
  }

  const res: Record<string, unknown> = {
    ownerId,
    active: isEntitled({ ...record, entitlement }, c.cfg, c.now()),
    expiresAt: entitlement.expiresAt || null,
    platform: entitlement.platform || null,
    productId: entitlement.productId || null,
    mode: c.cfg.mode
  };
  if (reason) res.reason = reason;
  if (deviceToken) res.deviceToken = deviceToken;
  return json(res, deviceToken ? 201 : 200);
}

// v1.15 A-10: bind a store receipt to a single owner.
//
// The restore-on-a-new-phone path used to end with TWO owners entitled by one
// purchase: the app mints a device before it can send anything, so the receipt
// arrives owned by a brand-new owner, and nothing ever compared it against the
// owner that bought the subscription. Each owner then carried its own
// OWNER_MAX_CONNECTIONS allowance at the aggregator (a real cost, billed per
// session), the first owner stayed active because the store still reports the
// subscription as active, and the restored device showed an empty hub because
// the linked banks live on the FIRST owner.
//
// So: the first owner to present a receipt claims it. A later device
// presenting the same receipt is ADOPTED into that owner — it gets a fresh
// device token for it, which means the user's banks are simply there, and the
// connection cap counts once per subscription as intended. The trust boundary
// is the store: only someone signed into the same store account can produce a
// receipt Apple or Google will verify, which is exactly "the same user's
// devices".
//
// The caller's own owner is only abandoned when it has nothing to lose. If it
// already holds bank connections (a device that used Bank Connect under a
// different store account, now restoring this one) moving it would strand
// them, so it keeps its entitlement and the index is left alone.
async function adoptReceiptOwner(
  v: { platform: string; purchaseToken?: string | null; originalTransactionId?: string | null },
  ownerId: string,
  owner: OwnerClient,
  record: OwnerRecord,
  c: Ctx
): Promise<{ ownerId: string; owner: OwnerClient; record: OwnerRecord; deviceToken: string } | null> {
  const receiptId = v.purchaseToken || v.originalTransactionId || '';
  if (!receiptId) return null;
  // Hashed: the raw purchase token is a bearer credential at the store, and
  // DO keys turn up in traces and dumps.
  const key = `${v.platform}:${await sha256Hex(receiptId)}`;

  const claim = await c.system.receiptClaim(key, ownerId);
  if (claim.claimed || claim.ownerId === ownerId) return null; // ours already

  if (Object.keys(record.requisitions || {}).length > 0) {
    // Would strand this device's own banks. Leave both entitled rather than
    // silently disconnect someone; the store is still the judge of validity.
    return null;
  }

  const target = new OwnerClient(c.env, claim.ownerId);
  const secret = randomHex(32);
  const targetRecord = await target.addDevice(await sha256Hex(secret), 'native');

  // Retire the owner we are leaving: it was minted moments ago for this very
  // request, and an orphan that stays entitled is the bug we came to fix.
  try {
    await owner.setEntitlement({
      active: false,
      platform: null,
      productId: null,
      expiresAt: null,
      lastVerifiedAt: iso(c.now()),
      purchaseToken: null,
      originalTransactionId: null,
      state: 'ADOPTED'
    });
  } catch { /* best effort: the adoption itself has already succeeded */ }

  return { ownerId: claim.ownerId, owner: target, record: targetRecord, deviceToken: `${claim.ownerId}.${secret}` };
}

function receiptFromBody(body: Record<string, unknown>, stored: Entitlement): VerifyInput | null {
  const platform = String(body.platform || stored.platform || '');
  if (platform === 'play') {
    const purchaseToken = String(body.purchaseToken || stored.purchaseToken || '');
    return purchaseToken ? { platform: 'play', purchaseToken, productId: String(body.productId || stored.productId || '') } : null;
  }
  if (platform === 'appstore') {
    const originalTransactionId = String(body.originalTransactionId || body.transactionId || stored.originalTransactionId || '');
    return originalTransactionId ? { platform: 'appstore', originalTransactionId, productId: String(body.productId || stored.productId || '') } : null;
  }
  return null;
}

function shouldRecheck(e: Entitlement, c: Ctx): boolean {
  if (!e || !e.platform || (!e.purchaseToken && !e.originalTransactionId)) return false;
  const now = c.now();
  const last = e.lastVerifiedAt ? Date.parse(e.lastVerifiedAt) : 0;
  if (now - last < c.cfg.recheckMinIntervalMs) return false;
  const exp = e.expiresAt ? Date.parse(e.expiresAt) : NaN;
  if (!e.active) return true; // lapsed: maybe renewed since
  return Number.isFinite(exp) && exp - now < c.cfg.recheckWithinMs;
}

// ── Connect ────────────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

function userLanguage(request: Request): string {
  const al = request.headers.get('accept-language') || '';
  const m = /^([a-z]{2})/i.exec(al.trim());
  return m ? m[1].toLowerCase() : 'en';
}

function returnUrl(c: Ctx): string {
  return `${c.cfg.publicUrl || c.origin}/v1/connect/return`;
}

async function handleConnectStart(request: Request, session: Session, c: Ctx): Promise<Response> {
  requireEntitled(session, c);
  const body = await readJson(request);
  const country = String(body.country || '').toUpperCase();
  const institutionId = String(body.institutionId || '').trim();
  if (!COUNTRY_RE.test(country)) throw new HttpError(400, 'country_required');
  if (!institutionId || institutionId.length > 200) throw new HttpError(400, 'institution_required');
  if (Object.keys(session.record.requisitions).length >= c.cfg.ownerMaxConnections) throw new HttpError(409, 'connection_limit');

  const inst = (await institutionsFor(country, c)).find(i => i.id === institutionId);
  if (!inst) throw new HttpError(400, 'unknown_institution');
  const historyDays = clamp(Number(body.historyDays) || 90, 1, inst.historyDays);
  const validityDays = clamp(Number(body.validityDays) || inst.maxValidityDays, 1, inst.maxValidityDays);

  const reserved = await c.system.reserve(c.cfg.maxConnections);
  if (!reserved.ok) throw new HttpError(503, 'capacity');

  try {
    const ref = `${session.ownerId}_${randomHex(8)}`;
    const auth = await c.agg.startAuth({
      name: inst.name,
      country: inst.country,
      validUntil: iso(c.now() + validityDays * DAY_MS),
      state: ref,
      redirectUrl: returnUrl(c),
      language: userLanguage(request)
    });
    const rec: ReqRecord = {
      ref,
      authorizationId: auth.authorizationId,
      sessionId: null,
      institutionId: inst.id,
      institutionName: inst.name,
      institutionLogo: inst.logo,
      createdAt: iso(c.now()),
      status: 'CR',
      kind: session.kind,
      accounts: null,
      historyDays,
      validityDays,
      expiresAt: null,
      linkedAt: null,
      lastError: null
    };
    await session.owner.addRequisition(rec);
    return json({ ref, bankRedirectUrl: auth.url, historyDays, validityDays }, 201);
  } catch (e) {
    await c.system.release();
    throw e;
  }
}

// The bank sends the user back here (App Link on a verified install, else the
// hand-off page). No device auth: `state` is our ref, which embeds the owner
// id and must match a CR record; the code is single-use and short-lived.
async function handleConnectReturn(url: URL, c: Ctx): Promise<Response> {
  const ref = url.searchParams.get('state') || url.searchParams.get('ref') || '';
  const code = url.searchParams.get('code') || '';
  const error = url.searchParams.get('error') || '';
  const details = url.searchParams.get('error_description') || url.searchParams.get('details') || '';
  const page = (p: { error?: string; details?: string }) => returnPage({ scheme: c.cfg.appScheme, ref, error: p.error || '', details: p.details || '' });

  const m = REF_RE.exec(ref);
  if (!m) return page({ error: 'invalid_ref', details: 'This link is not valid.' });
  const owner = new OwnerClient(c.env, m[1]);
  const record = await owner.record();
  const rec = record ? record.requisitions[ref] : undefined;
  if (!rec) return page({ error: 'invalid_ref', details: 'This link is not valid.' });
  // v1.11 B7: a flow that started from a web session lands back in the web
  // build; its hub resumes from pendingRef and reads the outcome via
  // /v1/connect/status, so the redirect carries nothing but the route.
  const toWeb = rec.kind === 'web' && !!c.cfg.publicWebUrl;
  const done = (p: { error?: string; details?: string }) => toWeb
    ? new Response(null, { status: 302, headers: { location: `${c.cfg.publicWebUrl}/#bank-connect`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } })
    : page(p);
  if (rec.status === 'LN') return done({}); // idempotent: reload of the return page

  if (error || !code) {
    const cancelled = /cancel/i.test(details) || /access_denied/i.test(error) && /cancel/i.test(details);
    await owner.updateRequisition(ref, { status: cancelled ? 'UA' : 'RJ', lastError: (error || 'no_code').slice(0, 100) });
    return done({ error: error || 'no_code', details: details || 'The bank did not return an authorization.' });
  }

  try {
    const s = await c.agg.createSession(code);
    const accounts = (s.accounts || []).map(a => ({
      id: a.uid,
      ibanTail: String((a.account_id && a.account_id.iban) || '').slice(-4),
      currency: a.currency || null,
      name: a.name || a.product || null
    }));
    const expiresAt = s.access && s.access.valid_until ? s.access.valid_until : iso(c.now() + rec.validityDays * DAY_MS);
    await owner.updateRequisition(ref, { status: 'LN', sessionId: s.session_id, accounts, linkedAt: iso(c.now()), expiresAt, lastError: null });
    return done({});
  } catch (e) {
    const codeStr = e instanceof AggregatorError ? e.code : 'internal';
    await owner.updateRequisition(ref, { status: 'RJ', lastError: codeStr });
    return done({ error: codeStr, details: 'The connection could not be completed. Please try again.' });
  }
}

function publicRequisition(rec: ReqRecord, now: number): Record<string, unknown> {
  const expired = rec.status === 'LN' && rec.expiresAt && Date.parse(rec.expiresAt) <= now;
  return {
    ref: rec.ref,
    status: expired ? 'EX' : rec.status,
    institutionId: rec.institutionId,
    institutionName: rec.institutionName,
    institutionLogo: rec.institutionLogo,
    accounts: rec.accounts || [],
    historyDays: rec.historyDays,
    validityDays: rec.validityDays,
    createdAt: rec.createdAt,
    linkedAt: rec.linkedAt,
    expiresAt: rec.expiresAt,
    lastError: rec.lastError || null
  };
}

async function handleConnectStatus(url: URL, session: Session, c: Ctx): Promise<Response> {
  const ref = url.searchParams.get('ref') || '';
  const rec = session.record.requisitions[ref];
  if (!rec) throw new HttpError(404, 'unknown_ref');
  return json(publicRequisition(rec, c.now()));
}

function findAccount(record: OwnerRecord, accountId: string): ReqRecord | null {
  for (const rec of Object.values(record.requisitions)) {
    if (rec.status === 'LN' && rec.accounts && rec.accounts.some(a => a.id === accountId)) return rec;
  }
  return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function handleAccountData(kind: 'transactions' | 'balances', accountId: string, url: URL, request: Request, session: Session, c: Ctx): Promise<Response> {
  requireEntitled(session, c);
  const rec = findAccount(session.record, accountId);
  if (!rec) throw new HttpError(404, 'unknown_account');
  if (rec.expiresAt && Date.parse(rec.expiresAt) <= c.now()) throw new HttpError(410, 'consent_expired');
  const psu: PsuContext = { ip: c.ip, userAgent: request.headers.get('user-agent') };
  try {
    if (kind === 'balances') return json(await c.agg.balances(accountId, psu));
    const from = url.searchParams.get('date_from') || undefined;
    const to = url.searchParams.get('date_to') || undefined;
    if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) throw new HttpError(400, 'invalid_date');
    return json(await c.agg.transactions(accountId, from, to, psu));
  } catch (e) {
    if (e instanceof AggregatorError && e.status === 410) {
      await session.owner.updateRequisition(rec.ref, { status: 'EX', lastError: e.code });
    }
    throw e;
  }
}

async function handleRevoke(ref: string, session: Session, c: Ctx): Promise<Response> {
  const rec = session.record.requisitions[ref];
  if (!rec) throw new HttpError(404, 'unknown_ref');
  if (rec.sessionId) await c.agg.deleteSession(rec.sessionId);
  await session.owner.removeRequisition(ref);
  await c.system.release();
  return json({ ok: true, ref });
}

// ── Well-known (D-C7) ──────────────────────────────────────────────────────

function assetLinks(cfg: Config): Response {
  return json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: cfg.androidPackage, sha256_cert_fingerprints: cfg.androidFingerprints }
  }], 200, { 'cache-control': 'public, max-age=3600' });
}

function appleAssociation(cfg: Config): Response {
  const details = cfg.iosAppId
    ? [{ appID: cfg.iosAppId, paths: ['/v1/connect/return*'] }]
    : [];
  return json({ applinks: { apps: [], details } }, 200, { 'cache-control': 'public, max-age=3600' });
}

// ── Router ─────────────────────────────────────────────────────────────────

async function route(request: Request, url: URL, c: Ctx): Promise<Response> {
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === '/healthz' && method === 'GET') return json({ ok: true, mode: c.cfg.mode, service: 'stackd-broker', aggregator: 'enablebanking' });
  // v1.16 A-11: the deep check. Guarded by a shared secret and 404 when
  // OPS_TOKEN is unset, so it is invisible unless deliberately enabled — it
  // reports capacity and failure counts, which is not public information.
  if (path === '/v1/ops/status' && method === 'GET') {
    if (!c.env.OPS_TOKEN) throw new HttpError(404, 'not_found');
    const given = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
    if (given !== c.env.OPS_TOKEN) throw new HttpError(401, 'unauthorized');
    return json(await opsSnapshot(c.env, c.cfg, c.now()));
  }
  if (path === '/.well-known/assetlinks.json' && method === 'GET') return assetLinks(c.cfg);
  if (path === '/.well-known/apple-app-site-association' && method === 'GET') return appleAssociation(c.cfg);
  if (path === '/v1/connect/return' && method === 'GET') return handleConnectReturn(url, c);
  if (!path.startsWith('/v1/')) throw new HttpError(404, 'not_found');

  // Build-time client id: worthless against extraction, filters lazy
  // scanners; X-Stackd-Attest (D-C5) lands here later.
  if (request.headers.get('x-stackd-client') !== c.cfg.clientId) throw new HttpError(403, 'client_required');

  if (path === '/v1/institutions' && method === 'GET') return handleInstitutions(url, c);
  if (path === '/v1/entitlement/verify' && method === 'POST') return handleEntitlementVerify(request, c);
  // v1.11 B7: these two authenticate themselves (a claim has no session yet;
  // the boot check must answer 401 no_session cleanly, never mint).
  if (path === '/v1/pair/claim' && method === 'POST') return handlePairClaim(request, c);
  if (path === '/v1/session' && method === 'GET') return handleSession(request, c);

  const session = await requireDevice(request, c);
  if (path === '/v1/pair/code' && method === 'POST') return handlePairCode(session, c);
  if (path === '/v1/session/logout' && method === 'POST') return handleLogout(session, c);
  if (path === '/v1/devices' && method === 'GET') return handleDevices(session);
  const dev = /^\/v1\/devices\/([^/]+)$/.exec(path);
  if (dev && method === 'DELETE') return handleDeviceRevoke(decodeURIComponent(dev[1]), session);
  if (path === '/v1/connect/start' && method === 'POST') return handleConnectStart(request, session, c);
  if (path === '/v1/connect/status' && method === 'GET') return handleConnectStatus(url, session, c);
  if (path === '/v1/connections' && method === 'GET') {
    return json({ connections: Object.values(session.record.requisitions).map(r => publicRequisition(r, c.now())) });
  }
  const acc = /^\/v1\/accounts\/([^/]+)\/(transactions|balances)$/.exec(path);
  if (acc && method === 'GET') return handleAccountData(acc[2] as 'transactions' | 'balances', decodeURIComponent(acc[1]), url, request, session, c);
  const del = /^\/v1\/connections\/([^/]+)$/.exec(path);
  if (del && method === 'DELETE') return handleRevoke(decodeURIComponent(del[1]), session, c);

  throw new HttpError(404, 'not_found');
}

export function createApp(deps: Deps = {}) {
  const fetchImpl = deps.fetch || ((input: string, init?: RequestInit) => fetch(input, init));
  const now = deps.now || (() => Date.now());
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const cfg = parseConfig(env);
      const url = new URL(request.url);
      const cors = corsHeaders(request.headers.get('origin'), cfg.allowedOrigins);
      const started = now();
      let res: Response;
      try {
        if (request.method === 'OPTIONS') {
          res = new Response(null, { status: 204 });
        } else {
          const c: Ctx = {
            env,
            cfg,
            agg: new EnableBanking(env, cfg, fetchImpl, now),
            system: new SystemClient(env),
            rate: new RateClient(env),
            now,
            ip: request.headers.get('cf-connecting-ip') || 'unknown',
            origin: url.origin,
            fetchImpl
          };
          res = await route(request, url, c);
        }
      } catch (e) {
        // v1.16 A-11: record the faults an operator can act on. Errors are
        // rare, so the extra DO write costs nothing on the happy path, and a
        // failure to count must never change the response.
        const note = async (code: string) => {
          const bucket = countable(code);
          if (!bucket) return;
          try { await new SystemClient(env).bump([bucket], now(), cfg.counterKeepMs); } catch { /* counting is best effort */ }
        };
        if (e instanceof HttpError) {
          res = json({ error: e.code }, e.status, e.headers);
          await note(e.code);
        } else if (e instanceof StoreError) {
          res = json({ error: e.code }, e.status);
          await note(e.code);
        } else if (e instanceof AggregatorError) {
          // Shape-only diagnostics ride along on staging (open mode) — the
          // tail websocket is not reachable from every network.
          res = json(cfg.mode === 'open' && e.diag ? { error: e.code, diag: e.diag } : { error: e.code }, e.status);
          await note(e.code);
        } else {
          // Message only — never a body, never a header.
          console.log(JSON.stringify({ level: 'error', p: url.pathname, err: e instanceof Error ? e.message : String(e) }));
          res = json({ error: 'internal' }, 500);
          await note('internal');
        }
      }
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      headers.set('x-content-type-options', 'nosniff');
      res = new Response(res.body, { status: res.status, headers });
      console.log(JSON.stringify({ m: request.method, p: url.pathname, s: res.status, ms: now() - started }));
      return res;
    },

    // v1.16 A-11: wired to the cron trigger in wrangler.toml.
    async scheduled(_event: unknown, env: Env): Promise<void> {
      await runScheduled(env, fetchImpl as typeof fetch, now());
    }
  };
}

// ── Monitoring (v1.16 A-11) ────────────────────────────────────────────────
// Only faults an operator can ACT on are counted. Per-user 4xx (a bad token,
// a rate limit, an unknown ref) are normal traffic: counting them would turn
// ordinary use into Durable Object writes and bury the signal.
const COUNTED = new Set([
  'aggregator_auth_failed', 'aggregator_key_invalid', 'aggregator_not_configured',
  'aggregator_paused', 'aggregator_rate_limited', 'capacity',
  'store_auth_failed', 'store_not_configured', 'store_key_invalid',
  'internal'
]);

const countable = (code: string): string | null => {
  if (COUNTED.has(code)) return code;
  // aggregator_error_502 / store_error_500 -> one bucket each, so a bad day
  // upstream does not create a hundred distinct counters.
  if (code.startsWith('aggregator_error_')) return 'aggregator_error';
  if (code.startsWith('store_error_')) return 'store_error';
  return null;
};

export interface OpsSnapshot {
  mode: string;
  at: string;
  breakerPausedUntil: number;
  connections: number;
  maxConnections: number;
  counters: Record<string, number>;
  conditions: { code: string; detail: string }[];
}

// What is wrong right now, in words. Shared by the cron and /v1/ops/status so
// an alert and a manual check can never disagree.
export function evaluate(snapshot: Omit<OpsSnapshot, 'conditions'>, cfg: Config): { code: string; detail: string }[] {
  const out: { code: string; detail: string }[] = [];
  for (const [code, threshold] of Object.entries(cfg.alertThresholds)) {
    const n = snapshot.counters[code] || 0;
    if (n >= threshold) out.push({ code, detail: `${n} in the last hour (threshold ${threshold})` });
  }
  if (snapshot.breakerPausedUntil > Date.parse(snapshot.at)) {
    out.push({ code: 'breaker_open', detail: `aggregator calls paused until ${new Date(snapshot.breakerPausedUntil).toISOString()}` });
  }
  if (snapshot.maxConnections > 0 && snapshot.connections >= snapshot.maxConnections * 0.9) {
    out.push({ code: 'capacity_high', detail: `${snapshot.connections} of ${snapshot.maxConnections} connections used` });
  }
  return out;
}

async function opsSnapshot(env: Env, cfg: Config, now: number): Promise<OpsSnapshot> {
  const system = new SystemClient(env);
  const [counters, breaker, connections] = await Promise.all([
    system.counters(3600000, now).catch(() => ({})),
    system.getBreaker().catch(() => ({ pausedUntil: 0 })),
    system.connections().catch(() => 0)
  ]);
  const base = {
    mode: cfg.mode,
    at: new Date(now).toISOString(),
    breakerPausedUntil: breaker.pausedUntil || 0,
    connections,
    maxConnections: cfg.maxConnections,
    counters
  };
  return { ...base, conditions: evaluate(base, cfg) };
}

// The cron. Cloudflare runs this outside the request path, so it still fires
// while the API itself is failing — but NOT if the whole Worker is down,
// which is why the README also asks for an external pinger on /healthz.
export async function runScheduled(env: Env, fetchImpl: typeof fetch, now: number): Promise<OpsSnapshot> {
  const cfg = parseConfig(env);
  const snap = await opsSnapshot(env, cfg, now);
  if (!snap.conditions.length || !env.ALERT_WEBHOOK_URL) return snap;

  const system = new SystemClient(env);
  const state = await system.alertState().catch(() => ({} as Record<string, number>));
  const fresh = snap.conditions.filter(c => !state[c.code] || now - state[c.code] > cfg.alertRepeatMs);
  if (!fresh.length) return snap; // already reported; stay quiet

  try {
    await fetchImpl(env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        service: 'stackd-broker',
        host: cfg.publicUrl,
        mode: cfg.mode,
        at: snap.at,
        conditions: fresh,
        counters: snap.counters
      })
    });
    const next = { ...state };
    for (const c of fresh) next[c.code] = now;
    await system.setAlertState(next);
  } catch (e) {
    // Never throw out of a cron: a webhook outage must not look like a
    // broker fault, and the next tick will try again.
    console.log(JSON.stringify({ level: 'error', p: 'scheduled', err: e instanceof Error ? e.message : String(e) }));
  }
  return snap;
}

export default createApp();
