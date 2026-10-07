import { NextResponse, after } from 'next/server';
import { verifyDemoKey, requestId, issueSession, verifySession, readCookie, sessionCookieHeader, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/auth';
import { acquireTriggerSlot, releaseTriggerSlot, cancelAdmission, keysFor, cooldownSeconds, DAILY_LIMIT } from '@/lib/redis';
import { isTargetable } from '@/lib/environments';
import { dispatchRun, newRunRef, DISPATCHABLE, type DispatchWorkflow, type Scope, type Suite } from '@/lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUITES: Suite[] = ['all', 'desktop', 'mobile', 'drill'];
const SCOPES: Scope[] = ['full', 'api', 'ui'];

// Fixed client-facing messages. Nothing from GitHub or Redis is echoed.
const E = {
  unauthorized: { error: 'unauthorized', message: 'Demo key rejected.' },
  cooldown: (s: number) => ({ error: 'cooldown', message: `A run was triggered recently. Try again in ${s}s.`, retryAfter: s }),
  daily: { error: 'daily-limit', message: `Daily trigger limit (${DAILY_LIMIT}) reached. Resets at 00:00 UTC.` },
  failed: { error: 'trigger-failed', message: 'Could not start the run. Please try again shortly.' },
  badRequest: { error: 'bad-request', message: 'Invalid request.' },
} as const;

/** Test seam: a per-test key namespace, honoured only outside production. */
function namespaceFrom(req: Request): string | undefined {
  if (process.env.ALLOW_TEST_NAMESPACE !== '1') return undefined;
  return req.headers.get('x-trigger-namespace') ?? undefined;
}

/**
 * POST /api/trigger
 * body: { demoKey?: string, remember?: boolean, workflow?: 'qa-run.yml'|'qa-regression.yml',
 *         suite?: 'all'|'desktop'|'mobile'|'drill', scope?: 'full'|'api'|'ui', environment?: string }
 * Auth: a submitted demoKey is always checked (a wrong key is 401 even with a remembered
 * session); with no key, a valid qa_demo_session cookie is accepted.
 *
 * Order: validate key → atomic cooldown+daily cap → dispatch →
 *   rejected  → owner-checked rollback on the original keys
 *   uncertain → keep the quota consumed; return 202 so the poller resolves it
 * Only an allowlisted workflow on the fixed repo/branch from env is ever dispatched.
 */
export async function POST(req: Request) {
  const rid = requestId();
  const keys = keysFor(rid, namespaceFrom(req));
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json(E.badRequest, { status: 400 }); }

  const suite: Suite = SUITES.includes(body?.suite) ? body.suite : 'all';
  const workflow: DispatchWorkflow = DISPATCHABLE.includes(body?.workflow) ? body.workflow : 'qa-run.yml';
  const scope: Scope = SCOPES.includes(body?.scope) ? body.scope : 'full';
  const environment = body?.environment ?? 'prod';
  // Only environments with a URL in qa-environments.json; checked before auth so nothing is consumed.
  if (!isTargetable(environment)) {
    return NextResponse.json({ error: 'bad-request', message: `Environment "${String(environment).slice(0, 20)}" is not configured.` }, { status: 400 });
  }

  // 1. Auth first so a bad key cannot consume a cooldown slot.
  const keyGiven = body?.demoKey !== undefined && body?.demoKey !== '';
  const viaKey = keyGiven && verifyDemoKey(body.demoKey);
  const viaSession = !keyGiven && verifySession(readCookie(req, SESSION_COOKIE)) !== null;
  if (!viaKey && !viaSession) {
    console.info(`[trigger ${rid}] auth=failed`);
    return NextResponse.json(E.unauthorized, { status: 401 });
  }

  // 2 + 3. Atomic admission control in Redis.
  let slot;
  try {
    slot = await acquireTriggerSlot(rid, keys);
  } catch (err) {
    console.error(`[trigger ${rid}] redis=${(err as Error).message}`);
    // The ACQUIRE may still be in flight. CANCEL sets a marker the script checks, so a
    // late ACQUIRE is refused, and releases if it already landed. Runs after the response
    // inside the request lifecycle (Next `after()`), bounded by its own timeout.
    after(async () => {
      const r = await cancelAdmission(rid, keys);
      console.info(`[trigger ${rid}] cancel=${r}`);
    });
    return NextResponse.json(E.failed, { status: 503 });
  }
  if (!slot.ok) {
    if (slot.reason === 'cooldown') {
      return NextResponse.json(E.cooldown(slot.retryAfter), {
        status: 429,
        headers: { 'Retry-After': String(slot.retryAfter) },
      });
    }
    if (slot.reason === 'daily-limit') return NextResponse.json(E.daily, { status: 429 });
    return NextResponse.json(E.failed, { status: 503 }); // 'cancelled': a stale retry; safe to try again
  }

  // 4. Dispatch. Refund only on a definitive rejection.
  const runRef = newRunRef();
  const outcome = await dispatchRun(runRef, suite, { workflow, scope, environment });

  if (outcome === 'rejected') {
    console.error(`[trigger ${rid}] dispatch=rejected ref=${runRef}`);
    await releaseTriggerSlot(slot.admission);
    return NextResponse.json(E.failed, { status: 502 });
  }

  console.info(`[trigger ${rid}] auth=${viaKey ? 'key' : 'session'} dispatch=${outcome} ref=${runRef} workflow=${workflow} env=${environment} suite=${suite} scope=${scope} used=${slot.admission.count}`);
  const session = viaKey && body?.remember !== false ? issueSession() : null;
  const res = NextResponse.json(
    {
      run_ref: runRef,
      workflow,
      environment,
      suite,
      scope,
      remembered: session ? session.expiresAt : null,
      dispatch: outcome, // 'accepted' | 'uncertain' — UI shows "confirming…" for uncertain until the poller finds it
      cooldownSeconds: cooldownSeconds(),
      quotaUsed: slot.admission.count,
      quotaLimit: DAILY_LIMIT,
      pollUrl: `/api/runs/${runRef}`,
    },
    { status: 202 },
  );
  if (session) res.headers.set('Set-Cookie', sessionCookieHeader(req, session.value, SESSION_TTL_SECONDS));
  return res;
}
