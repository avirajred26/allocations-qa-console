import { LockIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ScenarioSource, ScenarioStatus } from '@/lib/fixture';
import type { RunConclusion, SessionRunState } from '@/lib/run-types';
import { cn } from '@/lib/utils';

const TONE = {
  success: 'bg-success/15 text-success',
  danger: 'bg-destructive/15 text-destructive',
  warning: 'bg-warning/15 text-warning',
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-primary/15 text-primary',
} as const;

const STATUS_TONE: Record<ScenarioStatus, keyof typeof TONE> = {
  pass: 'success',
  fail: 'danger',
  flaky: 'warning',
  skipped: 'neutral',
};

export function StatusBadge({ status, className }: { status: ScenarioStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('border-transparent font-mono uppercase', TONE[STATUS_TONE[status]], className)}>
      {status}
    </Badge>
  );
}

type Provenance = 'live' | 'fixture' | 'mock' | 'recorded';

const PROVENANCE: Record<Provenance, { label: string; title: string; className: string }> = {
  live: {
    label: 'LIVE',
    title: 'Workflow-level status read from GitHub via /api/runs. Never per-scenario.',
    className: 'border-primary/40 text-primary',
  },
  fixture: {
    label: 'FIXTURE',
    title: 'Seeded data mirroring the real pre-auth checks. Not imported results.',
    className: 'border-warning/40 text-warning',
  },
  mock: {
    label: 'MOCK',
    title: 'Authenticated product flow that cannot run without Allocations credentials. Example data.',
    className: 'border-border text-muted-foreground',
  },
  recorded: {
    label: 'RECORDED LOCAL',
    title: 'Totals recorded from a local harness run. No per-scenario breakdown.',
    className: 'border-chart-5 text-foreground',
  },
};

export function ProvenanceBadge({ kind, className }: { kind: Provenance; className?: string }) {
  const p = PROVENANCE[kind];
  return (
    <Badge variant="outline" title={p.title} className={cn('font-mono text-[10px] tracking-wider', p.className, className)}>
      {p.label}
    </Badge>
  );
}

export function SourceBadge({ source }: { source: ScenarioSource }) {
  return <ProvenanceBadge kind={source === 'mock' ? 'mock' : 'fixture'} />;
}

export function AuthLock() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
          />
        }
      >
        <LockIcon aria-hidden className="size-3.5" />
        <span className="sr-only">Logged-in flow. Mock data, needs an Allocations login</span>
      </TooltipTrigger>
      <TooltipContent>Logged-in flow. Mock data, needs an Allocations login</TooltipContent>
    </Tooltip>
  );
}

const RUN_STATE: Record<SessionRunState, { label: string; tone: keyof typeof TONE }> = {
  confirming: { label: 'confirming', tone: 'info' },
  queued: { label: 'queued', tone: 'neutral' },
  in_progress: { label: 'in progress', tone: 'info' },
  completed: { label: 'completed', tone: 'neutral' },
  unresolved: { label: 'unresolved', tone: 'warning' },
};

export function RunStateBadge({ state }: { state: SessionRunState }) {
  const s = RUN_STATE[state];
  return (
    <Badge variant="outline" className={cn('border-transparent font-mono', TONE[s.tone])}>
      {s.label}
    </Badge>
  );
}

export function ConclusionBadge({ conclusion }: { conclusion: RunConclusion }) {
  if (!conclusion) return <span className="text-muted-foreground">—</span>;
  const tone: keyof typeof TONE =
    conclusion === 'success' ? 'success' : conclusion === 'failure' || conclusion === 'timed_out' ? 'danger' : 'neutral';
  return (
    <Badge variant="outline" className={cn('border-transparent font-mono', TONE[tone])}>
      {conclusion.replace('_', ' ')}
    </Badge>
  );
}
