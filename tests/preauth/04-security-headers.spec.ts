import { test, expect } from '@playwright/test';

/**
 * PRE-AUTH SMOKE · Security headers on the sign-in document
 * Scenario: SM-004 · Target: dashboard.allocations.com (public)
 * These are the headers an investor-facing fintech sign-in page must not lose in a release.
 */
test('sign-in document carries HSTS, nosniff, frame protection and a CSP', async ({ request, baseURL }) => {
  const res = await request.get(`${baseURL}/`, { maxRedirects: 3 });
  expect(res.ok()).toBeTruthy();
  const h = res.headers();

  expect(h['strict-transport-security'], 'HSTS').toMatch(/max-age=\d+/);
  expect(Number(h['strict-transport-security']?.match(/max-age=(\d+)/)?.[1] ?? 0), 'HSTS max-age ≥ 6 months').toBeGreaterThanOrEqual(15_552_000);
  expect(h['x-content-type-options'], 'nosniff').toBe('nosniff');

  const framed = h['x-frame-options']?.toUpperCase() ?? '';
  const csp = h['content-security-policy'] ?? '';
  expect(framed === 'DENY' || framed === 'SAMEORIGIN' || /frame-ancestors/.test(csp), 'clickjacking protection').toBe(true);
  expect(csp, 'a Content-Security-Policy must be present').toMatch(/default-src/);
  expect(h['referrer-policy'], 'referrer policy').toBeTruthy();
});
