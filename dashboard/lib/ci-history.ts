import { Redis } from '@upstash/redis';
import { downloadArtifact, listRuns, type WorkflowRun } from '@/lib/github';
import { extractZipEntry } from '@/lib/zip';

export type CheckStats = { passed: number; failed: number; flaky: number; skipped: number };

export type HistoryRun = {
  id: number;
  ref: string;
  event: string;
  status: string;
  conclusion: WorkflowRun['conclusion'];
  url: string;
  startedAt: string;
  durationSec: number | null;
  /** Totals from the run's own results.json; null when the artifact is gone or the run is not finished. */
  stats: CheckStats | null;
};

const CACHE_PREFIX = 'ci:stats:v1:';
const MISSING_TTL_SECONDS = 6 * 3600;
/** Artifact downloads per request; the rest are filled in by later requests. */
const MAX_DOWNLOADS = 3;

/** Accepts Playwright's results.json or the workflow's qa-summary.json — both carry `stats`. */
export function parseStats(json: unknown): CheckStats | null {
  const s = (json as { stats?: Record<string, unknown> } | null)?.stats;
  if (!s) return null;
  const n = (k: string) => (typeof s[k] === 'number' ? (s[k] as number) : NaN);
  const out = { passed: n('expected'), failed: n('unexpected'), flaky: n('flaky'), skipped: n('skipped') };
  return Object.values(out).every(Number.isFinite) ? out : null;
}

async function fetchStats(runId: number): Promise<CheckStats | null> {
  const art = await downloadArtifact(runId, ['qa-summary-', 'playwright-report-']);
  if (!art) return null;
  const entry = art.name.startsWith('qa-summary-')
    ? extractZipEntry(art.zip, 'qa-summary.json')
    : extractZipEntry(art.zip, 'test-results/results.json');
  if (!entry) return null;
  try { return parseStats(JSON.parse(entry.toString('utf8'))); } catch { return null; }
}

function redisOrNull(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  return Redis.fromEnv();
}

export async function loadHistory(limit = 30): Promise<HistoryRun[]> {
  const runs = await listRuns(limit);
  const redis = redisOrNull();
  const finished = runs.filter((r) => r.status === 'completed');
  const cached = new Map<number, CheckStats | 'missing'>();
  if (redis && finished.length) {
    const values = await redis.mget<(CheckStats | 'missing' | null)[]>(...finished.map((r) => CACHE_PREFIX + r.id)).catch(() => []);
    finished.forEach((r, i) => { const v = values[i]; if (v) cached.set(r.id, v); });
  }
  let downloads = 0;
  const out: HistoryRun[] = [];
  for (const r of runs) {
    let stats: CheckStats | null = null;
    if (r.status === 'completed') {
      const hit = cached.get(r.id);
      if (hit) stats = hit === 'missing' ? null : hit;
      else if (downloads < MAX_DOWNLOADS) {
        downloads++;
        let failed = false;
        stats = await fetchStats(r.id).catch(() => { failed = true; return null; });
        // A transient GitHub error is retried on the next request; only a definite miss is cached.
        if (redis && !failed) {
          await (stats
            ? redis.set(CACHE_PREFIX + r.id, stats)
            : redis.set(CACHE_PREFIX + r.id, 'missing', { ex: MISSING_TTL_SECONDS })
          ).catch(() => undefined);
        }
      }
    }
    const start = Date.parse(r.run_started_at);
    const end = Date.parse(r.updated_at);
    out.push({
      id: r.id,
      ref: r.display_title.replace(/^QA run\s*/, '') || String(r.id),
      event: r.event,
      status: r.status,
      conclusion: r.conclusion,
      url: r.html_url,
      startedAt: r.run_started_at,
      durationSec: r.status === 'completed' && end > start ? Math.round((end - start) / 1000) : null,
      stats,
    });
  }
  return out;
}
