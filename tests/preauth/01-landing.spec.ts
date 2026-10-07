import { test, expect } from '@playwright/test';
import { dismissConsent, emailField, passkeyButton, ANON_AUTH_PROBE } from './helpers';

/**
 * PRE-AUTH SMOKE · Sign-in surface renders and anonymous auth probes behave
 * Scenario: SM-001 · Target: dashboard.allocations.com (public)
 */
test('sign-in renders with email + passkey options; anonymous auth probes return 401; no other runtime errors', async ({ page }) => {
  const runtimeErrors: string[] = [];
  const probeStatuses: Record<string, number> = {};
  page.on('pageerror', (e) => runtimeErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') runtimeErrors.push(m.text()); });
  page.on('response', (r) => { if (ANON_AUTH_PROBE.test(r.url())) probeStatuses[new URL(r.url()).pathname] = r.status(); });

  const res = await page.goto('/');
  expect(res?.ok(), 'document request should return 2xx').toBeTruthy();
  await dismissConsent(page);

  await expect(page).toHaveTitle(/allocations/i);
  await expect(emailField(page)).toBeVisible();
  await expect(passkeyButton(page)).toBeVisible();

  // The app checks for a session on load. Anonymous → 401 is the correct answer; 200 or 5xx would be a defect.
  for (const [path, status] of Object.entries(probeStatuses)) {
    expect(status, `${path} should reject an anonymous visitor with 401`).toBe(401);
  }

  // Console noise from those expected 401s is not a runtime error. Everything else must be clean.
  const relevant = runtimeErrors.filter((e) => !/401/.test(e) && !/analytics|gtag|plausible|cloudflareinsights|hotjar|intercom/i.test(e));
  expect(relevant, `unexpected runtime errors: ${relevant.join(' | ')}`).toHaveLength(0);
});
