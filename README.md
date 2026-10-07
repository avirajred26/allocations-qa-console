# Allocations QA Console — updated local preview (harness corrected 7 Oct)

Independent Lead QA assignment for dashboard.allocations.com. Not an official Allocations product. This package combines the original Playwright harness and GitHub workflow with the completed v0-derived dashboard, including the latest local redesign (7 October 2026).

**Live console: https://aviraj-allocations-qa.vercel.app** — Live trigger configured; demo key issued to reviewers out-of-band. No credentials are included in this repo.

## Harness status (7 October 2026)

The 6 Oct CI run failed 7/14 because the harness assumed a password form. The real sign-in is
passwordless (email code + passkey) and POSTs `/api/auth/refresh` on startup; the fail-closed guard was
aborting that and freezing the page. Corrected harness, run locally against the live surface:
**13 passed, 0 failed, 1 by-design skip** (SM-005 is mobile-only and skips on the desktop project).

Replaced checks: SM-003 is now the anonymous API boundary (`/api/auth/me` → 401, no user data) and
SM-004 is security headers (HSTS ≥ 6 months, nosniff, frame protection, CSP). Both pass.

One product finding surfaced, recorded as a Playwright annotation (not a failure):
**PRE-002** — the sign-in validation message is plain text with no `aria-invalid` / `aria-describedby`
on the input; assistive technology is not told the field is in error.

Re-run in GitHub Actions on 7 Oct as `ci-corrected-01` ([run 37567120072](https://github.com/avirajred26/allocations-qa-console/actions/runs/37567120072)): **13 passed, 0 failed, 1 by-design skip**. That report is the recorded CI result in the dashboard.

## Start the dashboard

```sh
cd dashboard
pnpm install --frozen-lockfile
pnpm dev --hostname 127.0.0.1 --port 3000
```

Open http://127.0.0.1:3000. No environment file is required to explore the UI, fixtures, or recorded CI report. Live triggering remains blocked without its backend credentials.

The local preview was verified on Node 24.15.0 and pnpm 11.19.0 with the included pnpm lockfile. The root harness is a separate npm package with its own package-lock.json. Do not use the old dashboard npm lockfile from a previous archive; this updated dashboard uses pnpm.

Production preview and local logic checks:

```sh
pnpm typecheck
pnpm exec playwright test tests/readiness.spec.ts tests/execution-records.spec.ts
pnpm build
pnpm start --hostname 127.0.0.1 --port 3000
```

Run only one server on port 3000. Stop the dev server before starting the production preview. Rebuild after editing source if using `pnpm start`.

## Included functionality

- Release readiness, sample outcome distribution, outstanding risks and Slack-copy dialog.
- Light/dark theme switch; preference persists in localStorage.
- Grouped navigation, breadcrumbs and workspace search (Cmd/Ctrl + K).
- Searchable run table, source tabs, status filters, sorting and dedicated run investigation pages.
- Actual recorded CI detail at `/runs/ci-37567120072` (run_ref `ci-corrected-01`): 14 test cases, final-attempt durations, retries, failure messages, skip reasons and original artifact link.
- Live run history (`/api/history`): every `qa-run.yml` run on `main` from the GitHub API, with pass/fail/skip totals read from each run's own artifact (`qa-summary-*`, falling back to `results.json` in the report) and cached in Redis. The workflow also runs every 6 hours, so the trend reflects real runs between demos.
- Live targets (`/api/targets`): one anonymous GET of the Allocations sign-in page (status, latency, the four SM-004 security headers), GitHub workflow state, Redis ping and this deployment's commit. CDN-cached for 60 s, so the product sees at most one probe a minute from the console.
- Scenario library with device history, local triage editing, owner/priority/classification/ticket fields, quarantine and reset.
- Harness coverage and connection-status explanations.
- Trigger dialog and real server-side dispatch/status/quota implementation. The dialog shows missing setup and prevents dispatch when quota is unavailable.
- Original root Playwright harness, fail-closed sign-in checks and `.github/workflows/qa-run.yml`.

## PR quality gate (pre-merge and post-merge)

| Trigger | Workflow | Scope (`QA_SCOPE`) |
|---|---|---|
| Pre-merge: every PR to `main` (open, push, reopen, ready for review) | `qa-pr.yml` | **API** — anonymous API boundary + security headers; fails the check so branch protection can block the merge |
| Post-merge: every push to `main`, attributed to the merged PR | `qa-pr.yml` | **UI + API** — the full pre-auth suite |
| Weekly regression: Mondays 03:00 UTC or on demand | `qa-regression.yml` | **Entire suite**, every spec old and new, each check repeated 3× |
| Health check: every 6 h | `qa-run.yml` | Full suite |
| Manual: console *Trigger run* | `qa-run.yml` | All / desktop / mobile, or **Failure drill** (`tests/drill`: two deliberate, read-only failures — one UI, one API — that prove the failure report) |

API specs are recognised by filename (`*api*`, `*header*`, `*boundary*`, `*contract*`), so new specs join the right gate automatically. The full process — gates, triage, severity, roles — is documented in the console at `/process`. Every run's report is also a console page at `/runs/gh/<run id>` with inline screenshots and recordings.

Each run posts **one report** to the PR (a sticky comment per phase), the job summary, and — when the secrets are set — Slack and Microsoft Teams:

- PR number, title and link; author (@mentioned); commit; target; phase
- total / passed / failed / flaky / skipped and duration; slowest checks
- every failure with a **cause** (`UI`, `BACKEND`, `NETWORK`, `TIMEOUT`, `TEST`), the first error line and the full error text
- links to that failure's **screenshot** (shown inline in Slack/Teams), **recording**, **trace** (opens in trace.playwright.dev) and **log** (`error-context.md`: error, page snapshot, test source), served by the console's `/api/evidence` route from the run's own artifact
- stakeholders from `.github/qa-notify.json`: QA is always notified; frontend / backend / platform owners are added only when a failure of that cause appears

Causes are a rule-based triage hint from the error text and spec type (`scripts/qa-notify.mjs`, tested against the real 6 Oct failing report), not a verdict.

Setup: add repository secrets `SLACK_WEBHOOK_URL` (Slack incoming webhook) and/or `TEAMS_WEBHOOK_URL` (Teams Workflows webhook), and fill Slack member IDs / Teams emails in `.github/qa-notify.json`. Without them the PR comment and job summary still work.

## Evidence and limitations

| Data | Provenance |
| --- | --- |
| Scenario library and release verdict | Seeded fixture + authenticated mocks, not production evidence. Initial verdict is NO-GO because INV-020 is a mocked failed blocker. |
| Seven sample execution groups | Grouped from existing fixture history by reference, product flow and device. They are not GitHub workflows. |
| Recorded CI | Imported static snapshot from the actual report artifact: 2 passed, 7 failed, 5 skipped. Started 2026-10-06 19:55 UTC (7 October in India). |
| Recorded local run | Aggregate snapshot: 3 passed, 6 failed, 5 skipped. No per-test details imported for this entry. |
| Live session runs | Real dispatch metadata, once configured. Workflow conclusions never manufacture scenario outcomes. |

The first harness executions exposed incorrect password-form assumptions and a blocked startup refresh request on the actual email-code/passkey sign-in surface. These are harness failures, not verified product defects. Skips do not count as passes. Keep the no-credential-submission boundary while adapting the checks.

Triage edits are in-memory, shared between the library/readiness/Slack copy, and lost on reload. Example issue keys are not synced to an issue tracker. Theme preference is stored in localStorage; non-sensitive live run metadata is stored in sessionStorage. No demo key is persisted.

Verified for this package's source: dashboard typecheck, production build and seven logic/evidence-integrity tests. Desktop Chrome checks covered theme switching/persistence, run search, list-to-detail navigation, real error expansion and the blocked trigger dialog. Full mobile/all-interaction regression, scratch Redis integration tests and live dashboard dispatch are still pending.

## Original harness

From the repository root (not dashboard):

```sh
npm ci
npx playwright install --with-deps chromium webkit
npm test
```

These commands contact the actual public Allocations surface. They are not needed just to explore the local UI. The known harness failures above remain unresolved; do not present it as a green suite.

## Connect live triggering later

Use `dashboard/.env.example` as the environment-variable inventory. Configure these privately, never in client code or version control:

- `GH_TOKEN`: fine-grained GitHub PAT, Actions read/write for this repository only.
- `GH_OWNER`, `GH_REPO`, `GH_WORKFLOW`, `GH_BRANCH`: the fixed dispatch destination.
- `DEMO_KEY_HASH`: SHA-256 hash of a privately generated demo key. Only share the original key privately with reviewers and rotate after review.
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: Upstash credentials.

Restart the server after changing environment variables. Readable quota alone does not verify all integration credentials. Live Redis tests need a scratch database; the test instructions are in `dashboard/tests/admission.spec.ts` and `dashboard/tests/trigger.spec.ts`. All `ALLOW_TEST_NAMESPACE` and `TEST_*` seams are dev-only and must never be set on a public deployment.

Admission validates the key before atomic Redis cooldown/daily-cap checks. Exact `run_ref` names correlate workflow dispatches. Definitive rejection can release the owner-checked slot; ambiguous dispatch is not refunded. No run is invented when confirmation times out.

## Project layout

```text
tests/preauth/                 Original five smoke specs and helpers
.github/workflows/qa-run.yml   Real workflow_dispatch workflow
fixtures/                     Original seeded history
dashboard/app/                Console pages, run detail route and server API routes
dashboard/components/         UI, providers, navigation, dialogs and run investigation
dashboard/lib/                Auth, Redis, GitHub, readiness and evidence logic
dashboard/fixtures/           Seeded history + sanitized recorded CI snapshot
dashboard/tests/              Unit/evidence tests and scratch-Redis integration tests
dashboard/V0_PROMPT.md         Historical v0 generation brief, not the current status
```

The ZIP intentionally excludes dependencies, Next builds, Git metadata, raw videos/traces/screenshots and credentials. Install dependencies locally. The original CI artifact remains linked on GitHub and is subject to its retention policy.
