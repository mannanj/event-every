import { expect, test, type Page } from '@playwright/test';

const BASE_USAGE = {
  status: 'available',
  policyVersion: 'owner-v1',
  authorityDay: '2026-08-13',
  limitNanodollars: 5_000_000_000,
  spentNanodollars: 1_000_000_000,
  reservedNanodollars: 0,
  remainingNanodollars: 4_000_000_000,
  exhausted: false,
  frozen: false,
  resetAt: '2026-08-14T00:00:00.000Z',
} as const;

async function mockUsage(page: Page, body: unknown, status = 200) {
  await page.route('**/api/usage', (route) => route.fulfill({ status, json: body }));
}

test.describe('owner budget boundary', () => {
  test('shows the fixed exhausted state without private operational details', async ({ page }) => {
    await mockUsage(page, {
      ...BASE_USAGE,
      spentNanodollars: 4_999_600_000,
      remainingNanodollars: 400_000,
      exhausted: true,
    });
    await page.goto('/');
    await expect(page.getByTestId('owner-budget-screen')).toHaveAttribute('data-owner-budget-state', 'exhausted');
    await expect(page.getByTestId('owner-budget-message')).toHaveText(
      'Event processing is paused until the daily owner budget resets.',
    );
    await expect(page.getByTestId('owner-budget-screen')).not.toContainText(/request id|provider|waitlist/i);
  });

  test('shows the fixed frozen state before the exhausted state', async ({ page }) => {
    await mockUsage(page, { ...BASE_USAGE, exhausted: true, frozen: true, remainingNanodollars: 0 });
    await page.goto('/');
    await expect(page.getByTestId('owner-budget-screen')).toHaveAttribute('data-owner-budget-state', 'frozen');
    await expect(page.getByRole('heading', { name: 'Owner budget frozen' })).toBeVisible();
  });

  test('shows the fixed unavailable state when usage fails closed', async ({ page }) => {
    await mockUsage(page, { error: 'Owner budget unavailable.', code: 'owner_budget_unavailable' }, 503);
    await page.goto('/');
    await expect(page.getByTestId('owner-budget-screen')).toHaveAttribute('data-owner-budget-state', 'unavailable');
    await expect(page.getByTestId('owner-budget-message')).toHaveText(
      'Event processing is temporarily unavailable. Please try again later.',
    );
  });

  test('treats a malformed successful usage response as unavailable', async ({ page }) => {
    await mockUsage(page, { exhausted: false });
    await page.goto('/');
    await expect(page.getByTestId('owner-budget-screen')).toHaveAttribute('data-owner-budget-state', 'unavailable');
  });

  test('keeps the app open when the owner budget is available', async ({ page }) => {
    await mockUsage(page, BASE_USAGE);
    await page.goto('/');
    await expect(page.getByTestId('input-box')).toBeVisible();
    await expect(page.getByTestId('owner-budget-screen')).toHaveCount(0);
  });

  test('reads only the usage endpoint and renders no retired action', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith('/api/')) requested.push(pathname);
    });
    await mockUsage(page, { ...BASE_USAGE, exhausted: true, remainingNanodollars: 0 });
    await page.goto('/');
    await expect(page.getByTestId('owner-budget-screen')).toBeVisible();
    expect(requested.filter((path) => path === '/api/usage')).toHaveLength(1);
    expect(requested).not.toContain('/api/waitlist');
    await expect(page.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('link')).toHaveCount(0);
  });
});
