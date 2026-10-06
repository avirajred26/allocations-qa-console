import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Admission tests for /api/trigger. They never dispatch to GitHub: the server is started
 * with a controlled dispatch outcome, and each test uses its own Redis key namespace.
 *
 * Start the dev server (from dashboard/) with the test seam and a scratch Upstash DB:
 *
 *   ALLOW_TEST_NAMESPACE=1 TEST_COOLDOWN_SECONDS=1 TEST_DISPATCH_MODE=accept npm run dev
 *   DEMO_KEY=<key> TEST_DISPATCH_MODE=accept npm test        # concurrency, quota, boundary
 *
 *   ALLOW_TEST_NAMESPACE=1 TEST_COOLDOWN_SECONDS=1 TEST_DISPATCH_MODE=reject npm run dev
 *   DEMO_KEY=<key> TEST_DISPATCH_MODE=reject npm test        # rollback
 *
 *   ALLOW_TEST_NAMESPACE=1 TEST_COOLDOWN_SECONDS=1 TEST_DISPATCH_MODE=uncertain npm run dev
 *   DEMO_KEY=<key> TEST_DISPATCH_MODE=uncertain npm test     # no refund on ambiguous dispatch
 *
 *   ALLOW_TEST_NAMESPACE=1 TEST_COOLDOWN_SECONDS=1 TEST_DISPATCH_MODE=accept TEST_ACQUIRE_TIMEOUT_MS=0 npm run dev
 *   DEMO_KEY=<key> TEST_DISPATCH_MODE=accept TEST_ACQUIRE_TIMEOUT_MS=0 npm test   # delayed ACQUIRE / CANCEL
 *
 * TEST_DISPATCH_MODE in the test process selects which cases run; it must match the server.
 */
const KEY = process.env.DEMO_KEY ?? '';
const MODE = process.env.TEST_DISPATCH_MODE ?? '';
const ACQUIRE_TIMEOUT_FORCED = process.env.TEST_ACQUIRE_TIMEOUT_MS === '0';
const LIMIT = 20;
const ns = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function trigger(request: APIRequestContext, namespace: string, demoKey = KEY) {
  return request.post('/api/trigger', { data: { demoKey, suite: 'desktop' }, headers: { 'x-trigger-namespace': namespace } });
}
async function used(request: APIRequestContext, namespace: string) {
  const r = await request.get('/api/quota', { headers: { 'x-trigger-namespace': namespace } });
  expect(r.status()).toBe(200);
  return (await r.json()).used as number;
}

test.describe('POST /api/trigger', () => {
  test.skip(!KEY, 'DEMO_KEY not set');

  test('bad key → 401; cooldown and quota untouched', async ({ request }) => {
    const n = ns();
    const bad = await trigger(request, n, 'wrong-key-wrong-key-wrong');
    expect(bad.status()).toBe(401);
    expect(await used(request, n)).toBe(0);
  });

  test.describe('controlled ACCEPT', () => {
    test.skip(MODE !== 'accept' || ACQUIRE_TIMEOUT_FORCED, 'requires server started with TEST_DISPATCH_MODE=accept (and no forced acquire timeout)');

    test('five parallel requests: exactly one admitted, four cooled down (lock stays held)', async ({ request }) => {
      const n = ns();
      const statuses = (await Promise.all(Array.from({ length: 5 }, () => trigger(request, n)))).map((r) => r.status());
      expect(statuses.filter((s) => s === 202)).toHaveLength(1);
      expect(statuses.filter((s) => s === 429)).toHaveLength(4);
      expect(await used(request, n)).toBe(1);
    });

    test('an admitted run increments quota by exactly one and reports dispatch=accepted', async ({ request }) => {
      const n = ns();
      const r = await trigger(request, n);
      expect(r.status()).toBe(202);
      const body = await r.json();
      expect(body.dispatch).toBe('accepted');
      expect(body.quotaUsed).toBe(1);
      expect(await used(request, n)).toBe(1);
    });

    test(`daily boundary: run ${LIMIT} is admitted, run ${LIMIT + 1} is refused and quota stays at ${LIMIT}`, async ({ request }) => {
      test.setTimeout(120_000);
      const n = ns();
      for (let i = 1; i <= LIMIT; i++) {
        const r = await trigger(request, n);
        expect(r.status(), `run ${i} should be admitted`).toBe(202);
        await sleep(1200); // TEST_COOLDOWN_SECONDS=1
      }
      const over = await trigger(request, n);
      expect(over.status()).toBe(429);
      expect((await over.json()).error).toBe('daily-limit');
      expect(await used(request, n)).toBe(LIMIT);
    });
  });

  test.describe('controlled UNCERTAIN', () => {
    test.skip(MODE !== 'uncertain', 'requires server started with TEST_DISPATCH_MODE=uncertain');

    test('ambiguous dispatch → 202 with dispatch=uncertain, quota stays consumed, cooldown stays held', async ({ request }) => {
      const n = ns();
      const r = await trigger(request, n);
      expect(r.status()).toBe(202);
      expect((await r.json()).dispatch).toBe('uncertain');
      expect(await used(request, n), 'quota must NOT be refunded on an uncertain dispatch').toBe(1);
      const again = await trigger(request, n);
      expect(again.status(), 'cooldown must remain held').toBe(429);
      expect(await used(request, n)).toBe(1);
    });
  });

  test.describe('ACQUIRE timeout path (route smoke only)', () => {
    test.skip(!ACQUIRE_TIMEOUT_FORCED, 'requires server started with TEST_ACQUIRE_TIMEOUT_MS=0');

    /**
     * SMOKE, not proof. Confirms only that the route takes the timeout branch and returns the
     * generic 503. It cannot observe when the late ACQUIRE or the CANCEL settles, so it makes
     * NO claim about final state — tests/admission.spec.ts covers both orderings explicitly
     * against Redis with every operation awaited.
     */
    test('route returns 503 with the generic error on ACQUIRE timeout', async ({ request }) => {
      const n = ns();
      const r = await trigger(request, n);
      expect(r.status()).toBe(503);
      expect((await r.json()).error).toBe('trigger-failed');
    });
  });

  test.describe('controlled REJECT', () => {
    test.skip(MODE !== 'reject', 'requires server started with TEST_DISPATCH_MODE=reject');

    test('definitive rejection → 502, cooldown released, quota refunded, and a retry is admitted again', async ({ request }) => {
      const n = ns();
      const first = await trigger(request, n);
      expect(first.status()).toBe(502);
      expect(await used(request, n), 'quota should be refunded').toBe(0);

      const second = await trigger(request, n);
      expect(second.status(), 'cooldown should have been released so the retry reaches dispatch').toBe(502);
      expect(await used(request, n)).toBe(0);
    });
  });
});
