import { defineConfig, devices } from '@playwright/test';

/**
 * Pre-auth demonstration harness for dashboard.allocations.com.
 *
 * Scope is deliberately limited to public, unauthenticated surfaces.
 * No test submits credentials to the production sign-in endpoint.
 * Authenticated product flows (SPV formation, KYC, capital calls) are
 * represented in the console as mocked scenarios until credentials are provided.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://dashboard.allocations.com',
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
