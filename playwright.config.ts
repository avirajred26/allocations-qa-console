import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Pre-auth demonstration harness for dashboard.allocations.com.
 *
 * Scope is deliberately limited to public, unauthenticated surfaces.
 * No test submits credentials to the production sign-in endpoint.
 * Authenticated product flows (SPV formation, KYC, capital calls) are
 * represented in the console as mocked scenarios until credentials are provided.
 */
/**
 * Test scope per trigger (QA_SCOPE):
 *   api  — request-level specs only (pre-merge gate: fast, no browser rendering needed)
 *   ui   — browser specs only
 *   full — everything (default; post-merge, weekly regression, manual runs)
 * API specs are recognised by filename, the same rule the reporter uses for the BACKEND cause.
 * tests/drill holds deliberate, read-only failures and runs only when QA_DRILL=1.
 */
const API_SPEC = /(api|header|boundary|contract)[^/]*\.spec\.ts$/;
const SCOPE = process.env.QA_SCOPE ?? 'full';
const DRILL = process.env.QA_DRILL === '1';

/**
 * Target: BASE_URL wins (CI sets it from scripts/qa-env.mjs); otherwise QA_ENV picks an
 * environment from dashboard/qa-environments.json; otherwise production.
 */
function targetUrl(): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  const id = process.env.QA_ENV ?? 'prod';
  const registry = JSON.parse(readFileSync(join(__dirname, 'dashboard', 'qa-environments.json'), 'utf8'));
  const env = registry.environments.find((e: { id: string }) => e.id === id);
  if (!env?.baseUrl) throw new Error(`QA_ENV=${id} has no baseUrl in dashboard/qa-environments.json`);
  return env.baseUrl;
}

export default defineConfig({
  testDir: './tests',
  testMatch: DRILL ? /drill\/.*\.spec\.ts$/ : SCOPE === 'api' ? API_SPEC : /.*\.spec\.ts$/,
  testIgnore: DRILL ? [] : SCOPE === 'ui' ? [/\/drill\//, API_SPEC] : [/\/drill\//],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    // JUnit for CI systems with a native test tab (Azure DevOps, Jenkins, GitLab).
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    baseURL: targetUrl(),
    trace: 'retain-on-failure',
    // page.route() cannot see requests a service worker intercepts; block them for the harness.
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-iphone', use: { ...devices['iPhone 13'] } },
  ],
});
