import fixtureJson from '@/fixtures/scenario-history.json';

export type ScenarioStatus = 'pass' | 'fail' | 'flaky' | 'skipped';
export type ScenarioSource = 'fixture-harness' | 'mock';
export type Device = 'desktop-chromium' | 'mobile-iphone';
export type Flow = 'pre-auth' | 'spv-formation' | 'investor-onboarding' | 'capital-calls' | 'distributions';
export type TriageClass = 'product-defect' | 'automation-defect' | 'environment' | 'flaky';
export type Owner = 'frontend' | 'backend' | 'qa' | 'infra';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export interface Triage {
  class: TriageClass;
  owner: Owner;
  priority: Priority;
  ticket: string;
  quarantined: boolean;
  note: string;
}

export interface HistoryEntry {
  run_ref: string;
  status: ScenarioStatus;
  duration_ms: number;
  env: string;
  device: Device;
  at: string;
  reason?: string;
  triage?: Triage;
}

export interface Scenario {
  id: string;
  name: string;
  flow: Flow;
  auth_required: boolean;
  source: ScenarioSource;
  blocker: boolean;
  history: HistoryEntry[];
}

interface FixtureFile {
  _meta: { kind: string; label: string; generated_at: string; note: string };
  scenarios: Scenario[];
}

const fixture = fixtureJson as unknown as FixtureFile;

export const fixtureMeta = fixture._meta;
export const scenarios: readonly Scenario[] = fixture.scenarios;

export const RELEASE_TRAIN = '2026.10';
export const REPO_URL = 'https://github.com/avirajred26/allocations-qa-console';
/** The v0.dev chat that generated the console's first version (UI scaffold from dashboard/V0_PROMPT.md). */
export const V0_URL = 'https://v0.app/avirajlall26-2389/chat/build-lead-qa-tool-qVMTjJgaNwZ';

export const FLOW_ORDER: Flow[] = ['pre-auth', 'spv-formation', 'investor-onboarding', 'capital-calls', 'distributions'];

export const FLOW_LABEL: Record<Flow, string> = {
  'pre-auth': 'Pre-auth (public)',
  'spv-formation': 'SPV formation',
  'investor-onboarding': 'Investor onboarding',
  'capital-calls': 'Capital calls',
  distributions: 'Distributions',
};

export const DEVICE_LABEL: Record<Device, string> = {
  'desktop-chromium': 'Desktop Chromium',
  'mobile-iphone': 'Mobile iPhone',
};

export const TRIAGE_CLASSES: TriageClass[] = ['product-defect', 'automation-defect', 'environment', 'flaky'];
export const OWNERS: Owner[] = ['frontend', 'backend', 'qa', 'infra'];
export const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3'];

export const TICKET_PATTERN = /^LIN-\d{1,6}$/;
