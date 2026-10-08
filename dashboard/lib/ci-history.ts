import { Redis } from '@upstash/redis';
import { downloadArtifact, getJobLogTail, getJobs, getRun, listRuns, type WorkflowRun } from '@/lib/github';
import { buildReport } from '@/lib/qa-report-core.mjs';
import { extractZipEntry } from '@/lib/zip';

import type { CheckStats, HistoryRun, Phase, QaSummary } from '@/lib/qa-types';
export { PHASE_LABEL } from '@/lib/qa-types';
export type { CheckStats, HistoryRun, Phase, QaSummary, ReportFailure, ReportTest } from '@/lib/qa-types';

const CACHE_PREFIX = 'ci:summary:v3:';
const MISSING_TTL_SECONDS = 6 * 3600;
/** Artifact downloads per request; the rest are filled in by later requests. */
const MAX_DOWNLOADS = 8;

/** Accepts Playwright's results.json or the workflow's qa-summary.json — both carry `stats`. */
export function parseStats(json: unknown): CheckStats | null {
  const s = (json as { stats?: Record<string, unknown> } | null)?.stats;
  if (!s) return null;
  const n = (k: string) => (typeof s[k] === 'number' ? (s[k] as number) : NaN);
  const out = { passed: n('expected'), failed: n('unexpected'), flaky: n('flaky'), skipped: n('skipped') };
  return Object.values(out).every(Number.isFinite) ? out : null;
}

/** Which gate a run belongs to, from its workflow file and event (the summary's own phase wins when present). */
export function phaseOf(run: Pick<WorkflowRun, 'path' | 'event'>): Phase {
  if (run.path.endsWith('qa-pr.yml')) return run.event === 'pull_request' ? 'pre-merge' : 'post-merge';
  if (run.path.endsWith('qa-regression.yml')) return 'regression';
  if (run.path.endsWith('qa-mobile.yml')) return 'mobile';
  return run.event === 'schedule' ? 'health' : 'manual';
}

/** The run's qa-summary.json, or for runs that predate it, a results.json read out of the full report. */
export async function fetchSummary(runId: number): Promise<QaSummary | null> {
  const art = await downloadArtifact(runId, ['qa-summary-', 'playwright-report-']);
  if (!art) return null;
  const entry = art.name.startsWith('qa-summary-')
    ? extractZipEntry(art.zip, 'qa-summary.json')
    : extractZipEntry(art.zip, 'test-results/results.json');
  if (!entry) return null;
  try {
    const json = JSON.parse(entry.toString('utf8'));
    // Older runs only have Playwright's results.json: rebuild the same report the CI reporter writes.
    return art.name.startsWith('qa-summary-') ? (json as QaSummary) : ({ stats: json.stats, report: buildReport(json) } as QaSummary);
  } catch { return null; }
}

type Cached = { stats: CheckStats | null; phase: Phase | null; causes: Record<string, number> | null; env?: string | null; suite?: string | null } | 'missing';

function redisOrNull(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  return Redis.fromEnv();
}

export async function loadHistory(limit = 30): Promise<HistoryRun[]> {
  const runs = await listRuns(limit);
  const redis = redisOrNull();
  const finished = runs.filter((r) => r.status === 'completed');
  const cached = new Map<number, Cached>();
  if (redis && finished.length) {
    const values = await redis.mget<(Cached | null)[]>(...finished.map((r) => CACHE_PREFIX + r.id)).catch(() => []);
    finished.forEach((r, i) => { const v = values[i]; if (v) cached.set(r.id, v); });
  }
  let downloads = 0;
  const out: HistoryRun[] = [];
  for (const r of runs) {
    let entry: Cached | undefined = cached.get(r.id);
    if (r.status === 'completed' && !entry && downloads < MAX_DOWNLOADS) {
      downloads++;
      let failed = false;
      const summary = await fetchSummary(r.id).catch(() => { failed = true; return null; });
      entry = summary ? { stats: parseStats(summary), phase: summary.phase ?? null, causes: summary.report?.byCategory ?? null, env: summary.ctx?.envLabel ?? null, suite: (summary as { suite?: string | null }).suite ?? null } : 'missing';
      // A transient GitHub error is retried on the next request; only a definite result is cached.
      if (redis && !failed) {
        await (entry === 'missing'
          ? redis.set(CACHE_PREFIX + r.id, 'missing', { ex: MISSING_TTL_SECONDS })
          : redis.set(CACHE_PREFIX + r.id, entry)
        ).catch(() => undefined);
      }
    }
    const hit = entry && entry !== 'missing' ? entry : null;
    const start = Date.parse(r.run_started_at);
    const end = Date.parse(r.updated_at);
    out.push({
      id: r.id,
      // "QA run <ref>" / "QA pre-merge PR #n" / "QA post-merge <sha>" → short ref.
      ref: r.display_title.replace(/^QA (run )?/, '').replace(/\b([0-9a-f]{7})[0-9a-f]{33}\b/, '$1') || String(r.id),
      event: r.event,
      phase: hit?.phase ?? phaseOf(r),
      status: r.status,
      conclusion: r.conclusion,
      url: r.html_url,
      branch: r.head_branch,
      startedAt: r.run_started_at,
      durationSec: r.status === 'completed' && end > start ? Math.round((end - start) / 1000) : null,
      stats: hit?.stats ?? null,
      causes: hit?.causes ?? null,
      env: hit?.env ?? null,
      suite: hit?.suite ?? null,
    });
  }
  return out;
}

/** Everything the run report page shows for one run. */
export async function loadRunReport(runId: number) {
  const run = await getRun(runId);
  if (!run) return null;
  const [summary, jobs] = await Promise.all([
    run.status === 'completed' ? fetchSummary(runId).catch(() => null) : null,
    getJobs(runId).catch(() => []),
  ]);
  // The Playwright step's own console output, so the console answers "what happened" without GitHub.
  const job = jobs.find((j) => j.conclusion === 'failure') ?? jobs[0];
  const logTail = job && run.status === 'completed' ? await getJobLogTail(job.id).catch(() => null) : null;
  const start = Date.parse(run.run_started_at);
  const end = Date.parse(run.updated_at);
  return {
    id: run.id,
    title: run.display_title,
    phase: summary?.phase ?? phaseOf(run),
    scope: summary?.scope ?? null,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    url: run.html_url,
    branch: run.head_branch,
    startedAt: run.run_started_at,
    durationSec: run.status === 'completed' && end > start ? Math.round((end - start) / 1000) : null,
    stats: summary ? parseStats(summary) : null,
    ctx: summary?.ctx ?? null,
    report: summary?.report ?? null,
    jobs,
    log: job && logTail ? { job: job.name, step: job.steps.find((s) => /playwright/i.test(s.name) && s.name.startsWith('Run'))?.name ?? 'Run Playwright', lines: logTail } : null,
  };
}
export type RunReport = NonNullable<Awaited<ReturnType<typeof loadRunReport>>>;
