import { createHash, timingSafeEqual } from 'node:crypto';

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
