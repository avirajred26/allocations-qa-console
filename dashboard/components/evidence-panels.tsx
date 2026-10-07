import { ExternalLinkIcon, FlaskConicalIcon, GitBranchIcon } from 'lucide-react';
import { CI_EVIDENCE, LOCAL_EVIDENCE } from '@/lib/local-evidence';

export function EvidencePanels() {
  return <div className="grid gap-4 xl:grid-cols-2">
    {[
      { title: 'Local harness', tag: 'RECORDED LOCAL', icon: FlaskConicalIcon, evidence: LOCAL_EVIDENCE, description: 'Corrected harness run against the live passwordless sign-in. The single skip is a mobile-only check on the desktop project.' },
      { title: 'GitHub Actions', tag: 'RECORDED CI', icon: GitBranchIcon, evidence: CI_EVIDENCE, description: CI_EVIDENCE.note },
    ].map(({ title, tag, icon: Icon, evidence, description }) => <section key={title} className="qa-panel">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-muted-foreground" />{title}</h3><span className="qa-tag">{tag}</span></div>
      <p className="mt-2 text-xs text-muted-foreground">{evidence.dateLabel} · Chromium + mobile WebKit</p>
      <div className="my-5 grid grid-cols-3 gap-3">
        <div><p className="font-mono text-2xl text-success">{evidence.passed}</p><p className="qa-caption">Passed</p></div>
        <div><p className="font-mono text-2xl text-destructive">{evidence.failed}</p><p className="qa-caption">Failed</p></div>
        <div><p className="font-mono text-2xl text-muted-foreground">{evidence.skipped}</p><p className="qa-caption">Skipped</p></div>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      {tag === 'RECORDED CI' && <a className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline" href={CI_EVIDENCE.url} target="_blank" rel="noopener noreferrer">Run & report artifact <ExternalLinkIcon className="size-3.5" /></a>}
    </section>)}
  </div>;
}
