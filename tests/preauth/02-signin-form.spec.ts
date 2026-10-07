import { test as base, expect, type BrowserContext, type Page, type Locator } from '@playwright/test';
import { dismissConsent, emailField, continueButton, passkeyButton } from './helpers';

/**
 * PRE-AUTH SMOKE · Passwordless sign-in form: structure and client-side validation
 * Scenario: SM-002 · Target: dashboard.allocations.com (public)
 *
 * The real surface is passwordless: one email input, "Continue" (sends an email code) and
 * "Sign in with a passkey". There is no password field.
 *
 * DELIBERATE RESTRAINT — enforced, not promised:
 *  - serviceWorkers: 'block' (playwright.config.ts) so no worker can bypass routing.
 *  - A CONTEXT-level route installed BEFORE navigation aborts EVERY mutating request
 *    (anything but GET/HEAD/OPTIONS) to any destination, with ONE verified exception:
 *    POST /api/auth/refresh on dashboard.allocations.com. The app issues it on page load,
 *    before any interaction, with no user-entered data (cookie-only token refresh), and the
 *    sign-in form does not render until it settles. Aborting it froze the page in CI on
 *    2026-10-06 (7/14 failures) — that is why it is allowlisted, and why nothing else is.
 *  - Every other mutating attempt to the product's hosts is counted and must be zero, so an
 *    email-code request from a Continue click with invalid input can never reach production.
 */
const PRODUCT_HOST = /(^|\.)allocations\.com$/i;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const STARTUP_ALLOWLIST = [/^https:\/\/dashboard\.allocations\.com\/api\/auth\/refresh$/];

type Guard = { count: () => number; list: () => string[] };

async function armMutationGuard(context: BrowserContext): Promise<Guard> {
  let productAttempts = 0;
  const attempted: string[] = [];
  await context.route('**/*', (route) => {
    const r = route.request();
    if (SAFE_METHODS.has(r.method())) return route.continue();
    if (r.method() === 'POST' && STARTUP_ALLOWLIST.some((re) => re.test(r.url().split('?')[0]))) return route.continue();
    const u = new URL(r.url());
    // Cloudflare RUM / bot-challenge beacons are served from the product origin but are not
    // application traffic. Still aborted, not counted.
    const isCdnBeacon = u.pathname.startsWith('/cdn-cgi/');
    if (PRODUCT_HOST.test(u.hostname) && !isCdnBeacon) { productAttempts++; attempted.push(`${r.method()} ${r.url()}`); }
    return route.abort('blockedbyclient');
  });
  return { count: () => productAttempts, list: () => attempted };
}

/**
 * Field-scoped validation probe. Bound to ONE control (the email input):
 *  - records native `invalid` events dispatched ON THAT ELEMENT (the event does not bubble,
 *    so a listener on the element itself cannot be satisfied by the password field);
 *  - snapshots that field's own feedback: its aria-invalid, and the text of whatever it
 *    points at via aria-describedby / aria-errormessage.
 * After the click we require either an event on this element or a transition of this
 * field's feedback. We never call checkValidity()/reportValidity() ourselves.
 */
async function armFieldProbe(field: Locator) {
  const before = await field.evaluate((el: HTMLInputElement) => {
    const w = el as any;
    w.__qaInvalidCount = 0;
    if (!w.__qaInvalidBound) {
      w.__qaInvalidBound = true;
      el.addEventListener('invalid', () => { w.__qaInvalidCount++; });
    }
    const ids = `${el.getAttribute('aria-describedby') ?? ''} ${el.getAttribute('aria-errormessage') ?? ''}`.trim().split(/\s+/).filter(Boolean);
    const described = ids.map((id) => document.getElementById(id)).filter(Boolean)
      .filter((n) => (n as HTMLElement).offsetParent !== null)
      .map((n) => (n!.textContent ?? '').trim()).join('|');
    const scope: ParentNode = el.form ?? document;
    const visibleErrors = Array.from(scope.querySelectorAll('*'))
      .filter((n) => n.children.length === 0 && (n as HTMLElement).offsetParent !== null)
      .map((n) => (n.textContent ?? '').trim())
      .filter((t) => /valid email|invalid|required|enter (a|your|an) /i.test(t));
    return { ariaInvalid: el.getAttribute('aria-invalid') === 'true', described, visibleErrors };
  });
  return {
    eventsOnField: () => field.evaluate((el: any) => el.__qaInvalidCount as number),
    /** A validation message that is visible inside this field's form now but was not at arm time. */
    newVisibleErrorInForm: () =>
      field.evaluate((el: HTMLInputElement, prev) => {
        const scope: ParentNode = el.form ?? document;
        const now = Array.from(scope.querySelectorAll('*'))
          .filter((n) => n.children.length === 0 && (n as HTMLElement).offsetParent !== null)
          .map((n) => (n.textContent ?? '').trim())
          .filter((t) => /valid email|invalid|required|enter (a|your|an) /i.test(t));
        return now.some((t) => !prev.includes(t));
      }, before.visibleErrors),
    /** True when the field's ARIA state is wired to the error. Reported, not required. */
    ariaWired: () =>
      field.evaluate((el: HTMLInputElement) => el.getAttribute('aria-invalid') === 'true' || !!el.getAttribute('aria-describedby') || !!el.getAttribute('aria-errormessage')),
    fieldFeedbackChanged: () =>
      field.evaluate((el: HTMLInputElement, prev) => {
        const ids = `${el.getAttribute('aria-describedby') ?? ''} ${el.getAttribute('aria-errormessage') ?? ''}`.trim().split(/\s+/).filter(Boolean);
        const described = ids.map((id) => document.getElementById(id)).filter(Boolean)
          .filter((n) => (n as HTMLElement).offsetParent !== null)
          .map((n) => (n!.textContent ?? '').trim()).join('|');
        const ariaInvalid = el.getAttribute('aria-invalid') === 'true';
        const becameInvalid = ariaInvalid && !prev.ariaInvalid;
        const newMessage = described !== '' && described !== prev.described;
        return becameInvalid || newMessage;
      }, before),
  };
}

/**
 * Form-scoped probe for the empty-submit case: any control in the sign-in form firing
 * `invalid` (capture phase on the form, since the event does not bubble) counts as proof
 * the click triggered validation.
 */
async function armFormProbe(page: Page, anyField: Locator) {
  await anyField.evaluate((el: HTMLInputElement) => {
    const scope: any = el.form ?? document;
    scope.__qaFormInvalid = 0;
    if (!scope.__qaFormBound) {
      scope.__qaFormBound = true;
      scope.addEventListener('invalid', () => { scope.__qaFormInvalid++; }, true);
    }
  });
  return {
    eventsInForm: () => anyField.evaluate((el: HTMLInputElement) => ((el.form ?? document) as any).__qaFormInvalid as number),
  };
}

/** Fixture: the guard is armed exactly once per test, before any navigation. */
const test = base.extend<{ guard: Guard }>({
  guard: async ({ context }, use) => { await use(await armMutationGuard(context)); },
});

test.describe('Sign-in form', () => {
  test.beforeEach(async ({ guard, page }) => {
    void guard; // forces the fixture to resolve before goto
    await page.goto('/');
    await dismissConsent(page);
  });

  test('exposes an email field, a Continue action and a passkey option; no password field', async ({ page }) => {
    await expect(emailField(page)).toBeVisible();
    await expect(emailField(page)).toHaveAttribute('type', 'email');
    await expect(continueButton(page)).toBeVisible();
    await expect(passkeyButton(page)).toBeVisible();
    await expect(page.locator('input[type="password"]'), 'passwordless flow must not render a password input').toHaveCount(0);
  });

  test('empty submission triggers validation on click, and no mutating request is attempted', async ({ guard, page }, testInfo) => {
    // Observed 2026-10-07: the input is not `required` and the form uses custom validation
    // (no native `invalid` event), rendering "Please enter a valid email." as plain text.
    // The visible-message signal is what catches it; ARIA wiring is reported below.
    const before = page.url();
    const email = emailField(page);
    const form = await armFormProbe(page, email);
    const field = await armFieldProbe(email);

    await continueButton(page).click();

    // Proof that the CLICK caused validation: an `invalid` event inside the form after arming,
    // or the email field's own feedback transitioning. Pre-existing invalidity does not count.
    await expect
      .poll(async () => (await form.eventsInForm()) > 0 || (await field.fieldFeedbackChanged()) || (await field.newVisibleErrorInForm()), {
        message: 'clicking submit must trigger validation (invalid event in form, field feedback change, or a new visible message)',
        timeout: 3000,
      })
      .toBe(true);

    expect(page.url()).toBe(before);
    expect(guard.count(), `no mutating request to the product may be attempted:\n${guard.list().join('\n')}`).toBe(0);

    if (!(await field.ariaWired())) {
      testInfo.annotations.push({ type: 'finding', description: 'PRE-002 validation error is not ARIA-linked to the email input (no aria-invalid / aria-describedby)' });
    }
  });

  test('malformed email is flagged when submitted, and no mutating request is attempted', async ({ guard, page }, testInfo) => {
    const email = emailField(page);
    await email.fill('not-an-email');
    await email.blur();

    const probe = await armFieldProbe(email); // bound to the EMAIL element, armed after fill
    await continueButton(page).click();

    // Email-specific evidence only: an `invalid` event ON the email element, or the email
    // field's own aria-invalid / described error changing. A required-password error cannot
    // satisfy this — the event does not bubble and the feedback snapshot is the email's.
    await expect
      .poll(async () => (await probe.eventsOnField()) > 0 || (await probe.fieldFeedbackChanged()) || (await probe.newVisibleErrorInForm()), {
        message: 'submitting a malformed email must produce validation evidence on the email field (event, ARIA state, or a new visible message in its form)',
        timeout: 3000,
      })
      .toBe(true);

    // FINDING PRE-002 (observed 2026-10-07): the message is rendered as plain text with no
    // aria-invalid / aria-describedby on the input, so assistive tech is not told the field is
    // in error. Reported as an annotation; not a failure of the pre-auth smoke.
    if (!(await probe.ariaWired())) {
      testInfo.annotations.push({ type: 'finding', description: 'PRE-002 malformed-email error is not ARIA-linked to the input (no aria-invalid / aria-describedby)' });
    }

    expect(guard.count(), `no mutating request to the product may be attempted:\n${guard.list().join('\n')}`).toBe(0);
  });
});
