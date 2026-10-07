'use client';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeftIcon, ArrowUpRightIcon, FileTextIcon, FilmIcon, ImageIcon, ScanSearchIcon } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { ConclusionBadge, ProvenanceBadge } from '@/components/status-badges';
import { Skeleton } from '@/components/ui/skeleton';
import { PHASE_LABEL, type ReportFailure } from '@/lib/qa-types';
import type { RunReport } from '@/lib/ci-history';
import { cn } from '@/lib/utils';

export const CAUSE: Record<string, { label: string; cls: string; owner: string }> = {
  ui: { label: 'UI', cls: 'border-primary/30 bg-primary/10 text-primary', owner: 'Frontend' },
  backend: { label: 'BACKEND', cls: 'border-destructive/30 bg-destructive/10 text-destructive', owner: 'Backend / API' },
  network: { label: 'NETWORK', cls: 'border-warning/30 bg-warning/10 text-warning', owner: 'Platform' },
  timeout: { label: 'TIMEOUT', cls: 'border-warning/30 bg-warning/10 text-warning', owner: 'QA' },
  test: { label: 'TEST', cls: 'border-border bg-muted text-muted-foreground', owner: 'QA' },
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw Object.assign(new Error(String(res.status)), { status: res.status });
  return res.json() as Promise<T>;
}

const fmt = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s` : `${(ms / 1000).toFixed(1)}s`);
const evidenceUrl = (runId: string, p: string) => `/api/evidence/${runId}/${p.split('/').map(encodeURIComponent).join('/')}`;

function FailureCard({ runId, f, flaky }: { runId: string; f: ReportFailure; flaky?: boolean }) {
  const c = CAUSE[f.category] ?? CAUSE.test;
  const ev = f.evidence;
  const traceHref = ev.trace && typeof window !== 'undefined' ? `https://trace.playwright.dev/?trace=${encodeURIComponent(window.location.origin + evidenceUrl(runId, ev.trace))}` : null;
  return (
    <article className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider', c.cls)}>{c.label}</span>
            {flaky && <span className="rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] text-warning">FLAKY · passed on retry</span>}
            <h3 className="text-sm font-medium">{f.title}</h3>
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">{f.project} · {f.file}:{f.line}{f.retries ? ` · retried ${f.retries}×` : ''} · {fmt(f.durationMs)} · suggested owner: {c.owner}</p>
        </div>
      </div>
      <div className="grid gap-5 p-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0 space-y-3">
          <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 font-mono text-[12px] text-destructive">{f.reason || 'No error message recorded.'}</p>
          <details className="group rounded-md border"><summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground">Full error</summary><pre className="max-h-72 overflow-auto border-t bg-muted/30 p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap">{f.detail}</pre></details>
          <div className="flex flex-wrap gap-2 text-xs">
            {ev.screenshot && <a className="qa-link-button gap-1.5 !py-1.5 !text-xs" href={evidenceUrl(runId, ev.screenshot)} target="_blank" rel="noopener noreferrer"><ImageIcon className="size-3.5" />Screenshot</a>}
            {ev.video && <a className="qa-link-button gap-1.5 !py-1.5 !text-xs" href={evidenceUrl(runId, ev.video)} target="_blank" rel="noopener noreferrer"><FilmIcon className="size-3.5" />Recording</a>}
            {traceHref && <a className="qa-link-button gap-1.5 !py-1.5 !text-xs" href={traceHref} target="_blank" rel="noopener noreferrer"><ScanSearchIcon className="size-3.5" />Trace viewer</a>}
            {ev.log && <a className="qa-link-button gap-1.5 !py-1.5 !text-xs" href={evidenceUrl(runId, ev.log)} target="_blank" rel="noopener noreferrer"><FileTextIcon className="size-3.5" />Log</a>}
            {!ev.screenshot && !ev.video && !ev.trace && !ev.log && <span className="text-muted-foreground">No evidence files for this attempt.</span>}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {ev.screenshot && <a href={evidenceUrl(runId, ev.screenshot)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md border bg-muted/30"><img src={evidenceUrl(runId, ev.screenshot)} alt={`Screenshot at failure: ${f.title}`} loading="lazy" className="aspect-video w-full object-contain" /></a>}
          {ev.video && <video src={evidenceUrl(runId, ev.video)} controls preload="none" className="aspect-video w-full rounded-md border bg-muted/30" aria-label={`Recording: ${f.title}`} />}
        </div>
      </div>
    </article>
  );
}

export function RunReportView({ runId }: { runId: string }) {
  const { data: r, error, isLoading } = useSWR<RunReport>(`/api/report/${runId}`, getJson, {
    refreshInterval: (d) => (d && d.status !== 'completed' ? 15_000 : 0),
    revalidateOnFocus: false,
  });
  const status = (error as { status?: number } | undefined)?.status;
  const rep = r?.report;
  const stats = rep?.stats ?? (r?.stats ? { total: r.stats.passed + r.stats.failed + r.stats.flaky + r.stats.skipped, ...r.stats, durationMs: (r.durationSec ?? 0) * 1000 } : null);
  return (
    <>
      <Link href="/runs" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-3.5" />All runs</Link>
      <PageHeader
        eyebrow="RUN REPORT"
        title={r ? `${PHASE_LABEL[r.phase]} · ${r.title.replace(/^QA (run )?/, '')}` : 'Run report'}
        description={r ? <>GitHub Actions run {r.id} · {r.startedAt.slice(0, 16).replace('T', ' ')} UTC{r.durationSec ? ` · ${r.durationSec}s` : ''}{r.scope ? ` · scope ${r.scope}` : ''}</> : 'Totals, failure causes and evidence for one QA run.'}
        actions={r && <><a href={r.url} target="_blank" rel="noopener noreferrer" className="qa-link-button gap-1.5">GitHub run <ArrowUpRightIcon className="size-3.5" /></a>{r.ctx?.prUrl && <a href={r.ctx.prUrl} target="_blank" rel="noopener noreferrer" className="qa-link-button gap-1.5">PR #{r.ctx.prNumber} <ArrowUpRightIcon className="size-3.5" /></a>}</>}
      />
      {isLoading && !r ? <Skeleton className="h-64 w-full" /> : error ? (
        <div className="qa-panel text-sm text-muted-foreground">{status === 404 ? 'This is not a QA run in this repository.' : 'This run could not be read from GitHub right now.'}</div>
      ) : r && (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-5 py-3 text-xs">
            {r.status === 'completed' ? <ConclusionBadge conclusion={r.conclusion ?? null} /> : <span className="font-mono text-primary">{r.status.replace('_', ' ')} · refreshing every 15 s</span>}
            {r.ctx?.prNumber && <span><span className="text-muted-foreground">PR</span> #{r.ctx.prNumber}{r.ctx.prTitle ? ` · ${r.ctx.prTitle}` : ''}</span>}
            {r.ctx?.author && <span><span className="text-muted-foreground">Author</span> @{r.ctx.author}</span>}
            {r.ctx?.sha && <span className="font-mono"><span className="font-sans text-muted-foreground">Commit</span> {r.ctx.sha.slice(0, 7)}</span>}
            <span><span className="text-muted-foreground">Branch</span> {r.branch}</span>
            <span><span className="text-muted-foreground">Target</span> {r.ctx?.target?.replace(/^https?:\/\//, '') ?? 'dashboard.allocations.com'}</span>
            <ProvenanceBadge kind="live" className="ml-auto" />
          </div>
          {stats ? (
            <div className="grid grid-cols-3 overflow-hidden rounded-lg border bg-card sm:grid-cols-6 [&>div+div]:border-l">
              {([['Total', stats.total, ''], ['Passed', stats.passed, 'text-success'], ['Failed', stats.failed, stats.failed ? 'text-destructive' : ''], ['Flaky', stats.flaky, stats.flaky ? 'text-warning' : ''], ['Skipped', stats.skipped, ''], ['Duration', fmt(stats.durationMs), '']] as const).map(([k, v, cls]) => (
                <div key={k} className="px-4 py-4"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{k}</p><p className={cn('mt-2 font-mono text-2xl', cls)}>{v}</p></div>
              ))}
            </div>
          ) : r.status === 'completed' && <div className="qa-panel text-sm text-muted-foreground">No summary was uploaded for this run (it predates the reporter, or its artifacts expired). Open the GitHub run for the raw logs.</div>}
          {rep && rep.globalErrors.length > 0 && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Harness error: {rep.globalErrors.join('; ')}</div>}
          {rep && rep.failures.length > 0 && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center gap-3"><h2 className="text-sm font-semibold">Failures</h2>{Object.entries(rep.byCategory).map(([c, n]) => <span key={c} className={cn('rounded border px-2 py-0.5 font-mono text-[10px]', (CAUSE[c] ?? CAUSE.test).cls)}>{(CAUSE[c] ?? CAUSE.test).label} {n}</span>)}<span className="text-[11px] text-muted-foreground">Cause is a rule-based triage hint from the error text and spec type.</span></div>
              {rep.failures.map((f, i) => <FailureCard key={`${f.title}-${f.project}-${i}`} runId={runId} f={f} />)}
            </section>
          )}
          {rep && rep.flaky.length > 0 && <section className="space-y-4"><h2 className="text-sm font-semibold">Flaky (passed on retry)</h2>{rep.flaky.map((f, i) => <FailureCard key={`${f.title}-${i}`} runId={runId} f={f} flaky />)}</section>}
          {rep && rep.failures.length === 0 && rep.flaky.length === 0 && stats && <div className="qa-panel text-sm"><span className="font-medium text-success">All executed checks passed.</span> <span className="text-muted-foreground">{stats.skipped ? `${stats.skipped} skipped by design.` : ''}</span></div>}
          {rep && (rep.findings.length > 0 || rep.slowest.length > 0) && (
            <div className="grid gap-5 md:grid-cols-2">
              {rep.findings.length > 0 && <section className="qa-panel"><h2 className="text-sm font-semibold">Findings</h2><ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">{rep.findings.map((x) => <li key={x}>{x}</li>)}</ul></section>}
              <section className="qa-panel"><h2 className="text-sm font-semibold">Slowest checks</h2><ul className="mt-3 space-y-2 font-mono text-[11px]">{rep.slowest.map((t) => <li key={t.title + t.project} className="flex justify-between gap-3"><span className="truncate text-muted-foreground">{t.title} · {t.project}</span><span>{fmt(t.durationMs)}</span></li>)}</ul></section>
            </div>
          )}
        </>
      )}
    </>
  );
}
