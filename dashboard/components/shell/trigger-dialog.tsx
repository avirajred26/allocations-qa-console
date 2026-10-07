'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { AlertCircleIcon, PlayIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useRuns } from '@/components/providers/runs-provider';
import { QUOTA_KEY, type QuotaData, type TriggerBlock } from '@/hooks/use-quota';
import { RUN_REF_PATTERN, type Suite } from '@/lib/run-types';

const SUITE_OPTIONS: { value: Suite; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
];

const FALLBACK: Record<number, string> = {
  400: 'Invalid request.',
  401: 'Demo key rejected.',
  429: 'Trigger limit reached. Try again later.',
};

/** Only the server's fixed, short `message` is shown — never a raw body. */
function serverMessage(status: number, body: unknown): string {
  const msg = (body as { message?: unknown } | null)?.message;
  if (status === 401) return 'Demo key rejected.';
  if (typeof msg === 'string' && msg.length > 0 && msg.length <= 160) return msg;
  return FALLBACK[status] ?? 'Could not start the run. Please try again shortly.';
}

export function TriggerDialog({
  open,
  onOpenChange,
  block,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block: TriggerBlock;
}) {
  const { addRun } = useRuns();
  const { mutate } = useSWRConfig();
  const [suite, setSuite] = useState<Suite>('all');
  // The demo key lives only in this component's memory and is cleared on submit and on close.
  const [demoKey, setDemoKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setDemoKey('');
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || block || !demoKey) return;
    const key = demoKey;
    setDemoKey('');
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demoKey: key, suite }),
        cache: 'no-store',
      });
      const body: unknown = await res.json().catch(() => null);

      if (res.status === 202) {
        const b = body as { run_ref?: unknown; dispatch?: unknown; suite?: unknown } | null;
        const runRef = typeof b?.run_ref === 'string' && RUN_REF_PATTERN.test(b.run_ref) ? b.run_ref : null;
        const dispatch = b?.dispatch === 'accepted' || b?.dispatch === 'uncertain' ? b.dispatch : null;
        if (!runRef || !dispatch) {
          setError('The server accepted the request but returned an unexpected response. Check the Runs page and GitHub before retrying.');
          void mutate(QUOTA_KEY);
          return;
        }
        addRun({ run_ref: runRef, suite, dispatch });
        void mutate(QUOTA_KEY);
        handleOpenChange(false);
        return;
      }

      const message = serverMessage(res.status, body);
      setError(message);

      if (res.status === 429) {
        const retryAfter = (body as { retryAfter?: unknown } | null)?.retryAfter;
        if (typeof retryAfter === 'number' && retryAfter > 0) {
          void mutate(
            QUOTA_KEY,
            (current?: QuotaData) => (current ? { ...current, cooldownRemaining: retryAfter, observedAt: Date.now() } : current),
            { revalidate: false },
          );
        } else {
          void mutate(QUOTA_KEY);
        }
      }
      if (res.status >= 500) toast.error(message);
    } catch {
      setError('Network error — the request may not have reached the server. Check the Runs page and quota before retrying.');
      void mutate(QUOTA_KEY);
    } finally {
      setSubmitting(false);
    }
  }

  const blocked = block !== null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Trigger a harness run</DialogTitle>
            <DialogDescription>
              Dispatches the fixed GitHub Actions workflow against the public pre-auth surface. Each attempt that
              reaches GitHub consumes daily quota, even if confirmation is uncertain.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs"><div className="flex justify-between gap-3"><span className="text-muted-foreground">Target</span><span>dashboard.allocations.com</span></div><div className="mt-2 flex justify-between gap-3"><span className="text-muted-foreground">Workflow</span><span className="font-mono">qa-run.yml · main</span></div></div>
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">Suite</FieldLegend>
              <ToggleGroup
                variant="outline"
                value={[suite]}
                onValueChange={(v: string[]) => {
                  const next = v[0] as Suite | undefined;
                  if (next) setSuite(next);
                }}
                aria-label="Suite"
              >
                {SUITE_OPTIONS.map((o) => (
                  <ToggleGroupItem key={o.value} value={o.value} disabled={submitting}>
                    {o.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </FieldSet>

            <Field data-invalid={error === 'Demo key rejected.' || undefined}>
              <FieldLabel htmlFor="demo-key">Demo key</FieldLabel>
              <Input
                id="demo-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                value={demoKey}
                onChange={(e) => setDemoKey(e.target.value)}
                disabled={submitting || blocked}
                aria-invalid={error === 'Demo key rejected.' || undefined}
                required
              />
              <FieldDescription>Held in memory only. Cleared when you submit or close this dialog.</FieldDescription>
            </Field>
          </FieldGroup>

          {error && (
            <Alert variant="destructive" aria-live="assertive">
              <AlertCircleIcon />
              <AlertTitle>Run not started</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {blocked && !error && (
            <Alert>
              <AlertCircleIcon />
              <AlertTitle>Triggering disabled</AlertTitle>
              <AlertDescription>{blockText(block)}{block?.kind==='unavailable'&&<Link href="/harness#connections" onClick={()=>handleOpenChange(false)} className="mt-2 block text-primary underline">Review runner setup →</Link>}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
            <Button type="submit" disabled={submitting || blocked || demoKey.length === 0}>
              {submitting ? <Spinner data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
              {submitting ? 'Starting…' : 'Start'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function blockText(block: TriggerBlock): string {
  switch (block?.kind) {
    case 'loading':
      return 'Reading quota…';
    case 'unavailable':
      return 'Quota cannot be read (Redis integration unavailable or misconfigured). Triggering stays disabled until quota is readable.';
    case 'daily-limit':
      return 'Daily trigger limit reached. Resets at 00:00 UTC.';
    case 'cooldown':
      return `Cooldown active — try again in ${block.seconds}s.`;
    default:
      return '';
  }
}
