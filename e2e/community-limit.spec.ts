import { test, expect, Page } from '@playwright/test';

const RESET_AT = '2026-06-11T00:00:00.000Z';
const TZ = 'America/New_York';

// Pin browser locale + TZ so the Intl output computed here matches the page.
test.use({ locale: 'en-US', timezoneId: TZ });

function expectedResetText(): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: TZ,
  }).format(new Date(RESET_AT));
}

const EXHAUSTED = {
  exhausted: true,
  isAdmin: false,
  resetAt: RESET_AT,
  limitUsd: 5,
  spentUsd: 5.0021,
  remainingUsd: 0,
};

async function mockAnonymous(page: Page, usage: Record<string, unknown>) {
  await page.route('**/api/auth/check', (route) =>
    route.fulfill({ json: { authenticated: false } })
  );
  await page.route('**/api/usage', (route) => route.fulfill({ json: usage }));
}

test.describe('community limit screen', () => {
  test('shows the community-sponsored message with reset time in the local timezone', async ({ page }) => {
    await mockAnonymous(page, EXHAUSTED);
    await page.goto('/');

    const message = page.getByTestId('community-limit-message');
    await expect(message).toBeVisible();
    await expect(message).toContainText(
      'This app is community sponsored. The usage limits have been hit today and reset'
    );
    await expect(message).toContainText(expectedResetText());
    await expect(page.getByText('Spirit & Hammer collective', { exact: false })).toBeVisible();
  });

  test('waitlist signup shows the on-screen confirmation', async ({ page }) => {
    await mockAnonymous(page, EXHAUSTED);
    await page.route('**/api/waitlist', (route) =>
      route.fulfill({ json: { ok: true, alreadyJoined: false, emailSent: true } })
    );
    await page.goto('/');

    await page.getByTestId('waitlist-email').fill('friend@example.com');
    await page.getByTestId('waitlist-submit').click();

    await expect(page.getByTestId('waitlist-confirmation')).toContainText(
      "You're on the waitlist. A confirmation email is on its way to friend@example.com."
    );
  });

  test('already-joined emails get the already-on-the-list message', async ({ page }) => {
    await mockAnonymous(page, EXHAUSTED);
    await page.route('**/api/waitlist', (route) =>
      route.fulfill({ json: { ok: true, alreadyJoined: true, emailSent: false } })
    );
    await page.goto('/');

    await page.getByTestId('waitlist-email').fill('friend@example.com');
    await page.getByTestId('waitlist-submit').click();

    await expect(page.getByTestId('waitlist-confirmation')).toContainText(
      "You're already on the waitlist."
    );
  });

  test('"Enter pattern lock" switches to the pattern screen as it looks today', async ({ page }) => {
    await mockAnonymous(page, EXHAUSTED);
    await page.goto('/');

    await page.getByTestId('enter-pattern-link').click();

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByTestId('community-limit-screen')).toHaveCount(0);
  });

  test('app stays open (no pattern lock) when the budget is not exhausted', async ({ page }) => {
    await mockAnonymous(page, {
      exhausted: false,
      isAdmin: false,
      resetAt: RESET_AT,
      limitUsd: 5,
      spentUsd: 0.42,
      remainingUsd: 4.58,
    });
    await page.goto('/');

    await expect(page.getByTestId('input-box')).toBeVisible();
    await expect(page.getByTestId('community-limit-screen')).toHaveCount(0);
  });

  test('admins with a valid pattern session bypass the limit screen', async ({ page }) => {
    await page.route('**/api/auth/check', (route) =>
      route.fulfill({ json: { authenticated: true } })
    );
    await page.route('**/api/usage', (route) => route.fulfill({ json: EXHAUSTED }));
    await page.goto('/');

    await expect(page.getByTestId('input-box')).toBeVisible();
  });

  test('a mid-session community 402 flips the app to the limit screen', async ({ page }) => {
    await mockAnonymous(page, {
      exhausted: false,
      isAdmin: false,
      resetAt: RESET_AT,
      limitUsd: 5,
      spentUsd: 4.99,
      remainingUsd: 0.01,
    });
    await page.route('**/api/detect-urls', (route) =>
      route.fulfill({ json: { hasUrls: false, urls: [], remainingText: '' } })
    );
    await page.route('**/api/parse', (route) =>
      route.fulfill({
        status: 402,
        json: {
          error: 'This app is community sponsored. The usage limits have been hit today.',
          code: 'community_limit',
          resetAt: RESET_AT,
        },
      })
    );
    await page.goto('/');

    const textarea = page.locator('[data-testid="smart-input-textarea"]');
    await textarea.fill('Dinner with Sam tomorrow at 7pm');
    await textarea.press('Meta+Enter');

    await expect(page.getByTestId('community-limit-screen')).toBeVisible();
    await expect(page.getByTestId('community-limit-message')).toContainText(expectedResetText());
  });
});
