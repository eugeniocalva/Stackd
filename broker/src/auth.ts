// Device tokens: `<ownerId>.<secret>`. The ownerId routes to the owner's
// Durable Object; the DO stores only sha256(secret). A leaked DO record
// therefore yields no usable token, and a token alone reveals only an opaque
// owner id. Web sessions (v1.11 B7, UX plan §16) carry the same token shape
// in an HttpOnly cookie; the OwnerDO stores sha256(secret) either way, plus a
// hashed CSRF token for the cookie mode.

const HEX = '0123456789abcdef';

export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let out = '';
  for (const b of buf) out += HEX[b >> 4] + HEX[b & 15];
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  let out = '';
  for (const b of new Uint8Array(digest)) out += HEX[b >> 4] + HEX[b & 15];
  return out;
}

export interface ParsedToken {
  ownerId: string;
  secret: string;
}

const TOKEN_RE = /^([0-9a-f]{16})\.([0-9a-f]{64})$/;

export function parseBearer(header: string | null): ParsedToken | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  const t = TOKEN_RE.exec(m[1].trim());
  if (!t) return null;
  return { ownerId: t[1], secret: t[2] };
}

export function mintToken(): { ownerId: string; secret: string; token: string } {
  const ownerId = randomHex(8);
  const secret = randomHex(32);
  return { ownerId, secret, token: `${ownerId}.${secret}` };
}

// ── Web session cookie (v1.11 B7) ──────────────────────────────────────────
// `stackd_session=<ownerId>.<secret>` — same token grammar as the bearer, so
// a web device is verified by the very same DO call. Set only by the broker
// host; Lax rides on the app's same-site fetch (D-C11), HttpOnly keeps it out
// of JS, and the app never sees the secret at all.

export const SESSION_COOKIE = 'stackd_session';

export function parseSessionCookie(header: string | null): ParsedToken | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const t = TOKEN_RE.exec(part.slice(eq + 1).trim());
    return t ? { ownerId: t[1], secret: t[2] } : null;
  }
  return null;
}

export function sessionCookie(token: string, maxAgeMs: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

// ── Pairing codes (v1.11 B7) ───────────────────────────────────────────────
// 8 characters from an unambiguous alphabet (no 0/O/1/I): 32^8 ≈ 1.1e12,
// against 10 claim attempts per hour per IP and a 5-minute life.

export const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomPairCode(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  let out = '';
  for (const b of buf) out += PAIR_ALPHABET[b % 32]; // 256 = 8 × 32: unbiased
  return out;
}

// What the user typed → canonical form (upper-case, spaces and dashes
// dropped). '' when it cannot be a code (wrong length, excluded glyph).
export function normalizePairCode(input: unknown): string {
  const s = String(input || '').toUpperCase().replace(/[\s-]/g, '');
  return s.length === 8 && [...s].every(ch => PAIR_ALPHABET.includes(ch)) ? s : '';
}
