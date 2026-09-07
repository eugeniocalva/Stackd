// Device tokens: `<ownerId>.<secret>`. The ownerId routes to the owner's
// Durable Object; the DO stores only sha256(secret). A leaked DO record
// therefore yields no usable token, and a token alone reveals only an opaque
// owner id. Web sessions (C5) will resolve to the same ownerId via a cookie.

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
