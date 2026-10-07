/** QA run shapes shared by server routes and client components (no server-only imports). */

export type CheckStats = { passed: number; failed: number; flaky: number; skipped: number };

export type Phase = 'pre-merge' | 'post-merge' | 'regression' | 'manual' | 'drill' | 'health';

export const PHASE_LABEL: Record<Phase, string> = {
  'pre-merge': 'Pre-merge · API',
  'post-merge': 'Post-merge · UI + API',
  regression: 'Weekly regression',
  manual: 'Manual',
  drill: 'Failure drill',
  health: 'Health check',
};

export type HistoryRun = {
  id: number;
  ref: string;
  event: string;
  phase: Phase;
  status: string;
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'neutral' | null | undefined;
  url: string;
  branch: string;
  startedAt: string;
  durationSec: number | null;
  /** Totals from the run's own results; null when the artifact is gone or the run is not finished. */
  stats: CheckStats | null;
  /** Failure count per cause (ui / backend / network / timeout / test), when the run has a qa-summary. */
  causes: Record<string, number> | null;
};

/** Shape written by scripts/qa-notify.mjs into qa-summary.json (only the fields the console reads). */
export type QaSummary = {
  phase?: Phase;
  scope?: string;
  stats?: Record<string, number>;
  ctx?: { prNumber?: string | null; prTitle?: string; prUrl?: string | null; author?: string | null; sha?: string; target?: string };
  report?: {
    stats: { total: number; passed: number; failed: number; flaky: number; skipped: number; durationMs: number };
    byCategory: Record<string, number>;
    failures: ReportFailure[];
    flaky: ReportFailure[];
    findings: string[];
    slowest: { title: string; project: string; durationMs: number }[];
    globalErrors: string[];
  };
};
export type ReportFailure = {
  title: string; file: string; line: number; project: string; retries: number; durationMs: number;
  category: string; reason: string; detail: string;
  evidence: { screenshot: string | null; video: string | null; trace: string | null; log: string | null };
};
