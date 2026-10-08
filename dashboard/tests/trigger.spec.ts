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
 * The cases above run against a key-mode server (TRIGGER_REQUIRE_KEY=1). Open mode:
 *   ALLOW_TEST_NAMESPACE=1 TEST_COOLDOWN_SECONDS=1 TEST_DISPATCH_MODE=accept npm run dev
 *   TRIGGER_OPEN=1 TEST_DISPATCH_MODE=accept npm test
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

/** Server started without TRIGGER_REQUIRE_KEY: no key, same-origin only, per-visitor cap. */
const OPEN = process.env.TRIGGER_OPEN === '1';

test.describe('POST /api/trigger — open mode (no key)', () => {
  test.skip(!OPEN || MODE !== 'accept', 'requires an open-mode server (no TRIGGER_REQUIRE_KEY) with TEST_DISPATCH_MODE=accept, and TRIGGER_OPEN=1 here');
  const post = (request: APIRequestContext, namespace: string, visitor: string, origin?: string) =>
    request.post('/api/trigger', { data: { suite: 'desktop' }, headers: { 'x-trigger-namespace': namespace, 'x-test-visitor': visitor, ...(origin ? { origin } : {}) } });

  test('no key from the console origin is admitted; the session API reports no key required', async ({ request, baseURL }) => {
    const n = ns();
    const r = await post(request, n, `v-${n}`, baseURL);
    expect(r.status()).toBe(202);
    expect(await r.json()).toMatchObject({ dispatch: 'accepted', visitorUsed: 1, visitorLimit: 5 });
    expect((await (await request.get('/api/session')).json()).keyRequired).toBe(false);
  });

  test('a foreign or missing origin is refused before any quota is spent', async ({ request }) => {
    const n = ns();
    expect((await post(request, n, `v-${n}`, 'https://evil.example')).status()).toBe(403);
    expect((await post(request, n, `v-${n}`)).status()).toBe(403);
    expect(await used(request, n)).toBe(0);
  });

  test('one visitor is capped at 5 runs a day; another visitor is still admitted', async ({ request, baseURL }) => {
    test.setTimeout(60_000);
    const n = ns();
    for (let i = 1; i <= 5; i++) {
      expect((await post(request, n, 'same-visitor', baseURL)).status(), `run ${i}`).toBe(202);
      await sleep(1200); // TEST_COOLDOWN_SECONDS=1
    }
    const sixth = await post(request, n, 'same-visitor', baseURL);
    expect(sixth.status()).toBe(429);
    expect((await sixth.json()).error).toBe('visitor-limit');
    expect(await used(request, n)).toBe(5);
    expect((await post(request, n, 'other-visitor', baseURL)).status()).toBe(202);
  });
});

test.describe('POST /api/trigger', () => {
  test.skip(!KEY || OPEN, 'DEMO_KEY not set, or running the open-mode suite');

  test('bad key → 401; cooldown and quota untouched', async ({ request }) => {
    const n = ns();
    const bad = await trigger(request, n, 'wrong-key-wrong-key-wrong');
    expect(bad.status()).toBe(401);
    expect(await used(request, n)).toBe(0);
  });

  test.describe('remembered session (controlled ACCEPT)', () => {
    test.skip(MODE !== 'accept' || ACQUIRE_TIMEOUT_FORCED, 'requires server started with TEST_DISPATCH_MODE=accept (and no forced acquire timeout)');

    const post = (ctx: APIRequestContext, namespace: string, data: Record<string, unknown>, cookie?: string) =>
      ctx.post('/api/trigger', { data: { suite: 'desktop', ...data }, headers: { 'x-trigger-namespace': namespace, ...(cookie ? { cookie } : {}) } });
    const sessionCookie = (setCookie: string | undefined) => setCookie?.match(/qa_demo_session=[^;]+/)?.[0];

    test('a valid key sets an HttpOnly, SameSite=Strict session cookie scoped to /api', async ({ playwright, baseURL }) => {
      const ctx = await playwright.request.newContext({ baseURL });
      const r = await post(ctx, ns(), { demoKey: KEY });
      expect(r.status()).toBe(202);
      const sc = r.headers()['set-cookie'] ?? '';
      expect(sc).toMatch(/qa_demo_session=\d{10}\.[A-Za-z0-9_-]{43}/);
      for (const attr of ['HttpOnly', 'SameSite=Strict', 'Path=/api', 'Max-Age=28800']) expect(sc).toContain(attr);
      expect(sc).not.toContain(KEY);
      expect(typeof (await r.json()).remembered).toBe('number');
      await ctx.dispose();
    });

    test('the cookie alone admits the next run; a tampered cookie and a wrong key are refused', async ({ playwright, baseURL }) => {
      const ctx = await playwright.request.newContext({ baseURL });
      const n = ns();
      const first = await post(ctx, n, { demoKey: KEY });
      expect(first.status()).toBe(202);
      const cookie = sessionCookie(first.headers()['set-cookie']);
      expect(cookie).toBeTruthy();
      await sleep(1200); // TEST_COOLDOWN_SECONDS=1
      const fresh = await playwright.request.newContext({ baseURL });
      const second = await post(fresh, n, {}, cookie);
      expect(second.status(), 'cookie without key').toBe(202);
      await sleep(1200);
      const tampered = cookie!.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
      expect((await post(fresh, n, {}, tampered)).status(), 'tampered cookie').toBe(401);
      expect((await post(fresh, n, { demoKey: 'wrong-key-wrong-key-wrong' }, cookie)).status(), 'wrong key beats a valid cookie').toBe(401);
      expect(await used(fresh, n)).toBe(2);
      await ctx.dispose();
      await fresh.dispose();
    });

    test('remember:false sets no cookie; /api/session reports and forgets a session', async ({ playwright, baseURL }) => {
      const ctx = await playwright.request.newContext({ baseURL });
      const off = await post(ctx, ns(), { demoKey: KEY, remember: false });
      expect(off.status()).toBe(202);
      expect(off.headers()['set-cookie']).toBeUndefined();
      const on = await post(ctx, ns(), { demoKey: KEY });
      const cookie = sessionCookie(on.headers()['set-cookie'])!;
      const fresh = await playwright.request.newContext({ baseURL });
      const s = await fresh.get('/api/session', { headers: { cookie } });
      expect(await s.json()).toMatchObject({ active: true });
      expect((await (await fresh.get('/api/session')).json()).active).toBe(false);
      const del = await fresh.delete('/api/session', { headers: { cookie } });
      expect(del.headers()['set-cookie']).toMatch(/qa_demo_session=;.*Max-Age=0/);
      await ctx.dispose();
      await fresh.dispose();
    });
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
