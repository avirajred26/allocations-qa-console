import { test, expect } from '@playwright/test';
import { dismissConsent, emailField, submitButton, expectNoHorizontalScroll } from './helpers';

/**
 * PRE-AUTH SMOKE · Mobile viewport layout
 * Scenario: SM-005 · Target: dashboard.allocations.com (public) · iPhone 13 emulation
 * Runs under the mobile project only; desktop project skips it.
 */
test('sign-in renders without overflow and controls stay tappable on mobile', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'mobile-only check');

  await page.goto('/');
  await dismissConsent(page);
  await expectNoHorizontalScroll(page);

  const email = emailField(page);
  const submit = submitButton(page);
  await expect(email).toBeInViewport();
  await expect(submit).toBeInViewport();

  const box = await submit.boundingBox();
  expect(box?.height ?? 0, 'tap target should be at least 40px tall').toBeGreaterThanOrEqual(40);
});
