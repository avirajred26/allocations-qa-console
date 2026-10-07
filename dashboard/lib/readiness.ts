import {
  RELEASE_TRAIN,
  TICKET_PATTERN,
  type Device,
  type HistoryEntry,
  type Scenario,
  type ScenarioStatus,
  type Triage,
} from '@/lib/fixture';
import { CI_EVIDENCE, EVIDENCE_NOTES, LOCAL_EVIDENCE } from '@/lib/local-evidence';
import type { SessionRun } from '@/lib/run-types';

export type TriageMap = Record<string, Triage | undefined>;
export type Verdict = 'GO' | 'CONDITIONAL GO' | 'NO-GO';

const SEVERITY: Record<ScenarioStatus, number> = { fail: 3, flaky: 2, skipped: 1, pass: 0 };

function byTimeDesc(a: HistoryEntry, b: HistoryEntry) {
  return Date.parse(b.at) - Date.parse(a.at);
}

/** Most recent entry per device, newest first. */
export function latestPerDevice(s: Scenario): HistoryEntry[] {
  const seen = new Map<Device, HistoryEntry>();
  for (const e of [...s.history].sort(byTimeDesc)) {
    if (!seen.has(e.device)) seen.set(e.device, e);
  }
  return [...seen.values()];
}

/** Latest status across devices; the worst one wins so a device-specific failure is never hidden. */
export function latestStatus(s: Scenario): ScenarioStatus {
  return latestPerDevice(s).reduce<ScenarioStatus>(
    (worst, e) => (SEVERITY[e.status] > SEVERITY[worst] ? e.status : worst),
    'pass',
  );
}

export function latestEntry(s: Scenario): HistoryEntry {
  return [...s.history].sort(byTimeDesc)[0];
}

export function fixtureTriage(s: Scenario): Triage | undefined {
  return [...s.history].sort(byTimeDesc).find((e) => e.triage)?.triage;
}

export function initialTriageMap(list: readonly Scenario[]): TriageMap {
  return Object.fromEntries(list.map((s) => [s.id, fixtureTriage(s)]));
}

export function validTicket(t: Triage | undefined): string | undefined {
  const ticket = t?.ticket.trim();
  return ticket && TICKET_PATTERN.test(ticket) ? ticket : undefined;
}

/** Same-device previous run, used for "what changed". Concurrent runs on other devices are not "previous". */
export interface StatusChange {
  scenario: Scenario;
  device: Device;
  from: ScenarioStatus;
  to: ScenarioStatus;
}

export function statusChanges(list: readonly Scenario[]): StatusChange[] {
  const out: StatusChange[] = [];
  for (const s of list) {
    const byDevice = new Map<Device, HistoryEntry[]>();
    for (const e of s.history) byDevice.set(e.device, [...(byDevice.get(e.device) ?? []), e]);
    for (const [device, entries] of byDevice) {
      const [latest, prior] = entries.sort(byTimeDesc);
      if (prior && prior.status !== latest.status) out.push({ scenario: s, device, from: prior.status, to: latest.status });
    }
  }
  return out;
}

export interface RetestProgress {
  baseline: number;
  recovered: number;
  /** null when there is no previously failed baseline — shown as N/A, never 0% or 100%. */
  pct: number | null;
}

export function retestProgress(list: readonly Scenario[]): RetestProgress {
  let baseline = 0;
  let recovered = 0;
  for (const s of list) {
    const [latest, ...earlier] = [...s.history].sort(byTimeDesc);
    const latestTime = Date.parse(latest.at);
    const previouslyFailed = earlier.some((e) => Date.parse(e.at) < latestTime && e.status === 'fail');
    if (!previouslyFailed) continue;
    baseline++;
    if (latestStatus(s) === 'pass') recovered++;
  }
  return { baseline, recovered, pct: baseline === 0 ? null : Math.round((recovered / baseline) * 100) };
}

export function computeVerdict(list: readonly Scenario[], triage: TriageMap): Verdict {
  const blockers = list.filter((s) => s.blocker);
  if (blockers.some((s) => latestStatus(s) === 'fail')) return 'NO-GO';
  if (blockers.some((s) => latestStatus(s) === 'flaky' || triage[s.id]?.quarantined)) return 'CONDITIONAL GO';
  return 'GO';
}

export interface Readiness {
  verdict: Verdict;
  blockerFailures: Scenario[];
  conditionalBlockers: Scenario[];
  openDefects: { scenario: Scenario; ticket: string }[];
  retest: RetestProgress;
  changes: StatusChange[];
  passed: { total: number; fixture: number; mock: number };
  /** Fixture passes contradicted by separate recorded evidence; never merge the datasets. */
  contradicted: Scenario[];
}

export function computeReadiness(list: readonly Scenario[], triage: TriageMap): Readiness {
  const isContradicted = (s: Scenario) => EVIDENCE_NOTES[s.id]?.tone === 'danger';
  const passedList = list.filter((s) => latestStatus(s) === 'pass');
  return {
    verdict: computeVerdict(list, triage),
    blockerFailures: list.filter((s) => s.blocker && latestStatus(s) === 'fail'),
    conditionalBlockers: list.filter(
      (s) => s.blocker && latestStatus(s) !== 'fail' && (latestStatus(s) === 'flaky' || triage[s.id]?.quarantined),
    ),
    openDefects: list.flatMap((s) => {
      const ticket = validTicket(triage[s.id]);
      return ticket ? [{ scenario: s, ticket }] : [];
    }),
    retest: retestProgress(list),
    changes: statusChanges(list),
    passed: {
      total: passedList.length,
      fixture: passedList.filter((s) => s.source === 'fixture-harness').length,
      mock: passedList.filter((s) => s.source === 'mock').length,
    },
    contradicted: list.filter((s) => latestStatus(s) === 'pass' && isContradicted(s)),
  };
}

/** Rows for the release-risks table: anything not passing, or anything carrying triage. */
export function riskRows(list: readonly Scenario[], triage: TriageMap) {
  return list
    .filter((s) => latestStatus(s) !== 'pass' || triage[s.id] || EVIDENCE_NOTES[s.id])
    .map((s) => ({ scenario: s, status: latestStatus(s), triage: triage[s.id] }));
}

export function sourceTag(s: Scenario) {
  return s.source === 'mock' ? 'mock' : 'fixture';
}

export interface ObservedRuns {
  observed: number;
  green: number;
}

/** Only runs this browser session actually found on GitHub and saw complete. */
export function observedRuns(runs: readonly SessionRun[]): ObservedRuns {
  const completed = runs.filter((r) => r.found && r.status === 'completed');
  return { observed: completed.length, green: completed.filter((r) => r.conclusion === 'success').length };
}

export function formatUtc(date: Date) {
  return `${date.toISOString().slice(0, 16).replace('T', ' ')}`;
}

export function buildSlackUpdate(args: {
  readiness: Readiness;
  triage: TriageMap;
  runs: ObservedRuns;
  consoleUrl: string;
  now: Date;
}): string {
  const { readiness: r, runs, consoleUrl, now } = args;

  const inReview = r.openDefects.length
    ? r.openDefects
        .map(({ scenario, ticket }) => `${ticket} (example ticket, ${sourceTag(scenario)}) — ${scenario.id} ${scenario.name}`)
        .join('; ')
    : 'none';

  const inProgress =
    r.retest.pct === null
      ? 'retest N/A (no previously failed baseline)'
      : `retest ${r.retest.pct}% done (${r.retest.recovered}/${r.retest.baseline})`;

  const blockerActions = [
    ...r.blockerFailures.map((s) => {
      const ticket = validTicket(args.triage[s.id]);
      return ticket
        ? `${s.id} (${sourceTag(s)}) failing — ${ticket} (example ticket) fix needs merge and retest before prod push`
        : `${s.id} (${sourceTag(s)}) failing — needs a triage ticket and owner before prod push`;
    }),
    ...r.conditionalBlockers.map((s) => {
      const ticket = validTicket(args.triage[s.id]);
      const state = args.triage[s.id]?.quarantined ? 'quarantined' : latestStatus(s);
      return `${s.id} (${sourceTag(s)}) ${state} — ${ticket ? `${ticket} (example ticket)` : 'untracked'} must be stabilised before removing quarantine`;
    }),
    `Recorded local harness run ${LOCAL_EVIDENCE.isoDate}: ${LOCAL_EVIDENCE.passed} passed, ${LOCAL_EVIDENCE.failed} failed, ${LOCAL_EVIDENCE.skipped} skipped (by-design mobile-only skip on desktop). Finding PRE-002: sign-in validation message not ARIA-linked to the input — raise with frontend as P3. Latest CI run ${CI_EVIDENCE.runRef} (GitHub Actions): ${CI_EVIDENCE.passed} passed, ${CI_EVIDENCE.failed} failed, ${CI_EVIDENCE.skipped} skipped — ${CI_EVIDENCE.url}`,
  ];

  return [
    `*QA status — Release ${RELEASE_TRAIN} · ${formatUtc(now)} UTC*`,
    `*Verdict:* ${r.verdict} (fixture verdict — computed from fixture + mock scenarios; not a production release assessment)`,
    `*Completed:* ${r.passed.total} scenarios passed (${r.passed.fixture} fixture, ${r.passed.mock} mock — seeded, not observed) · live workflow runs observed this session: ${runs.observed} (${runs.green} green)${
      r.contradicted.length ? ` · caution: ${r.contradicted.map((s) => s.id).join(', ')} fixture pass is not supported by recorded local evidence` : ''
    }`,
    `*In-Review:* ${inReview}`,
    `*In-Progress:* ${inProgress}`,
    `*Blockers:* ${blockerActions.join('; ')}`,
    `Evidence: ${consoleUrl}`,
  ].join('\n');
}
