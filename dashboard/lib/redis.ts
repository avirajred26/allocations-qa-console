import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv(); // UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN

export const DAILY_LIMIT = 20;
const DAILY_TTL_SECONDS = 90_000; // slightly over 24 h so the key outlives the UTC day
const CANCEL_TTL_SECONDS = 120;   // longer than any plausible delayed ACQUIRE delivery

/** Test seam: shorter cooldown only when the seam is enabled. Production is always 30 s. */
export function cooldownSeconds(): number {
  if (process.env.ALLOW_TEST_NAMESPACE === '1' && process.env.TEST_COOLDOWN_SECONDS) {
    const n = Number(process.env.TEST_COOLDOWN_SECONDS);
    if (Number.isInteger(n) && n >= 1 && n <= 30) return n;
  }
  return 30;
}

export type Keys = { cooldown: string; daily: string; cancel: string };
export function keysFor(owner: string, namespace = 'prod', at = new Date()): Keys {
  const ns = namespace.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'prod';
  return {
    cooldown: `trigger:${ns}:cooldown`,
    daily: `trigger:${ns}:daily:${at.toISOString().slice(0, 10)}`,
    cancel: `trigger:${ns}:cancel:${owner}`,
  };
}

/**
 * Atomic admission with a cancellation check.
 * KEYS[1]=cooldown KEYS[2]=daily KEYS[3]=cancel(owner)
 * ARGV[1]=owner ARGV[2]=cooldownSec ARGV[3]=limit ARGV[4]=dailyTtl
 * Returns {1,count} admitted · {0,ttl} cooldown · {-1,0} daily limit · {-2,0} cancelled
 *
 * The cancel marker is what makes a *late* ACQUIRE safe: if the caller already timed
 * out and ran CANCEL, this script sees the marker and refuses to admit. Lua atomicity
 * orders the check and the admission; the marker orders CANCEL against a delayed ACQUIRE.
 */
const ACQUIRE = `
if redis.call('EXISTS', KEYS[3]) == 1 then return {-2, 0} end
local ok = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', tonumber(ARGV[2]))
if not ok then return {0, redis.call('TTL', KEYS[1])} end
local c = redis.call('INCR', KEYS[2])
if c == 1 then redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4])) end
if c > tonumber(ARGV[3]) then
  redis.call('DECR', KEYS[2])
  redis.call('DEL', KEYS[1])
  return {-1, 0}
end
return {1, c}
`;

/**
 * Owner-checked release against the ORIGINAL admission keys (never recomputed — a
 * request crossing UTC midnight must not decrement tomorrow's counter).
 * KEYS[1]=cooldown KEYS[2]=daily ARGV[1]=owner
 */
const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1])
  if tonumber(redis.call('GET', KEYS[2]) or '0') > 0 then redis.call('DECR', KEYS[2]) end
  return 1
end
return 0
`;

/**
 * CANCEL = set the marker, then release if we hold the lock — one script, so a delayed
 * ACQUIRE can only land strictly before (and be released) or strictly after (and be refused).
 * KEYS[1]=cooldown KEYS[2]=daily KEYS[3]=cancel ARGV[1]=owner ARGV[2]=cancelTtl
 */
const CANCEL = `
redis.call('SET', KEYS[3], '1', 'EX', tonumber(ARGV[2]))
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1])
  if tonumber(redis.call('GET', KEYS[2]) or '0') > 0 then redis.call('DECR', KEYS[2]) end
  return 1
end
return 0
`;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error('redis-timeout')), ms); });
  try { return await Promise.race([p, timeout]); } finally { if (t) clearTimeout(t); }
}

export type Admission = { owner: string; keys: Keys; count: number };
export type GuardResult =
  | { ok: true; admission: Admission }
  | { ok: false; reason: 'cooldown'; retryAfter: number }
  | { ok: false; reason: 'daily-limit' }
  | { ok: false; reason: 'cancelled' };

/**
 * Test seam: force the local ACQUIRE timeout to fire before Redis replies, so the
 * delayed-ACQUIRE / CANCEL ordering path can be exercised deterministically. The eval
 * itself is still sent — exactly the "late admission" scenario.
 */
function acquireTimeoutMs(): number {
  if (process.env.ALLOW_TEST_NAMESPACE === '1' && process.env.TEST_ACQUIRE_TIMEOUT_MS) {
    const n = Number(process.env.TEST_ACQUIRE_TIMEOUT_MS);
    if (Number.isInteger(n) && n >= 0 && n <= 2000) return n;
  }
  return 2000;
}

export async function acquireTriggerSlot(owner: string, keys: Keys): Promise<GuardResult> {
  const [code, val] = (await withTimeout(
    redis.eval(ACQUIRE, [keys.cooldown, keys.daily, keys.cancel], [owner, cooldownSeconds(), DAILY_LIMIT, DAILY_TTL_SECONDS]),
    acquireTimeoutMs(),
  )) as [number, number];
  if (code === 1) return { ok: true, admission: { owner, keys, count: val } };
  if (code === 0) return { ok: false, reason: 'cooldown', retryAfter: Math.max(1, val) };
  if (code === -1) return { ok: false, reason: 'daily-limit' };
  return { ok: false, reason: 'cancelled' };
}

/** Rollback after a definitive dispatch rejection. Owner-checked. Bounded; never throws. */
export async function releaseTriggerSlot(a: Admission): Promise<boolean> {
  try {
    return ((await withTimeout(redis.eval(RELEASE, [a.keys.cooldown, a.keys.daily], [a.owner]), 3000)) as number) === 1;
  } catch {
    return false;
  }
}

/**
 * Cancel after an ACQUIRE timeout. Must be awaited inside the request lifecycle
 * (the route wraps it in `after()`); it is bounded and never throws. Sets the marker so a
 * still-in-flight ACQUIRE is refused, and releases if the ACQUIRE already landed.
 */
export async function cancelAdmission(owner: string, keys: Keys): Promise<'released' | 'marked' | 'failed'> {
  try {
    const r = (await withTimeout(
      redis.eval(CANCEL, [keys.cooldown, keys.daily, keys.cancel], [owner, CANCEL_TTL_SECONDS]),
      4000,
    )) as number;
    return r === 1 ? 'released' : 'marked';
  } catch {
    return 'failed';
  }
}

/** Read-only quota view for the UI and for tests. */
export async function quota(keys: Keys): Promise<{ used: number; limit: number; cooldownRemaining: number }> {
  const [used, ttl] = await withTimeout(Promise.all([redis.get<number>(keys.daily), redis.ttl(keys.cooldown)]), 2000);
  return { used: Number(used ?? 0), limit: DAILY_LIMIT, cooldownRemaining: Math.max(0, ttl) };
}
