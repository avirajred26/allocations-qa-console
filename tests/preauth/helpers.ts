import { Page, expect } from '@playwright/test';

/**
 * Observed sign-in surface at dashboard.allocations.com (2026-10-07):
 *   - passwordless: one email input (#email, type=email, placeholder mail@address.com)
 *   - primary action "Continue" (sends an email code)
 *   - secondary action "Sign in with a passkey" (WebAuthn)
 *   - on load the app probes GET /api/auth/me and POSTs /api/auth/refresh; both return 401
 *     for an anonymous visitor. That is correct behaviour, not an error.
 */

/** Dismiss any cookie/consent banner without accepting non-essential cookies. */
export async function dismissConsent(page: Page) {
  const decline = page.getByRole('button', { name: /decline|reject|necessary only|essential/i }).first();
  if (await decline.isVisible({ timeout: 1500 }).catch(() => false)) {
    await decline.click();
  }
}

export function emailField(page: Page) {
  return page
    .getByRole('textbox', { name: /email/i })
    .or(page.locator('#email'))
    .or(page.locator('input[type="email"]'))
    .first();
}

/** Primary action on the passwordless form. */
export function continueButton(page: Page) {
  return page.getByRole('button', { name: /^continue$|sign in|log in|submit/i }).first();
}

export function passkeyButton(page: Page) {
  return page.getByRole('button', { name: /passkey/i }).first();
}

/** Assert no horizontal overflow — the classic mobile layout defect. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page should not scroll horizontally').toBeLessThanOrEqual(1);
}

/** The app's own anonymous auth probes. 401 here is expected pre-auth behaviour. */
export const ANON_AUTH_PROBE = /\/api\/auth\/(me|refresh)(\?|$)/;
