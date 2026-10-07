#!/usr/bin/env bash
# CI-neutral entrypoint for the QA harness. Any CI (GitHub Actions, Azure DevOps, GitLab,
# Jenkins, a laptop) can run the same thing:
#
#   QA_PHASE=pre-merge  scripts/qa-ci.sh          # API checks against the pre-merge environment
#   QA_PHASE=post-merge scripts/qa-ci.sh          # UI + API
#   QA_PHASE=regression scripts/qa-ci.sh          # entire suite, each check 3x
#   QA_PHASE=manual QA_ENV=staging QA_SCOPE=ui scripts/qa-ci.sh
#
# Steps: resolve the environment from dashboard/qa-environments.json -> run Playwright ->
# write the report (qa-report.md, qa-summary.json, junit.xml) and notify if configured.
# Exit code is Playwright's, so the pipeline goes red exactly when a check failed.
set -uo pipefail
cd "$(dirname "$0")/.."

PHASE="${QA_PHASE:-manual}"
case "$PHASE" in
  pre-merge)  : "${QA_SCOPE:=api}" ;;
  regression) : "${QA_SCOPE:=full}"; EXTRA="--repeat-each=3" ;;
  *)          : "${QA_SCOPE:=full}" ;;
esac
export QA_PHASE="$PHASE" QA_SCOPE CI="${CI:-true}"

# Environment: explicit QA_ENV wins, otherwise the gate for this phase.
if ! resolved="$(node scripts/qa-env.mjs "${QA_ENV:-$PHASE}")"; then exit 2; fi
while IFS='=' read -r k v; do [ -n "$k" ] && export "$k=$v"; done <<<"$resolved"
echo "QA ${QA_PHASE} · scope ${QA_SCOPE} · ${QA_ENV_LABEL} (${BASE_URL})"

npx playwright test ${EXTRA:-} ${QA_PROJECT:+--project="$QA_PROJECT"}
status=$?

node scripts/qa-notify.mjs || echo "qa-notify failed (report not sent); test status unchanged"
exit $status
