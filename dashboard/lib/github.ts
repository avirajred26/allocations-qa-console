/**
 * Minimal GitHub Actions client. Only the fixed owner/repo/workflow/branch
 * from env are ever used; nothing from the request body reaches GitHub
 * except the validated run_ref.
 */
const OWNER = process.env.GH_OWNER ?? 'avirajred26';
const REPO = process.env.GH_REPO ?? 'allocations-qa-console';
const WORKFLOW = process.env.GH_WORKFLOW ?? 'qa-run.yml';
const BRANCH = process.env.GH_BRANCH ?? 'main';
const TOKEN = process.env.GH_TOKEN; // fine-grained PAT: Actions read/write on this repo only

const RUN_REF = /^[A-Za-z0-9_-]{8,32}$/;
export function isValidRunRef(v: unknown): v is string {
  return typeof v === 'string' && RUN_REF.test(v);
}

export function newRunRef(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `qa-${t}-${r}`;
}

async function gh(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  if (!TOKEN) throw new Error('gh-token-missing');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`https://api.github.com${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'allocations-qa-console',
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

/** 'drill' runs only tests/drill: deliberate, read-only failures that prove the failure-reporting path. */
export type Suite = 'all' | 'desktop' | 'mobile' | 'drill';

export type Scope = 'full' | 'api' | 'ui';
/** Workflows the console may dispatch. qa-pr.yml is driven by PR events only. */
export const DISPATCHABLE = ['qa-run.yml', 'qa-regression.yml'] as const;
export type DispatchWorkflow = (typeof DISPATCHABLE)[number];

export type DispatchOutcome = 'accepted' | 'rejected' | 'uncertain';

/**
 * Classification is explicit, not "anything but 204 is a failure":
 *   204                       → accepted   (run exists)
 *   400 401 403 404 422       → rejected   (GitHub definitively refused; no side effects; refund)
 *   5xx, 429, any other code  → uncertain  (gateway/upstream failure may have occurred AFTER
 *                                           GitHub accepted; a 504 is the classic case; no refund)
 *   thrown timeout / network  → uncertain
 *   token missing locally     → rejected   (nothing was sent)
 */
const DEFINITIVE_REJECTION = new Set([400, 401, 403, 404, 422]);

export function classifyDispatchStatus(status: number): DispatchOutcome {
  if (status === 204) return 'accepted';
  if (DEFINITIVE_REJECTION.has(status)) return 'rejected';
  return 'uncertain';
}

/** Test seam: fixed outcomes so admission tests never touch GitHub. Only honoured with the seam enabled. */
function testDispatchMode(): DispatchOutcome | null {
  if (process.env.ALLOW_TEST_NAMESPACE !== '1') return null;
  const m = process.env.TEST_DISPATCH_MODE;
  return m === 'accept' ? 'accepted' : m === 'reject' ? 'rejected' : m === 'uncertain' ? 'uncertain' : null;
}

export async function dispatchRun(runRef: string, suite: Suite, opts: { workflow?: DispatchWorkflow; scope?: Scope } = {}): Promise<DispatchOutcome> {
  const forced = testDispatchMode();
  if (forced) return forced;

  const workflow = opts.workflow === 'qa-regression.yml' ? 'qa-regression.yml' : WORKFLOW;
  const inputs = workflow === 'qa-regression.yml'
    ? { run_ref: runRef }
    : { run_ref: runRef, target: 'prod-public', suite, scope: opts.scope ?? 'full' };
  let res: Response;
  try {
    res = await gh(`/repos/${OWNER}/${REPO}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref: BRANCH, inputs }),
    });
  } catch (err) {
    if ((err as Error).message === 'gh-token-missing') return 'rejected';
    console.error(`[github] dispatch threw ref=${runRef}`);
    return 'uncertain';
  }
  const outcome = classifyDispatchStatus(res.status);
  if (outcome !== 'accepted') console.error(`[github] dispatch status=${res.status} outcome=${outcome} ref=${runRef}`);
  return outcome;
}

export type RunStatus = {
  found: boolean;
  run_ref: string;
  status?: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'neutral' | null;
  html_url?: string;
  run_id?: number;
  started_at?: string;
  updated_at?: string;
  artifacts_url?: string;
};

/**
 * Correlate by run name. workflow_dispatch returns no run id, so the workflow sets
 * `run-name: "QA run <run_ref>"`; GitHub exposes that custom name as `display_title`
 * (`name` is the workflow's static name). Match exactly, never with includes().
 */
export function expectedDisplayTitle(runRef: string): string {
  return `QA run ${runRef}`;
}

export async function findRun(runRef: string): Promise<RunStatus> {
  // Any dispatchable workflow: both set run-name "QA run <run_ref>" when started from the console.
  const res = await gh(`/repos/${OWNER}/${REPO}/actions/runs?branch=${BRANCH}&per_page=40&event=workflow_dispatch`);
  if (!res.ok) throw new Error(`gh-list-${res.status}`);
  const data = (await res.json()) as { workflow_runs: Array<Record<string, any>> };
  const want = expectedDisplayTitle(runRef);
  const run = data.workflow_runs.find((r) => r.display_title === want && QA_WORKFLOWS.includes(r.path));
  if (!run) return { found: false, run_ref: runRef };
  return {
    found: true,
    run_ref: runRef,
    status: run.status,
    conclusion: run.conclusion,
    html_url: run.html_url,
    run_id: run.id,
    started_at: run.run_started_at,
    updated_at: run.updated_at,
    artifacts_url: `${run.html_url}#artifacts`,
  };
}

export type WorkflowRun = {
  id: number;
  path: string;
  head_branch: string;
  display_title: string;
  event: string;
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion: RunStatus['conclusion'];
  html_url: string;
  run_started_at: string;
  updated_at: string;
};

/** Every QA workflow in this repo: manual/health runs, the PR gate and the weekly regression. */
export const QA_WORKFLOWS = [`.github/workflows/${WORKFLOW}`, '.github/workflows/qa-pr.yml', '.github/workflows/qa-regression.yml'];

/** Runs of the QA workflows, newest first (dispatch, schedule, pull_request and push alike). */
export async function listRuns(perPage = 30): Promise<WorkflowRun[]> {
  const res = await gh(`/repos/${OWNER}/${REPO}/actions/runs?per_page=${Math.min(100, perPage * 2)}`);
  if (!res.ok) throw new Error(`gh-list-${res.status}`);
  const data = (await res.json()) as { workflow_runs: WorkflowRun[] };
  return data.workflow_runs.filter((r) => QA_WORKFLOWS.includes(r.path)).slice(0, perPage);
}

/** One QA run by id; null when it is not a run of a QA workflow in this repo. */
export async function getRun(runId: number): Promise<WorkflowRun | null> {
  const res = await gh(`/repos/${OWNER}/${REPO}/actions/runs/${runId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`gh-run-${res.status}`);
  const run = (await res.json()) as WorkflowRun;
  return QA_WORKFLOWS.includes(run.path) ? run : null;
}

/**
 * Downloads the first non-expired artifact of a run whose name starts with one of the
 * prefixes (in preference order). GitHub answers with a redirect to blob storage; fetch
 * drops the Authorization header on that cross-origin hop.
 */
export async function downloadArtifact(runId: number, prefixes: string[]): Promise<{ name: string; zip: Buffer } | null> {
  const res = await gh(`/repos/${OWNER}/${REPO}/actions/runs/${runId}/artifacts?per_page=20`);
  if (!res.ok) throw new Error(`gh-artifacts-${res.status}`);
  const { artifacts } = (await res.json()) as { artifacts: Array<{ id: number; name: string; expired: boolean }> };
  for (const prefix of prefixes) {
    const a = artifacts.find((x) => !x.expired && x.name.startsWith(prefix));
    if (!a) continue;
    const zip = await gh(`/repos/${OWNER}/${REPO}/actions/artifacts/${a.id}/zip`, {}, 20_000);
    if (!zip.ok) throw new Error(`gh-artifact-zip-${zip.status}`);
    return { name: a.name, zip: Buffer.from(await zip.arrayBuffer()) };
  }
  return null;
}

/** Workflow state ("active" / "disabled_*") and round-trip time; used by the targets panel. */
export async function workflowState(): Promise<{ state: string; ms: number }> {
  const t0 = Date.now();
  const res = await gh(`/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}`, {}, 5000);
  if (!res.ok) throw new Error(`gh-workflow-${res.status}`);
  const { state } = (await res.json()) as { state: string };
  return { state, ms: Date.now() - t0 };
}
