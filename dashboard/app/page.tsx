'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRightIcon, CopyIcon, ShieldAlertIcon, CheckIcon, GitBranchIcon } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useTriage } from '@/components/providers/triage-provider';
import { useRuns } from '@/components/providers/runs-provider';
import { UnsavedTriageNotice } from '@/components/unsaved-triage-notice';
import { SourceBadge, StatusBadge } from '@/components/status-badges';
import { scenarios, fixtureMeta, FLOW_LABEL } from '@/lib/fixture';
import { buildSlackUpdate, observedRuns, riskRows, latestStatus } from '@/lib/readiness';
import { recordedExecutions } from '@/lib/execution-records';
import { KpiStrip, LiveQueue, CheckTiming, OutcomesByFlow } from '@/components/overview-panels';
import { RunHistory, Targets } from '@/components/live-panels';
import { EVIDENCE_NOTES } from '@/lib/local-evidence';

export default function ReadinessPage(){
  const {triage,readiness:r}=useTriage();const {runs}=useRuns();const [slack,setSlack]=useState('');const [copied,setCopied]=useState(false);
  async function copyUpdate(){const text=buildSlackUpdate({readiness:r,triage,runs:observedRuns(runs),consoleUrl:window.location.origin,now:new Date()});setSlack(text);try{await navigator.clipboard.writeText(text);setCopied(true);}catch{setCopied(false);}}
  return <>
    <PageHeader title="Release readiness" eyebrow="MONITOR" description="The release gate, outstanding risks, and evidence behind the decision." actions={<Button variant="outline" onClick={copyUpdate}><CopyIcon/>Copy Slack update</Button>}/>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 text-xs"><div className="flex items-center gap-3"><span className="font-medium">Release 2026.10</span><span className="h-3 border-l"/><span className="qa-tag">FIXTURE + MOCK</span></div><span className="text-muted-foreground">Snapshot {fixtureMeta.generated_at.slice(0,10)} <span className="mx-1">·</span> Not a production assessment</span></div>
    <UnsavedTriageNotice/>
    <KpiStrip/>
    <div className="grid gap-5 xl:grid-cols-[1.8fr_1fr]">
      <RunHistory/>
      <LiveQueue/>
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.8fr_1fr]">
      <section className="overflow-hidden rounded-lg border bg-card"><div className="flex items-center justify-between border-b px-5 py-3.5"><h2 className="text-sm font-semibold">Release gate</h2><span className="qa-tag">SAMPLE DECISION</span></div><div className="grid gap-6 p-5 sm:grid-cols-[.9fr_1.1fr]"><div><span className="inline-flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xl font-semibold text-destructive"><ShieldAlertIcon className="size-5"/>{r.verdict}</span><p className="mt-4 text-sm font-medium">Investor onboarding is blocking</p><p className="mt-2 text-xs leading-6 text-muted-foreground">INV-020 is a mocked failure. Fix and retest the invitation flow in this sample release before changing the gate.</p><Link href="/history#INV-020" className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary">Review blocker <ArrowUpRightIcon className="size-3.5"/></Link></div><div className="space-y-4 border-t pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0"><div className="flex justify-between text-xs"><span className="text-muted-foreground">Failed blockers</span><span className="font-mono text-destructive">{r.blockerFailures.length}</span></div><div className="flex justify-between text-xs"><span className="text-muted-foreground">Conditional / quarantined</span><span className="font-mono text-warning">{r.conditionalBlockers.length}</span></div><div className="flex justify-between text-xs"><span className="text-muted-foreground">Retest progress</span><span className="font-mono">{r.retest.pct===null?'N/A':`${r.retest.pct}%`}</span></div><div className="border-t pt-3"><p className="text-[11px] font-medium">No comparable previous run</p><p className="mt-1 text-[10px] leading-5 text-muted-foreground">A same-device baseline is needed to report changes or retest recovery.</p></div></div></div></section>
      <OutcomesByFlow readiness={r}/>
    </div>
    <CheckTiming/>
    <Targets/>
    <section className="overflow-hidden rounded-lg border bg-card"><div className="flex items-center justify-between gap-3 border-b px-5 py-3.5"><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Needs attention</h2><span className="qa-count">{riskRows(scenarios,triage).length}</span></div><Link href="/history" className="text-xs text-primary">Scenario library ↗</Link></div><div className="overflow-x-auto"><table className="qa-table min-w-[780px]"><thead><tr><th>Scenario / risk</th><th>Status</th><th>Flow</th><th>Owner</th><th>Example ticket</th><th>Source</th></tr></thead><tbody>{riskRows(scenarios,triage).map(({scenario:s,status,triage:t})=><tr key={s.id}><td><Link className="font-medium hover:text-primary" href={`/history#${s.id}`}>{s.id} <span className="mx-1 text-muted-foreground">·</span> {s.name}</Link>{EVIDENCE_NOTES[s.id]&&<p className="mt-1 text-[10px] text-warning">{EVIDENCE_NOTES[s.id]?.text ?? 'Skipped — no passing coverage'}</p>}</td><td><StatusBadge status={status}/></td><td className="text-xs text-muted-foreground">{FLOW_LABEL[s.flow]}</td><td className="text-xs capitalize">{t?.owner??'Unassigned'}</td><td className="font-mono text-xs text-muted-foreground">{t?.ticket||'—'}</td><td><SourceBadge source={s.source}/></td></tr>)}</tbody></table></div></section>
    <section className="overflow-hidden rounded-lg border bg-card"><div className="flex items-center justify-between border-b px-5 py-3.5"><h2 className="text-sm font-semibold">Recorded executions</h2><Link href="/runs" className="text-xs text-primary">View all records ↗</Link></div>{recordedExecutions.map(e=><div key={e.id} className="flex flex-wrap items-center gap-4 border-b px-5 py-4 last:border-b-0"><span className="flex size-8 items-center justify-center rounded-md border bg-muted/30"><GitBranchIcon className="size-4 text-muted-foreground"/></span><div className="min-w-52 flex-1"><Link href="/runs" className="text-xs font-medium hover:text-primary">{e.title}</Link><p className="mt-1 font-mono text-[10px] text-muted-foreground">{e.date} · {e.source==='recorded-ci'?'RECORDED CI':'RECORDED LOCAL'}</p></div><StatusBadge status={e.status}/><p className="text-xs text-muted-foreground"><span className="text-success">{e.counts.pass} passed</span><span className="mx-2">·</span><span className="text-destructive">{e.counts.fail} failed</span><span className="mx-2">·</span>{e.counts.skipped} skipped</p>{e.url&&<a href={e.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary">Report ↗</a>}</div>)}</section>
    <Dialog open={!!slack} onOpenChange={open=>{if(!open)setSlack('');}}><DialogContent className="sm:max-w-2xl"><DialogTitle className="flex items-center gap-2">{copied&&<CheckIcon className="size-4 text-success"/>}{copied?'Copied — review before sharing':'Slack update'}</DialogTitle><DialogDescription>Same verdict and triage as this page. Nothing is posted automatically.</DialogDescription><textarea aria-label="Slack update preview" readOnly value={slack} className="qa-input min-h-80 resize-y font-mono text-xs leading-6"/></DialogContent></Dialog>
  </>;
}
