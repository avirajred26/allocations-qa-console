'use client';
import Link from 'next/link';
import { PlugZapIcon, RefreshCwIcon } from 'lucide-react';
import { useQuota } from '@/hooks/use-quota';
import { Button } from '@/components/ui/button';

export function ConnectionNotice() {
  const { data, error, isLoading, mutate } = useQuota();
  if (data && !error) return <div className="qa-panel flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-medium">Trigger quota connected</p><p className="qa-caption">{data.used} of {data.limit} runs used today. Demo key required to dispatch.</p></div><Button variant="outline" onClick={() => void mutate()} disabled={isLoading}><RefreshCwIcon /> Refresh quota</Button></div>;
  return <div className="flex flex-wrap items-start gap-4 rounded-xl border border-warning/25 bg-warning/5 p-5"><PlugZapIcon className="mt-0.5 size-5 shrink-0 text-warning" /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Live triggering is not connected</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">The preview works with labelled sample data. Quota could not be read, so dispatch is disabled. <Link href="/harness#connections" className="text-primary hover:underline">Review configuration</Link>.</p></div><Button variant="outline" onClick={() => void mutate()} disabled={isLoading}><RefreshCwIcon /> Retry connection</Button></div>;
}
