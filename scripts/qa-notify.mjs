#!/usr/bin/env node
/**
 * QA run reporter: turns Playwright's results.json into one report and sends it to
 * the PR (sticky comment), the job summary, Slack and Microsoft Teams.
 *
 * Every number comes from results.json. Failure categories are a rule-based reading of
 * the error text and the spec type, shown as a triage hint, never as a verdict.
 * Evidence links point at the console's /api/evidence route, which serves files out of
 * this run's own report artifact (so Slack can show the screenshot inline).
 *
 * No dependencies: runs on the runner's Node with nothing installed.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ANSI = /\u001b\[[0-9;]*m/g;
const clean = (s) => (s ?? '').replace(ANSI, '');

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

function firstLine(msg) {
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
  return { stats, failures, flaky, byCategory, findings, slowest, globalErrors: (results.errors ?? []).map((e) => firstLine(e.message)) };
}

/* ---------- context, people, links ---------- */

export function resolvePeople(config, ctx, report) {
  const people = config.stakeholders ?? [];
  const author = people.find((p) => p.github && ctx.author && p.github.toLowerCase() === ctx.author.toLowerCase()) ?? (ctx.author ? { name: ctx.author, github: ctx.author } : null);
  // QA is always told; owners of each failure cause are added only when that cause appears.
  const roles = new Set(['qa', ...Object.keys(report.byCategory).map((c) => CATEGORY[c].role)]);
  const notify = people.filter((p) => roles.has(p.role) && p !== author);
  return { author, notify };
}

const fmtDuration = (ms) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s` : `${(ms / 1000).toFixed(1)}s`);

export function links(ctx, f) {
  const ev = (p) => (p && ctx.consoleUrl && ctx.runId ? `${ctx.consoleUrl}/api/evidence/${ctx.runId}/${p.split('/').map(encodeURIComponent).join('/')}` : null);
  if (!f) return { run: ctx.runUrl, artifacts: ctx.runUrl ? `${ctx.runUrl}#artifacts` : null, pr: ctx.prUrl };
  const trace = ev(f.evidence.trace);
  return { screenshot: ev(f.evidence.screenshot), video: ev(f.evidence.video), trace: trace ? `https://trace.playwright.dev/?trace=${encodeURIComponent(trace)}` : null, log: ev(f.evidence.log) };
}

function headline(ctx, report) {
  const ok = report.stats.failed === 0 && !report.globalErrors.length;
  const phase = PHASE_LABEL[ctx.phase] ?? ctx.phase;
  return { ok, phase, text: `${ok ? '✅' : '❌'} QA · ${phase} ${ok ? 'passed' : 'failed'}${ctx.prNumber ? ` · PR #${ctx.prNumber}` : ''}` };
}

export const PHASE_LABEL = { 'pre-merge': 'Pre-merge (API)', 'post-merge': 'Post-merge (UI + API)', regression: 'Weekly regression', manual: 'Manual', drill: 'Failure drill', health: 'Health check' };

const MARKER = (phase) => `<!-- qa-report:${phase} -->`;

/* ---------- renderers ---------- */

export function renderMarkdown(ctx, report, people) {
  const h = headline(ctx, report);
  const L = links(ctx);
  const s = report.stats;
  const who = people.author ? `@${people.author.github ?? people.author.name}` : '—';
  const out = [MARKER(ctx.phase), `### ${h.text}`, ''];
  out.push(`${ctx.prNumber ? `**PR:** [#${ctx.prNumber}](${ctx.prUrl}) ${ctx.prTitle ? `— ${ctx.prTitle}` : ''} · ` : ''}**Author:** ${who} · **Commit:** \`${(ctx.sha ?? '').slice(0, 7)}\` · **Target:** ${ctx.target}`);
  out.push('', '| Total | Passed | Failed | Flaky | Skipped | Duration |', '|---:|---:|---:|---:|---:|---:|', `| ${s.total} | ${s.passed} | ${s.failed} | ${s.flaky} | ${s.skipped} | ${fmtDuration(s.durationMs)} |`, '');
  if (report.globalErrors.length) out.push(`> **Harness error:** ${report.globalErrors.join('; ')}`, '');
  if (report.failures.length) {
    out.push(`**Failures by cause:** ${Object.entries(report.byCategory).map(([c, n]) => `${CATEGORY[c].label} ${n}`).join(' · ')}`, '');
    out.push('| Cause | Test | Project | Reason | Evidence |', '|---|---|---|---|---|');
    for (const f of report.failures) {
      const l = links(ctx, f);
      const ev = [l.screenshot && `[screenshot](${l.screenshot})`, l.video && `[recording](${l.video})`, l.trace && `[trace](${l.trace})`, l.log && `[log](${l.log})`].filter(Boolean).join(' · ') || '—';
      out.push(`| **${CATEGORY[f.category].short}** | ${f.title.replace(/\|/g, '\\|')}<br><sub>${f.file}:${f.line}${f.retries ? ` · retried ${f.retries}×` : ''}</sub> | ${f.project} | \`${f.reason.replace(/\|/g, '\\|').replace(/`/g, "'")}\` | ${ev} |`);
    }
    out.push('');
    const first = report.failures.find((f) => links(ctx, f).screenshot);
    if (first) out.push(`<details><summary>Screenshot · ${first.title} (${first.project})</summary>\n\n![failure screenshot](${links(ctx, first).screenshot})\n\n</details>`, '');
    out.push('<details><summary>Error details</summary>\n', ...report.failures.map((f) => `**${f.title}** (${f.project}) — ${CATEGORY[f.category].hint}\n\n\`\`\`\n${f.detail}\n\`\`\`\n`), '</details>', '');
  }
  if (report.flaky.length) out.push(`**Flaky (passed on retry):** ${report.flaky.map((f) => `${f.title} (${f.project}) — \`${f.reason}\``).join('; ')}`, '');
  if (report.findings.length) out.push(`**Findings:** ${report.findings.join('; ')}`, '');
  out.push(`**Slowest:** ${report.slowest.map((t) => `${t.title} (${t.project}) ${fmtDuration(t.durationMs)}`).join(' · ')}`, '');
  out.push(`[GitHub run](${L.run}) · [Full report, traces & videos](${L.artifacts})${people.notify.length ? ` · cc ${people.notify.map((p) => (p.github ? `@${p.github}` : p.name)).join(' ')}` : ''}`);
  return out.join('\n');
}

const slackMention = (p) => (p?.slack ? `<@${p.slack}>` : p ? `*${p.name}*` : '—');
const slackEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderSlack(ctx, report, people) {
  const h = headline(ctx, report);
  const L = links(ctx);
  const s = report.stats;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: h.text, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `${ctx.prNumber ? `*<${ctx.prUrl}|#${ctx.prNumber}${ctx.prTitle ? ` ${slackEsc(ctx.prTitle)}` : ''}>*\n` : ''}Author ${slackMention(people.author)} · \`${(ctx.sha ?? '').slice(0, 7)}\` · ${slackEsc(ctx.target)} · <${L.run}|GitHub run>` } },
    { type: 'section', fields: [
      ['Passed', `${s.passed}/${s.total}`], ['Failed', String(s.failed)], ['Flaky', String(s.flaky)], ['Skipped', String(s.skipped)], ['Duration', fmtDuration(s.durationMs)], ['Phase', h.phase],
    ].map(([k, v]) => ({ type: 'mrkdwn', text: `*${k}*\n${v}` })) },
  ];
  if (report.globalErrors.length) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `:warning: *Harness error:* ${slackEsc(report.globalErrors.join('; '))}` } });
  if (report.failures.length) {
    blocks.push({ type: 'divider' }, { type: 'section', text: { type: 'mrkdwn', text: `*Failures by cause:* ${Object.entries(report.byCategory).map(([c, n]) => `${CATEGORY[c].label} *${n}*`).join(' · ')}` } });
    for (const f of report.failures.slice(0, 6)) {
      const l = links(ctx, f);
      const ev = [l.screenshot && `<${l.screenshot}|Screenshot>`, l.video && `<${l.video}|Recording>`, l.trace && `<${l.trace}|Trace>`, l.log && `<${l.log}|Log>`].filter(Boolean).join(' · ');
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `\`${CATEGORY[f.category].short}\` *${slackEsc(f.title)}* — ${f.project}${f.retries ? ` (retried ${f.retries}×)` : ''}\n>${slackEsc(f.reason)}\n${ev}` } });
    }
    if (report.failures.length > 6) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `+${report.failures.length - 6} more in the <${L.run}|run>` }] });
    const first = report.failures.find((f) => links(ctx, f).screenshot);
    if (first) blocks.push({ type: 'image', image_url: links(ctx, first).screenshot, alt_text: `Failure screenshot: ${first.title}`, title: { type: 'plain_text', text: `${first.title} · ${first.project}`.slice(0, 150) } });
  }
  if (report.flaky.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `:large_yellow_circle: Flaky: ${slackEsc(report.flaky.map((f) => `${f.title} (${f.project})`).join(', '))}` }] });
  if (report.findings.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `:mag: ${slackEsc(report.findings.join('; '))}` }] });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `${people.notify.length ? `cc ${people.notify.map(slackMention).join(' ')} · ` : ''}<${L.artifacts}|Full report, traces & videos>` }] });
  return { text: h.text, blocks };
}

export function renderTeams(ctx, report, people) {
  const h = headline(ctx, report);
  const L = links(ctx);
  const s = report.stats;
  const mentioned = [people.author, ...people.notify].filter((p) => p?.teams);
  const tag = (p) => (p?.teams ? `<at>${p.name}</at>` : p?.name ?? '—');
  const body = [
    { type: 'TextBlock', size: 'Large', weight: 'Bolder', text: h.text, color: h.ok ? 'Good' : 'Attention', wrap: true },
    { type: 'TextBlock', wrap: true, spacing: 'Small', text: `${ctx.prNumber ? `[#${ctx.prNumber}${ctx.prTitle ? ` ${ctx.prTitle}` : ''}](${ctx.prUrl}) · ` : ''}Author ${tag(people.author)} · \`${(ctx.sha ?? '').slice(0, 7)}\` · ${ctx.target}` },
    { type: 'FactSet', facts: [['Passed', `${s.passed}/${s.total}`], ['Failed', String(s.failed)], ['Flaky', String(s.flaky)], ['Skipped', String(s.skipped)], ['Duration', fmtDuration(s.durationMs)], ['Phase', h.phase]].map(([title, value]) => ({ title, value })) },
  ];
  if (report.failures.length) {
    body.push({ type: 'TextBlock', weight: 'Bolder', separator: true, wrap: true, text: `Failures by cause: ${Object.entries(report.byCategory).map(([c, n]) => `${CATEGORY[c].label} ${n}`).join(' · ')}` });
    for (const f of report.failures.slice(0, 6)) {
      const l = links(ctx, f);
      const ev = [l.screenshot && `[Screenshot](${l.screenshot})`, l.video && `[Recording](${l.video})`, l.trace && `[Trace](${l.trace})`, l.log && `[Log](${l.log})`].filter(Boolean).join(' · ');
      body.push({ type: 'TextBlock', wrap: true, spacing: 'Medium', text: `**[${CATEGORY[f.category].short}] ${f.title}** — ${f.project}${f.retries ? ` (retried ${f.retries}×)` : ''}` }, { type: 'TextBlock', wrap: true, spacing: 'None', isSubtle: true, fontType: 'Monospace', text: f.reason }, { type: 'TextBlock', wrap: true, spacing: 'None', text: ev });
    }
    const first = report.failures.find((f) => links(ctx, f).screenshot);
    if (first) body.push({ type: 'Image', url: links(ctx, first).screenshot, altText: `Failure screenshot: ${first.title}`, size: 'Stretch' });
  }
  if (people.notify.length) body.push({ type: 'TextBlock', wrap: true, isSubtle: true, text: `cc ${people.notify.map(tag).join(' ')}` });
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', body,
        actions: [{ type: 'Action.OpenUrl', title: 'GitHub run', url: L.run }, { type: 'Action.OpenUrl', title: 'Report & traces', url: L.artifacts }, ...(ctx.prUrl ? [{ type: 'Action.OpenUrl', title: `PR #${ctx.prNumber}`, url: ctx.prUrl }] : [])],
        msteams: { width: 'Full', entities: mentioned.map((p) => ({ type: 'mention', text: `<at>${p.name}</at>`, mentioned: { id: p.teams, name: p.name } })) },
      },
    }],
  };
}

/* ---------- delivery ---------- */

async function post(url, body, label) {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) console.log(`::warning::${label} webhook answered ${res.status}`);
    else console.log(`${label}: delivered`);
  } catch (e) {
    console.log(`::warning::${label} webhook failed: ${e.message}`);
  }
}

async function upsertPrComment(ctx, markdown) {
  const api = `https://api.github.com/repos/${ctx.repo}/issues/${ctx.prNumber}/comments`;
  const headers = { Authorization: `Bearer ${ctx.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'qa-notify' };
  try {
    const list = await (await fetch(`${api}?per_page=100`, { headers })).json();
    const mine = Array.isArray(list) ? list.find((c) => c.body?.startsWith(MARKER(ctx.phase))) : null;
    const res = await fetch(mine ? `https://api.github.com/repos/${ctx.repo}/issues/comments/${mine.id}` : api, { method: mine ? 'PATCH' : 'POST', headers, body: JSON.stringify({ body: markdown }) });
    console.log(res.ok ? `PR comment: ${mine ? 'updated' : 'created'}` : `::warning::PR comment answered ${res.status}`);
  } catch (e) {
    console.log(`::warning::PR comment failed: ${e.message}`);
  }
}

async function main() {
  const env = process.env;
  const config = existsSync(env.QA_CONFIG ?? '.github/qa-notify.json') ? JSON.parse(readFileSync(env.QA_CONFIG ?? '.github/qa-notify.json', 'utf8')) : {};
  const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
  const ctx = {
    phase: env.QA_PHASE ?? 'manual',
    prNumber: env.PR_NUMBER || null, prTitle: env.PR_TITLE || '', prUrl: env.PR_URL || null, author: env.PR_AUTHOR || env.GITHUB_ACTOR || null,
    sha: env.HEAD_SHA ?? env.GITHUB_SHA ?? '', repo: env.GITHUB_REPOSITORY, runId: env.GITHUB_RUN_ID,
    runUrl: `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    target: env.BASE_URL ?? 'https://dashboard.allocations.com', consoleUrl: (env.CONSOLE_URL || config.consoleUrl || '').replace(/\/$/, ''), token: env.GITHUB_TOKEN,
  };
  const path = env.RESULTS_PATH ?? 'test-results/results.json';
  const raw = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  const report = raw
    ? buildReport(raw)
    : { stats: { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, durationMs: 0 }, failures: [], flaky: [], byCategory: {}, findings: [], slowest: [], globalErrors: ['Playwright produced no results.json (install or config failure) — see the job log.'] };
  const people = resolvePeople(config, ctx, report);
  const md = renderMarkdown(ctx, report, people);
  const publicCtx = { ...ctx, token: undefined };
  writeFileSync('qa-notify-report.json', JSON.stringify({ ctx: publicCtx, report }, null, 2));
  // Read by the console (run history + run report pages). `stats` keeps Playwright's own field names.
  writeFileSync('qa-summary.json', JSON.stringify({ run_ref: env.RUN_REF ?? null, suite: env.SUITE ?? null, scope: env.QA_SCOPE ?? 'full', phase: ctx.phase, stats: raw?.stats ?? null, ctx: publicCtx, report }));
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${md}\n`);
  const notifyOn = config.notify?.[ctx.phase] ?? 'always';
  const shouldNotify = notifyOn === 'always' || (notifyOn === 'failure' && !headline(ctx, report).ok);
  await Promise.all([
    ctx.prNumber && ctx.token ? upsertPrComment(ctx, md) : null,
    shouldNotify && env.SLACK_WEBHOOK_URL ? post(env.SLACK_WEBHOOK_URL, renderSlack(ctx, report, people), 'Slack') : null,
    shouldNotify && env.TEAMS_WEBHOOK_URL ? post(env.TEAMS_WEBHOOK_URL, renderTeams(ctx, report, people), 'Teams') : null,
  ]);
  if (!env.SLACK_WEBHOOK_URL && !env.TEAMS_WEBHOOK_URL) console.log('No SLACK_WEBHOOK_URL / TEAMS_WEBHOOK_URL secret set; PR comment and job summary only.');
  console.log(`${report.stats.passed} passed, ${report.stats.failed} failed, ${report.stats.flaky} flaky, ${report.stats.skipped} skipped`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
