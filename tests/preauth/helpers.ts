import { Page, expect } from '@playwright/test';

/** Dismiss any cookie/consent banner without accepting non-essential cookies. */
export async function dismissConsent(page: Page) {
  const decline = page.getByRole('button', { name: /decline|reject|necessary only|essential/i }).first();
  if (await decline.isVisible({ timeout: 1500 }).catch(() => false)) {
    await decline.click();
  }
}

/** Email input on the sign-in surface, tolerant of label/placeholder variants. */
export function emailField(page: Page) {
  return page
    .getByRole('textbox', { name: /email/i })
    .or(page.getByPlaceholder(/email/i))
    .or(page.locator('input[type="email"]'))
    .first();
}

export function passwordField(page: Page) {
  return page
    .getByLabel(/password/i)
    .or(page.getByPlaceholder(/password/i))
    .or(page.locator('input[type="password"]'))
    .first();
}

export function submitButton(page: Page) {
  return page.getByRole('button', { name: /sign in|log in|continue|submit/i }).first();
}

/** Assert no horizontal overflow — the classic mobile layout defect. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page should not scroll horizontally').toBeLessThanOrEqual(1);
}
