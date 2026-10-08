# Allocations QA Console

QA assignment for [dashboard.allocations.com](https://dashboard.allocations.com) by Aviraj Lall. Not an official Allocations product.

- **Live console:** https://aviraj-allocations-qa.vercel.app
- **Built with v0:** [v0 chat "Build Lead QA tool"](https://v0.app/avirajlall26-2389/chat/build-lead-qa-tool-qVMTjJgaNwZ) (brief in `dashboard/V0_PROMPT.md`), then extended in code.

## What it does

- Playwright checks on the public sign-in page, on desktop Chrome and iPhone 13 (WebKit): sign-in page loads, email validation, anonymous API returns 401, security headers, mobile layout.
- Tests are read-only on production: the sign-in tests block every POST/PUT/DELETE except the app's own session refresh.
- The console shows the release status (GO / CONDITIONAL / NO-GO), run history, a report for every run (failures with screenshot, recording, trace and log), live environment checks, and the QA/QC process.
- **Trigger run** starts a GitHub Actions run from the console. No key needed for the demo: 30 s between runs, 20 runs a day, 5 per browser. Set `TRIGGER_REQUIRE_KEY=1` in Vercel to require a demo key again.

## When tests run

| Trigger | Workflow | Tests |
|---|---|---|
| PR opened or updated | `qa-pr.yml` | API checks; a failure blocks the merge |
| Merged to `main` | `qa-pr.yml` | UI + API |
| Mondays 03:00 UTC | `qa-regression.yml` | Whole suite, each check 3× |
| Every 6 hours | `qa-run.yml` | Whole suite |
| Trigger run (console) | `qa-run.yml` / `qa-regression.yml` | You pick environment, suite and scope; "Failure drill" runs two tests that fail on purpose |

Each run posts a report as a PR comment, in the job summary and in the console. Slack and Teams are optional (`SLACK_WEBHOOK_URL`, `TEAMS_WEBHOOK_URL` secrets).

## Environments and other CI

`dashboard/qa-environments.json` lists dev, staging and prod. Only the production URL exists for this assignment, so dev and staging point at it and every report marks them as demo aliases.

`scripts/qa-ci.sh` runs the same flow on any CI (set `QA_PHASE`, optionally `QA_ENV` and `QA_SCOPE`). `azure-pipelines.yml` is a ready-to-import Azure DevOps version; I haven't run it in an Azure org.

## Real vs sample data

- **Real:** pre-auth test results, run history, run reports and evidence (from GitHub Actions), live environment checks.
- **Sample (marked FIXTURE / MOCK):** scenario history, and logged-in flows like SPV formation, KYC, capital calls and distributions, because they need Allocations accounts.

One real finding: **PRE-002**, the sign-in error message isn't linked to the email field (`aria-invalid` / `aria-describedby` missing), so screen readers don't announce it.

## Run it locally

```sh
npm ci && npx playwright install chromium webkit
npm test                       # harness against production
npm run test:unit              # reporter and environment tests

cd dashboard
pnpm install --frozen-lockfile
pnpm dev                       # http://localhost:3000
pnpm typecheck && pnpm build
```

The console needs `GH_TOKEN`, `GH_OWNER`, `GH_REPO`, `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (see `dashboard/.env.example`). No credentials are in this repo.

## Layout

```text
tests/preauth/          Playwright checks
tests/drill/            Failure drill (fails on purpose)
scripts/                Reporter, environment resolver, CI entrypoint
.github/workflows/      PR gate, regression, manual runs
azure-pipelines.yml     Azure DevOps version
dashboard/              Next.js console (pages, API routes, tests)
```
