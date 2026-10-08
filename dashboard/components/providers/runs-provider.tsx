'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  NOT_FOUND_DEADLINE_MS,
  POLL_INTERVAL_MS,
  RUN_REF_PATTERN,
  safeGithubUrl,
  githubRunId,
  type Dispatch,
  type RunConclusion,
  type SessionRun,
  type SessionRunState,
  type Suite,
  type Workflow,
  type Scope,
} from '@/lib/run-types';

const STORAGE_KEY = 'allocations-qa:session-runs:v1';
const FIRST_POLL_DELAY_MS = 5_000;
const SUITES: Suite[] = ['all', 'desktop', 'mobile', 'drill'];
const STATES: SessionRunState[] = ['confirming', 'queued', 'in_progress', 'completed', 'unresolved'];
const CONCLUSIONS = ['success', 'failure', 'cancelled', 'skipped', 'timed_out', 'neutral'] as const;

interface RunsContextValue {
  runs: SessionRun[];
  hydrated: boolean;
  addRun: (input: { run_ref: string; suite: Suite; dispatch: Dispatch; workflow?: Workflow; scope?: Scope; environment?: string }) => void;
  recheck: (ref: string) => void;
}

const RunsContext = createContext<RunsContextValue | null>(null);

function sanitizeStored(value: unknown): SessionRun[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((r): SessionRun[] => {
    if (!r || typeof r !== 'object') return [];
    const x = r as Record<string, unknown>;
    if (typeof x.run_ref !== 'string' || !RUN_REF_PATTERN.test(x.run_ref)) return [];
    if (!SUITES.includes(x.suite as Suite)) return [];
    if (x.dispatch !== 'accepted' && x.dispatch !== 'uncertain') return [];
    if (typeof x.startedAt !== 'number' || !STATES.includes(x.status as SessionRunState)) return [];
    return [
      {
        run_ref: x.run_ref,
        suite: x.suite as Suite,
        workflow: x.workflow === 'qa-run.yml' || x.workflow === 'qa-regression.yml' ? x.workflow : undefined,
        scope: x.scope === 'full' || x.scope === 'api' || x.scope === 'ui' ? x.scope : undefined,
        environment: typeof x.environment === 'string' && /^[a-z0-9-]{2,20}$/.test(x.environment) ? x.environment : undefined,
        dispatch: x.dispatch,
        startedAt: x.startedAt,
        found: x.found === true,
        status: x.status as SessionRunState,
        conclusion: CONCLUSIONS.includes(x.conclusion as (typeof CONCLUSIONS)[number]) ? (x.conclusion as RunConclusion) : null,
        html_url: safeGithubUrl(x.html_url),
        artifacts_url: safeGithubUrl(x.artifacts_url),
        lastCheckedAt: typeof x.lastCheckedAt === 'number' ? x.lastCheckedAt : undefined,
      },
    ];
  });
}

/** Strips transient UI flags; only non-sensitive run metadata is persisted. */
function toStored(runs: SessionRun[]) {
  return runs.map(({ checking: _c, checkError: _e, ...rest }) => rest);
}

function RunLinks({ run }: { run: SessionRun }) {
  const id = githubRunId(run.html_url);
  if (!id) return null;
  return (
    <span className="mt-1 flex gap-3">
      <Link className="underline underline-offset-2" href={`/runs/gh/${id}`}>
        Open report
      </Link>
    </span>
  );
}

function notify(run: SessionRun) {
  const title = `Run ${run.run_ref}`;
  const opts = { id: run.run_ref, description: <RunLinks run={run} /> };
  switch (run.status) {
    case 'confirming':
      toast.loading(title, {
        ...opts,
        description: run.dispatch === 'uncertain' ? 'Confirming with GitHub…' : 'Waiting for GitHub to list the run…',
      });
      break;
    case 'queued':
      toast.loading(`${title} · queued`, opts);
      break;
    case 'in_progress':
      toast.loading(`${title} · in progress`, opts);
      break;
    case 'completed':
      if (run.conclusion === 'success') toast.success(`${title} · completed: success`, { ...opts, duration: 15_000 });
      else toast.error(`${title} · completed: ${run.conclusion ?? 'no conclusion'}`, { ...opts, duration: 20_000 });
      break;
    case 'unresolved':
      toast.warning(`${title} · unresolved`, {
        id: run.run_ref,
        duration: 20_000,
        description: 'Not found on GitHub after 3 minutes. No result is assumed. Use Recheck on the Runs page.',
      });
      break;
  }
}

export function RunsProvider({ children }: { children: ReactNode }) {
  const [runs, setRuns] = useState<SessionRun[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const runsRef = useRef<SessionRun[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inflight = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);

  const commit = useCallback((next: SessionRun[]) => {
    runsRef.current = next;
    setRuns(next);
  }, []);

  const patch = useCallback(
    (ref: string, update: Partial<SessionRun>) => {
      const prev = runsRef.current.find((r) => r.run_ref === ref);
      if (!prev) return undefined;
      const next = { ...prev, ...update };
      commit(runsRef.current.map((r) => (r.run_ref === ref ? next : r)));
      if (prev.status !== next.status || (next.status !== 'confirming' && prev.html_url !== next.html_url)) notify(next);
      return next;
    },
    [commit],
  );

  const clearTimer = useCallback((ref: string) => {
    const t = timers.current.get(ref);
    if (t) clearTimeout(t);
    timers.current.delete(ref);
  }, []);

  const pollRef = useRef<(ref: string, manual: boolean) => Promise<void>>(async () => {});

  const schedule = useCallback(
    (ref: string, delay: number) => {
      clearTimer(ref);
      timers.current.set(
        ref,
        setTimeout(() => {
          timers.current.delete(ref);
          void pollRef.current(ref, false);
        }, delay),
      );
    },
    [clearTimer],
  );

  const poll = useCallback(
    async (ref: string, manual: boolean) => {
      const run = runsRef.current.find((r) => r.run_ref === ref);
      if (!run || run.status === 'completed') return;
      if (run.status === 'unresolved' && !manual) return;

      inflight.current.get(ref)?.abort();
      const controller = new AbortController();
      inflight.current.set(ref, controller);
      if (manual) patch(ref, { checking: true });

      const pastDeadline = () => Date.now() - run.startedAt >= NOT_FOUND_DEADLINE_MS;
      const afterNotFound = (extra: Partial<SessionRun>) => {
        if (run.found) {
          patch(ref, extra);
          schedule(ref, POLL_INTERVAL_MS);
        } else if (run.status === 'unresolved' || pastDeadline()) {
          patch(ref, { ...extra, status: 'unresolved' });
        } else {
          patch(ref, { ...extra, status: 'confirming' });
          schedule(ref, POLL_INTERVAL_MS);
        }
      };

      try {
        const res = await fetch(`/api/runs/${encodeURIComponent(ref)}`, { cache: 'no-store', signal: controller.signal });
        if (!mounted.current) return;
        const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        const checkedAt = Date.now();

        if (!res.ok || !body || typeof body.found !== 'boolean') {
          afterNotFound({ checking: false, checkError: true, lastCheckedAt: checkedAt });
          return;
        }

        if (!body.found) {
          afterNotFound({ checking: false, checkError: false, lastCheckedAt: checkedAt });
          return;
        }

        const status: SessionRunState =
          body.status === 'completed' ? 'completed' : body.status === 'in_progress' ? 'in_progress' : 'queued';
        const conclusion = CONCLUSIONS.includes(body.conclusion as (typeof CONCLUSIONS)[number])
          ? (body.conclusion as RunConclusion)
          : null;
        patch(ref, {
          found: true,
          status,
          conclusion: status === 'completed' ? conclusion : null,
          html_url: safeGithubUrl(body.html_url) ?? run.html_url,
          artifacts_url: safeGithubUrl(body.artifacts_url) ?? run.artifacts_url,
          checking: false,
          checkError: false,
          lastCheckedAt: checkedAt,
        });
        if (status !== 'completed') schedule(ref, POLL_INTERVAL_MS);
      } catch (err) {
        if ((err as Error).name === 'AbortError' || !mounted.current) return;
        afterNotFound({ checking: false, checkError: true, lastCheckedAt: Date.now() });
      } finally {
        if (inflight.current.get(ref) === controller) inflight.current.delete(ref);
      }
    },
    [patch, schedule],
  );

  pollRef.current = poll;

  useEffect(() => {
    mounted.current = true;
    let stored: SessionRun[] = [];
    try {
      stored = sanitizeStored(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]'));
    } catch {
      stored = [];
    }
    const now = Date.now();
    const resumed = stored.map((r) =>
      !r.found && (r.status === 'confirming' || r.status === 'queued') && now - r.startedAt >= NOT_FOUND_DEADLINE_MS
        ? { ...r, status: 'unresolved' as const }
        : r,
    );
    commit(resumed);
    setHydrated(true);
    for (const r of resumed) {
      if (r.status !== 'completed' && r.status !== 'unresolved') schedule(r.run_ref, 0);
    }

    const timerMap = timers.current;
    const inflightMap = inflight.current;
    return () => {
      mounted.current = false;
      for (const t of timerMap.values()) clearTimeout(t);
      timerMap.clear();
      for (const c of inflightMap.values()) c.abort();
      inflightMap.clear();
    };
  }, [commit, schedule]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toStored(runs)));
    } catch {
      // Storage full or disabled: the run list still works for this tab.
    }
  }, [runs, hydrated]);

  const addRun = useCallback(
    ({ run_ref, suite, dispatch, workflow, scope, environment }: { run_ref: string; suite: Suite; dispatch: Dispatch; workflow?: Workflow; scope?: Scope; environment?: string }) => {
      const run: SessionRun = {
        run_ref,
        suite,
        workflow,
        scope,
        environment,
        dispatch,
        startedAt: Date.now(),
        found: false,
        status: 'confirming',
        conclusion: null,
      };
      commit([run, ...runsRef.current.filter((r) => r.run_ref !== run_ref)]);
      notify(run);
      schedule(run_ref, FIRST_POLL_DELAY_MS);
    },
    [commit, schedule],
  );

  const recheck = useCallback((ref: string) => void poll(ref, true), [poll]);

  const value = useMemo(() => ({ runs, hydrated, addRun, recheck }), [runs, hydrated, addRun, recheck]);
  return <RunsContext.Provider value={value}>{children}</RunsContext.Provider>;
}

export function useRuns() {
  const ctx = useContext(RunsContext);
  if (!ctx) throw new Error('useRuns must be used within RunsProvider');
  return ctx;
}
