import { test, expect } from '@playwright/test';
import { dismissConsent } from './helpers';

/**
 * PRE-AUTH SMOKE · Public outbound links resolve (no 4xx/5xx)
 * Scenario: SM-004 · Target: dashboard.allocations.com (public)
 * HEAD-checks allocations.com links only; capped at 12 to stay polite.
 */
test('header and footer links resolve', async ({ page, request }) => {
  await page.goto('/');
  await dismissConsent(page);

  const hrefs = await page.locator('a[href]').evaluateAll((as) =>
    (as as HTMLAnchorElement[]).map((a) => a.href).filter((h) => /^https?:\/\//.test(h)),
  );
  const candidates = [...new Set(hrefs)].filter((h) => /allocations\.com/i.test(h)).slice(0, 12);
  test.skip(candidates.length === 0, 'no public allocations.com links on this surface');

  const failures: string[] = [];
  for (const url of candidates) {
    const res = await request.head(url, { maxRedirects: 5, timeout: 10_000 }).catch(() => null);
    const status = res?.status() ?? 0;
    if (status === 405) continue; // HEAD not allowed is not a broken link
    if (status === 0 || status >= 400) failures.push(`${url} → ${status || 'no response'}`);
  }
  expect(failures, failures.join('\n')).toHaveLength(0);
});
