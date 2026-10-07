export type Suite = 'all' | 'desktop' | 'mobile';
export type Dispatch = 'accepted' | 'uncertain';
export type RunConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'neutral' | null;

/** UI state for a session run. "confirming" = not yet found on GitHub, still within the deadline. */
export type SessionRunState = 'confirming' | 'queued' | 'in_progress' | 'completed' | 'unresolved';

/** Non-sensitive run metadata only — this is the sole thing written to sessionStorage. */
export interface SessionRun {
  run_ref: string;
  suite: Suite;
  dispatch: Dispatch;
  startedAt: number;
  found: boolean;
  status: SessionRunState;
  conclusion: RunConclusion;
  html_url?: string;
  artifacts_url?: string;
  lastCheckedAt?: number;
  /** Last poll could not read status (network or 5xx). */
  checkError?: boolean;
  checking?: boolean;
}

export const NOT_FOUND_DEADLINE_MS = 3 * 60 * 1000;
export const POLL_INTERVAL_MS = 12_000;
export const RUN_REF_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;

export function safeGithubUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname === 'github.com' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
