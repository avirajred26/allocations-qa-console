import { LockKeyholeIcon, ShieldCheckIcon } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EvidencePanels } from '@/components/evidence-panels';
import { ConnectionNotice } from '@/components/connection-notice';
import { Targets } from '@/components/live-panels';
import { REPO_URL } from '@/lib/fixture';
import { CI_EVIDENCE, LOCAL_EVIDENCE } from '@/lib/local-evidence';

export const dynamic='force-dynamic';

export default function HarnessPage(){
  return <>
    <PageHeader title="Harness" description="What runs, what is mocked, and where the evidence stops." actions={<a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="qa-link-button">View repository ↗</a>}/>
    <section className="qa-panel grid gap-6 md:grid-cols-[1.3fr_1fr]"><div><span className="qa-eyebrow text-primary">Pre-auth smoke · Playwright</span><h2 className="mt-3 text-2xl font-semibold tracking-tight">Small suite. Explicit boundaries.</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">Public entry points only, on desktop Chromium and mobile WebKit. No real credentials, no OTP requests, and no claim of authenticated product coverage. The first CI execution exposed wrong assumptions about the sign-in flow; the harness was corrected on 7 Oct and now passes in GitHub Actions against the live surface.</p></div><div className="rounded-xl border bg-background/50 p-5"><h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheckIcon className="size-4 text-primary"/>Safety boundary</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">Sign-in validation tests arm a context-level guard before navigation. Non-GET/HEAD/OPTIONS requests are aborted, service workers are blocked, and attempted mutations to Allocations are counted.</p></div></section>
    <section className="qa-panel !p-0 overflow-hidden"><div className="border-b p-5"><h2 className="font-semibold">Five smoke scenarios</h2><p className="qa-caption mt-1">Scope as implemented. Latest recorded CI run {CI_EVIDENCE.runRef}: {CI_EVIDENCE.passed} passed, {CI_EVIDENCE.failed} failed, {CI_EVIDENCE.skipped} by-design skip.</p></div><div className="divide-y">{[
      ['SM-001','Sign-in surface','Email + passkey controls render; the app\'s anonymous session probes (/api/auth/me, /api/auth/refresh) return 401; no other runtime errors.'],
      ['SM-002','Passwordless validation','Empty and malformed email produce visible validation on Continue; no mutating request reaches the product (fail-closed guard, one allowlisted startup POST). Carries PRE-002.'],
      ['SM-003','Anonymous API boundary','GET /api/auth/me without a session returns 401 with a machine-readable error and no user, token or email data.'],
      ['SM-004','Security headers','Sign-in document carries HSTS (≥6 months), nosniff, clickjacking protection and a Content-Security-Policy.'],
      ['SM-005','Mobile layout','iPhone 13 emulation: no horizontal overflow; email, Continue and passkey controls in viewport with ≥40px tap targets.'],
    ].map(([id,title,text])=><div key={id} className="grid gap-2 p-5 sm:grid-cols-[90px_170px_1fr]"><span className="font-mono text-xs text-primary">{id}</span><h3 className="text-sm font-medium">{title}</h3><p className="text-sm leading-6 text-muted-foreground">{text}</p></div>)}</div></section>
    <EvidencePanels/>
    <section className="qa-panel"><h2 className="font-semibold">Next harness work</h2><ol className="mt-4 space-y-3">{LOCAL_EVIDENCE.actions.map((action,i)=><li key={action} className="flex gap-3 text-sm leading-6 text-muted-foreground"><span className="font-mono text-primary">0{i+1}</span>{action}</li>)}</ol></section>
    <section id="connections" className="scroll-mt-20"><Targets/></section>
    <ConnectionNotice/>
    <section className="qa-panel"><h2 className="flex items-center gap-2 font-semibold"><LockKeyholeIcon className="size-4 text-primary"/>Honest by design</h2><div className="mt-4 grid gap-5 md:grid-cols-3">{[['Real backend','Server-side key hashing, atomic Redis cooldown/daily cap, owner-checked cleanup, and uncertain dispatch handling. Verified end to end: a reviewer-style trigger dispatched, polled and completed green, and the live checks above re-verify GitHub and Redis every minute.'],['Fixture + mock','Scenario history is seeded. Authenticated flows require credentials; issue keys are examples. Edits are local to this tab and reset on reload.'],['Recorded and live','Run history and per-run totals come from GitHub; the imported CI report is the corrected run, and the first failing run stays visible as history. Reports are kept 14 days, summaries 90.']].map(([title,body])=><div key={title}><h3 className="text-sm font-medium">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p></div>)}</div></section>
  </>;
}
