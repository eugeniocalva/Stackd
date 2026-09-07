// Enable Banking adapter — the ONE aggregator-facing file (2026-09-07 pivot:
// GoCardless Bank Account Data closed self-serve sign-ups; see
// docs/bank-connect-ux-plan.md §11). Authenticates with an RS256 JWT signed
// by the application's private key (kid = application id), never logs a
// response body, and maps aggregator errors to the broker's own codes.
import type { Env, Config } from './env';
import { SystemClient } from './durable-objects';

export class AggregatorError extends Error {
  // Non-sensitive diagnostics (lengths/shapes only); surfaced in staging responses.
  diag?: Record<string, unknown>;
  constructor(public status: number, public code: string, message?: string) {
    super(message || code);
  }
}

// The broker's own institution shape (aggregator-neutral; the app consumes it).
export interface Institution {
  id: string; // `${country}:${name}` — Enable Banking identifies ASPSPs by name + country
  name: string;
  country: string;
  logo: string | null;
  bic: string | null;
  historyDays: number;
  maxValidityDays: number;
  beta: boolean;
  sandbox: boolean;
}

export interface SessionAccount {
  uid: string;
  account_id?: { iban?: string; other?: { identification?: string } };
  currency?: string;
  name?: string;
  product?: string;
  cash_account_type?: string;
}

export interface Session {
  session_id: string;
  accounts: SessionAccount[];
  access?: { valid_until?: string };
  status?: string;
  aspsp?: { name: string; country: string };
}

export interface PsuContext {
  ip?: string | null;
  userAgent?: string | null;
}

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

// Enable Banking exposes no per-ASPSP history limit; most banks return at
// least a year (FAQ). The app clamps its own preference to this.
export const DEFAULT_HISTORY_DAYS = 365;
const JWT_TTL_S = 3600;
const JWT_RENEW_S = 300;
const BREAKER_PAUSE_MS = 10 * 60 * 1000;
const MAX_TX_PAGES = 25;

// ── Key + JWT helpers ──────────────────────────────────────────────────────

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const textToBase64Url = (s: string): string => bytesToBase64Url(new TextEncoder().encode(s));

function derLength(n: number): number[] {
  if (n < 128) return [n];
  const bytes: number[] = [];
  while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
  return [0x80 | bytes.length, ...bytes];
}

// PKCS#1 "RSA PRIVATE KEY" → PKCS#8 "PRIVATE KEY" (WebCrypto imports only the latter).
function wrapPkcs1(pkcs1: Uint8Array): Uint8Array {
  const version = [0x02, 0x01, 0x00];
  const rsaAlgId = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const octet = [0x04, ...derLength(pkcs1.length), ...Array.from(pkcs1)];
  const body = [...version, ...rsaAlgId, ...octet];
  return new Uint8Array([0x30, ...derLength(body.length), ...body]);
}

// Accepts a PEM (PKCS#8 or PKCS#1) or the base64 of a PEM (handy for .dev.vars).
export function pemToPkcs8(raw: string): Uint8Array {
  let text = String(raw || '').trim();
  if (!text.startsWith('-----')) {
    try {
      text = atob(text.replace(/\s+/g, '')).trim();
    } catch {
      throw new AggregatorError(503, 'aggregator_key_invalid');
    }
  }
  const m = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/.exec(text);
  if (!m) throw new AggregatorError(503, 'aggregator_key_invalid');
  const der = base64ToBytes(m[2].replace(/\s+/g, ''));
  if (m[1] === 'PRIVATE KEY') return der;
  if (m[1] === 'RSA PRIVATE KEY') return wrapPkcs1(der);
  throw new AggregatorError(503, 'aggregator_key_unsupported');
}

interface KeyMemo {
  fingerprint: string;
  key: CryptoKey;
}

interface JwtMemo {
  fingerprint: string;
  token: string;
  exp: number;
}

export class EnableBanking {
  private static keyMemo: KeyMemo | null = null;
  private static jwtMemo: JwtMemo | null = null;
  static resetMemo(): void {
    EnableBanking.keyMemo = null;
    EnableBanking.jwtMemo = null;
  }

  private system: SystemClient;

  constructor(
    private env: Env,
    private cfg: Config,
    private fetchImpl: FetchImpl,
    private now: () => number = () => Date.now()
  ) {
    this.system = new SystemClient(env);
  }

  private fingerprint(): string {
    return `${this.env.EB_APP_ID || ''}:${String(this.env.EB_PRIVATE_KEY || '').length}`;
  }

  private async key(): Promise<CryptoKey> {
    const fp = this.fingerprint();
    if (EnableBanking.keyMemo && EnableBanking.keyMemo.fingerprint === fp) return EnableBanking.keyMemo.key;
    const der = pemToPkcs8(this.env.EB_PRIVATE_KEY);
    let key: CryptoKey;
    try {
      key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    } catch {
      throw new AggregatorError(503, 'aggregator_key_invalid');
    }
    EnableBanking.keyMemo = { fingerprint: fp, key };
    return key;
  }

  async jwt(): Promise<string> {
    const appId = String(this.env.EB_APP_ID || '').trim();
    if (!appId || !this.env.EB_PRIVATE_KEY) throw new AggregatorError(503, 'aggregator_not_configured');
    const nowS = Math.floor(this.now() / 1000);
    const fp = this.fingerprint();
    const memo = EnableBanking.jwtMemo;
    if (memo && memo.fingerprint === fp && memo.exp - nowS > JWT_RENEW_S) return memo.token;
    const key = await this.key();
    const header = textToBase64Url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }));
    const payload = textToBase64Url(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: nowS, exp: nowS + JWT_TTL_S }));
    const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(`${header}.${payload}`));
    const token = `${header}.${payload}.${bytesToBase64Url(new Uint8Array(sig))}`;
    EnableBanking.jwtMemo = { fingerprint: fp, token, exp: nowS + JWT_TTL_S };
    return token;
  }

  private async checkBreaker(): Promise<void> {
    const b = await this.system.getBreaker();
    if (b.pausedUntil && b.pausedUntil > this.now()) throw new AggregatorError(503, 'aggregator_paused');
  }

  // Error code from the aggregator body (`{"error": "..."}` / `{"code": ...}`); never the message.
  private async errorCode(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as Record<string, unknown>;
      const code = body.error || body.code || body.error_code;
      return typeof code === 'string' ? code.toUpperCase() : '';
    } catch {
      return '';
    }
  }

  async request<T>(path: string, init: RequestInit = {}, psu?: PsuContext): Promise<T | null> {
    await this.checkBreaker();
    const token = await this.jwt();
    const headers = new Headers(init.headers || {});
    headers.set('accept', 'application/json');
    headers.set('authorization', `Bearer ${token}`);
    if (init.body) headers.set('content-type', 'application/json');
    // PSU-online headers: banks allow more than the 4 background fetches a day
    // when the end user is present. Only what the device request already carries.
    if (psu && psu.ip && psu.ip !== 'unknown') headers.set('psu-ip-address', psu.ip);
    if (psu && psu.userAgent) headers.set('psu-user-agent', psu.userAgent.slice(0, 200));
    const res = await this.fetchImpl(`${this.cfg.ebBaseUrl}${path}`, { ...init, headers });
    if (res.ok) {
      if (res.status === 204) return null;
      const text = await res.text();
      return text ? (JSON.parse(text) as T) : null;
    }
    const code = await this.errorCode(res);
    // A dead session is a consent problem for ONE connection, not a broker
    // credential problem — classify it before the 401/403 auth branch.
    if (res.status >= 400 && res.status < 500 && res.status !== 429 && /EXPIRED|REVOKED|INVALID_SESSION|SESSION/.test(code)) {
      throw new AggregatorError(410, 'consent_expired');
    }
    if (res.status === 401 || res.status === 403) {
      const appId = String(this.env.EB_APP_ID || '').trim();
      const pem = String(this.env.EB_PRIVATE_KEY || '');
      const err = new AggregatorError(502, 'aggregator_auth_failed');
      err.diag = { status: res.status, code, appIdIsUuid: /^[0-9a-f-]{36}$/i.test(appId), keyIsPem: pem.trim().startsWith('-----'), keyLen: pem.length };
      console.log(JSON.stringify({ level: 'warn', msg: 'aggregator auth failed', ...err.diag }));
      throw err;
    }
    if (res.status === 429) {
      // The bank's own per-PSU budget is not our quota: surface it. Anything
      // else pauses every caller for a while.
      if (path.startsWith('/accounts/') || code.includes('ASPSP')) throw new AggregatorError(429, 'account_rate_limited');
      await this.system.setBreaker(this.now() + BREAKER_PAUSE_MS);
      throw new AggregatorError(503, 'aggregator_rate_limited');
    }
    if (res.status === 404) throw new AggregatorError(404, 'aggregator_not_found');
    console.log(JSON.stringify({ level: 'warn', msg: 'aggregator error', p: path.split('?')[0].replace(/[0-9a-f-]{36}/g, ':id'), status: res.status, code }));
    throw new AggregatorError(502, `aggregator_error_${res.status}`);
  }

  async institutions(country: string): Promise<Institution[]> {
    const list = await this.request<{ aspsps?: unknown[] } | unknown[]>(`/aspsps?country=${encodeURIComponent(country)}&psu_type=personal`);
    const raw = Array.isArray(list) ? list : (list && Array.isArray((list as { aspsps?: unknown[] }).aspsps) ? (list as { aspsps: unknown[] }).aspsps : []);
    return raw.map(x => {
      const a = x as Record<string, unknown>;
      const validitySeconds = Number(a.maximum_consent_validity || 0);
      const name = String(a.name || '');
      const c = String(a.country || country).toUpperCase();
      return {
        id: `${c}:${name}`,
        name,
        country: c,
        logo: typeof a.logo === 'string' && a.logo ? a.logo : null,
        bic: typeof a.bic === 'string' && a.bic ? a.bic : null,
        historyDays: DEFAULT_HISTORY_DAYS,
        maxValidityDays: validitySeconds > 0 ? Math.max(1, Math.floor(validitySeconds / 86400)) : 90,
        beta: !!a.beta,
        sandbox: !!a.sandbox
      };
    }).filter(i => i.name);
  }

  async startAuth(p: { name: string; country: string; validUntil: string; state: string; redirectUrl: string; language: string }): Promise<{ url: string; authorizationId: string }> {
    const res = await this.request<{ url: string; authorization_id: string }>('/auth', {
      method: 'POST',
      body: JSON.stringify({
        access: { valid_until: p.validUntil },
        aspsp: { name: p.name, country: p.country },
        state: p.state,
        redirect_url: p.redirectUrl,
        psu_type: 'personal',
        language: p.language
      })
    });
    if (!res || !res.url) throw new AggregatorError(502, 'aggregator_no_link');
    return { url: res.url, authorizationId: res.authorization_id };
  }

  async createSession(code: string): Promise<Session> {
    const s = await this.request<Session>('/sessions', { method: 'POST', body: JSON.stringify({ code }) });
    if (!s || !s.session_id) throw new AggregatorError(502, 'aggregator_no_session');
    return s;
  }

  getSession(id: string): Promise<Session | null> {
    return this.request<Session>(`/sessions/${encodeURIComponent(id)}`);
  }

  async deleteSession(id: string): Promise<void> {
    try {
      await this.request(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (e) {
      if (e instanceof AggregatorError && (e.status === 404 || e.status === 410)) return; // already gone
      throw e;
    }
  }

  balances(uid: string, psu?: PsuContext): Promise<unknown> {
    return this.request(`/accounts/${encodeURIComponent(uid)}/balances`, {}, psu);
  }

  // Follows continuation_key so the app gets ONE list per window.
  async transactions(uid: string, dateFrom?: string, dateTo?: string, psu?: PsuContext): Promise<{ transactions: unknown[]; truncated: boolean }> {
    const all: unknown[] = [];
    let continuation: string | undefined;
    for (let page = 0; page < MAX_TX_PAGES; page++) {
      const q = new URLSearchParams();
      if (dateFrom) q.set('date_from', dateFrom);
      if (dateTo) q.set('date_to', dateTo);
      if (continuation) q.set('continuation_key', continuation);
      const qs = q.toString();
      const res = await this.request<{ transactions?: unknown[]; continuation_key?: string }>(`/accounts/${encodeURIComponent(uid)}/transactions${qs ? '?' + qs : ''}`, {}, psu);
      if (res && Array.isArray(res.transactions)) all.push(...res.transactions);
      continuation = res && res.continuation_key ? res.continuation_key : undefined;
      if (!continuation) return { transactions: all, truncated: false };
    }
    return { transactions: all, truncated: true };
  }
}
