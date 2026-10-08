import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRegistry, resolveEnv } from './qa-env.mjs';

const reg = {
  environments: [
    { id: 'dev', label: 'Dev', baseUrl: null },
    { id: 'staging', label: 'Staging', baseUrl: 'https://staging.example' },
    { id: 'prod', label: 'Production', baseUrl: 'https://prod.example' },
  ],
  gates: { 'pre-merge': 'dev', 'post-merge': 'staging', regression: 'prod' },
  fallback: 'prod',
};

test('an explicit environment resolves to its URL', () => {
  assert.equal(resolveEnv(reg, 'staging').env.baseUrl, 'https://staging.example');
});

test('an explicit environment without a URL is an error, never a silent switch to prod', () => {
  assert.throws(() => resolveEnv(reg, 'dev'), /no baseUrl/);
  assert.throws(() => resolveEnv(reg, 'qa'), /Unknown environment/);
});

test('a gate uses its environment, or the fallback with a note when that has no URL', () => {
  assert.deepEqual(resolveEnv(reg, 'post-merge'), { env: reg.environments[1], note: null });
  const r = resolveEnv(reg, 'pre-merge');
  assert.equal(r.env.id, 'prod');
  assert.match(r.note, /pre-merge targets dev, which has no URL yet; ran against prod/);
});

test('the shipped registry has a reachable production and only https URLs', () => {
  const shipped = loadRegistry();
  assert.equal(resolveEnv(shipped, 'prod').env.baseUrl, 'https://dashboard.allocations.com');
  for (const e of shipped.environments) if (e.baseUrl) assert.match(e.baseUrl, /^https:\/\//);
  for (const g of Object.values(shipped.gates)) assert.ok(shipped.environments.some((e) => e.id === g), `gate target ${g} exists`);
});
