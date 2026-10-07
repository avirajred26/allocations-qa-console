import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { workflowState } from '@/lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TARGET = 'https://dashboard.allocations.com/';

export type TargetHealth = 'healthy' | 'degraded' | 'down' | 'unknown';
export type Target = { id: string; name: string; host: string; health: TargetHealth; rows: [string, string][]; note?: string };

async function timed<T>(fn: () => Promise<T>): Promise<{ v: T; ms: number }> {
  const t0 = Date.now();
  const v = await fn();
  return { v, ms: Date.now() - t0 };
}

/** One anonymous GET of the public sign-in document — the same request SM-004 makes. */
async function probeAllocations(): Promise<Target> {
  const base = { id: 'allocations', name: 'Allocations sign-in', host: 'dashboard.allocations.com' };
  try {
    const { v: res, ms } = await timed(() => fetch(TARGET, { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'allocations-qa-console (pre-auth probe)' } }));
    const h = res.headers;
    const hsts = Number(h.get('strict-transport-security')?.match(/max-age=(\d+)/)?.[1] ?? 0);
    const csp = h.get('content-security-policy') ?? '';
    const xfo = (h.get('x-frame-options') ?? '').toUpperCase();
    const checks = {
      hsts: hsts >= 15_552_000,
      nosniff: h.get('x-content-type-options') === 'nosniff',
      frame: xfo === 'DENY' || xfo === 'SAMEORIGIN' || /frame-ancestors/.test(csp),
      csp: /default-src/.test(csp),
    };
    const passed = Object.values(checks).filter(Boolean).length;
    const health: TargetHealth = !res.ok ? 'down' : passed < 4 || ms > 2500 ? 'degraded' : 'healthy';
    return {
      ...base, health,
      rows: [['http', String(res.status)], ['latency', `${ms}ms`], ['headers', `${passed}/4 required`], ['probe', 'anonymous GET']],
      note: health === 'degraded' ? (passed < 4 ? 'A required security header is missing.' : 'Slow response from the sign-in page.') : undefined,
    };
  } catch {
    return { ...base, health: 'down', rows: [['http', '—'], ['latency', 'timeout'], ['headers', '—'], ['probe', 'anonymous GET']], note: 'Sign-in page did not answer within 6 s.' };
  }
}

async function probeGithub(): Promise<Target> {
  const base = { id: 'github', name: 'GitHub Actions', host: 'qa-run.yml · main' };
  try {
    const { state, ms } = await workflowState();
    return { ...base, health: state === 'active' ? 'healthy' : 'degraded', rows: [['workflow', state], ['api', `${ms}ms`], ['runners', 'ubuntu-latest'], ['schedule', 'every 6 h + on demand']] };
  } catch {
    return { ...base, health: process.env.GH_TOKEN ? 'down' : 'unknown', rows: [['workflow', '—'], ['api', '—'], ['runners', 'ubuntu-latest'], ['schedule', 'every 6 h + on demand']], note: process.env.GH_TOKEN ? 'GitHub API did not answer.' : 'GH_TOKEN is not configured here.' };
  }
}

async function probeRedis(): Promise<Target> {
  const base = { id: 'redis', name: 'Upstash Redis', host: 'rate limit · quota · cache' };
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return { ...base, health: 'unknown', rows: [['ping', '—'], ['cooldown', '30s'], ['daily cap', '20 runs'], ['lock', 'Lua ACQUIRE / CANCEL']], note: 'Redis is not configured here.' };
  }
  try {
    const { v, ms } = await timed(() => Redis.fromEnv().ping());
    return { ...base, health: v === 'PONG' ? 'healthy' : 'degraded', rows: [['ping', `${ms}ms`], ['cooldown', '30s'], ['daily cap', '20 runs'], ['lock', 'Lua ACQUIRE / CANCEL']] };
  } catch {
    return { ...base, health: 'down', rows: [['ping', 'failed'], ['cooldown', '30s'], ['daily cap', '20 runs'], ['lock', 'Lua ACQUIRE / CANCEL']], note: 'Trigger is blocked while Redis is unreachable.' };
  }
}

function consoleTarget(): Target {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  return {
    id: 'console', name: 'This console', host: process.env.VERCEL_URL ? 'Vercel' : 'local',
    health: 'healthy',
    rows: [['env', process.env.VERCEL_ENV ?? 'development'], ['region', process.env.VERCEL_REGION ?? 'local'], ['commit', sha ?? '—'], ['runtime', 'Next.js 15 · Node']],
  };
}

/**
 * GET /api/targets
 * Live health of everything the QA loop depends on. CDN-cached for a minute, so the
 * Allocations sign-in page sees at most one anonymous GET per minute from this console.
 */
export async function GET() {
  const targets = await Promise.all([probeAllocations(), probeGithub(), probeRedis()]);
  return NextResponse.json(
    { targets: [...targets, consoleTarget()], checkedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } },
  );
}
