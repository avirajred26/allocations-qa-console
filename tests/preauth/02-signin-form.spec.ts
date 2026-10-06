import { test as base, expect, type BrowserContext, type Page, type Locator } from '@playwright/test';
import { dismissConsent, emailField, passwordField, submitButton } from './helpers';

/**
 * PRE-AUTH SMOKE · Sign-in form structure and client-side validation
 * Scenario: SM-002 · Target: dashboard.allocations.com (public)
 *
 * DELIBERATE RESTRAINT — enforced, not promised:
 *  - serviceWorkers: 'block' (playwright.config.ts) so no worker can bypass routing.
 *  - A CONTEXT-level route installed BEFORE navigation aborts EVERY mutating request
 *    (anything but GET/HEAD/OPTIONS) to any destination. Fail closed: we do not guess the
 *    auth endpoint's name, so /graphql, /api/session, /auth, etc. are all covered.
 *  - Attempts to the product's own hosts are counted; the assertions require zero.
 *    Third-party beacons are aborted too but not counted, so analytics can't fail the test.
 */
const PRODUCT_HOST = /(^|\.)allocations\.com$/i;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type Guard = { count: () => number; list: () => string[] };

async function armMutationGuard(context: BrowserContext): Promise<Guard> {
  let productAttempts = 0;
  const attempted: string[] = [];
  await context.route('**/*', (route) => {
    const r = route.request();
    if (SAFE_METHODS.has(r.method())) return route.continue();
    const host = new URL(r.url()).hostname;
    if (PRODUCT_HOST.test(host)) { productAttempts++; attempted.push(`${r.method()} ${r.url()}`); }
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
    return { ariaInvalid: el.getAttribute('aria-invalid') === 'true', described };
  });
  return {
    eventsOnField: () => field.evaluate((el: any) => el.__qaInvalidCount as number),
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

  test('exposes email and password fields with a submit control', async ({ page }) => {
    await expect(emailField(page)).toBeVisible();
    await expect(passwordField(page)).toBeVisible();
    await expect(submitButton(page)).toBeVisible();
  });

  test('empty submission triggers validation on click, and no mutating request is attempted', async ({ guard, page }) => {
    const before = page.url();
    const email = emailField(page);
    const form = await armFormProbe(page, email);
    const field = await armFieldProbe(email);

    await submitButton(page).click();

    // Proof that the CLICK caused validation: an `invalid` event inside the form after arming,
    // or the email field's own feedback transitioning. Pre-existing invalidity does not count.
    await expect
      .poll(async () => (await form.eventsInForm()) > 0 || (await field.fieldFeedbackChanged()), {
        message: 'clicking submit must trigger validation (invalid event in form, or field feedback change)',
        timeout: 3000,
      })
      .toBe(true);

    expect(page.url()).toBe(before);
    expect(guard.count(), `no mutating request to the product may be attempted:\n${guard.list().join('\n')}`).toBe(0);
  });

  test('malformed email is flagged when submitted, and no mutating request is attempted', async ({ guard, page }) => {
    const email = emailField(page);
    await email.fill('not-an-email');
    await email.blur();

    const probe = await armFieldProbe(email); // bound to the EMAIL element, armed after fill
    await submitButton(page).click();

    // Email-specific evidence only: an `invalid` event ON the email element, or the email
    // field's own aria-invalid / described error changing. A required-password error cannot
    // satisfy this — the event does not bubble and the feedback snapshot is the email's.
    await expect
      .poll(async () => (await probe.eventsOnField()) > 0 || (await probe.fieldFeedbackChanged()), {
        message: 'submitting a malformed email must produce validation evidence on the email field itself',
        timeout: 3000,
      })
      .toBe(true);

    expect(guard.count(), `no mutating request to the product may be attempted:\n${guard.list().join('\n')}`).toBe(0);
  });
});
