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
import { resolve } from 'node:path';

import { CATEGORY, classifyFailure, artifactPath, buildReport, buildReportFromJUnit, rawStats } from '../dashboard/lib/qa-report-core.mjs';
export { CATEGORY, classifyFailure, artifactPath, buildReport, buildReportFromJUnit };

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
  const ev = (p) => (p && ctx.consoleUrl && ctx.runId && ctx.evidenceViaConsole !== false ? `${ctx.consoleUrl}/api/evidence/${ctx.runId}/${p.split('/').map(encodeURIComponent).join('/')}` : null);
  if (!f) return { run: ctx.runUrl, artifacts: ctx.runUrl ? (ctx.ci === 'azure' ? `${ctx.runUrl}&view=artifacts` : ctx.ci === 'github' || !ctx.ci ? `${ctx.runUrl}#artifacts` : ctx.runUrl) : null, pr: ctx.prUrl };
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
  out.push(`${ctx.prNumber ? `**PR:** [#${ctx.prNumber}](${ctx.prUrl}) ${ctx.prTitle ? `— ${ctx.prTitle}` : ''} · ` : ''}**Author:** ${who} · **Commit:** \`${(ctx.sha ?? '').slice(0, 7)}\` · **Environment:** ${ctx.envLabel ?? 'Production'} (${ctx.target.replace(/^https?:\/\//, '')})`);
  if (ctx.envNote) out.push('', `> ${ctx.envNote}`);
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
  out.push(`[${ctx.ciLabel ?? 'CI'} run](${L.run}) · [Full report, traces & videos](${L.artifacts})${people.notify.length ? ` · cc ${people.notify.map((p) => (p.github ? `@${p.github}` : p.name)).join(' ')}` : ''}`);
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
    { type: 'section', text: { type: 'mrkdwn', text: `${ctx.prNumber ? `*<${ctx.prUrl}|#${ctx.prNumber}${ctx.prTitle ? ` ${slackEsc(ctx.prTitle)}` : ''}>*\n` : ''}Author ${slackMention(people.author)} · \`${(ctx.sha ?? '').slice(0, 7)}\` · ${slackEsc(ctx.envLabel ?? 'Production')} · <${L.run}|CI run>` } },
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
    { type: 'TextBlock', wrap: true, spacing: 'Small', text: `${ctx.prNumber ? `[#${ctx.prNumber}${ctx.prTitle ? ` ${ctx.prTitle}` : ''}](${ctx.prUrl}) · ` : ''}Author ${tag(people.author)} · \`${(ctx.sha ?? '').slice(0, 7)}\` · ${ctx.envLabel ?? 'Production'}` },
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

/* ---------- mobile (JUnit) ---------- */

/** Reads each platform's JUnit and the evidence files the device scripts leave next to it. */
export function junitReport(spec, suite = 'both') {
  const platforms = spec.split(',').map((pair) => {
    const [project, file] = pair.split('=');
    const dir = file.replace(/\/[^/]*$/, '');
    const pick = (...names) => names.map((n) => `${dir}/${n}`).find((f) => existsSync(f)) ?? null;
    return {
      project, file: `mobile/flows/${project}`,
      required: suite === 'both' || suite === project,
      xml: existsSync(file) ? readFileSync(file, 'utf8') : null,
      evidence: { screenshot: pick('failure.png', '03-malformed-email-validation.png', '02-empty-email-validation.png', '01-signin-page.png'), video: pick('recording.mp4'), trace: null, log: pick('maestro-log.txt') },
    };
  });
  const report = buildReportFromJUnit(platforms.filter((p) => p.required || p.xml));
  // Evidence the flow saved when the app showed its session error before the retry.
  for (const p of platforms) {
    const dir = spec.split(',').find((x) => x.startsWith(`${p.project}=`))?.split('=')[1]?.replace(/\/[^/]*$/, '');
    if (!dir || !existsSync(`${dir}/00-session-error.png`)) continue;
    const failed = report.failures.some((f) => f.project === p.project);
    const env = existsSync(`${dir}/os-version.txt`) ? readFileSync(`${dir}/os-version.txt`, 'utf8').trim().replace(/\s*\n\s*/g, ', ') : '';
    report.findings.push(`MOB-001 (${p.project}${env ? `, ${env}` : ''}): sign-in page shows "Unable to load your session"; ${failed ? 'Retry does not recover' : 'recovered after Retry'}.`);
  }
  return report;
}

/* ---------- CI context ---------- */

/**
 * Run identity from whichever CI is running this. QA_* variables override anything detected,
 * so any other system can call this script by exporting them.
 */
export function ciContext(env) {
  const pick = (...keys) => keys.map((k) => env[k]).find((v) => v !== undefined && v !== '') ?? null;
  let c;
  if (env.GITHUB_ACTIONS === 'true') {
    const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
    c = { ci: 'github', ciLabel: 'GitHub Actions', runId: env.GITHUB_RUN_ID, runUrl: `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`, repo: env.GITHUB_REPOSITORY, sha: pick('HEAD_SHA', 'GITHUB_SHA'), prNumber: pick('PR_NUMBER'), prUrl: pick('PR_URL'), prTitle: pick('PR_TITLE') ?? '', author: pick('PR_AUTHOR', 'GITHUB_ACTOR'), token: env.GITHUB_TOKEN };
  } else if (env.TF_BUILD === 'True') {
    const base = `${env.SYSTEM_COLLECTIONURI ?? ''}${encodeURIComponent(env.SYSTEM_TEAMPROJECT ?? '')}`;
    c = { ci: 'azure', ciLabel: 'Azure DevOps', runId: env.BUILD_BUILDID, runUrl: `${base}/_build/results?buildId=${env.BUILD_BUILDID}`, repo: env.BUILD_REPOSITORY_NAME, sha: pick('BUILD_SOURCEVERSION'), prNumber: pick('SYSTEM_PULLREQUEST_PULLREQUESTNUMBER', 'SYSTEM_PULLREQUEST_PULLREQUESTID'), prUrl: null, prTitle: '', author: pick('BUILD_REQUESTEDFOR') };
  } else if (env.GITLAB_CI === 'true') {
    c = { ci: 'gitlab', ciLabel: 'GitLab CI', runId: env.CI_PIPELINE_ID, runUrl: env.CI_PIPELINE_URL, repo: env.CI_PROJECT_PATH, sha: env.CI_COMMIT_SHA, prNumber: pick('CI_MERGE_REQUEST_IID'), prUrl: null, prTitle: pick('CI_MERGE_REQUEST_TITLE') ?? '', author: pick('GITLAB_USER_LOGIN') };
  } else if (env.JENKINS_URL) {
    c = { ci: 'jenkins', ciLabel: 'Jenkins', runId: env.BUILD_NUMBER, runUrl: env.BUILD_URL, repo: env.JOB_NAME, sha: pick('GIT_COMMIT'), prNumber: pick('CHANGE_ID'), prUrl: pick('CHANGE_URL'), prTitle: pick('CHANGE_TITLE') ?? '', author: pick('CHANGE_AUTHOR') };
  } else {
    c = { ci: 'local', ciLabel: 'Local', runId: null, runUrl: null, repo: null, sha: null, prNumber: null, prUrl: null, prTitle: '', author: null };
  }
  return {
    ...c,
    phase: env.QA_PHASE ?? 'manual',
    runUrl: pick('QA_RUN_URL') ?? c.runUrl, prNumber: pick('QA_PR_NUMBER') ?? c.prNumber, prUrl: pick('QA_PR_URL') ?? c.prUrl, author: pick('QA_AUTHOR') ?? c.author,
    // The console serves evidence only from GitHub artifacts; elsewhere it lives in the CI run itself.
    evidenceViaConsole: c.ci === 'github',
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
  const ctx = { ...ciContext(env), target: env.BASE_URL ?? 'https://dashboard.allocations.com', env: env.QA_ENV ?? null, envLabel: env.QA_ENV_LABEL ?? null, envNote: env.QA_ENV_NOTE ?? null, consoleUrl: (env.CONSOLE_URL || config.consoleUrl || '').replace(/\/$/, '') };
  const path = env.RESULTS_PATH ?? 'test-results/results.json';
  let raw = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  // Mobile / native runners: QA_JUNIT=android=path,ios=path (Maestro JUnit + evidence next to it).
  const junit = !raw && env.QA_JUNIT ? junitReport(env.QA_JUNIT, env.SUITE) : null;
  if (junit) raw = { stats: rawStats(junit) };
  const report = junit ? junit : raw
    ? buildReport(raw)
    : { stats: { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, durationMs: 0 }, failures: [], flaky: [], byCategory: {}, findings: [], slowest: [], globalErrors: ['Playwright produced no results.json (install or config failure) — see the job log.'] };
  const people = resolvePeople(config, ctx, report);
  const md = renderMarkdown(ctx, report, people);
  const publicCtx = { ...ctx, token: undefined };
  writeFileSync('qa-notify-report.json', JSON.stringify({ ctx: publicCtx, report }, null, 2));
  // Read by the console (run history + run report pages). `stats` keeps Playwright's own field names.
  writeFileSync('qa-summary.json', JSON.stringify({ run_ref: env.RUN_REF ?? null, suite: env.SUITE ?? null, scope: ctx.phase === 'drill' ? 'drill' : env.QA_SCOPE ?? 'full', phase: ctx.phase, stats: raw?.stats ?? null, ctx: publicCtx, report }));
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${md}\n`);
  // Same report as a file for any CI; Azure DevOps shows it as a tab on the build summary.
  writeFileSync('qa-report.md', `${md}\n`);
  if (ctx.ci === 'azure') console.log(`##vso[task.uploadsummary]${resolve('qa-report.md')}`);
  const notifyOn = config.notify?.[ctx.phase] ?? 'always';
  const shouldNotify = notifyOn === 'always' || (notifyOn === 'failure' && !headline(ctx, report).ok);
  await Promise.all([
    ctx.ci === 'github' && ctx.prNumber && ctx.token ? upsertPrComment(ctx, md) : null,
    shouldNotify && env.SLACK_WEBHOOK_URL ? post(env.SLACK_WEBHOOK_URL, renderSlack(ctx, report, people), 'Slack') : null,
    shouldNotify && env.TEAMS_WEBHOOK_URL ? post(env.TEAMS_WEBHOOK_URL, renderTeams(ctx, report, people), 'Teams') : null,
  ]);
  if (!env.SLACK_WEBHOOK_URL && !env.TEAMS_WEBHOOK_URL) console.log('No SLACK_WEBHOOK_URL / TEAMS_WEBHOOK_URL secret set; PR comment and job summary only.');
  console.log(`${report.stats.passed} passed, ${report.stats.failed} failed, ${report.stats.flaky} flaky, ${report.stats.skipped} skipped`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
