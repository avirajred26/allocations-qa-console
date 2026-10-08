'use client';
import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowUpRightIcon } from 'lucide-react';
import { ConclusionBadge, ProvenanceBadge } from '@/components/status-badges';
import { Skeleton } from '@/components/ui/skeleton';
import { PHASE_LABEL, type HistoryRun } from '@/lib/qa-types';
import type { Target, TargetHealth } from '@/app/api/targets/route';
import { cn } from '@/lib/utils';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<T>;
}

const SEG = [
  ['passed', 'var(--success)'],
  ['flaky', 'var(--warning)'],
  ['failed', 'var(--destructive)'],
  ['skipped', 'var(--chart-5)'],
] as const;

const day = (iso: string) => iso.slice(5, 10).replace('-', '/');

/** Every qa-run.yml run from the GitHub API, with totals read from each run's own report. */
export function RunHistory() {
  const { data, error, isLoading } = useSWR<{ runs: HistoryRun[] }>('/api/history', getJson, { revalidateOnFocus: false });
  const [mode, setMode] = useState<'checks' | 'duration'>('checks');
  const runs = [...(data?.runs ?? [])].filter((r) => r.status === 'completed').reverse();
  const withStats = runs.filter((r) => r.stats);
  const checks = withStats.reduce((a, r) => ({ pass: a.pass + r.stats!.passed, run: a.run + r.stats!.passed + r.stats!.failed + r.stats!.flaky }), { pass: 0, run: 0 });
  const green = runs.filter((r) => r.conclusion === 'success').length;
  const maxChecks = Math.max(1, ...withStats.map((r) => r.stats!.passed + r.stats!.failed + r.stats!.flaky + r.stats!.skipped));
  const maxDur = Math.max(1, ...runs.map((r) => r.durationSec ?? 0));
  const H = 140;
  return (
    <section className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-3.5">
        <div>
          <div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Run history</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">
            {runs.length ? <>{runs.length} QA runs · <span className="text-success">{Math.round((green / runs.length) * 100)}% green</span>{checks.run > 0 && <> · {((checks.pass / checks.run) * 100).toFixed(1)}% of executed checks passed</>}</> : 'All QA runs'}
          </p>
        </div>
        <div className="flex rounded-md border p-0.5 text-[11px]" role="tablist" aria-label="Chart metric">
          {(['checks', 'duration'] as const).map((m) => <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn('rounded px-2.5 py-1 capitalize transition', mode === m ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground')}>{m}</button>)}
        </div>
      </div>
      <div className="flex-1 px-5 pb-3 pt-5">
        {isLoading && !data ? <Skeleton className="h-[170px] w-full" /> : error ? (
          <p className="flex h-[170px] items-center justify-center text-xs text-muted-foreground">Run history is unavailable right now (GitHub API).</p>
        ) : !runs.length ? (
          <p className="flex h-[170px] items-center justify-center text-xs text-muted-foreground">No completed runs yet.</p>
        ) : (
          <div className="flex h-[170px] items-end gap-2" role="img" aria-label={`${runs.length} runs, ${green} green`}>
            {runs.map((r, i) => {
              const total = r.stats ? r.stats.passed + r.stats.failed + r.stats.flaky + r.stats.skipped : 0;
              const tip = `${PHASE_LABEL[r.phase]} · ${r.ref} · ${r.startedAt.slice(0, 16).replace('T', ' ')} UTC · ${r.conclusion}${r.stats ? ` · ${r.stats.passed} passed, ${r.stats.failed} failed, ${r.stats.skipped} skipped` : ''}${r.durationSec ? ` · ${r.durationSec}s` : ''}`;
              return (
                <Link key={r.id} href={`/runs/gh/${r.id}`} title={tip} className="group flex h-full min-w-3 max-w-12 flex-1 flex-col">
                  <div className="flex flex-1 flex-col justify-end border-b border-border/70">
                  {mode === 'checks' ? (
                    r.stats ? (
                      <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-sm transition group-hover:opacity-80" style={{ height: `${(total / maxChecks) * H}px` }}>
                        {SEG.map(([k, c]) => r.stats![k] > 0 && <span key={k} style={{ flex: r.stats![k], background: c }} />)}
                      </div>
                    ) : <div className="w-full rounded-t-sm border border-dashed" style={{ height: 24, borderColor: r.conclusion === 'success' ? 'var(--success)' : 'var(--destructive)' }} />
                  ) : (
                    <div className="w-full rounded-t-sm transition group-hover:opacity-80" style={{ height: `${((r.durationSec ?? 0) / maxDur) * H}px`, background: r.conclusion === 'success' ? 'var(--chart-1)' : 'var(--destructive)' }} />
                  )}
                  </div>
                  <span className="mt-1.5 h-3 text-center font-mono text-[10px] text-muted-foreground">{i === 0 || day(runs[i - 1].startedAt) !== day(r.startedAt) ? day(r.startedAt) : ''}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <LatestRuns />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-2.5 text-[10px] text-muted-foreground">
        <div className="flex gap-4">{mode === 'checks' ? SEG.map(([k, c]) => <span key={k} className="flex items-center gap-1.5 capitalize"><span className="size-2 rounded-sm" style={{ background: c }} />{k}</span>) : <span>Wall-clock duration per run · red = failed run</span>}</div>
        
      </div>
    </section>
  );
}

const HEALTH: Record<TargetHealth, { label: string; cls: string; card: string }> = {
  healthy: { label: 'HEALTHY', cls: 'border-success/30 bg-success/10 text-success', card: '' },
  degraded: { label: 'DEGRADED', cls: 'border-warning/30 bg-warning/10 text-warning', card: 'border-warning/40 bg-warning/[0.04]' },
  down: { label: 'DOWN', cls: 'border-destructive/30 bg-destructive/10 text-destructive', card: 'border-destructive/40 bg-destructive/[0.04]' },
  unknown: { label: 'UNKNOWN', cls: 'border-border bg-muted text-muted-foreground', card: '' },
};

/** Live checks of everything the QA loop depends on, measured server-side at most once a minute. */
export function Targets() {
  const { data, error, isLoading } = useSWR<{ targets: Target[]; checkedAt: string }>('/api/targets', getJson, { revalidateOnFocus: false, refreshInterval: 60_000 });
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-3.5">
        <div><h2 className="text-sm font-semibold">Targets &amp; dependencies</h2><p className="mt-1 text-xs text-muted-foreground">{data ? <>Checked {data.checkedAt.slice(11, 16)} UTC</> : 'Checked every minute'}</p></div>
        
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading && !data ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />) : error || !data ? (
          <p className="col-span-full py-8 text-center text-xs text-muted-foreground">Target checks are unavailable right now.</p>
        ) : data.targets.map((t) => (
          <article key={t.id} className={cn('rounded-lg border p-4', HEALTH[t.health].card)}>
            <div className="flex items-center justify-between gap-2"><h3 className="text-[13px] font-medium">{t.name}</h3><span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-wider', HEALTH[t.health].cls)}><span className="size-1.5 rounded-full bg-current" />{HEALTH[t.health].label}</span></div>
            <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{t.host}</p>
            <dl className="mt-3 space-y-1.5">{t.rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 font-mono text-[11px]"><dt className="text-muted-foreground">{k}</dt><dd className="truncate text-right">{v}</dd></div>)}</dl>
            {t.note && <p className="mt-3 text-[11px] text-warning">{t.note}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

/** Newest runs from the same history feed, for the Runs-style list under the chart. */
function LatestRuns() {
  const { data } = useSWR<{ runs: HistoryRun[] }>('/api/history', getJson, { revalidateOnFocus: false });
  const runs = (data?.runs ?? []).slice(0, 4);
  if (!runs.length) return null;
  return <ul className="divide-y border-t">{runs.map((r) => <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs"><Link href={`/runs/gh/${r.id}`} className="min-w-0 truncate font-mono text-[11px] hover:text-primary"><span className="mr-2 rounded bg-muted px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground">{PHASE_LABEL[r.phase]}</span>{r.ref}<span className="ml-2 text-muted-foreground">{r.startedAt.slice(5, 16).replace('T', ' ')}</span></Link><span className="flex shrink-0 items-center gap-3">{r.causes && Object.keys(r.causes).length > 0 && <span className="hidden font-mono text-[10px] text-destructive sm:inline">{Object.entries(r.causes).map(([c, n]) => `${c.toUpperCase()} ${n}`).join(' · ')}</span>}{r.stats && <span className="font-mono text-[10px] text-muted-foreground">{r.stats.passed}/{r.stats.passed + r.stats.failed + r.stats.flaky + r.stats.skipped}</span>}{r.status === 'completed' ? <ConclusionBadge conclusion={r.conclusion ?? null} /> : <span className="font-mono text-[10px] text-primary">{r.status.replace('_', ' ')}</span>}<Link href={`/runs/gh/${r.id}`} aria-label={`Open ${r.ref} report`} className="text-primary"><ArrowUpRightIcon className="size-3.5" /></Link></span></li>)}</ul>;
}
