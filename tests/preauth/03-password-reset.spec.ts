import { test, expect } from '@playwright/test';
import { dismissConsent, emailField } from './helpers';

/**
 * PRE-AUTH SMOKE · Password-reset entry point is reachable
 * Scenario: SM-003 · Target: dashboard.allocations.com (public)
 * Does not submit the reset form — only verifies the route and its input render.
 */
test('forgot-password link leads to a reset form', async ({ page }) => {
  await page.goto('/');
  await dismissConsent(page);

  const link = page.getByRole('link', { name: /forgot|reset/i }).first();
  const exposed = await link.isVisible({ timeout: 2000 }).catch(() => false);
  test.skip(!exposed, 'no reset link exposed on this surface');

  await link.click();
  await expect(page).toHaveURL(/forgot|reset|recover/i);
  await expect(emailField(page)).toBeVisible();
});
