import { NextResponse, after } from 'next/server';
import { verifyDemoKey, requestId } from '@/lib/auth';
import { acquireTriggerSlot, releaseTriggerSlot, cancelAdmission, keysFor, cooldownSeconds, DAILY_LIMIT } from '@/lib/redis';
import { dispatchRun, newRunRef, type Suite } from '@/lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUITES: Suite[] = ['all', 'desktop', 'mobile'];

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
 * body: { demoKey: string, suite?: 'all'|'desktop'|'mobile' }
 *
 * Order: validate key → atomic cooldown+daily cap → dispatch →
 *   rejected  → owner-checked rollback on the original keys
 *   uncertain → keep the quota consumed; return 202 so the poller resolves it
 * Only the fixed workflow/repo/branch from env is ever dispatched.
 */
export async function POST(req: Request) {
  const rid = requestId();
  const keys = keysFor(rid, namespaceFrom(req));
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json(E.badRequest, { status: 400 }); }

  const suite: Suite = SUITES.includes(body?.suite) ? body.suite : 'all';

  // 1. Auth first so a bad key cannot consume a cooldown slot.
  if (!verifyDemoKey(body?.demoKey)) {
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
  const outcome = await dispatchRun(runRef, suite);

  if (outcome === 'rejected') {
    console.error(`[trigger ${rid}] dispatch=rejected ref=${runRef}`);
    await releaseTriggerSlot(slot.admission);
    return NextResponse.json(E.failed, { status: 502 });
  }

  console.info(`[trigger ${rid}] auth=ok dispatch=${outcome} ref=${runRef} suite=${suite} used=${slot.admission.count}`);
  return NextResponse.json(
    {
      run_ref: runRef,
      suite,
      dispatch: outcome, // 'accepted' | 'uncertain' — UI shows "confirming…" for uncertain until the poller finds it
      cooldownSeconds: cooldownSeconds(),
      quotaUsed: slot.admission.count,
      quotaLimit: DAILY_LIMIT,
      pollUrl: `/api/runs/${runRef}`,
    },
    { status: 202 },
  );
}
