import Link from 'next/link';
import { BellIcon, BoxesIcon, ServerIcon, CalendarClockIcon, ClipboardCheckIcon, GaugeIcon, GitMergeIcon, GitPullRequestIcon, HandIcon, RouteIcon, ShieldCheckIcon, SirenIcon, UsersIcon } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { REPO_URL } from '@/lib/fixture';
import { ENVIRONMENTS, GATES } from '@/lib/environments';

export const metadata = { title: 'QA/QC process · Allocations QA Console' };

const TRIGGERS = [
  { icon: GitPullRequestIcon, name: 'Pre-merge gate', when: 'Every PR to main: opened, pushed, reopened, ready for review', scope: 'API checks (anonymous API boundary, security headers)', devices: 'Desktop + iPhone', runs: '1× · 1 retry', gate: 'Blocks merge (required check)', file: 'qa-pr.yml' },
  { icon: GitMergeIcon, name: 'Post-merge verification', when: 'Every push to main, attributed to the merged PR', scope: 'UI + API: the full pre-auth suite', devices: 'Desktop + iPhone', runs: '1× · 1 retry', gate: 'Red main: fix forward or revert', file: 'qa-pr.yml' },
  { icon: CalendarClockIcon, name: 'Weekly regression', when: 'Mondays 03:00 UTC, or Trigger run → qa-regression.yml', scope: 'Entire suite: every spec, old and new', devices: 'Desktop + iPhone', runs: '3× repeats · 1 retry', gate: 'Opens triage for any failure', file: 'qa-regression.yml' },
  { icon: GaugeIcon, name: 'Health check', when: 'Every 6 hours', scope: 'Full pre-auth suite', devices: 'Desktop + iPhone', runs: '1× · 1 retry', gate: 'Signal only', file: 'qa-run.yml' },
  { icon: HandIcon, name: 'Manual run', when: 'Trigger run → environment + qa-run.yml (demo key once per 8 h, 30 s cooldown, 20/day)', scope: 'All, desktop or mobile × UI + API, API only or UI only', devices: 'As chosen', runs: '1× · 1 retry', gate: 'On demand', file: 'qa-run.yml' },
  { icon: SirenIcon, name: 'Failure drill', when: 'Trigger run → Failure drill', scope: 'Two deliberate, read-only failures (1 UI, 1 API)', devices: 'Desktop', runs: '1× · 1 retry', gate: 'Proves the failure path; always red', file: 'tests/drill' },
];

const CHECKS = [
  ['SM-001', 'UI', 'Sign-in surface renders; anonymous auth probes return 401; no other runtime errors'],
  ['SM-002', 'UI', 'Passwordless validation on empty / malformed email; fail-closed guard, no mutation reaches the product (carries PRE-002)'],
  ['SM-003', 'API', 'GET /api/auth/me without a session → 401, no user, token or email data'],
  ['SM-004', 'API', 'Sign-in document: HSTS ≥ 6 months, nosniff, clickjacking protection, CSP'],
  ['SM-005', 'UI', 'iPhone 13: no horizontal overflow; email, Continue and passkey tappable (mobile only)'],
];

const CAUSES = [
  ['UI', 'Element missing, hidden or different: locator and visibility assertions', 'Frontend'],
  ['BACKEND', 'HTTP status, header or request-level expectation not met; request-level spec files', 'Backend / API'],
  ['NETWORK', 'Target unreachable, DNS / TLS / connection errors, navigation timeout', 'Platform'],
  ['TIMEOUT', 'Test ran out of time with no more specific signal', 'QA'],
  ['TEST', 'Assertion failed without a UI or API signal: review the test first', 'QA'],
];

const SEVERITY = [
  ['P1', 'Blocker', 'Sign-in unavailable, data exposed to anonymous callers, security header lost', 'Same day; release is NO-GO'],
  ['P2', 'Major', 'Core flow broken on one device or browser; required check red on main', '2 business days'],
  ['P3', 'Minor', 'Degraded but usable, e.g. PRE-002 (validation not announced to screen readers)', 'Next sprint'],
  ['P4', 'Cosmetic', 'Copy, spacing, non-blocking visual differences', 'Backlog'],
];

function Section({ id, icon: Icon, title, intro, children }: { id: string; icon: typeof ClipboardCheckIcon; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-5 py-3.5"><h2 className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-primary" aria-hidden />{title}</h2>{intro && <p className="mt-1 text-xs leading-5 text-muted-foreground">{intro}</p>}</div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Lifecycle of a change through the automated gates, plus the scheduled and manual lanes. */
function PipelineDiagram() {
  const box = 'fill-[var(--card)] stroke-[var(--border)]';
  const node = (x: number, y: number, w: number, title: string, sub: string, tone = 'var(--primary)') => (
    <g transform={`translate(${x},${y})`}>
      <rect width={w} height="58" rx="8" className={box} strokeWidth="1" />
      <rect width="3" height="58" rx="1.5" fill={tone} />
      <text x="14" y="24" className="fill-[var(--foreground)]" fontSize="12" fontWeight="600">{title}</text>
      <text x="14" y="42" className="fill-[var(--muted-foreground)]" fontSize="10.5" fontFamily="var(--font-mono)">{sub}</text>
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number, label?: string) => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--muted-foreground)" strokeWidth="1.2" markerEnd="url(#arrow)" />
      {label && <text x={(x1 + x2) / 2} y={Math.min(y1, y2) - 6} textAnchor="middle" className="fill-[var(--muted-foreground)]" fontSize="10">{label}</text>}
    </g>
  );
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 960 290" className="min-w-[760px]" role="img" aria-label="Pipeline: PR opened, pre-merge API gate, review and merge, post-merge UI and API run, main verified; reports go to the PR, job summary, console, and optionally Slack or Teams. Weekly regression, 6-hourly health checks and manual runs feed the same report.">
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted-foreground)" /></marker></defs>
        <text x="0" y="14" className="fill-[var(--muted-foreground)]" fontSize="10" letterSpacing="1.5">CHANGE LIFECYCLE</text>
        {node(0, 28, 150, 'PR opened / pushed', 'author: dev')}
        {arrow(150, 57, 190, 57)}
        {node(190, 28, 170, 'Pre-merge gate', 'API · 4 checks', 'var(--chart-1)')}
        {arrow(360, 57, 400, 57, 'green')}
        {node(400, 28, 150, 'Review & merge', 'required check ✓')}
        {arrow(550, 57, 590, 57)}
        {node(590, 28, 180, 'Post-merge verify', 'UI + API · 14 checks', 'var(--chart-2)')}
        {arrow(770, 57, 810, 57, 'green')}
        {node(810, 28, 150, 'main verified', 'release gate input', 'var(--success)')}
        <path d="M275 86 V118 H230" fill="none" stroke="var(--destructive)" strokeWidth="1.2" strokeDasharray="4 3" markerEnd="url(#arrow)" />
        <text x="282" y="108" className="fill-[var(--destructive)]" fontSize="10">red → fix &amp; push again</text>
        <path d="M680 86 V118 H640" fill="none" stroke="var(--destructive)" strokeWidth="1.2" strokeDasharray="4 3" markerEnd="url(#arrow)" />
        <text x="687" y="108" className="fill-[var(--destructive)]" fontSize="10">red → fix forward or revert</text>
        <text x="0" y="160" className="fill-[var(--muted-foreground)]" fontSize="10" letterSpacing="1.5">SCHEDULED &amp; ON DEMAND</text>
        {node(0, 172, 200, 'Weekly regression', 'entire suite · 3× · Mon 03:00', 'var(--warning)')}
        {node(220, 172, 170, 'Health check', 'full suite · every 6 h', 'var(--chart-5)')}
        {node(410, 172, 170, 'Manual / drill', 'console Trigger run', 'var(--chart-5)')}
        {arrow(580, 201, 640, 201)}
        <g transform="translate(640,160)">
          <rect width="320" height="122" rx="8" className={box} strokeWidth="1" />
          <text x="14" y="24" className="fill-[var(--foreground)]" fontSize="12" fontWeight="600">One report per run</text>
          {['PR comment (sticky, per phase) · job summary', 'Console run report: screenshots, recordings', 'Trace viewer link · error log per failure', 'Slack / Teams: optional, if a webhook is set'].map((t, i) => <text key={t} x="14" y={46 + i * 18} className="fill-[var(--muted-foreground)]" fontSize="10.5">{t}</text>)}
        </g>
        <path d="M100 230 V262 H620" fill="none" stroke="var(--border)" strokeWidth="1.2" />
        <path d="M305 230 V262" fill="none" stroke="var(--border)" strokeWidth="1.2" />
        <path d="M495 230 V262" fill="none" stroke="var(--border)" strokeWidth="1.2" />
        <line x1="620" y1="262" x2="636" y2="262" stroke="var(--border)" strokeWidth="1.2" markerEnd="url(#arrow)" />
      </svg>
    </div>
  );
}

export default function ProcessPage() {
  return (
    <>
      <PageHeader
        eyebrow="PROCESS"
        title="QA/QC process"
        description="How every change to dashboard.allocations.com is checked, how failures are triaged, and what decides a release."
        actions={<a href={`${REPO_URL}/tree/main/.github/workflows`} target="_blank" rel="noopener noreferrer" className="qa-link-button">Workflows on GitHub ↗</a>}
      />

      <nav aria-label="On this page" className="flex flex-wrap gap-2 text-xs">
        {[['pipeline', 'Pipeline'], ['triggers', 'Triggers & scope'], ['environments', 'Environments'], ['cicd', 'CI/CD'], ['checks', 'Test inventory'], ['gates', 'Quality gates'], ['triage', 'Failure triage'], ['severity', 'Severity'], ['reporting', 'Reporting'], ['safety', 'Safety'], ['roles', 'Roles']].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-md border bg-card px-2.5 py-1 text-muted-foreground transition hover:border-primary/40 hover:text-foreground">{label}</a>
        ))}
      </nav>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Quality assurance', 'Prevent regressions reaching main: fast API gate before merge, full UI + API verification after, and a weekly regression of everything.'],
          ['Quality control', 'Every run is measured: totals, durations, failure causes and evidence, reported where the team already works.'],
          ['Honest scope', 'Automated checks cover the public, pre-auth surface. Authenticated flows (SPV formation, KYC, capital calls, distributions) are mocked and labelled until credentials exist.'],
        ].map(([t, b]) => <div key={t} className="qa-panel"><h2 className="text-sm font-semibold">{t}</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">{b}</p></div>)}
      </div>

      <Section id="pipeline" icon={RouteIcon} title="Pipeline" intro="A change moves left to right; a red gate sends it back. Scheduled and manual runs produce the same report.">
        <PipelineDiagram />
      </Section>

      <Section id="triggers" icon={CalendarClockIcon} title="Triggers & scope" intro="What runs when. Scope is selected by QA_SCOPE in playwright.config.ts; API specs are recognised by filename, so new specs land in the right gate automatically.">
        <div className="-m-5 overflow-x-auto"><table className="qa-table min-w-[900px]"><thead><tr><th>Trigger</th><th>When</th><th>Scope</th><th>Devices</th><th>Runs</th><th>Effect</th><th>Source</th></tr></thead><tbody>
          {TRIGGERS.map((t) => <tr key={t.name}><td><span className="flex items-center gap-2 font-medium"><t.icon className="size-4 text-primary" aria-hidden />{t.name}</span></td><td className="text-xs text-muted-foreground">{t.when}</td><td className="text-xs">{t.scope}</td><td className="text-xs text-muted-foreground">{t.devices}</td><td className="font-mono text-[11px]">{t.runs}</td><td className="text-xs">{t.gate}</td><td className="font-mono text-[11px] text-muted-foreground">{t.file}</td></tr>)}
        </tbody></table></div>
      </Section>

      <Section id="environments" icon={ServerIcon} title="Environments" intro="One registry, dashboard/qa-environments.json, read by the harness, every pipeline and this console. An environment without a URL is listed but cannot be targeted; nothing silently falls back to production.">
        <div className="-m-5 overflow-x-auto"><table className="qa-table min-w-[720px]"><thead><tr><th>Environment</th><th>URL</th><th>Used by</th><th>Status</th></tr></thead><tbody>
          {ENVIRONMENTS.map((e) => {
            const gates = Object.entries(GATES).filter(([, id]) => id === e.id).map(([g]) => g);
            return <tr key={e.id}><td className="text-xs font-medium">{e.label} <span className="font-mono text-[10px] text-muted-foreground">{e.id}</span></td><td className="font-mono text-[11px]">{e.baseUrl ?? '—'}</td><td className="text-xs text-muted-foreground">{gates.length ? gates.join(', ') : 'manual only'}</td><td>{e.baseUrl ? <span className="rounded bg-success/15 px-1.5 py-0.5 font-mono text-[10px] text-success">CONFIGURED</span> : <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">NO URL YET</span>}</td></tr>;
          })}
        </tbody></table></div>
        <p className="mt-8 text-[11px] leading-5 text-muted-foreground">Gate mapping: pre-merge and post-merge target staging, the regression, health check and manual runs target production. While staging has no URL, the gates run against the fallback (production) and every report says so in a warning line. Only Allocations&apos; production URL is known for this assignment; adding the dev and staging URLs to the registry enables them everywhere at once.</p>
      </Section>

      <Section id="cicd" icon={BoxesIcon} title="CI/CD portability" intro="The harness is CI-agnostic: one entrypoint, standard outputs. GitHub Actions is live; the Azure DevOps pipeline ships ready to import.">
        <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-3 text-xs leading-5 text-muted-foreground">
            <p><span className="font-medium text-foreground">Entrypoint:</span> <code className="font-mono">scripts/qa-ci.sh</code> resolves the environment, runs Playwright with the phase&apos;s scope, writes the report and exits with Playwright&apos;s status.</p>
            <p><span className="font-medium text-foreground">Outputs any CI understands:</span> JUnit (<code className="font-mono">test-results/junit.xml</code>), the HTML report, screenshots / recordings / traces, <code className="font-mono">qa-report.md</code> and <code className="font-mono">qa-summary.json</code>.</p>
            <p><span className="font-medium text-foreground">Context detection:</span> the reporter reads GitHub Actions, Azure DevOps, GitLab and Jenkins variables for run link, PR number and author; <code className="font-mono">QA_RUN_URL</code> / <code className="font-mono">QA_PR_NUMBER</code> / <code className="font-mono">QA_AUTHOR</code> override for anything else.</p>
            <p><span className="font-medium text-foreground">Live in this console:</span> run history, run reports and inline evidence read GitHub Actions. On other CI the same report lives in that system&apos;s run (Azure: Tests tab + &quot;QA report&quot; tab + artifacts).</p>
          </div>
          <div className="-mx-5 -mb-5 overflow-x-auto border-t lg:mx-0 lg:mb-0 lg:rounded-md lg:border"><table className="qa-table min-w-[520px]"><thead><tr><th>CI/CD</th><th>File</th><th>Status</th></tr></thead><tbody>
            {[['GitHub Actions', '.github/workflows/qa-pr.yml · qa-run.yml · qa-regression.yml', 'Live: PR gate, post-merge, weekly, manual'], ['Azure DevOps', 'azure-pipelines.yml', 'Ready to import (PR, main, weekly, manual parameters); not run here, no Azure org'], ['GitLab CI / Jenkins / other', 'call scripts/qa-ci.sh with QA_PHASE', 'Same entrypoint; publish junit.xml and the report folders']].map(([c, f, st]) => <tr key={c}><td className="text-xs font-medium">{c}</td><td className="font-mono text-[11px] text-muted-foreground">{f}</td><td className="text-xs">{st}</td></tr>)}
          </tbody></table></div>
        </div>
      </Section>

      <Section id="checks" icon={ClipboardCheckIcon} title="Test inventory" intro="Automated checks today (each runs on desktop Chromium and iPhone 13 WebKit unless noted). Authenticated product flows stay in the scenario library as labelled mocks.">
        <div className="-m-5 overflow-x-auto"><table className="qa-table min-w-[720px]"><thead><tr><th>ID</th><th>Level</th><th>What it proves</th><th>Gate</th></tr></thead><tbody>
          {CHECKS.map(([id, level, what]) => <tr key={id}><td className="whitespace-nowrap font-mono text-xs text-primary">{id}</td><td><span className="rounded border px-1.5 py-0.5 font-mono text-[10px]">{level}</span></td><td className="text-xs leading-5">{what}</td><td className="text-xs text-muted-foreground">{level === 'API' ? 'Pre-merge · post-merge · regression' : 'Post-merge · regression'}</td></tr>)}
          <tr><td className="font-mono text-xs text-warning">DRILL</td><td><span className="rounded border px-1.5 py-0.5 font-mono text-[10px]">UI + API</span></td><td className="text-xs leading-5">Two deliberate failures that exercise the reporting path end to end; never part of a gate</td><td className="text-xs text-muted-foreground">Manual only</td></tr>
        </tbody></table></div>
      </Section>

      <Section id="gates" icon={ShieldCheckIcon} title="Quality gates & exit criteria">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            ['Merge (pre-merge)', ['All API checks pass on both devices', 'A retry pass is reported as flaky, not hidden', 'Make "QA pre-merge (API)" a required check in branch protection']],
            ['Main (post-merge)', ['All UI + API checks pass', 'Red main is fixed forward or reverted the same day', 'The post-merge report links back to the PR and its author']],
            ['Release (readiness gate)', ['NO-GO: any blocker scenario failing', 'CONDITIONAL GO: a blocker flaky or quarantined', 'GO: every blocker passing; computed on the home page, never by hand']],
          ].map(([t, items]) => <div key={t as string}><h3 className="text-sm font-medium">{t as string}</h3><ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">{(items as string[]).map((i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />{i}</li>)}</ul></div>)}
        </div>
      </Section>

      <Section id="triage" icon={SirenIcon} title="Failure triage (QC loop)" intro="What happens from a red check to closure. Steps 1–4 are automated; 5–7 are owned by people.">
        <ol className="grid gap-3 md:grid-cols-7">
          {[['Detect', 'Gate or schedule goes red'], ['Classify', 'Cause from error text and spec type'], ['Route', 'Owner by cause; author @mentioned'], ['Evidence', 'Screenshot, recording, trace, log'], ['Ticket', 'Severity P1–P4, owner, due date'], ['Fix & retest', 'Push → pre-merge reruns'], ['Close', 'Green post-merge; flaky → quarantine']].map(([t, b], i) => (
            <li key={t} className="rounded-md border bg-background/50 p-3"><span className="font-mono text-[10px] text-primary">0{i + 1}</span><p className="mt-1 text-xs font-medium">{t}</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{b}</p></li>
          ))}
        </ol>
        <div className="-mx-5 -mb-5 mt-5 overflow-x-auto border-t"><table className="qa-table min-w-[640px]"><thead><tr><th>Cause</th><th>Rule (first match wins)</th><th>Routed to</th></tr></thead><tbody>
          {CAUSES.map(([c, r, o]) => <tr key={c}><td className="font-mono text-xs">{c}</td><td className="text-xs text-muted-foreground">{r}</td><td className="text-xs">{o}</td></tr>)}
        </tbody></table></div>
        <p className="mt-8 text-[11px] leading-5 text-muted-foreground">Flaky policy: a check that passes only on retry is reported as flaky in every run. Two flaky results in a week → quarantine with a ticket for at most 7 days; a quarantined blocker makes the release CONDITIONAL GO, never GO.</p>
      </Section>

      <Section id="severity" icon={GaugeIcon} title="Severity">
        <div className="-m-5 overflow-x-auto"><table className="qa-table min-w-[640px]"><thead><tr><th>Level</th><th>Meaning</th><th>Example</th><th>Target</th></tr></thead><tbody>
          {SEVERITY.map(([p, n, e, t]) => <tr key={p}><td className="font-mono text-xs font-semibold">{p}</td><td className="text-xs">{n}</td><td className="text-xs text-muted-foreground">{e}</td><td className="text-xs">{t}</td></tr>)}
        </tbody></table></div>
      </Section>

      <Section id="reporting" icon={BellIcon} title="Reporting & evidence">
        <div className="grid gap-5 md:grid-cols-2">
          <div><h3 className="text-sm font-medium">Every run reports</h3><ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">{['PR number, title, author, commit, phase and target', 'Total / passed / failed / flaky / skipped and duration; slowest checks', 'Each failure: cause, first error line, full error, suggested owner', 'Evidence per failure: screenshot (inline), recording, Playwright trace, error log', 'Findings recorded as annotations, e.g. PRE-002'].map((i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />{i}</li>)}</ul></div>
          <div><h3 className="text-sm font-medium">Where it goes</h3><ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">{['PR comment, updated in place per phase (always)', 'GitHub job summary (always)', <>Console: <Link className="text-primary" href="/">Run history</Link> → run report page (always)</>, 'Slack / Microsoft Teams: optional, enabled by a repository secret', 'Retention: full reports 14 days, summaries 90 days'].map((i, k) => <li key={k} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />{i}</li>)}</ul></div>
        </div>
      </Section>

      <Section id="safety" icon={ShieldCheckIcon} title="Safety boundaries" intro="The harness runs against production, so it is built to be harmless there.">
        <ul className="grid gap-3 text-xs leading-5 text-muted-foreground md:grid-cols-2">
          {['Public, pre-auth surface only; no credentials, no OTP requests, no accounts created', 'Fail-closed request guard: every non-GET request is aborted except the app’s own startup /api/auth/refresh', 'Service workers blocked so the guard sees every request', 'The console’s trigger needs a demo key (only its hash is stored; a signed HttpOnly cookie remembers a browser for 8 h), dispatches only allowlisted workflows, and has a 30 s cooldown and a 20-run daily cap', 'The failure drill is read-only: one page load and one anonymous GET', 'Live target checks are cached for 60 s: at most one probe a minute from the console'].map((i) => <li key={i} className="flex gap-2 rounded-md border bg-background/50 p-3"><ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />{i}</li>)}
        </ul>
      </Section>

      <Section id="roles" icon={UsersIcon} title="Roles">
        <div className="-m-5 overflow-x-auto"><table className="qa-table min-w-[640px]"><thead><tr><th>Role</th><th>Responsible for</th></tr></thead><tbody>
          {[['QA lead', 'Owns the suite, scopes and gates; triages TEST / TIMEOUT causes; runs the weekly regression review; decides quarantine'], ['PR author', 'Keeps the pre-merge gate green; fixes or reverts a red post-merge run of their change'], ['Frontend', 'UI-caused failures and accessibility findings (e.g. PRE-002)'], ['Backend / API', 'BACKEND-caused failures: status codes, headers, API contracts'], ['Platform', 'NETWORK-caused failures: availability, DNS, TLS, environments']].map(([r, d]) => <tr key={r}><td className="text-xs font-medium">{r}</td><td className="text-xs text-muted-foreground">{d}</td></tr>)}
        </tbody></table></div>
      </Section>
    </>
  );
}
