/**
 * Recorded local harness evidence. Totals only — the recording does not carry a
 * per-scenario breakdown, so none is shown or inferred.
 */
export const LOCAL_EVIDENCE = {
  dateLabel: '7 October 2026',
  isoDate: '2026-10-07',
  projects: 'desktop-chromium + mobile-iphone (iPhone 13, WebKit)',
  target: 'dashboard.allocations.com (public, pre-auth)',
  passed: 13,
  failed: 0,
  skipped: 1,
  findings: [
    'Sign-in is passwordless (email code / passkey). The harness was corrected on 2026-10-07 to match: no password assertions, Continue + passkey controls, and the startup POST /api/auth/refresh (cookie-only, no user data) is the single allowlisted mutation so the page can render.',
    'PRE-002 (product, accessibility): the "Please enter a valid email." message is plain text — the input gets no aria-invalid and no aria-describedby, so assistive tech is not told the field is in error. Recorded as a test annotation, not a failure.',
    'The one skip is SM-005 on the desktop project; it is a mobile-only check and runs under mobile-iphone, where it passes.',
  ],
  actions: [
    'Done 7 Oct: qa-run.yml re-run in GitHub Actions as ci-corrected-01 (13 passed, 0 failed, 1 by-design skip); the CI record below is that run.',
    'Raise PRE-002 with frontend as a P3 accessibility defect on the sign-in form.',
  ],
} as const;

/** Known gaps between fixture rows and reality. Shown next to the fixture row; never rewrites it. */
export const EVIDENCE_NOTES: Record<string, { tone: 'danger' | 'warning'; text: string }> = {
  'SM-002': {
    tone: 'warning',
    text: 'Passes on the live surface (7 Oct local run). Carries finding PRE-002: validation message is not ARIA-linked to the input.',
  },
};

export const LOCAL_EVIDENCE_TOTAL = LOCAL_EVIDENCE.passed + LOCAL_EVIDENCE.failed + LOCAL_EVIDENCE.skipped;

/** Verified historical CI snapshot; never presented as a live or scenario-level result. */
export const CI_EVIDENCE = {
  dateLabel: '7 October 2026 (UTC)',
  runRef: 'ci-corrected-01',
  url: 'https://github.com/avirajred26/allocations-qa-console/actions/runs/37567120072',
  passed: 13, failed: 0, skipped: 1,
  artifact: 'playwright-report-ci-corrected-01',
  note: 'Corrected harness run in GitHub Actions on 7 October 2026: 13 passed, 0 failed, 1 by-design skip (SM-005 is mobile-only and skips on desktop-chromium).',
} as const;
