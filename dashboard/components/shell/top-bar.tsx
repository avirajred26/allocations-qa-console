'use client';

import { useEffect, useState } from 'react';
import { CircleSlashIcon, MoonIcon, SunIcon, PlayIcon, TimerIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { QuickSearch } from '@/components/shell/quick-search';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TriggerDialog, blockText } from '@/components/shell/trigger-dialog';
import { triggerBlock, useCooldownSeconds, useQuota } from '@/hooks/use-quota';
import { RELEASE_TRAIN } from '@/lib/fixture';

function QuotaIndicator() {
  const { data, error, isLoading } = useQuota();
  const cooldown = useCooldownSeconds(data);

  if (isLoading && !data) return <Skeleton className="h-5 w-24" />;
  if (error || !data) {
    return (
      <Badge variant="outline" className="gap-1 border-warning/20 bg-warning/5 text-warning">
        <CircleSlashIcon aria-hidden />
        <span className="hidden sm:inline">Trigger offline</span>
        <span className="sm:hidden">Offline</span>
      </Badge>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <span className="font-mono">
        <span className="hidden sm:inline">Runs today: </span>
        {data.used}/{data.limit}
      </span>
      {cooldown > 0 && (
        <Badge variant="outline" className="gap-1 font-mono text-warning">
          <TimerIcon aria-hidden />
          {cooldown}s
        </Badge>
      )}
    </div>
  );
}

function TriggerButton() {
  const [open, setOpen] = useState(false);
  const { data, error, isLoading } = useQuota();
  const cooldown = useCooldownSeconds(data);
  const block = triggerBlock(data, error, isLoading, cooldown);

  const button = (
    <Button size="sm" onClick={() => setOpen(true)}>
      <PlayIcon data-icon="inline-start" />
      <span>Trigger run</span>
    </Button>
  );

  return (
    <>
      {block ? (
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0} className="rounded-md focus-visible:outline-2 focus-visible:outline-ring" />}>
            {button}
          </TooltipTrigger>
          <TooltipContent>{blockText(block)}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <TriggerDialog open={open} onOpenChange={setOpen} block={block} />
    </>
  );
}

export function TopBar() {
  const pathname=usePathname();
  const [dark,setDark]=useState(false);
  const title=pathname.startsWith('/runs/gh/')?'Run report':pathname.startsWith('/runs/')?'Run investigation':({'/':'Release readiness','/runs':'Runs','/history':'Scenario library','/harness':'Harness & coverage','/process':'QA/QC process'} as Record<string,string>)[pathname]??'Workspace';
  useEffect(()=>{
    try {
      const saved=localStorage.getItem('allocations-qa:theme');
      const isDark=saved==='dark';
      document.documentElement.classList.toggle('dark',isDark);
      setDark(isDark);
    } catch { /* Storage can be unavailable; light mode remains usable. */ }
  },[]);
  function toggleTheme(){
    const next=!dark;
    setDark(next);
    document.documentElement.classList.toggle('dark',next);
    try { localStorage.setItem('allocations-qa:theme',next?'dark':'light'); } catch { /* In-memory theme still works. */ }
  }
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur md:px-6">
      <SidebarTrigger aria-label="Toggle navigation" />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link href="/" className="hidden text-xs text-muted-foreground sm:block">Workspace</Link><span className="hidden text-xs text-muted-foreground/50 sm:block">/</span><span className="truncate text-xs font-medium">{title}</span>
      </div>
      <QuotaIndicator />
      <QuickSearch />
      <Button size="icon-sm" variant="ghost" aria-label={dark?'Switch to light theme':'Switch to dark theme'} title={dark?'Switch to light theme':'Switch to dark theme'} onClick={toggleTheme}>{dark?<SunIcon/>:<MoonIcon/>}</Button>
      <TriggerButton />
    </header>
  );
}
