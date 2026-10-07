import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Demo-key check. The key itself is never stored; only its SHA-256 hex
 * lives in DEMO_KEY_HASH on Vercel. Both sides are decoded to fixed-length
 * buffers before timingSafeEqual — never compare hex strings directly.
 */
export function verifyDemoKey(submitted: unknown): boolean {
  const expectedHex = process.env.DEMO_KEY_HASH;
  if (typeof submitted !== 'string' || !expectedHex) return false;
  if (submitted.length < 16 || submitted.length > 128) return false;

  const a = createHash('sha256').update(submitted, 'utf8').digest();
  let b: Buffer;
  try { b = Buffer.from(expectedHex, 'hex'); } catch { return false; }
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Opaque per-request id for server logs; never log the key or raw GitHub errors. */
export function requestId(): string {
  return createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 12);
}

/**
 * Remembered demo-key session. After one successful key check the server sets an HttpOnly
 * cookie `<expiry>.<hmac>`; the key itself is never stored in the browser. The HMAC secret is
 * DEMO_KEY_HASH, so rotating the demo key invalidates every remembered browser at once.
 */
export const SESSION_COOKIE = 'qa_demo_session';
export const SESSION_TTL_SECONDS = 8 * 3600;

function sessionMac(exp: number): Buffer | null {
  const secret = process.env.DEMO_KEY_HASH;
  if (!secret) return null;
  return createHmac('sha256', secret).update(`qa-demo-session.v1.${exp}`).digest();
}

export function issueSession(now = Date.now()): { value: string; expiresAt: number } | null {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const mac = sessionMac(exp);
  return mac ? { value: `${exp}.${mac.toString('base64url')}`, expiresAt: exp * 1000 } : null;
}

/** Expiry (ms) of a valid, unexpired session cookie value; null otherwise. */
export function verifySession(value: string | undefined | null, now = Date.now()): number | null {
  const m = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(value ?? '');
  if (!m) return null;
  const exp = Number(m[1]);
  if (exp * 1000 <= now || exp * 1000 > now + SESSION_TTL_SECONDS * 1000 + 60_000) return null;
  const expected = sessionMac(exp);
  const got = Buffer.from(m[2], 'base64url');
  if (!expected || got.length !== expected.length) return null;
  return timingSafeEqual(got, expected) ? exp * 1000 : null;
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

/** Set-Cookie for the session; Secure whenever the request itself arrived over HTTPS. */
export function sessionCookieHeader(req: Request, value: string, maxAge: number): string {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
