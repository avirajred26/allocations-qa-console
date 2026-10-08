'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ActivityIcon, ArrowUpRightIcon, ChevronDownIcon, CircleCheckIcon, ClipboardCheckIcon, FlaskConicalIcon, LayersIcon, ShieldCheckIcon } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { REPO_URL, scenarios } from '@/lib/fixture';
import { useTriage } from '@/components/providers/triage-provider';
import { useRuns } from '@/components/providers/runs-provider';

export function AppSidebar(){
  const path=usePathname(); const pathname=path.startsWith('/runs/')?'/runs':path; const {setOpenMobile}=useSidebar();
  const {readiness}=useTriage(); const {runs}=useRuns();
  const groups=[
    {label:'Monitor',items:[{href:'/',label:'Release readiness',icon:CircleCheckIcon,count:readiness.blockerFailures.length},{href:'/runs',label:'Runs',icon:ActivityIcon,count:runs.filter(r=>r.status!=='completed'&&r.status!=='unresolved').length}]},
    {label:'Test assets',items:[{href:'/history',label:'Scenario library',icon:LayersIcon,count:scenarios.length}]},
    {label:'Engineering',items:[{href:'/process',label:'QA/QC process',icon:ClipboardCheckIcon,count:null},{href:'/harness',label:'Harness & coverage',icon:FlaskConicalIcon,count:null}]},
  ];
  return <Sidebar collapsible="offcanvas">
    <SidebarHeader className="h-16 justify-center border-b px-5"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"><ShieldCheckIcon className="size-5"/></span><div><p className="text-sm font-semibold tracking-tight">Allocations <span className="font-normal text-muted-foreground">QA</span></p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">RELEASE WORKSPACE</p></div></div></SidebarHeader>
    <SidebarContent className="gap-3 px-2 pt-4">{groups.map(g=><SidebarGroup key={g.label}><SidebarGroupLabel className="mb-2 h-auto px-3 text-[9px] uppercase tracking-[.15em]">{g.label}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{g.items.map(item=><SidebarMenuItem key={item.href}><SidebarMenuButton className="h-9 px-3 text-[13px]" isActive={pathname===item.href} render={<Link href={item.href} aria-current={pathname===item.href?'page':undefined} onClick={()=>setOpenMobile(false)}/> }><item.icon className="size-4"/><span>{item.label}</span>{item.count!==null&&item.count>0&&<span className="ml-auto font-mono text-[10px] text-muted-foreground">{item.count}</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup>)}</SidebarContent>
    <SidebarFooter className="gap-4 p-4"><div className="-mx-4 flex items-center gap-3 border-t px-5 pt-4"><span className="flex size-8 items-center justify-center rounded-full border bg-card text-xs font-medium">AL</span><div><p className="text-xs font-medium">Aviraj Lall</p><p className="mt-0.5 text-[10px] text-muted-foreground">Lead QA · assignment demo</p></div><ChevronDownIcon className="ml-auto size-3 text-muted-foreground" aria-hidden/></div></SidebarFooter>
  </Sidebar>;
}
