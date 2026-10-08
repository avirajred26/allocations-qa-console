'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRightIcon, ChevronDownIcon, LockKeyholeIcon, SearchIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { SourceBadge, StatusBadge } from '@/components/status-badges';
import { useTriage } from '@/components/providers/triage-provider';
import { UnsavedTriageNotice } from '@/components/unsaved-triage-notice';
import { DEVICE_LABEL, FLOW_LABEL, FLOW_ORDER, OWNERS, PRIORITIES, TRIAGE_CLASSES, TICKET_PATTERN, scenarios, fixtureMeta, type Scenario, type Triage } from '@/lib/fixture';
import { latestStatus, latestPerDevice, formatUtc } from '@/lib/readiness';
import { EVIDENCE_NOTES } from '@/lib/local-evidence';

function ScenarioCard({ scenario: s }: { scenario: Scenario }) {
  const { triage, setTriage, resetTriage, dirtyIds } = useTriage();
  const [expanded, setExpanded] = useState(true);
  const t = triage[s.id];
  const current: Triage = t ?? { class: 'automation-defect', owner: 'qa', priority: 'P2', ticket: '', quarantined: false, note: '' };
  function edit(patch: Partial<Triage>) { setTriage(s.id, { ...current, ...patch }); }
  const evidence = EVIDENCE_NOTES[s.id];
  return <article id={s.id} className="qa-panel scroll-mt-20 !p-0 overflow-hidden target:border-primary/60">
    <button type="button" aria-expanded={expanded} aria-controls={`${s.id}-detail`} onClick={() => setExpanded(v => !v)} className="flex w-full flex-wrap items-center gap-3 p-5 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary"><div className="min-w-44 flex-1"><div className="mb-1.5 flex items-center gap-2 font-mono text-xs text-muted-foreground"><span>{s.id}</span>{s.blocker && <span className="text-warning">RELEASE BLOCKER</span>}{dirtyIds.includes(s.id) && <span className="text-primary">EDITED</span>}</div><h3 className="text-sm font-medium">{s.name}</h3></div><SourceBadge source={s.source} /><StatusBadge status={latestStatus(s)} /><ChevronDownIcon className={`size-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
    {s.auth_required && <p className="flex items-center gap-2 border-t border-border/50 px-5 py-2.5 text-xs text-muted-foreground"><LockKeyholeIcon className="size-3.5 shrink-0" />Authenticated flow (mock, needs a login)</p>}
    {evidence && <p className="border-t border-warning/20 bg-warning/5 px-5 py-3 text-xs leading-5 text-warning">Recorded evidence note: {evidence.text}</p>}
    {expanded && <div id={`${s.id}-detail`} className="border-t p-5"><h4 className="qa-eyebrow mb-3">Seeded scenario history</h4><div className="overflow-x-auto"><table className="qa-table"><thead><tr><th>Run reference</th><th>Device</th><th>Environment</th><th>Result</th><th>Duration</th><th>Time (UTC)</th></tr></thead><tbody>{s.history.map((h,i) => <tr key={`${h.run_ref}-${h.device}-${i}`}><td className="font-mono">{h.run_ref}</td><td>{DEVICE_LABEL[h.device]}</td><td>{h.env}</td><td><StatusBadge status={h.status} /></td><td className="font-mono">{(h.duration_ms / 1000).toFixed(1)}s</td><td className="whitespace-nowrap">{formatUtc(new Date(h.at))}</td></tr>)}</tbody></table></div>
      {s.history.find(h=>h.reason)?.reason && <p className="mt-3 text-xs text-muted-foreground">Fixture note: {s.history.find(h=>h.reason)?.reason}</p>}
      <div className="mt-6 flex items-center justify-between gap-3"><h4 className="qa-eyebrow">Local triage</h4><Button variant="ghost" size="sm" onClick={() => resetTriage(s.id)} disabled={!dirtyIds.includes(s.id)}>Reset changes</Button></div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="qa-field">Classification<select aria-label={`${s.id} classification`} className="qa-input" value={current.class} onChange={e=>edit({class:e.target.value as Triage['class']})}>{TRIAGE_CLASSES.map(v=><option key={v}>{v}</option>)}</select></label>
        <label className="qa-field">Owner<select aria-label={`${s.id} owner`} className="qa-input" value={current.owner} onChange={e=>edit({owner:e.target.value as Triage['owner']})}>{OWNERS.map(v=><option key={v}>{v}</option>)}</select></label>
        <label className="qa-field">Priority<select aria-label={`${s.id} priority`} className="qa-input" value={current.priority} onChange={e=>edit({priority:e.target.value as Triage['priority']})}>{PRIORITIES.map(v=><option key={v}>{v}</option>)}</select></label>
        <label className="qa-field">Example ticket<input aria-label={`${s.id} example ticket`} className="qa-input" placeholder="LIN-123" value={current.ticket} aria-invalid={!!current.ticket && !TICKET_PATTERN.test(current.ticket.trim())} onChange={e=>edit({ticket:e.target.value})} />{current.ticket && !TICKET_PATTERN.test(current.ticket.trim()) && <span className="text-warning">Use LIN- followed by 1–6 digits.</span>}</label>
      </div>
      <label className="qa-field mt-4">Triage note<textarea aria-label={`${s.id} triage note`} className="qa-input min-h-20 resize-y" value={current.note} onChange={e=>edit({note:e.target.value})} /></label>
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-teal-400" checked={current.quarantined} onChange={e=>edit({quarantined:e.target.checked})} />Quarantined (known unstable, not a pass)</label>
      <p className="qa-caption mt-4">Edits update readiness and Slack copy in this tab. They are not saved to a server or issue tracker and reset on reload.{!t && ' Default fields above are suggestions until edited.'}</p>
    </div>}
  </article>;
}

export default function HistoryPage() {
  const [query,setQuery]=useState(''); const [status,setStatus]=useState('all'); const [source,setSource]=useState('all');
  const [selected,setSelected]=useState<Scenario|null>(null);
  const {triage}=useTriage();
  useEffect(()=>{const sync=()=>{const id=window.location.hash.slice(1);setSelected(scenarios.find(s=>s.id===id)??null);};sync();window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);},[]);
  function closeDetail(){setSelected(null);if(window.location.hash)window.history.replaceState(null,'',window.location.pathname+window.location.search);}
  const filtered=scenarios.filter(s=>(`${s.id} ${s.name} ${FLOW_LABEL[s.flow]}`.toLowerCase().includes(query.toLowerCase()))&&(status==='all'||latestStatus(s)===status)&&(source==='all'||s.source===source));
  return <>
    <PageHeader title="Scenario library" eyebrow="TEST ASSETS" description="Every scenario with its history and triage." actions={<span className="qa-tag">FIXTURE · {fixtureMeta.generated_at.slice(0,10)}</span>}/>
    <div className="grid grid-cols-2 divide-x rounded-lg border bg-card py-4 sm:grid-cols-4">{[['Total scenarios',10],['Release blockers',scenarios.filter(s=>s.blocker).length],['Device profiles',2],['Authenticated mocks',5]].map(([label,n])=><div key={label} className="px-5"><p className="qa-caption">{label}</p><p className="mt-2 font-mono text-2xl">{n}</p></div>)}</div>
    <UnsavedTriageNotice />
    <div className="flex flex-wrap gap-3"><label className="relative min-w-48 flex-1"><SearchIcon className="absolute left-3 top-3 size-4 text-muted-foreground" /><input className="qa-input !pl-10" aria-label="Search scenarios" placeholder="Search scenario ID, name, or flow…" value={query} onChange={e=>setQuery(e.target.value)} /></label><select aria-label="Filter status" className="qa-input !w-auto" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{['pass','fail','flaky','skipped'].map(v=><option key={v}>{v}</option>)}</select><select aria-label="Filter source" className="qa-input !w-auto" value={source} onChange={e=>setSource(e.target.value)}><option value="all">All sources</option><option value="fixture-harness">Pre-auth fixtures</option><option value="mock">Authenticated mocks</option></select></div>
    <div className="overflow-x-auto rounded-lg border bg-card"><table className="qa-table min-w-[970px]"><thead><tr><th className="w-[37%]">Scenario</th><th>Status</th><th>Product flow</th><th>Device coverage</th><th>Owner / ticket</th><th>Source</th><th><span className="sr-only">Inspect</span></th></tr></thead><tbody>{filtered.map(s=><tr key={s.id}><td><button className="block text-left text-[12px] font-medium hover:text-primary" onClick={()=>setSelected(s)}>{s.name}</button><div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground"><span>{s.id}</span>{s.blocker&&<span className="text-warning">· BLOCKER</span>}{EVIDENCE_NOTES[s.id]&&<span className="text-warning">· EVIDENCE GAP</span>}</div></td><td><StatusBadge status={latestStatus(s)}/></td><td className="text-xs text-muted-foreground">{FLOW_LABEL[s.flow]}</td><td><div className="space-y-1">{latestPerDevice(s).map(h=><p key={h.device} className="whitespace-nowrap text-[11px] text-muted-foreground">{DEVICE_LABEL[h.device]}</p>)}</div></td><td><p className="text-xs capitalize">{triage[s.id]?.owner??'Unassigned'}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{triage[s.id]?.ticket||'—'}</p></td><td><div className="flex items-center gap-1.5">{s.auth_required&&<LockKeyholeIcon className="size-3 text-muted-foreground" aria-label="Requires credentials"/>}<SourceBadge source={s.source}/></div></td><td><button aria-label={`Inspect ${s.id}`} onClick={()=>setSelected(s)} className="p-1 text-muted-foreground hover:text-primary"><ArrowUpRightIcon className="size-4"/></button></td></tr>)}</tbody></table>{!filtered.length&&<div className="p-12 text-center"><p className="text-sm text-muted-foreground">No matching scenarios.</p><Button className="mt-3" variant="outline" onClick={()=>{setQuery('');setStatus('all');setSource('all');}}>Reset filters</Button></div>}<div className="flex justify-between gap-4 border-t bg-muted/20 px-4 py-3 text-[10px] text-muted-foreground"><span>Seeded data · not imported results. Authenticated flows and tickets are examples.</span><span className="shrink-0" aria-live="polite">{filtered.length} / {scenarios.length} scenarios</span></div></div>
    <Dialog open={!!selected} onOpenChange={open=>{if(!open)closeDetail();}}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogTitle>Scenario investigation</DialogTitle><DialogDescription>Inspect sample evidence and edit triage locally.</DialogDescription>{selected&&<ScenarioCard key={selected.id} scenario={selected}/>}</DialogContent></Dialog>
  </>;
}
