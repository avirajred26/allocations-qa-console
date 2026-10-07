'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchIcon, ArrowUpRightIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { scenarios } from '@/lib/fixture';

export function QuickSearch(){
  const [open,setOpen]=useState(false);const [query,setQuery]=useState('');const router=useRouter();
  useEffect(()=>{const listener=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();setOpen(o=>!o);}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[]);
  const entries=[{label:'Release readiness',href:'/',detail:'Release gate and triage'},{label:'Runs',href:'/runs',detail:'Recorded and sample execution records'},{label:'Harness & coverage',href:'/harness',detail:'Safety boundaries and connections'},...scenarios.map(s=>({label:`${s.id} · ${s.name}`,href:`/history#${s.id}`,detail:s.source==='mock'?'Authenticated mock':'Pre-auth fixture'}))].filter(e=>`${e.label} ${e.detail}`.toLowerCase().includes(query.toLowerCase()));
  return <><button className="hidden h-8 w-52 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border bg-card px-2.5 text-xs text-muted-foreground transition hover:border-primary/40 lg:flex" onClick={()=>setOpen(true)}><SearchIcon className="size-3.5"/>Search workspace<kbd className="ml-auto rounded border px-1 text-[10px]">⌘ K</kbd></button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-xl"><DialogTitle>Search workspace</DialogTitle><DialogDescription className="sr-only">Navigate to a page or scenario.</DialogDescription><input aria-label="Search workspace" autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a scenario, run page, or configuration…" className="qa-input"/><div className="max-h-80 overflow-y-auto">{entries.map(e=><button key={e.href} onClick={()=>{setOpen(false);setQuery('');router.push(e.href);}} className="flex w-full items-center gap-3 rounded-md p-3 text-left hover:bg-muted"><div className="min-w-0 flex-1"><p className="truncate text-sm">{e.label}</p><p className="mt-1 text-xs text-muted-foreground">{e.detail}</p></div><ArrowUpRightIcon className="size-3.5 text-muted-foreground"/></button>)}{!entries.length&&<p className="p-6 text-center text-sm text-muted-foreground">No matching pages or scenarios.</p>}</div></DialogContent></Dialog></>;
}
