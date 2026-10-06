import { test, expect } from '@playwright/test';
import { acquireTriggerSlot, cancelAdmission, keysFor, quota } from '../lib/redis';

/**
 * Ordered ACQUIRE / CANCEL tests. These talk to Upstash DIRECTLY (not through the route)
 * so each sequence is explicit and fully awaited before final state is asserted.
 * Requires UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in the test process,
 * pointing at a scratch database.
 *
 *   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... npm test -- tests/admission.spec.ts
 */
const HAVE_REDIS = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
const ns = () => `o-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const owner = () => `own-${Math.random().toString(36).slice(2, 10)}`;

test.describe('ACQUIRE / CANCEL ordering (direct Redis)', () => {
  test.skip(!HAVE_REDIS, 'UPSTASH_REDIS_REST_URL / TOKEN not set');

  test('CANCEL first, then ACQUIRE → ACQUIRE is refused as cancelled; nothing consumed', async () => {
    const o = owner();
    const keys = keysFor(o, ns());

    const cancel = await cancelAdmission(o, keys);
    expect(cancel, 'nothing to release yet; marker only').toBe('marked');

    const acquire = await acquireTriggerSlot(o, keys);
    expect(acquire.ok).toBe(false);
    expect((acquire as any).reason).toBe('cancelled');

    const q = await quota(keys);
    expect(q.used).toBe(0);
    expect(q.cooldownRemaining).toBe(0);
  });

  test('ACQUIRE first, then CANCEL → admitted with count 1, then released; nothing consumed', async () => {
    const o = owner();
    const keys = keysFor(o, ns());

    const acquire = await acquireTriggerSlot(o, keys);
    expect(acquire.ok).toBe(true);
    expect((acquire as any).admission.count).toBe(1);
    const mid = await quota(keys);
    expect(mid.used).toBe(1);
    expect(mid.cooldownRemaining).toBeGreaterThan(0);

    const cancel = await cancelAdmission(o, keys);
    expect(cancel, 'we held the lock, so CANCEL must release it').toBe('released');

    const q = await quota(keys);
    expect(q.used).toBe(0);
    expect(q.cooldownRemaining).toBe(0);
  });

  test('CANCEL never releases a lock owned by someone else', async () => {
    const a = owner();
    const b = owner();
    const space = ns();
    const keysA = keysFor(a, space);
    const keysB = keysFor(b, space); // same cooldown/daily keys, different owner + cancel marker

    expect((await acquireTriggerSlot(a, keysA)).ok).toBe(true);

    const cancelB = await cancelAdmission(b, keysB);
    expect(cancelB, "B's cancel must not touch A's lock").toBe('marked');

    const q = await quota(keysA);
    expect(q.used, "A's admission must survive B's cancel").toBe(1);
    expect(q.cooldownRemaining).toBeGreaterThan(0);

    // Cleanup via the rightful owner.
    expect(await cancelAdmission(a, keysA)).toBe('released');
  });

  test('a second ACQUIRE for a cancelled owner stays refused while the marker lives', async () => {
    const o = owner();
    const keys = keysFor(o, ns());
    await cancelAdmission(o, keys);
    expect((await acquireTriggerSlot(o, keys) as any).reason).toBe('cancelled');
    expect((await acquireTriggerSlot(o, keys) as any).reason).toBe('cancelled');
    expect((await quota(keys)).used).toBe(0);
  });
});
