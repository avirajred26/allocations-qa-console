import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReport, classifyFailure, artifactPath, resolvePeople, renderMarkdown, renderSlack, renderTeams, links } from './qa-notify.mjs';

// Real results.json from GitHub Actions run 37522348772 (6 Oct, pre-fix harness): 2 passed, 7 failed, 5 skipped.
const failing = JSON.parse(readFileSync(new URL('./fixtures/failing-results.json', import.meta.url), 'utf8'));
const ctx = { phase: 'pre-merge', prNumber: '12', prTitle: 'Tighten sign-in checks', prUrl: 'https://github.com/o/r/pull/12', author: 'avirajred26', sha: 'abcdef1234567', repo: 'o/r', runId: '999', runUrl: 'https://github.com/o/r/actions/runs/999', target: 'https://dashboard.allocations.com', consoleUrl: 'https://console.example' };
const config = { stakeholders: [
  { name: 'Aviraj Lall', role: 'qa', github: 'avirajred26', slack: 'U0AVIRAJ', teams: 'aviraj@example.com' },
  { name: 'FE Lead', role: 'frontend', github: 'fe-lead', slack: 'U0FE' },
  { name: 'BE Lead', role: 'backend', github: 'be-lead', slack: 'U0BE' },
  { name: 'Platform', role: 'platform', github: 'plat', slack: 'U0PL' },
] };

test('totals come straight from results.json stats', () => {
  const r = buildReport(failing);
  assert.deepEqual({ ...r.stats, startTime: undefined }, { total: 14, passed: 2, failed: 7, flaky: 0, skipped: 5, durationMs: 94330, startTime: undefined });
  assert.equal(r.failures.length, 7);
});

test('real failures split into backend (401 resource) and UI (locator) causes', () => {
  const r = buildReport(failing);
  assert.deepEqual(r.byCategory, { backend: 1, ui: 6 });
  assert.match(r.failures.find((f) => f.category === 'backend').reason, /status of 401/);
});

test('classification rules: network first, request-level specs are backend, locators are UI', () => {
  assert.equal(classifyFailure({ message: 'page.goto: net::ERR_NAME_NOT_RESOLVED at https://x' }), 'network');
  assert.equal(classifyFailure({ file: 'preauth/03-anon-api-boundary.spec.ts', message: 'expect(received).toBe(expected) Expected: 401 Received: 200' }), 'backend');
  assert.equal(classifyFailure({ file: 'preauth/04-security-headers.spec.ts', message: 'HSTS' }), 'backend');
  assert.equal(classifyFailure({ message: "expect(locator).toBeVisible() failed Locator: getByRole('button')" }), 'ui');
  assert.equal(classifyFailure({ message: 'Test timeout of 30000ms exceeded.' }), 'timeout');
  assert.equal(classifyFailure({ message: 'expect(received).toEqual(expected)' }), 'test');
});

test('every failure carries screenshot, recording, trace and log from its final attempt', () => {
  for (const f of buildReport(failing).failures) {
    for (const k of ['screenshot', 'video', 'trace', 'log']) assert.match(f.evidence[k], /^test-results\/.+-retry1\//, `${f.title} ${k}`);
  }
  assert.equal(artifactPath('/home/runner/work/a/a/test-results/x/trace.zip'), 'test-results/x/trace.zip');
  assert.equal(artifactPath('/tmp/elsewhere/file.png'), null);
});

test('evidence links go through the console and the trace opens in the Playwright viewer', () => {
  const l = links(ctx, buildReport(failing).failures[0]);
  assert.match(l.screenshot, /^https:\/\/console\.example\/api\/evidence\/999\/test-results\//);
  assert.match(l.trace, /^https:\/\/trace\.playwright\.dev\/\?trace=https%3A%2F%2Fconsole\.example%2Fapi%2Fevidence%2F999%2F/);
});

test('author is resolved from config; owners are added only for causes that appeared', () => {
  const p = resolvePeople(config, ctx, buildReport(failing));
  assert.equal(p.author.slack, 'U0AVIRAJ');
  assert.deepEqual(p.notify.map((x) => x.role).sort(), ['backend', 'frontend']);
  const green = { ...buildReport(failing), failures: [], byCategory: {} };
  assert.deepEqual(resolvePeople(config, { ...ctx, author: 'someone' }, green).notify.map((x) => x.name), ['Aviraj Lall']);
});

test('Slack, Teams and Markdown messages carry PR, author, counts, causes and evidence', () => {
  const r = buildReport(failing);
  const people = resolvePeople(config, ctx, r);
  const slack = JSON.stringify(renderSlack(ctx, r, people));
  for (const s of ['PR #12', '<@U0AVIRAJ>', '<@U0FE>', '<@U0BE>', '2/14', '1m 34s', 'Backend / API *1*', 'UI *6*', 'Screenshot', 'Recording', 'Trace', 'Log', '"type":"image"']) assert.ok(slack.includes(s), `slack missing ${s}`);
  assert.ok(renderSlack(ctx, r, people).blocks.length <= 50);
  const teams = JSON.stringify(renderTeams(ctx, r, people));
  for (const s of ['AdaptiveCard', 'PR #12', '<at>Aviraj Lall</at>', 'aviraj@example.com', 'Failures by cause']) assert.ok(teams.includes(s), `teams missing ${s}`);
  const md = renderMarkdown(ctx, r, people);
  assert.ok(md.startsWith('<!-- qa-report:pre-merge -->'));
  for (const s of ['❌ QA pre-merge failed · PR #12', '| 14 | 2 | 7 | 0 | 5 | 1m 34s |', '**BACKEND**', '**UI**', '[trace](', '@fe-lead']) assert.ok(md.includes(s), `markdown missing ${s}`);
});
