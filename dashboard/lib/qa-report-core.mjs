/**
 * Pure core of the QA reporter, shared by scripts/qa-notify.mjs (any CI) and the console's
 * run report (which rebuilds reports for runs that predate qa-summary.json). No dependencies,
 * no I/O: Playwright results.json in, report out.
 */
const ANSI = /\u001b\[[0-9;]*m/g;
export const clean = (s) => (s ?? '').replace(ANSI, '');

export const CATEGORY = {
  network: { label: 'Network / environment', short: 'NETWORK', role: 'platform', hint: 'Target unreachable or navigation timed out — check the environment before the code.' },
  backend: { label: 'Backend / API', short: 'BACKEND', role: 'backend', hint: 'An HTTP status, header or request-level expectation was not met.' },
  ui: { label: 'UI', short: 'UI', role: 'frontend', hint: 'An element was missing, hidden or rendered differently than expected.' },
  timeout: { label: 'Timeout', short: 'TIMEOUT', role: 'qa', hint: 'The test ran out of time without a more specific signal.' },
  test: { label: 'Test / assertion', short: 'TEST', role: 'qa', hint: 'Assertion failed without a UI or API signal; review the test first.' },
};

/** Request-level specs: a failure there is about the server's answer, not the page. */
const REQUEST_LEVEL_SPEC = /(api|header|boundary|contract)[^/]*\.spec\.[jt]s$/i;

/** Ordered rules: the first match wins. */
export function classifyFailure({ file = '', message = '' }) {
  const m = clean(message);
  if (/net::ERR_|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket hang up|NS_ERROR_|page\.goto: Timeout|navigation timeout/i.test(m)) return 'network';
  if (REQUEST_LEVEL_SPEC.test(file)) return 'backend';
  // An HTTP status compared in an assertion about an endpoint or a status (e.g. Expected: 200, Received: 401).
  if (/(\/api\/|\bstatus\b)[\s\S]{0,300}\b(Expected|Received):\s*[1-5]\d\d\b/i.test(m)) return 'backend';
  if (/status (code )?(of )?[45]\d\d\b|Failed to load resource|toBeOK|response\.(status|ok)|apiRequestContext|mutating request|\b5\d\d\b.*(error|status)/i.test(m)) return 'backend';
  if (/locator|getBy(Role|Text|Label|Placeholder|TestId)|toBe(Visible|Hidden|Enabled|Disabled|InViewport|Checked)|toHave(Text|Value|Count|Attribute|Screenshot|Class|CSS)|element is not|overflow|tap target/i.test(m)) return 'ui';
  if (/Test timeout of \d+ms exceeded|Timeout \d+ms exceeded/i.test(m)) return 'timeout';
  return 'test';
}

/** Absolute runner path → path inside the uploaded artifact (playwright-report/ + test-results/). */
export function artifactPath(p) {
  if (!p) return null;
  const s = p.replace(/\\/g, '/');
  const i = s.search(/(^|\/)(test-results|playwright-report)\//);
  return i < 0 ? null : s.slice(s[i] === '/' ? i + 1 : i);
}

export function firstLine(msg) {
  return clean(msg).split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 220) ?? '';
}

function evidenceOf(result) {
  const pick = (name) => artifactPath(result?.attachments?.find((a) => a.name === name && a.path)?.path);
  return { screenshot: pick('screenshot'), video: pick('video'), trace: pick('trace'), log: pick('error-context') };
}

/** Flattens results.json into totals, per-test rows and enriched failures. */
export function buildReport(results) {
  const tests = [];
  const walk = (suite, parents = []) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        const final = t.results[t.results.length - 1] ?? {};
        const firstBad = t.results.find((r) => r.status !== 'passed' && r.status !== 'skipped');
        tests.push({
          title: [...parents, spec.title].join(' › '),
          file: spec.file,
          line: spec.line,
          project: t.projectName,
          outcome: t.status, // expected | unexpected | flaky | skipped
          durationMs: t.results.reduce((n, r) => n + (r.duration ?? 0), 0),
          retries: Math.max(0, t.results.length - 1),
          final,
          firstBad,
          annotations: [...(t.annotations ?? []), ...(final.annotations ?? [])],
        });
      }
    }
    // File-level suites carry the file name as title; nested suites are describe() blocks.
    for (const child of suite.suites ?? []) walk(child, child.title && child.title !== child.file ? [...parents, child.title] : parents);
  };
  for (const s of results.suites ?? []) walk(s);

  const s = results.stats ?? {};
  const stats = { total: tests.length, passed: s.expected ?? 0, failed: s.unexpected ?? 0, flaky: s.flaky ?? 0, skipped: s.skipped ?? 0, durationMs: Math.round(s.duration ?? 0), startTime: s.startTime ?? null };

  const toFailure = (t, attempt) => {
    const message = attempt?.error?.message ?? attempt?.errors?.map((e) => e.message).join('\n') ?? '';
    const category = classifyFailure({ file: t.file, message });
    return {
      title: t.title, file: t.file, line: t.line, project: t.project, retries: t.retries, durationMs: t.durationMs,
      category, reason: firstLine(message),
      detail: clean(message).split('\n').slice(0, 14).join('\n').slice(0, 1500),
      evidence: evidenceOf(attempt),
    };
  };
  const failures = tests.filter((t) => t.outcome === 'unexpected').map((t) => toFailure(t, t.final));
  const flaky = tests.filter((t) => t.outcome === 'flaky').map((t) => toFailure(t, t.firstBad));
  const byCategory = {};
  for (const f of failures) byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  const findings = tests.flatMap((t) => t.annotations.filter((a) => a.type === 'finding').map((a) => a.description)).filter((v, i, a) => v && a.indexOf(v) === i);
  const slowest = [...tests].filter((t) => t.outcome !== 'skipped').sort((a, b) => b.durationMs - a.durationMs).slice(0, 3).map((t) => ({ title: t.title, project: t.project, durationMs: t.durationMs }));
  const all = tests.map((t) => ({
    title: t.title, file: t.file, line: t.line, project: t.project,
    outcome: t.outcome, status: t.final.status ?? 'skipped', durationMs: t.durationMs, retries: t.retries,
    // Playwright records some annotations on both the test and its result; keep each once.
    annotations: t.annotations.map((a) => ({ type: a.type, description: a.description ?? '' })).filter((a, i, all) => all.findIndex((b) => b.type === a.type && b.description === a.description) === i),
  }));
  return { stats, tests: all, failures, flaky, byCategory, findings, slowest, globalErrors: (results.errors ?? []).map((e) => firstLine(e.message)) };
}

