import { test, expect } from '@playwright/test';
import { dismissConsent } from './helpers';

/**
 * PRE-AUTH SMOKE · Sign-in surface renders
 * Scenario: SM-001 · Target: dashboard.allocations.com (public)
 */
test('page loads with Allocations branding and no runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const res = await page.goto('/');
  expect(res?.ok(), 'document request should return 2xx').toBeTruthy();
  await dismissConsent(page);

  await expect(page).toHaveTitle(/allocations/i);
  await expect(page.locator('body')).toBeVisible();

  // Ignore known third-party analytics noise so the assertion stays meaningful.
  const relevant = errors.filter((e) => !/analytics|gtag|segment|hotjar|intercom/i.test(e));
  expect(relevant, `unexpected runtime errors: ${relevant.join(' | ')}`).toHaveLength(0);
});
