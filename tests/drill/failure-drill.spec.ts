import { test, expect } from '@playwright/test';

/**
 * FAILURE DRILL — runs only for the manual "Failure drill" suite (QA_DRILL=1).
 * Both checks are expected to fail against dashboard.allocations.com. They exist to prove the
 * failure path end to end: cause classification, screenshot, recording, trace, log and
 * notification. Read-only: one anonymous page load and one anonymous GET, nothing submitted.
 */
test.describe('Failure drill', () => {
  test('DRILL-UI: sign-in page shows a "Create SPV" button (expected to fail)', async ({ page }) => {
    test.info().annotations.push({ type: 'drill', description: 'Deliberate UI failure: this button does not exist on the public sign-in page.' });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Create SPV' })).toBeVisible({ timeout: 5_000 });
  });

  test('DRILL-API: anonymous GET /api/auth/me returns 200 (expected to fail)', async ({ request, baseURL }) => {
    test.info().annotations.push({ type: 'drill', description: 'Deliberate API failure: anonymous callers correctly receive 401.' });
    const res = await request.get(`${baseURL}/api/auth/me`);
    expect(res.status(), 'anonymous /api/auth/me status').toBe(200);
  });
});
