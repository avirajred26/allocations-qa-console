import Link from 'next/link';
import { BellIcon, BoxesIcon, ServerIcon, SmartphoneIcon, CalendarClockIcon, ClipboardCheckIcon, GaugeIcon, GitMergeIcon, GitPullRequestIcon, HandIcon, RouteIcon, ShieldCheckIcon, SirenIcon, UsersIcon } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { REPO_URL, V0_URL } from '@/lib/fixture';
import { ENVIRONMENTS, GATES } from '@/lib/environments';

export const metadata = { title: 'QA/QC process · Allocations QA Console' };

const TRIGGERS = [
  { icon: GitPullRequestIcon, name: 'Pre-merge gate', when: 'Every PR to main: opened, pushed, reopened, ready for review', scope: 'API checks (anonymous API boundary, security headers)', devices: 'Desktop + iPhone', runs: '1× · 1 retry', gate: 'Blocks merge (required check)', file: 'qa-pr.yml' },
  { icon: GitMergeIcon, name: 'Post-merge verification', when: 'Every push to main, attributed to the merged PR', scope: 'UI + API: the full pre-auth suite', devices: 'Desktop + iPhone', runs: '1× · 1 retry', gate: 'Red main: fix forward or revert', file: 'qa-pr.yml' },
  { icon: CalendarClockIcon, name: 'Weekly regression', when: 'Mondays 03:00 UTC, or Trigger run → qa-regression.yml', scope: 'Entire suite: every spec, old and new', devices: 'Desktop + iPhone', runs: '3× repeats · 1 retry', gate: 'Opens triage for any failure', file: 'qa-regression.yml' },
  { icon: GaugeIcon, name: 'Health check', when: 'Every 6 hours', scope: 'Full pre-auth suite', devices: 'Desktop + iPhone', runs: '1× · 1 retry', gate: 'Signal only', file: 'qa-run.yml' },
  { icon: HandIcon, name: 'Manual run', when: 'Trigger run → environment + workflow (open demo: 30 s cooldown, 20/day, 5 per browser)', scope: 'All, desktop or mobile × UI + API, API only or UI only', devices: 'As chosen', runs: '1× · 1 retry', gate: 'On demand', file: 'qa-run.yml' },
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

/** Web and mobile side by side: same gates, different steps. Web nodes blue, mobile nodes green. */
function OverviewDiagram() {
  const WEB = 'var(--primary)';
  const MOB = 'var(--success)';
  const box = 'fill-[var(--card)] stroke-[var(--border)]';
  const node = (x: number, y: number, w: number, title: string, sub: string, tone: string) => (
    <g transform={`translate(${x},${y})`}>
      <rect width={w} height="54" rx="8" className={box} strokeWidth="1" />
      <rect width={w} height="3" rx="1.5" fill={tone} />
      <text x="12" y="25" className="fill-[var(--foreground)]" fontSize="12" fontWeight="600">{title}</text>
      <text x="12" y="42" className="fill-[var(--muted-foreground)]" fontSize="10.5" fontFamily="var(--font-mono)">{sub}</text>
    </g>
  );
  const chip = (y: number, label: string, tone: string) => (
    <g transform={`translate(0,${y})`}>
      <rect width="74" height="24" rx="12" fill={tone} opacity="0.12" />
      <text x="37" y="16" textAnchor="middle" fontSize="10.5" fontWeight="700" letterSpacing="1" fill={tone}>{label}</text>
    </g>
  );
  const arrow = (x1: number, y: number, x2: number) => <line x1={x1} y1={y} x2={x2} y2={y} stroke="var(--muted-foreground)" strokeWidth="1.2" markerEnd="url(#o-arrow)" />;
  const lane = (y: number, tone: string, steps: [string, string][]) => {
    const w = 152, gap = 22, x0 = 90;
    return steps.map(([t, sub], i) => (
      <g key={t}>
        {node(x0 + i * (w + gap), y, w, t, sub, tone)}
        {i < steps.length - 1 && arrow(x0 + i * (w + gap) + w, y + 27, x0 + (i + 1) * (w + gap))}
      </g>
    ));
  };
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 960 170" className="min-w-[760px]" role="img" aria-label="Web lane: PR, pre-merge API checks, merge, post-merge UI and API checks, weekly regression. Mobile lane: PR, app build and key flows, merge, beta on TestFlight and Play, release gate and staged rollout. Both lanes produce the same report.">
        <defs><marker id="o-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted-foreground)" /></marker></defs>
        {chip(15, 'WEB', WEB)}
        {lane(0, WEB, [['PR', 'opened / pushed'], ['Pre-merge', 'API · 4 checks'], ['Merge', 'required check'], ['Post-merge', 'UI + API · 14'], ['Weekly', 'regression · 3×']])}
        {chip(103, 'MOBILE', MOB)}
        {lane(88, MOB, [['PR', 'build · flows'], ['Merge', 'staging build'], ['Beta', 'TestFlight · Play'], ['Release gate', 'crash-free 99.5%'], ['Rollout', '10% → 100%']])}
        <text x="90" y="162" className="fill-[var(--muted-foreground)]" fontSize="10.5">Both lanes: same triage, severity and report. Mobile today runs in the phone browser (no app build yet).</text>
      </svg>
    </div>
  );
}

/** Mobile pipeline: the app lifecycle, plus what this assignment runs today. */
function MobilePipelineDiagram() {
  const box = 'fill-[var(--card)] stroke-[var(--border)]';
  const node = (x: number, y: number, w: number, title: string, sub: string, tone = 'var(--primary)') => (
    <g transform={`translate(${x},${y})`}>
      <rect width={w} height="58" rx="8" className={box} strokeWidth="1" />
      <rect width="3" height="58" rx="1.5" fill={tone} />
      <text x="14" y="24" className="fill-[var(--foreground)]" fontSize="12" fontWeight="600">{title}</text>
      <text x="14" y="42" className="fill-[var(--muted-foreground)]" fontSize="10.5" fontFamily="var(--font-mono)">{sub}</text>
    </g>
  );
  const arrow = (x1: number, y: number, x2: number) => <line x1={x1} y1={y} x2={x2} y2={y} stroke="var(--muted-foreground)" strokeWidth="1.2" markerEnd="url(#m-arrow)" />;
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 960 300" className="min-w-[760px]" role="img" aria-label="Mobile pipeline: PR builds the apps and runs unit tests and key flows on a simulator and emulator; merge makes a signed staging build, runs the full suite and uploads to TestFlight and Play internal; weekly regression runs on real devices; release needs green regression and crash-free beta, then a staged rollout watched in Crashlytics. Today the assignment runs the sign-in checks in Chrome on an Android emulator and Safari on an iPhone simulator.">
        <defs><marker id="m-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted-foreground)" /></marker></defs>
        <text x="0" y="14" className="fill-[var(--muted-foreground)]" fontSize="10" letterSpacing="1.5">APP LIFECYCLE (WITH A REAL APP BUILD)</text>
        {node(0, 28, 168, 'PR', 'build · unit · flows', 'var(--chart-1)')}
        {arrow(168, 57, 194)}
        {node(194, 28, 182, 'Merge to main', 'staging · full suite', 'var(--chart-2)')}
        {arrow(376, 57, 402)}
        {node(402, 28, 172, 'Beta', 'TestFlight · Play')}
        {arrow(574, 57, 600)}
        {node(600, 28, 172, 'Release gate', 'crash-free ≥99.5%', 'var(--warning)')}
        {arrow(772, 57, 798)}
        {node(798, 28, 162, 'Staged rollout', '10% → 100%', 'var(--success)')}
        {node(194, 108, 380, 'Weekly regression on real devices', 'iOS 17–18 · Android 12–15', 'var(--warning)')}
        <path d="M285 86 V108" stroke="var(--border)" strokeWidth="1.2" />
        <path d="M574 137 H686 V86" fill="none" stroke="var(--border)" strokeWidth="1.2" markerEnd="url(#m-arrow)" />
        <text x="0" y="200" className="fill-[var(--muted-foreground)]" fontSize="10" letterSpacing="1.5">RUNNING NOW IN THIS ASSIGNMENT</text>
        {node(0, 212, 190, 'Trigger', 'PR · weekly · manual', 'var(--chart-5)')}
        {arrow(190, 241, 216)}
        {node(216, 212, 230, 'Android emulator', 'Chrome · Pixel 6', 'var(--chart-1)')}
        {node(462, 212, 230, 'iPhone simulator', 'Safari · macOS', 'var(--chart-1)')}
        <text x="454" y="206" textAnchor="middle" className="fill-[var(--muted-foreground)]" fontSize="10">in parallel</text>
        {arrow(692, 241, 718)}
        {node(718, 212, 242, 'One report', 'screenshots · video · log', 'var(--success)')}
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
        description="How changes to dashboard.allocations.com are tested, and what happens when a test fails."
      />

      <nav aria-label="On this page" className="flex flex-wrap gap-2 text-xs">
        {[['overview', 'Web + Mobile'], ['pipeline', 'Pipeline'], ['triggers', 'Triggers & scope'], ['environments', 'Environments'], ['cicd', 'CI/CD'], ['mobile', 'Mobile'], ['checks', 'Test inventory'], ['gates', 'Quality gates'], ['triage', 'Failure triage'], ['severity', 'Severity'], ['reporting', 'Reporting'], ['safety', 'Safety'], ['roles', 'Roles']].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-md border bg-card px-2.5 py-1 text-muted-foreground transition hover:border-primary/40 hover:text-foreground">{label}</a>
        ))}
      </nav>


      <Section id="overview" icon={RouteIcon} title="Web + Mobile at a glance">
        <OverviewDiagram />
      </Section>

      <Section id="pipeline" icon={RouteIcon} title="Pipeline">
        <PipelineDiagram />
      </Section>

      <Section id="triggers" icon={CalendarClockIcon} title="Triggers & scope" intro="QA_SCOPE in playwright.config.ts picks the tests. API specs are picked by filename.">
        <div className="-m-5 overflow-x-auto"><table className="qa-table min-w-[900px]"><thead><tr><th>Trigger</th><th>When</th><th>Scope</th><th>Devices</th><th>Runs</th><th>Effect</th><th>Source</th></tr></thead><tbody>
          {TRIGGERS.map((t) => <tr key={t.name}><td><span className="flex items-center gap-2 font-medium"><t.icon className="size-4 text-primary" aria-hidden />{t.name}</span></td><td className="text-xs text-muted-foreground">{t.when}</td><td className="text-xs">{t.scope}</td><td className="text-xs text-muted-foreground">{t.devices}</td><td className="font-mono text-[11px]">{t.runs}</td><td className="text-xs">{t.gate}</td><td className="font-mono text-[11px] text-muted-foreground">{t.file}</td></tr>)}
        </tbody></table></div>
      </Section>

      <Section id="environments" icon={ServerIcon} title="Environments" intro="All environments are listed in dashboard/qa-environments.json.">
        <div className="-m-5 overflow-x-auto"><table className="qa-table min-w-[720px]"><thead><tr><th>Environment</th><th>URL</th><th>Used by</th><th>Status</th></tr></thead><tbody>
          {ENVIRONMENTS.map((e) => {
            const gates = Object.entries(GATES).filter(([, id]) => id === e.id).map(([g]) => g);
            return <tr key={e.id}><td className="text-xs font-medium">{e.label} <span className="font-mono text-[10px] text-muted-foreground">{e.id}</span></td><td className="font-mono text-[11px]">{e.baseUrl ?? '—'}</td><td className="text-xs text-muted-foreground">{gates.length ? gates.join(', ') : 'manual only'}</td><td>{e.aliasOf ? <span className="rounded bg-warning/15 px-1.5 py-0.5 font-mono text-[10px] text-warning" title={e.notes}>DEMO ALIAS → {e.aliasOf.toUpperCase()}</span> : e.baseUrl ? <span className="rounded bg-success/15 px-1.5 py-0.5 font-mono text-[10px] text-success">CONFIGURED</span> : <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">NO URL YET</span>}</td></tr>;
          })}
        </tbody></table></div>
        <p className="mt-8 text-[11px] leading-5 text-muted-foreground">Only the production URL exists for this assignment, so dev and staging point at it and are marked as demo aliases in every report.</p>
      </Section>

      <Section id="cicd" icon={BoxesIcon} title="CI/CD portability">
        <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-3 text-xs leading-5 text-muted-foreground">
            <p><code className="font-mono">scripts/qa-ci.sh</code> runs the same steps on any CI: pick the environment, run Playwright, write the report.</p>
            <p>Outputs: JUnit, the HTML report, screenshots, recordings, traces, <code className="font-mono">qa-report.md</code>.</p>
          </div>
          <div className="-mx-5 -mb-5 overflow-x-auto border-t lg:mx-0 lg:mb-0 lg:rounded-md lg:border"><table className="qa-table min-w-[520px]"><thead><tr><th>CI/CD</th><th>File</th><th>Status</th></tr></thead><tbody>
            {[['GitHub Actions', '.github/workflows/qa-pr.yml · qa-run.yml · qa-regression.yml', 'Live'], ['Azure DevOps', 'azure-pipelines.yml', 'Ready to import; not run yet'], ['GitLab CI / Jenkins / other', 'call scripts/qa-ci.sh with QA_PHASE', 'Call scripts/qa-ci.sh']].map(([c, f, st]) => <tr key={c}><td className="text-xs font-medium">{c}</td><td className="font-mono text-[11px] text-muted-foreground">{f}</td><td className="text-xs">{st}</td></tr>)}
          </tbody></table></div>
        </div>
      </Section>

      <Section id="mobile" icon={SmartphoneIcon} title="Mobile (Android + iOS)" intro="Assignment demo: there is no Allocations app build, so the mobile checks open the public sign-in page in the phone's own browser.">
        <div className="space-y-6">
          <MobilePipelineDiagram />
          <div>
            <h3 className="mb-2 text-sm font-medium">Running now</h3>
            <div className="-mx-5 overflow-x-auto"><table className="qa-table min-w-[640px]"><thead><tr><th>Check</th><th>Device</th><th>When</th><th>Evidence</th></tr></thead><tbody>
              {[['MOB-A01', 'Chrome on an Android emulator (Pixel 6, API 34)'], ['MOB-I01', 'Safari on an iPhone simulator (macOS runner)']].map(([id, d]) => <tr key={id}><td className="whitespace-nowrap font-mono text-xs text-primary">{id}</td><td className="text-xs">{d}</td><td className="text-xs text-muted-foreground">PRs that change mobile/, Mondays 04:00 UTC, Trigger run → qa-mobile.yml</td><td className="text-xs text-muted-foreground">Screenshots, screen recording, Maestro log</td></tr>)}
            </tbody></table></div>
            <p className="mt-3 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] leading-5 text-warning">Finding MOB-001: in Chrome on the Android emulator the sign-in page shows &quot;Unable to load your session&quot; and Retry does not recover it (reproduced in two runs). Safari on the iPhone simulator and Android Chrome emulation in Playwright both load fine, so the likely cause is the emulator&apos;s older built-in Chrome. Next: confirm on a real Android phone. MOB-A01 stays red until then.</p>
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Each flow loads the sign-in page, then tries an empty and a malformed email, the same inputs SM-002 shows are rejected in the browser, so nothing is sent to Allocations. Tool: Maestro.</p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">With a real app build</h3>
            <div className="-mx-5 overflow-x-auto"><table className="qa-table min-w-[640px]"><thead><tr><th>Stage</th><th>What runs</th><th>Gate</th></tr></thead><tbody>
              {[
                ['PR', 'Build both apps, unit tests (XCTest / JUnit), 5–10 key flows on 1 simulator + 1 emulator', 'Blocks merge if red'],
                ['Merge', 'Signed staging build, full UI suite, upload to TestFlight and Play internal track', 'Beta ready'],
                ['Weekly', 'Full regression on real devices (BrowserStack / Firebase Test Lab), iOS 17–18, Android 12–15', 'Opens triage'],
                ['Release', 'Regression green, manual pass, accessibility (VoiceOver / TalkBack), crash-free ≥ 99.5% on beta', 'Staged rollout 10% → 100%'],
              ].map(([st, w, g]) => <tr key={st}><td className="text-xs font-medium">{st}</td><td className="text-xs text-muted-foreground">{w}</td><td className="text-xs">{g}</td></tr>)}
            </tbody></table></div>
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Same report and triage as web. The flows swap opening the browser for installing the .apk / .ipa; Fastlane handles builds and signing.</p>
          </div>
        </div>
      </Section>

      <Section id="checks" icon={ClipboardCheckIcon} title="Test inventory" intro="Each check runs on desktop Chrome and iPhone 13 unless noted.">
        <div className="-m-5 overflow-x-auto"><table className="qa-table min-w-[720px]"><thead><tr><th>ID</th><th>Level</th><th>What it proves</th><th>Gate</th></tr></thead><tbody>
          {CHECKS.map(([id, level, what]) => <tr key={id}><td className="whitespace-nowrap font-mono text-xs text-primary">{id}</td><td><span className="rounded border px-1.5 py-0.5 font-mono text-[10px]">{level}</span></td><td className="text-xs leading-5">{what}</td><td className="text-xs text-muted-foreground">{level === 'API' ? 'Pre-merge · post-merge · regression' : 'Post-merge · regression'}</td></tr>)}
          <tr><td className="whitespace-nowrap font-mono text-xs text-primary">MOB-A01 / I01</td><td><span className="rounded border px-1.5 py-0.5 font-mono text-[10px]">MOBILE</span></td><td className="text-xs leading-5">Sign-in page and email validation in Chrome on Android and Safari on iOS (emulator / simulator)</td><td className="text-xs text-muted-foreground">Mobile · weekly · manual</td></tr>
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

      <Section id="triage" icon={SirenIcon} title="Failure triage (QC loop)">
        <ol className="grid gap-3 md:grid-cols-7">
          {[['Detect', 'Gate or schedule goes red'], ['Classify', 'Cause from error text and spec type'], ['Route', 'Owner by cause; author @mentioned'], ['Evidence', 'Screenshot, recording, trace, log'], ['Ticket', 'Severity P1–P4, owner, due date'], ['Fix & retest', 'Push → pre-merge reruns'], ['Close', 'Green post-merge; flaky → quarantine']].map(([t, b], i) => (
            <li key={t} className="rounded-md border bg-background/50 p-3"><span className="font-mono text-[10px] text-primary">0{i + 1}</span><p className="mt-1 text-xs font-medium">{t}</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{b}</p></li>
          ))}
        </ol>
        <div className="-mx-5 -mb-5 mt-5 overflow-x-auto border-t"><table className="qa-table min-w-[640px]"><thead><tr><th>Cause</th><th>Rule (first match wins)</th><th>Routed to</th></tr></thead><tbody>
          {CAUSES.map(([c, r, o]) => <tr key={c}><td className="font-mono text-xs">{c}</td><td className="text-xs text-muted-foreground">{r}</td><td className="text-xs">{o}</td></tr>)}
        </tbody></table></div>
        <p className="mt-8 text-[11px] leading-5 text-muted-foreground">Flaky tests: passing only on retry counts as flaky. Two flaky results in a week means quarantine with a ticket, for up to 7 days.</p>
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

      <Section id="safety" icon={ShieldCheckIcon} title="Safety boundaries">
        <ul className="grid gap-3 text-xs leading-5 text-muted-foreground md:grid-cols-2">
          {['Public, pre-auth surface only; no credentials, no OTP requests, no accounts created', 'Fail-closed request guard: every non-GET request is aborted except the app’s own startup /api/auth/refresh', 'Service workers blocked so the guard sees every request', 'The console’s trigger is open for the demo but bounded: same-origin requests only, allowlisted workflows and configured environments only, 30 s cooldown, 20 runs a day overall and 5 per browser. A demo key can be required again with TRIGGER_REQUIRE_KEY=1', 'The failure drill is read-only: one page load and one anonymous GET', 'Live target checks are cached for 60 s: at most one probe a minute from the console'].map((i) => <li key={i} className="flex gap-2 rounded-md border bg-background/50 p-3"><ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />{i}</li>)}
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
