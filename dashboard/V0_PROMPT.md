# v0.dev prompt — Allocations QA Console

Paste the block below into v0.dev as the first message. After it generates, add the files
from `dashboard/lib/` and `dashboard/app/api/` into the project (v0 lets you edit files
directly), install `@upstash/redis`, set the env vars from `.env.example` in Vercel, and deploy.

---

Build a Next.js 15 App Router internal QA console called **Allocations QA Console** for the QA team
that tests dashboard.allocations.com (Hercules UI — SPV and fund formation, investor onboarding/KYC,
capital calls, distributions). Dark, dense, operational UI. shadcn/ui + Tailwind. Mobile-responsive.
Sidebar nav with four pages. No fake live-polling animations; everything that is mock must be labelled.

## Global
- Top bar: product name, "Release train · 2026.10", and a **Trigger run** button.
- Trigger run opens a dialog: suite selector (All / Desktop / Mobile), a password-type input
  "Demo key" (never persisted beyond sessionStorage), and a Start button.
  It POSTs `{ demoKey, suite }` to `/api/trigger`. On 202 it stores `run_ref` and starts polling
  `GET /api/runs/{run_ref}` every 12 s until `status === "completed"`, showing a toast that progresses
  queued → in progress → completed with conclusion, and a link to `html_url` plus `artifacts_url`.
  On 401 show "Demo key rejected". On 429 show the server's `message` and disable the button for
  `retryAfter` seconds. On 5xx show the server's `message`. Never show raw error bodies.
- Every data block carries a small badge: **LIVE** (workflow-level status from /api/runs — never
  per-scenario), **FIXTURE** (`source: "fixture-harness"` rows that mirror the real pre-auth checks
  but are seeded, not imported) or **MOCK** (`source: "mock"` authenticated flows that cannot run
  without credentials). Authenticated scenarios also show a lock icon with tooltip
  "Authenticated product flow — mocked; requires Allocations credentials".
- Top bar also shows quota from `GET /api/quota`: "Runs today: {used}/{limit}" and, when
  `cooldownRemaining > 0`, a countdown that disables Trigger run.
- The 202 response includes `dispatch: "accepted" | "uncertain"`. For `uncertain`, show
  "Confirming with GitHub…" and poll. Polling has a deadline: if `/api/runs/{ref}` still returns
  `found: false` after 3 minutes, stop automatic polling and move the run to an **Unresolved**
  state with a "Recheck" button that polls once on demand. Never invent a pass/fail for an
  unresolved run and never offer a refund from the UI — quota was consumed and stays consumed.
  Once `found: true`, poll until `status === "completed"` with no deadline (GitHub owns that).

## Page 1 — Release Readiness (default route `/`)
- Verdict card: **GO / CONDITIONAL GO / NO-GO**, computed from fixture data (label the card
  "computed from fixture + mock scenarios; live workflow runs listed separately"):
  NO-GO if any `blocker: true` scenario's latest status is `fail`;
  CONDITIONAL GO if any blocker is `flaky` or quarantined; else GO.
- Three counters: blocker failures, open defects (entries with a triage ticket), retest progress
  (percentage of previously failed scenarios whose latest status is pass) with a progress bar.
- "What changed since previous run" list: scenarios whose latest status differs from the prior one.
- Release risks table: scenario, class (product-defect / automation-defect / environment / flaky),
  owner, priority, ticket, evidence link.
- **Copy as Slack update** button that writes this exact format to the clipboard:

```
*QA status — Release 2026.10 · <date> UTC*
*Verdict:* <GO|CONDITIONAL GO|NO-GO>
*Completed:* <n> scenarios passed (<n> fixture, <n> mock) · live workflow runs today: <n> (<n> green)
*In-Review:* <ticket list with scenario names>
*In-Progress:* retest <pct>% done
*Blockers:* <exact action required, e.g. "LIN-412 fix needs merge before prod push">
Evidence: <console URL>
```

## Page 2 — Scenario History (`/history`)
- Loads `fixtures/scenario-history.json` (bundle it as a static import). Show the `_meta.label`
  prominently at the top of the page as a fixture notice with `generated_at`.
- Table grouped by `flow` (pre-auth, spv-formation, investor-onboarding, capital-calls,
  distributions). Columns: ID, scenario, blocker, latest status, duration, env, device
  (desktop-chromium / mobile-iphone), last run, source badge, lock icon when `auth_required`.
- Row expands to show full history and a **Triage** panel: class select, owner select
  (frontend / backend / qa / infra), priority (P0–P3), ticket text (LIN-xxx), quarantine toggle,
  note. Editable in state only; show "unsaved — demo" hint.
- Do NOT fan a workflow conclusion out to individual scenarios. A green desktop-only run says
  nothing about the mobile check, and skipped specs are not passes. Live results stay at workflow
  level on the Runs page until per-test import from the Playwright `results.json` artifact exists;
  show a muted note on this page saying exactly that.

## Page 3 — Runs (`/runs`)
- List of triggered runs from this browser session (sessionStorage): run_ref, suite, started,
  dispatch (accepted / uncertain), status (queued / in_progress / completed / unresolved),
  conclusion, GitHub link, artifacts link, and a Recheck button on unresolved rows. Empty state explains that runs are correlated by
  `run_ref` embedded in the GitHub run name and that status is read on demand, not pushed.

## Page 4 — Harness (`/harness`)
- Read-only explainer: the five pre-auth checks (SM-001..SM-005) with one line each, the statement
  that no test submits credentials to production auth, Playwright config highlights
  (`trace: retain-on-failure`, desktop + iPhone 13 projects), and a link to the GitHub repo
  `https://github.com/avirajred26/allocations-qa-console`.

## Non-goals (say so in a footer)
Environment comparison, dashboards of invented metrics, and any data not labelled by source.
