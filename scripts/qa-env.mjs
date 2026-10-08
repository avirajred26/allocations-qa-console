#!/usr/bin/env node
/**
 * Resolves which environment a QA run targets, for any CI system.
 *
 *   node scripts/qa-env.mjs <env-id | gate>     e.g. prod, staging, pre-merge
 *
 * Prints shell-style assignments on stdout (QA_ENV, QA_ENV_LABEL, BASE_URL, QA_ENV_NOTE) so
 * GitHub Actions can append them to $GITHUB_ENV and Azure / GitLab / Jenkins can eval them.
 * An explicitly requested environment without a URL is an error (exit 2), never a silent
 * switch to production. A gate whose environment is not configured uses `fallback` and says so.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function loadRegistry(path = fileURLToPath(new URL('../dashboard/qa-environments.json', import.meta.url))) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function resolveEnv(registry, request) {
  const byId = (id) => registry.environments.find((e) => e.id === id);
  const gateTarget = registry.gates?.[request];
  if (gateTarget) {
    const env = byId(gateTarget);
    if (env?.baseUrl) return { env, note: null };
    const fb = byId(registry.fallback);
    if (!fb?.baseUrl) throw new Error(`Gate "${request}" targets "${gateTarget}" (not configured) and fallback "${registry.fallback}" has no URL.`);
    return { env: fb, note: `${request} targets ${gateTarget}, which has no URL yet; ran against ${fb.id} instead.` };
  }
  const env = byId(request);
  if (!env) throw new Error(`Unknown environment "${request}". Known: ${registry.environments.map((e) => e.id).join(', ')}.`);
  if (!env.baseUrl) throw new Error(`Environment "${env.id}" has no baseUrl in dashboard/qa-environments.json. Add its URL to enable it.`);
  return { env, note: null };
}

/** Human note for an environment that is a demo alias of another one's surface. */
export function aliasNote(registry, env) {
  if (!env.aliasOf) return null;
  const target = registry.environments.find((e) => e.id === env.aliasOf);
  return `${env.label} is a demo alias of ${target?.label ?? env.aliasOf} (${env.baseUrl.replace(/^https?:\/\//, '')}) for this assignment; no separate ${env.label.toLowerCase()} URL exists.`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const request = process.argv[2] ?? 'prod';
  try {
    const registry = loadRegistry();
    const { env, note } = resolveEnv(registry, request);
    const alias = aliasNote(registry, env);
    console.log(`QA_ENV=${env.id}`);
    console.log(`QA_ENV_LABEL=${env.label}`);
    console.log(`BASE_URL=${env.baseUrl}`);
    const notes = [note, alias].filter(Boolean).join(' ');
    if (notes) console.log(`QA_ENV_NOTE=${notes}`);
    if (note) console.error(`::warning::${note}`);
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(2);
  }
}
