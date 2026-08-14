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

const KNOWN_RESET_MESSAGE = 'Event Every is powered by community support. New event processing is paused until August 14 12:00am, but your saved events are still available.';
const UNKNOWN_RESET_MESSAGE = 'Event Every is powered by community support. New event processing is temporarily paused, but your saved events are still available.';

test.use({ timezoneId: 'UTC', locale: 'en-US' });

async function mockUsage(page: Page, body: unknown, status = 200) {
  await page.route('**/api/usage', (route) => route.fulfill({ status, json: body }));
}

async function seedSavedEvent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('event_every_history', JSON.stringify([{
      id: 'saved-budget-event',
      title: 'Saved budget event',
      startDate: '2027-01-05T15:00:00.000Z',
      endDate: '2027-01-05T16:00:00.000Z',
      allDay: false,
      timezone: 'UTC',
      timezoneStatus: 'resolved',
      timezoneSource: 'extracted',
      created: '2026-08-01T00:00:00.000Z',
      source: 'text',
    }]));
  });
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
    await expect(page.getByRole('heading', { name: 'Event processing is paused' })).toBeVisible();
    await expect(page.getByTestId('owner-budget-message')).toHaveText(KNOWN_RESET_MESSAGE);
    await expect(page.getByTestId('owner-budget-screen')).not.toContainText(/owner budget|request id|provider|waitlist/i);
  });

  test('shows the fixed frozen state before the exhausted state', async ({ page }) => {
    await mockUsage(page, { ...BASE_USAGE, exhausted: true, frozen: true, remainingNanodollars: 0 });
    await page.goto('/');
    await expect(page.getByTestId('owner-budget-screen')).toHaveAttribute('data-owner-budget-state', 'frozen');
    await expect(page.getByRole('heading', { name: 'Event processing is paused' })).toBeVisible();
    await expect(page.getByTestId('owner-budget-message')).toHaveText(KNOWN_RESET_MESSAGE);
    await expect(page.getByTestId('owner-budget-screen')).not.toContainText(/owner budget|request id|provider|waitlist/i);
  });

  test('shows the fixed unavailable state when usage fails closed', async ({ page }) => {
    await mockUsage(page, { error: 'Owner budget unavailable.', code: 'owner_budget_unavailable' }, 503);
    await page.goto('/');
    await expect(page.getByTestId('owner-budget-screen')).toHaveAttribute('data-owner-budget-state', 'unavailable');
    await expect(page.getByRole('heading', { name: 'Event processing is paused' })).toBeVisible();
    await expect(page.getByTestId('owner-budget-message')).toHaveText(UNKNOWN_RESET_MESSAGE);
    await expect(page.getByTestId('owner-budget-screen')).not.toContainText(/owner budget|request id|provider|waitlist/i);
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

  test('opens saved events while provider processing remains disabled', async ({ page }) => {
    await seedSavedEvent(page);
    await mockUsage(page, { ...BASE_USAGE, exhausted: true, remainingNanodollars: 0 });
    await page.goto('/');

    await page.getByRole('button', { name: 'View my events' }).click();

    await expect(page.getByTestId('owner-budget-view-only')).toBeVisible();
    await expect(page.getByText('Saved budget event', { exact: true })).toBeVisible();
    await expect(page.getByTestId('smart-input-textarea')).toHaveAttribute('contenteditable', 'true');
    const inputBox = page.getByTestId('input-box');
    const transform = page.getByRole('button', { name: 'Transform content to events' });
    await expect(transform).toBeDisabled();
    const inputBounds = await inputBox.boundingBox();
    const transformBounds = await transform.boundingBox();
    expect(inputBounds).not.toBeNull();
    expect(transformBounds).not.toBeNull();
    expect(transformBounds!.x + transformBounds!.width).toBeLessThanOrEqual(inputBounds!.x + inputBounds!.width);
    expect(transformBounds!.y + transformBounds!.height).toBeLessThanOrEqual(inputBounds!.y + inputBounds!.height);
  });

  test('preserves an edited input across an unavailable visit and restores it ready to transform', async ({ page }) => {
    let usage: unknown = BASE_USAGE;
    let status = 200;
    await page.route('**/api/usage', (route) => route.fulfill({ status, json: usage }));
    await page.goto('/');

    const editor = page.getByTestId('smart-input-textarea');
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    await editor.fill('Original saved draft');
    await expect.poll(() => page.evaluate(async () => new Promise<string | null>((resolve) => {
      const opened = indexedDB.open('summon-input', 2);
      opened.onerror = () => resolve(null);
      opened.onsuccess = () => {
        const request = opened.result.transaction('draft', 'readonly').objectStore('draft').get('current');
        request.onerror = () => resolve(null);
        request.onsuccess = () => resolve(typeof request.result?.text === 'string' ? request.result.text : null);
      };
    }))).toBe('Original saved draft');

    usage = { error: 'Owner budget unavailable.', code: 'owner_budget_unavailable' };
    status = 503;
    await page.reload();
    await expect(page.getByTestId('owner-budget-screen')).toBeVisible();
    await page.getByRole('button', { name: 'View my events' }).click();
    await expect(editor).toHaveText('Original saved draft');
    await expect(page.getByRole('button', { name: 'Transform content to events' })).toBeDisabled();

    await editor.fill('Edited while processing was unavailable');
    await expect.poll(() => page.evaluate(async () => new Promise<string | null>((resolve) => {
      const opened = indexedDB.open('summon-input', 2);
      opened.onerror = () => resolve(null);
      opened.onsuccess = () => {
        const request = opened.result.transaction('draft', 'readonly').objectStore('draft').get('current');
        request.onerror = () => resolve(null);
        request.onsuccess = () => resolve(typeof request.result?.text === 'string' ? request.result.text : null);
      };
    }))).toBe('Edited while processing was unavailable');

    usage = BASE_USAGE;
    status = 200;
    await page.reload();
    await expect(editor).toHaveText('Edited while processing was unavailable');
    await expect(page.getByRole('button', { name: 'Transform content to events' })).toBeEnabled();
  });

  test('stops waiting for an unavailable budget response after three seconds', async ({ page }) => {
    let markRequested!: () => void;
    const requested = new Promise<void>((resolve) => { markRequested = resolve; });
    await page.route('**/api/usage', async (route) => {
      markRequested();
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      await route.fulfill({ status: 200, json: BASE_USAGE }).catch(() => undefined);
    });
    await page.goto('/');
    await requested;
    await expect(page.getByTestId('owner-budget-screen')).toBeVisible({ timeout: 4_500 });
  });

  test('reads only the usage endpoint and renders only the safe events action', async ({ page }) => {
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
    await expect(page.getByRole('button', { name: 'View my events' })).toHaveCount(1);
    await expect(page.getByRole('button')).toHaveCount(1);
    await expect(page.getByRole('link')).toHaveCount(0);
  });
});
