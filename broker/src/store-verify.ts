// Store receipt verification (v1.09 B5, docs/bank-connect-ux-plan.md §14).
// The client never decides entitlement (D-C3): it hands the broker a Google
// Play purchase token or an App Store transaction id, and the broker asks
// the store directly. Both stores are reached with credentials the broker
// holds (a Play service account, an App Store Connect API key), so the
// answers are trusted as-is — no client-side receipt parsing, no JWS chain
// validation of Apple's signed payloads (they arrive over TLS from Apple in
// a response we authenticated to).
import type { Env, Config } from './env';
import { pemToPkcs8 } from './enable-banking';
import { SystemClient } from './durable-objects';

export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export interface VerifyInput {
  platform: 'play' | 'appstore';
  purchaseToken?: string;          // Play
  originalTransactionId?: string;  // App Store (any transaction id of the subscription works)
  productId?: string;
}

export interface VerifyResult {
  active: boolean;
  platform: 'play' | 'appstore';
  productId: string | null;
  expiresAt: string | null;
  purchaseToken?: string | null;
  originalTransactionId?: string | null;
  state: string; // store-native state, for diagnostics
}

export class StoreError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message || code);
  }
}

// ── JWT helpers ────────────────────────────────────────────────────────────

const b64url = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlText = (s: string): string => b64url(new TextEncoder().encode(s));
const b64urlDecode = (s: string): string => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
};

async function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, key: CryptoKey, alg: 'RS256' | 'ES256'): Promise<string> {
  const h = b64urlText(JSON.stringify({ ...header, alg, typ: 'JWT' }));
  const p = b64urlText(JSON.stringify(payload));
  const data = new TextEncoder().encode(`${h}.${p}`);
  const sig = alg === 'RS256'
    ? await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, data)
    : await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data); // raw r||s, as JWS wants
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

const keyMemo = new Map<string, CryptoKey>();

async function importKey(pem: string, alg: 'RS256' | 'ES256'): Promise<CryptoKey> {
  const id = alg + ':' + pem.length + ':' + pem.slice(-40);
  const hit = keyMemo.get(id);
  if (hit) return hit;
  let der: Uint8Array;
  try {
    der = pemToPkcs8(pem);
  } catch {
    throw new StoreError(503, 'store_key_invalid');
  }
  try {
    const key = alg === 'RS256'
      ? await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
      : await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    keyMemo.set(id, key);
    return key;
  } catch {
    throw new StoreError(503, 'store_key_invalid');
  }
}

// ── Google Play ────────────────────────────────────────────────────────────

const PLAY_ACTIVE = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']);

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

async function playAccessToken(env: Env, cfg: Config, fetchImpl: FetchImpl, system: SystemClient, now: number): Promise<string> {
  const cached = await system.cacheGet<{ token: string; expiresAt: number }>('play_token');
  if (cached && cached.expiresAt > now + 60000) return cached.token;
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(env.PLAY_SERVICE_ACCOUNT_JSON || '') as ServiceAccount;
  } catch {
    throw new StoreError(503, 'store_not_configured');
  }
  if (!sa || !sa.client_email || !sa.private_key) throw new StoreError(503, 'store_not_configured');
  const key = await importKey(sa.private_key, 'RS256');
  const iat = Math.floor(now / 1000);
  const assertion = await signJwt({}, {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: cfg.googleTokenUrl,
    iat,
    exp: iat + 3600
  }, key, 'RS256');
  const res = await fetchImpl(cfg.googleTokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(assertion)}`
  });
  if (!res.ok) throw new StoreError(502, 'store_auth_failed');
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const token = data.access_token;
  await system.cachePut('play_token', { token, expiresAt: now + (Number(data.expires_in) || 3600) * 1000 });
  return token;
}

export async function verifyPlay(env: Env, cfg: Config, fetchImpl: FetchImpl, input: VerifyInput, now: number): Promise<VerifyResult> {
  const token = String(input.purchaseToken || '').trim();
  if (!token) throw new StoreError(400, 'receipt_required');
  if (!cfg.playPackage) throw new StoreError(503, 'store_not_configured');
  const system = new SystemClient(env);
  const access = await playAccessToken(env, cfg, fetchImpl, system, now);
  const url = `${cfg.playApiUrl}/androidpublisher/v3/applications/${encodeURIComponent(cfg.playPackage)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`;
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${access}`, accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) {
    await system.cachePut('play_token', null);
    throw new StoreError(502, 'store_auth_failed');
  }
  if (res.status === 404 || res.status === 400 || res.status === 410) throw new StoreError(400, 'receipt_invalid');
  if (!res.ok) throw new StoreError(502, `store_error_${res.status}`);
  const sub = (await res.json()) as {
    subscriptionState?: string;
    acknowledgementState?: string;
    lineItems?: { productId?: string; expiryTime?: string }[];
  };
  const state = String(sub.subscriptionState || '');
  const items = sub.lineItems || [];
  const item = items.find(li => cfg.productIds.includes(String(li.productId || ''))) || items[0];
  const productId = item && item.productId ? String(item.productId) : null;
  if (!productId || !cfg.productIds.includes(productId)) throw new StoreError(400, 'product_unknown');
  const expiresMs = item && item.expiryTime ? Date.parse(item.expiryTime) : NaN;
  const expiresAt = Number.isFinite(expiresMs) ? new Date(expiresMs).toISOString() : null;
  const active = PLAY_ACTIVE.has(state) && (expiresAt === null || expiresMs > now);
  // Belt and braces: an unacknowledged subscription is refunded by Google
  // after 3 days. The client acknowledges too (finish()); this is the backstop.
  if (sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' && active) {
    try {
      await fetchImpl(`${cfg.playApiUrl}/androidpublisher/v3/applications/${encodeURIComponent(cfg.playPackage)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`, {
        method: 'POST',
        headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
        body: '{}'
      });
    } catch { /* best effort */ }
  }
  return { active, platform: 'play', productId, expiresAt, purchaseToken: token, state };
}

// ── Apple App Store ────────────────────────────────────────────────────────

// App Store Server API subscription statuses.
const APPLE_ACTIVE = new Set([1, 3, 4]); // active, billing retry, billing grace period

async function appleJwt(env: Env, cfg: Config, now: number): Promise<string> {
  if (!env.APPLE_PRIVATE_KEY || !cfg.appleIssuerId || !cfg.appleKeyId || !cfg.appleBundleId) throw new StoreError(503, 'store_not_configured');
  const key = await importKey(env.APPLE_PRIVATE_KEY, 'ES256');
  const iat = Math.floor(now / 1000);
  return signJwt({ kid: cfg.appleKeyId }, {
    iss: cfg.appleIssuerId,
    iat,
    exp: iat + 1800, // Apple caps at 60 minutes
    aud: 'appstoreconnect-v1',
    bid: cfg.appleBundleId
  }, key, 'ES256');
}

function decodeJwsPayload(jws: string): Record<string, unknown> {
  const parts = String(jws || '').split('.');
  if (parts.length !== 3) return {};
  try {
    return JSON.parse(b64urlDecode(parts[1])) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function verifyApple(env: Env, cfg: Config, fetchImpl: FetchImpl, input: VerifyInput, now: number): Promise<VerifyResult> {
  const txId = String(input.originalTransactionId || '').trim();
  if (!/^\d{1,30}$/.test(txId)) throw new StoreError(400, 'receipt_required');
  const jwt = await appleJwt(env, cfg, now);
  const call = async (base: string) => fetchImpl(`${base}/inapps/v1/subscriptions/${encodeURIComponent(txId)}`, { headers: { authorization: `Bearer ${jwt}`, accept: 'application/json' } });
  let res = await call(cfg.appleApiUrl);
  if (res.status === 404 && cfg.appleSandboxApiUrl) {
    // A sandbox transaction looked up in production: Apple answers 404
    // (errorCode 4040010) — retry against the sandbox environment.
    res = await call(cfg.appleSandboxApiUrl);
  }
  if (res.status === 401) throw new StoreError(502, 'store_auth_failed');
  if (res.status === 404 || res.status === 400) throw new StoreError(400, 'receipt_invalid');
  if (!res.ok) throw new StoreError(502, `store_error_${res.status}`);
  const body = (await res.json()) as {
    bundleId?: string;
    data?: { lastTransactions?: { originalTransactionId?: string; status?: number; signedTransactionInfo?: string }[] }[];
  };
  if (body.bundleId && body.bundleId !== cfg.appleBundleId) throw new StoreError(400, 'receipt_invalid');
  const txs = (body.data || []).flatMap(g => g.lastTransactions || []);
  if (!txs.length) throw new StoreError(400, 'receipt_invalid');
  // Prefer the entry for one of OUR products; newest expiry wins.
  const decoded = txs.map(t => ({ t, info: decodeJwsPayload(t.signedTransactionInfo || '') }))
    .filter(x => !x.info.productId || cfg.productIds.includes(String(x.info.productId)))
    .sort((a, b) => Number(b.info.expiresDate || 0) - Number(a.info.expiresDate || 0));
  const best = decoded[0];
  if (!best) throw new StoreError(400, 'product_unknown');
  const productId = best.info.productId ? String(best.info.productId) : null;
  if (!productId || !cfg.productIds.includes(productId)) throw new StoreError(400, 'product_unknown');
  const expiresMs = Number(best.info.expiresDate || NaN);
  const expiresAt = Number.isFinite(expiresMs) ? new Date(expiresMs).toISOString() : null;
  const status = Number(best.t.status || 0);
  const active = APPLE_ACTIVE.has(status) && (expiresAt === null || expiresMs > now || status === 4 || status === 3);
  return {
    active,
    platform: 'appstore',
    productId,
    expiresAt,
    originalTransactionId: String(best.t.originalTransactionId || best.info.originalTransactionId || txId),
    state: String(status)
  };
}

export function verifyReceipt(env: Env, cfg: Config, fetchImpl: FetchImpl, input: VerifyInput, now: number): Promise<VerifyResult> {
  if (input.platform === 'play') return verifyPlay(env, cfg, fetchImpl, input, now);
  if (input.platform === 'appstore') return verifyApple(env, cfg, fetchImpl, input, now);
  return Promise.reject(new StoreError(400, 'platform_unknown'));
}
