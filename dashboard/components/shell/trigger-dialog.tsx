'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { AlertCircleIcon, KeyRoundIcon, PlayIcon } from 'lucide-react';
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
import { RUN_REF_PATTERN, type Scope, type Suite, type Workflow } from '@/lib/run-types';
import { ENVIRONMENTS } from '@/lib/environments';

const SUITE_OPTIONS: { value: Suite; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'drill', label: 'Failure drill' },
];

const WORKFLOW_OPTIONS: { value: Workflow; label: string; hint: string }[] = [
  { value: 'qa-run.yml', label: 'qa-run.yml', hint: 'Manual run: pick the suite and scope below.' },
  { value: 'qa-regression.yml', label: 'qa-regression.yml', hint: 'Entire suite, every spec old and new, desktop + iPhone, each check 3×. Takes a few minutes.' },
];

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: 'full', label: 'UI + API' },
  { value: 'api', label: 'API only' },
  { value: 'ui', label: 'UI only' },
];

type Session = { keyRequired?: boolean; active: boolean; expiresAt: number | null };
const SESSION_KEY = '/api/session';
const getSession = async (url: string): Promise<Session> => {
  const res = await fetch(url, { cache: 'no-store' });
  return res.ok ? res.json() : { keyRequired: false, active: false, expiresAt: null };
};

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
  const [environment, setEnvironment] = useState('prod');
  const [workflow, setWorkflow] = useState<Workflow>('qa-run.yml');
  const envInfo = ENVIRONMENTS.find((e) => e.id === environment);
  const [suite, setSuite] = useState<Suite>('all');
  const [scope, setScope] = useState<Scope>('full');
  const [remember, setRemember] = useState(true);
  // HttpOnly session cookie set by /api/trigger after one valid key; the key itself is never stored.
  const { data: session } = useSWR<Session>(open ? SESSION_KEY : null, getSession, { revalidateOnFocus: false });
  const remembered = !!session?.active;
  // Open mode (default): no key; the server's rate limits are the guard.
  const needsKey = session?.keyRequired === true;
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
    if (submitting || block || (needsKey && !demoKey && !remembered)) return;
    const key = demoKey;
    setDemoKey('');
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demoKey: key || undefined, remember, environment, workflow, suite: workflow === 'qa-run.yml' ? suite : 'all', scope: workflow === 'qa-run.yml' && suite !== 'drill' ? scope : 'full' }),
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
        addRun({ run_ref: runRef, suite: workflow === 'qa-run.yml' ? suite : 'all', dispatch, workflow, environment, scope: workflow === 'qa-run.yml' && suite !== 'drill' ? scope : 'full' });
        void mutate(QUOTA_KEY);
        void mutate(SESSION_KEY);
        handleOpenChange(false);
        return;
      }

      const message = res.status === 401 && !key ? 'The remembered session has expired. Enter the demo key again.' : serverMessage(res.status, body);
      setError(message);
      if (res.status === 401) void mutate(SESSION_KEY);

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

  async function forget() {
    await fetch(SESSION_KEY, { method: 'DELETE', cache: 'no-store' }).catch(() => undefined);
    void mutate(SESSION_KEY, { active: false, expiresAt: null }, { revalidate: false });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Trigger a harness run</DialogTitle>
            <DialogDescription>
              Assignment demo · runs the public pre-auth checks for dashboard.allocations.com in GitHub Actions.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs"><div className="flex justify-between gap-3"><span className="text-muted-foreground">Target</span><span>{envInfo?.baseUrl?.replace(/^https?:\/\//, '') ?? '—'}</span></div><div className="mt-2 flex justify-between gap-3"><span className="text-muted-foreground">Workflow</span><span className="font-mono">{workflow} · main</span></div></div>
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">Environment</FieldLegend>
              <ToggleGroup
                variant="outline"
                value={[environment]}
                onValueChange={(v: string[]) => {
                  if (v[0]) setEnvironment(v[0]);
                }}
                aria-label="Environment"
              >
                {ENVIRONMENTS.map((e) => (
                  <ToggleGroupItem key={e.id} value={e.id} disabled={submitting || !e.baseUrl} title={e.baseUrl ?? e.notes}>
                    {e.label}{!e.baseUrl ? <span className="ml-1 text-[10px] text-muted-foreground">· no URL</span> : e.aliasOf ? <span className="ml-1 text-[10px] text-muted-foreground">· demo</span> : null}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">Workflow</FieldLegend>
              <ToggleGroup
                variant="outline"
                value={[workflow]}
                onValueChange={(v: string[]) => {
                  const next = v[0] as Workflow | undefined;
                  if (next) setWorkflow(next);
                }}
                aria-label="Workflow"
              >
                {WORKFLOW_OPTIONS.map((o) => (
                  <ToggleGroupItem key={o.value} value={o.value} disabled={submitting} className="font-mono text-xs">
                    {o.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </FieldSet>

            {workflow === 'qa-run.yml' && (
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
            )}

            {workflow === 'qa-run.yml' && suite !== 'drill' && (
              <FieldSet>
                <FieldLegend variant="label">Scope</FieldLegend>
                <ToggleGroup
                  variant="outline"
                  value={[scope]}
                  onValueChange={(v: string[]) => {
                    const next = v[0] as Scope | undefined;
                    if (next) setScope(next);
                  }}
                  aria-label="Scope"
                >
                  {SCOPE_OPTIONS.map((o) => (
                    <ToggleGroupItem key={o.value} value={o.value} disabled={submitting}>
                      {o.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldSet>
            )}

            {!needsKey ? null : remembered ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-success/25 bg-success/5 px-3 py-2.5 text-xs">
                <span className="flex items-center gap-2"><KeyRoundIcon className="size-3.5 text-success" aria-hidden />Demo key remembered on this browser until {new Date(session!.expiresAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <button type="button" onClick={forget} className="text-primary underline-offset-2 hover:underline">Forget</button>
              </div>
            ) : (
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
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-3.5 accent-[var(--primary)]" />
                  Remember this browser for 8 hours
                </label>
                <FieldDescription>The key is held in memory and cleared on submit. Remembering sets a signed, HttpOnly cookie; the key itself is never stored.</FieldDescription>
              </Field>
            )}
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
            <Button type="submit" disabled={submitting || blocked || (needsKey && demoKey.length === 0 && !remembered)}>
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
