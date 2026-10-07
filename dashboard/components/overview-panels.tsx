'use client';
import Link from 'next/link';
import { ArrowUpRightIcon, PlayIcon, RadioIcon } from 'lucide-react';
import { ConclusionBadge, ProvenanceBadge, RunStateBadge } from '@/components/status-badges';
import { useRuns } from '@/components/providers/runs-provider';
import { useCooldownSeconds, useQuota } from '@/hooks/use-quota';
import { scenarios, FLOW_ORDER, FLOW_LABEL, type ScenarioStatus } from '@/lib/fixture';
import { latestStatus, type Readiness } from '@/lib/readiness';
import { CI_EVIDENCE, CI_HISTORY } from '@/lib/local-evidence';
import { cn } from '@/lib/utils';
import ciReport from '@/fixtures/recorded-ci-results.json';

const STATUS_COLOR:Record<ScenarioStatus,string>={pass:'var(--success)',fail:'var(--destructive)',flaky:'var(--warning)',skipped:'var(--border)'};
const ciTests=ciReport.tests.map(t=>({...t,status:(t.status==='passed'?'pass':t.status==='skipped'?'skipped':'fail') as ScenarioStatus}));
const ciTotal=ciTests.length;

/** Small uppercase label + provenance tag, shared by every tile and panel on the overview. */
function Eyebrow({label,kind}:{label:string;kind:'live'|'fixture'|'mock'|'recorded-ci'|'sample'}){
  const tag={live:'LIVE','recorded-ci':'RECORDED CI',fixture:'FIXTURE',mock:'MOCK',sample:'SAMPLE'}[kind];
  const tone={live:'text-primary','recorded-ci':'text-success',fixture:'text-warning',mock:'text-muted-foreground',sample:'text-muted-foreground'}[kind];
  return <div className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span><span className={cn('font-mono text-[9px] tracking-wider',tone)}>{tag}</span></div>;
}

function LatestCiTile(){
  const median=[...ciTests].filter(t=>t.status!=='skipped').map(t=>t.durationMs).sort((a,b)=>a-b);
  const mid=median[Math.floor(median.length/2)]??0;
  return <section className="flex flex-col gap-3 p-5">
    <Eyebrow label="Latest CI run" kind="recorded-ci"/>
    <p className="font-mono text-[30px] leading-none tracking-tight"><span className={CI_EVIDENCE.failed?'text-destructive':'text-success'}>{CI_EVIDENCE.passed}</span><span className="text-base text-muted-foreground">/{ciTotal} passed</span></p>
    <div className="flex gap-1" role="img" aria-label={`${CI_EVIDENCE.passed} passed, ${CI_EVIDENCE.failed} failed, ${CI_EVIDENCE.skipped} skipped`}>{ciTests.map(t=><span key={t.id} title={`${t.title} · ${t.device} · ${t.status}`} className="h-6 flex-1 rounded-[3px]" style={{background:STATUS_COLOR[t.status],opacity:t.status==='skipped'?1:.85}}/>)}</div>
    <p className="font-mono text-[10px] text-muted-foreground">{CI_EVIDENCE.runRef} · {CI_EVIDENCE.failed} fail · {CI_EVIDENCE.skipped} by-design skip · median {(mid/1000).toFixed(1)}s</p>
  </section>;
}

function RecoveryTile(){
  const [before,after]=[CI_HISTORY[0],CI_HISTORY[CI_HISTORY.length-1]];
  const total=(r:{passed:number;failed:number;skipped:number})=>r.passed+r.failed+r.skipped;
  return <section className="flex flex-col gap-3 p-5">
    <Eyebrow label="CI history" kind="recorded-ci"/>
    <p className="font-mono text-[30px] leading-none tracking-tight">{before.passed}<span className="mx-2 text-base text-muted-foreground">→</span><span className="text-success">{after.passed}</span><span className="ml-1.5 text-xs text-success">+{after.passed-before.passed}</span></p>
    <div className="space-y-1.5">{CI_HISTORY.map(r=><div key={r.runId} className="flex items-center gap-2"><span className="w-10 font-mono text-[10px] text-muted-foreground">{r.isoDate.slice(5).replace('-','/')}</span><div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">{(['passed','failed','skipped'] as const).map(k=><span key={k} style={{width:`${r[k]/total(r)*100}%`,background:k==='passed'?'var(--success)':k==='failed'?'var(--destructive)':'var(--chart-5)'}}/>)}</div></div>)}</div>
    <p className="text-[10px] leading-4 text-muted-foreground">Passing checks before vs after the passwordless-sign-in fix.</p>
  </section>;
}

function TriggerTile(){
  const {data,error,isLoading}=useQuota();const cooldown=useCooldownSeconds(data);
  const live=!!data&&!error;const checking=isLoading&&!data;
  return <section className="flex flex-col gap-3 p-5">
    <Eyebrow label="Runs today" kind="live"/>
    {live?<p className="font-mono text-[30px] leading-none tracking-tight">{data.used}<span className="text-base text-muted-foreground">/{data.limit}</span></p>:<p className="font-mono text-[30px] leading-none tracking-tight text-muted-foreground">—</p>}
    <div className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary transition-all" style={{width:live?`${Math.min(100,data.used/data.limit*100)}%`:'0%'}}/></div>
    <p className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground"><RadioIcon className={cn('size-3',live?'text-success':checking?'text-muted-foreground':'text-warning')} aria-hidden/>{checking?'checking…':!live?'Trigger offline':cooldown>0?`cooldown ${cooldown}s`:'ready · 30s cooldown · 20/day'}</p>
  </section>;
}

/** Product finding the harness recorded as a Playwright annotation (not a failure). */
function FindingTile(){
  const hits=ciTests.filter(t=>t.annotations.some(a=>a.type==='finding'));
  return <section className="flex flex-col gap-3 p-5">
    <Eyebrow label="Harness finding" kind="recorded-ci"/>
    <p className="font-mono text-[30px] leading-none tracking-tight text-warning">PRE-002<span className="ml-2 text-xs text-muted-foreground">P3 · a11y</span></p>
    <div className="flex gap-1">{ciTests.map(t=><span key={t.id} className="h-2 flex-1 rounded-full" style={{background:hits.includes(t)?'var(--warning)':'var(--muted)'}}/>)}</div>
    <p className="text-[10px] leading-4 text-muted-foreground">Sign-in error text is not ARIA-linked to the email input. Flagged in {hits.length} of {ciTotal} CI checks.</p>
  </section>;
}

export function KpiStrip(){
  return <div className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2 xl:grid-cols-4 [&>section]:border-border max-sm:[&>section+section]:border-t sm:max-xl:[&>section:nth-child(n+3)]:border-t sm:[&>section:nth-child(even)]:border-l xl:[&>section+section]:border-l">
    <LatestCiTile/><RecoveryTile/><TriggerTile/><FindingTile/>
  </div>;
}

const runIdOf=(url?:string)=>url?.match(/\/actions\/runs\/(\d+)/)?.[1];

/** Runs this browser dispatched, polled from GitHub by run_ref. Empty until someone presses Trigger run. */
export function LiveQueue(){
  const {runs,hydrated}=useRuns();
  const active=runs.filter(r=>r.status!=='completed').length;
  return <section className="flex flex-col overflow-hidden rounded-lg border bg-card">
    <div className="border-b px-5 py-3.5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Live queue</h2>{active>0&&<span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-primary">RUNNING</span>}</div><ProvenanceBadge kind="live"/></div><p className="mt-1 text-xs text-muted-foreground">{runs.length?`${active} active · ${runs.length-active} completed this session`:'GitHub Actions runs dispatched from this browser'}</p></div>
    {hydrated&&runs.length?<ul className="flex-1 divide-y">{runs.slice(0,4).map(r=><li key={r.run_ref} className="px-5 py-3.5"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-[13px] font-medium"><span className={cn('size-1.5 rounded-full',r.status==='completed'?(r.conclusion==='success'?'bg-success':'bg-destructive'):'animate-pulse bg-primary')}/>{r.suite==='drill'?'Failure drill · deliberate failures':`Pre-auth · ${r.suite==='all'?'desktop + mobile':r.suite}`}</span>{r.status==='completed'?<ConclusionBadge conclusion={r.conclusion}/>:<RunStateBadge state={r.status}/>}</div><div className="mt-1.5 flex items-center justify-between gap-3 font-mono text-[10px] text-muted-foreground"><span>{r.run_ref} · {new Date(r.startedAt).toISOString().slice(11,16)} UTC</span><span className="flex items-center gap-3">{r.status==='completed'&&runIdOf(r.html_url)&&<Link href={`/runs/gh/${runIdOf(r.html_url)}`} className="text-primary">Report</Link>}{r.html_url&&<a href={r.html_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary">GitHub <ArrowUpRightIcon className="size-3"/></a>}</span></div></li>)}</ul>
    :<div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center"><span className="flex size-9 items-center justify-center rounded-full border bg-muted/40"><PlayIcon className="size-4 text-muted-foreground"/></span><p className="text-xs font-medium">No runs in this session yet</p><p className="max-w-56 text-[11px] leading-5 text-muted-foreground">Press <span className="font-medium text-foreground">Trigger run</span> (top right) to dispatch qa-run.yml; it appears here and is polled until GitHub reports a conclusion.</p></div>}
    <p className="border-t bg-muted/20 px-5 py-2.5 font-mono text-[10px] text-muted-foreground">Server-side dispatch · Redis lock · status by run_ref</p>
  </section>;
}

/** Final-attempt duration of every check in the imported CI report, desktop vs mobile. */
export function CheckTiming(){
  const titles=[...new Set(ciTests.map(t=>t.title))];
  const max=Math.max(...ciTests.map(t=>t.durationMs));
  const short=(t:string)=>t.split(/[;,]/)[0];
  return <section className="overflow-hidden rounded-lg border bg-card">
    <div className="border-b px-5 py-3.5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Check timing</h2><Link href={`/runs/ci-${ciReport.runId}`} className="text-xs text-primary">Open run ↗</Link></div><p className="mt-1 text-xs text-muted-foreground">Final-attempt duration per check · {CI_EVIDENCE.runRef} · {(ciReport.durationMs/1000).toFixed(1)}s wall clock</p></div>
    <div className="space-y-3.5 px-5 py-5">{titles.map(title=><div key={title} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,15rem)_1fr]"><p className="row-span-2 truncate text-[11px] text-muted-foreground" title={title}>{short(title)}</p>{ciTests.filter(t=>t.title===title).map(t=><div key={t.id} className="flex items-center gap-2"><div className="h-2 flex-1"><span className="block h-full rounded-r-sm" style={{width:t.status==='skipped'?'0':`${Math.max(1.5,t.durationMs/max*100)}%`,background:t.device==='mobile-iphone'?'var(--chart-1)':'var(--chart-5)'}}/></div><span className="w-14 text-right font-mono text-[10px] text-muted-foreground">{t.status==='skipped'?'skip':`${(t.durationMs/1000).toFixed(1)}s`}</span></div>)}</div>)}</div>
    <div className="flex items-center justify-center gap-5 border-t px-5 py-2.5 text-[10px] text-muted-foreground"><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{background:'var(--chart-5)'}}/>Desktop Chromium</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{background:'var(--chart-1)'}}/>iPhone 13 (WebKit)</span><span className="font-mono text-[9px] tracking-wider text-success">RECORDED CI</span></div>
  </section>;
}

/** Latest seeded status per scenario, grouped by product flow. Fixture + mock only. */
export function OutcomesByFlow({readiness:r}:{readiness:Readiness}){
  const rows=FLOW_ORDER.map(flow=>{const list=scenarios.filter(s=>s.flow===flow);return {flow,list,counts:(['pass','flaky','fail','skipped'] as const).map(st=>({st,n:list.filter(s=>latestStatus(s)===st).length}))};}).filter(x=>x.list.length);
  return <section className="overflow-hidden rounded-lg border bg-card">
    <div className="border-b px-5 py-3.5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Outcomes by flow</h2><span className="qa-tag">FIXTURE + MOCK</span></div><p className="mt-1 text-xs text-muted-foreground">{r.passed.total}/{scenarios.length} seeded passes · authenticated flows are mocked</p></div>
    <div className="space-y-4 px-5 py-5">{rows.map(({flow,list,counts})=><div key={flow}><div className="mb-1.5 flex justify-between text-[11px]"><span>{FLOW_LABEL[flow]}</span><span className="font-mono text-muted-foreground">{list.length} · {list[0].source==='mock'?'mock':'fixture'}</span></div><div className="flex h-2.5 gap-0.5 overflow-hidden rounded-sm">{counts.filter(c=>c.n).map(c=><span key={c.st} title={`${c.n} ${c.st}`} style={{flex:c.n,background:STATUS_COLOR[c.st]}}/>)}</div></div>)}</div>
    <div className="flex items-center justify-center gap-4 border-t px-5 py-2.5 text-[10px] text-muted-foreground">{(['pass','flaky','fail'] as const).map(st=><span key={st} className="flex items-center gap-1.5 capitalize"><span className="size-2 rounded-sm" style={{background:STATUS_COLOR[st]}}/>{st}</span>)}</div>
  </section>;
}
