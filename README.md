# Allocations QA Console

Independent QA demonstration for **dashboard.allocations.com**, built as a Lead QA assignment. This is not an official Allocations product.

**Live console:** not deployed · **Workflow:** [`qa-run.yml`](.github/workflows/qa-run.yml)

## Verified status — 7 October 2026

This repository is a work-in-progress submission, not a completed production console.

- Both packages install with `npm ci` and pass TypeScript checks. The Next.js production build passes.
- The first live harness run finished with **3 passed, 6 failed, 5 skipped** across desktop Chromium and mobile WebKit. These results are separate from the seeded fixture.
- The live sign-in surface uses email codes/passkeys, not the password form assumed by SM-002. Its startup session-refresh POST is blocked by SM-002's fail-closed network guard, so the guarded page displays a session-loading error before the form appears. The guard has not been weakened to make the tests pass.
- Password-reset and public-link checks skipped when those elements were not found; the desktop mobile-only check is intentionally skipped. These skips are not passing coverage.
- The dashboard currently contains real API implementation and a placeholder UI. Redis integration tests, hosted workflow execution, the four-page UI, and deployment remain unverified or unfinished.
- Dashboard PostCSS is pinned through an override to `8.5.29`; the local dependency audit reported zero vulnerabilities after that update.

Before presenting a working demo, adapt the harness to the actual passwordless surface while preserving its no-credential-submission boundary, run the scratch-Redis tests, and implement/deploy the UI. Do not interpret the fixture verdict as a production release assessment.

## What it is

| Part | Where | Real or mock? |
|---|---|---|
| Pre-auth demonstration harness — 5 Playwright checks, desktop + iPhone 13 | `tests/preauth/` | **Real.** Runs against the public sign-in surface. Never submits credentials. |
| GitHub Actions workflow with `run_ref` correlation and report artifacts | `.github/workflows/qa-run.yml` | **Real.** |
| Trigger + status API with demo-key auth, atomic Upstash cooldown/daily cap (Lua), owner-checked rollback | `dashboard/` — a runnable Next.js 15 package: backend routes + placeholder shell | **Real backend.** UI pages are generated from `V0_PROMPT.md` and dropped over the shell. |
| Scenario history for SPV / onboarding / KYC / capital-call / distribution flows | `fixtures/scenario-history.json` | **Fixture.** Every row is seeded — the pre-auth rows mirror the real checks but are not imported results; authenticated flows need Allocations credentials. Live runs are shown at workflow level only. |
| Release Readiness verdict + Slack-copy | `dashboard/V0_PROMPT.md` | **Planned UI, not implemented.** The prompt requires fixture and live evidence to remain labelled and separate. |

## Definition of done
A reviewer can: trigger the one approved workflow with the demo key → see its correlated status →
open real pre-auth evidence (HTML report, traces on failure) → tell fixture data from live data →
copy an honest release verdict into Slack.

## Repository layout
```
.                      Playwright harness (root package)
├── tests/preauth/     5 pre-auth specs + helpers
├── .github/workflows/ qa-run.yml (workflow_dispatch, run_ref correlation)
├── fixtures/          scenario-history.json (labelled fixture)
└── dashboard/         Next.js 15 package — API routes, libs, trigger tests, v0 prompt
```

## Run the harness locally
```bash
npm ci
npx playwright install --with-deps chromium webkit
npm test            # both projects
npm run test:mobile # iPhone 13 only
npm run report
```

## Run the backend locally
```bash
cd dashboard
cp .env.example .env.local   # fill in values
npm ci && npm run dev
# trigger-route concurrency/rollback tests (needs a scratch Upstash DB):
# Admission tests never call GitHub. Start the server with a controlled dispatch outcome:
ALLOW_TEST_NAMESPACE=1 TEST_COOLDOWN_SECONDS=1 TEST_DISPATCH_MODE=accept npm run dev
DEMO_KEY=<key> TEST_DISPATCH_MODE=accept npm test    # concurrency, quota, 20-run boundary
ALLOW_TEST_NAMESPACE=1 TEST_COOLDOWN_SECONDS=1 TEST_DISPATCH_MODE=reject npm run dev
DEMO_KEY=<key> TEST_DISPATCH_MODE=reject npm test    # rollback + refund
ALLOW_TEST_NAMESPACE=1 TEST_COOLDOWN_SECONDS=1 TEST_DISPATCH_MODE=uncertain npm run dev
DEMO_KEY=<key> TEST_DISPATCH_MODE=uncertain npm test # no refund on ambiguous dispatch
ALLOW_TEST_NAMESPACE=1 TEST_COOLDOWN_SECONDS=1 TEST_DISPATCH_MODE=accept TEST_ACQUIRE_TIMEOUT_MS=0 npm run dev
DEMO_KEY=<key> TEST_DISPATCH_MODE=accept TEST_ACQUIRE_TIMEOUT_MS=0 npm test   # timeout-branch smoke (503)
# Ordered ACQUIRE/CANCEL proof — talks to the scratch Upstash DB directly, every op awaited:
UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... npm test -- tests/admission.spec.ts
```

## Deploy the console
1. Generate the UI in v0.dev using `dashboard/V0_PROMPT.md`.
2. Drop `dashboard/lib/*` and `dashboard/app/api/**` into the v0 project; `npm i @upstash/redis`.
3. Vercel → add Upstash Redis integration (free tier).
4. Create a **fine-grained PAT** scoped to this repo, permission *Actions: read & write* only.
5. `openssl rand -base64 32` → that's the demo key. Store `printf '%s' "$KEY" | sha256sum | cut -d' ' -f1` as `DEMO_KEY_HASH`. Set the rest from `.env.example`.
6. Deploy. Share the demo key with reviewers in the submission message. **Rotate it after review.**

## Guardrails on `/api/trigger`
Validate key (SHA-256, `timingSafeEqual` on buffers) → one Lua script does
`SET trigger:cooldown <owner> NX EX 30` + date-scoped `INCR` + `EXPIRE` on first increment +
reject > 20, so admission is atomic → dispatch fixed workflow only → on GitHub failure a second
script releases **only if the cooldown is still owned by this request** and decrements the counter.
Run correlation matches GitHub's `display_title` exactly against `QA run <run_ref>`.

Failure semantics are deliberate and explicitly classified (`classifyDispatchStatus`):
- `204` → **accepted**.
- `400 401 403 404 422` → **rejected** — GitHub definitively refused, no side effects → refund
  (owner-checked, against the original admission keys, so a request crossing UTC midnight never
  decrements tomorrow's counter).
- `5xx`, `429`, anything else, or a thrown timeout → **uncertain** — a 504 can arrive after GitHub
  accepted → *no refund*. The route returns 202 with `dispatch: "uncertain"`; the UI polls with a
  3-minute deadline, then parks the run as **Unresolved** with a manual Recheck. Quota stays consumed.
- Redis times out on ACQUIRE → the route schedules `cancelAdmission` via Next `after()` (runs inside the
  request lifecycle, bounded). CANCEL is one script: it sets a cancel marker **and** releases if the lock
  is ours. ACQUIRE checks that marker first, so a delayed ACQUIRE that lands *after* CANCEL is refused
  rather than silently consuming quota. Script atomicity orders the check; the marker orders the two
  HTTP requests.

Timeouts: GitHub 8 s, Redis 2 s. Client sees fixed messages only; the key is never logged.
`GET /api/quota` exposes runs-used/limit/cooldown for the UI and the tests (not secret).

## Fixture note
With the shipped fixture, Release Readiness computes **NO-GO** (INV-020 is a failed blocker). That is
intentional: the fixture demonstrates a seeded blocker, not an observed production defect. The planned Slack-copy output must identify it as fixture evidence.

## Deliberate restraint
Testing a production sign-in with bad credentials from a public tool is a security smell, not a test.
SM-002 enforces the boundary rather than promising it: service workers are blocked in the Playwright
config, and a **context-level** route is armed before navigation that aborts *every* non-GET/HEAD/OPTIONS
request to any destination (fail closed — no guessing the auth endpoint's name). Attempts to
`*.allocations.com` are counted and must be zero; the tests also require real validation feedback
caused by the click. The empty-submit case accepts any `invalid` event inside the form (capture
listener on the form, armed just before the click). The malformed-email case is **bound to the email
element**: an `invalid` event on that element (it does not bubble, so a required-password error cannot
satisfy it) or that field's own `aria-invalid` / `aria-describedby` / `aria-errormessage` feedback
changing. A pre-invalid field behind an inert `type="button"` fails both; a form where email accepts
arbitrary text but password is required fails the malformed-email check. The probes never call
`checkValidity()`/`reportValidity()`.

Not covered by the controlled suites: the real HTTP classification path (bypassed by the dispatch
seam) and the browser UI, which is generated from the v0 prompt.
