import { test, expect } from '@playwright/test';

/**
 * PRE-AUTH SMOKE · Anonymous API boundary
 * Scenario: SM-003 · Target: dashboard.allocations.com/api/auth/me (public)
 * Verifies the session endpoint refuses anonymous callers and leaks nothing about users.
 * Read-only GET; no credentials are ever sent.
 */
test('GET /api/auth/me without a session returns 401 and no user data', async ({ request, baseURL }) => {
  const res = await request.get(`${baseURL}/api/auth/me`, { failOnStatusCode: false });
  expect(res.status()).toBe(401);

  const text = await res.text();
  const body = (() => { try { return JSON.parse(text); } catch { return null; } })();
  expect(body, 'error body should be JSON').not.toBeNull();
  expect(body.code ?? body.error ?? body.message, 'should carry a machine-readable error').toBeTruthy();

  // No PII or session material in an anonymous error.
  expect(text).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
  for (const k of ['email', 'user', 'token', 'accessToken', 'refreshToken', 'session']) {
    expect(body, `anonymous response must not include "${k}"`).not.toHaveProperty(k);
  }
});
