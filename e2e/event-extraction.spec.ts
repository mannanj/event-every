import { test, expect, Page, Route } from '@playwright/test';

// Helper: build SSE response body for mocked /api/parse
function buildSSE(events: Record<string, unknown>[], chunkSize = 3): string {
  const chunks: string[] = [];
  for (let i = 0; i < events.length; i += chunkSize) {
    const slice = events.slice(i, i + chunkSize);
    chunks.push(
      `data: ${JSON.stringify({ events: slice, chunkIndex: Math.floor(i / chunkSize), isComplete: false })}\n\n`
    );
  }
  chunks.push(
    `data: ${JSON.stringify({ events: [], chunkIndex: Math.ceil(events.length / chunkSize), isComplete: true })}\n\n`
  );
  return chunks.join('');
}

// Helper: mock /api/parse to return given events via SSE stream
async function mockParseAPI(page: Page, events: Record<string, unknown>[]) {
  await page.route('**/api/parse', async (route: Route) => {
    const body = buildSSE(events);
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-RateLimit-Limit': '50',
        'X-RateLimit-Remaining': '49',
        'X-RateLimit-Reset': String(Date.now() + 86400000),
      },
      body,
    });
  });
}

// Helper: mock /api/parse to return an SSE error
async function mockParseAPIError(page: Page, errorMessage: string) {
  await page.route('**/api/parse', async (route: Route) => {
    const body = `data: ${JSON.stringify({ error: errorMessage })}\n\n`;
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-RateLimit-Limit': '50',
        'X-RateLimit-Remaining': '49',
        'X-RateLimit-Reset': String(Date.now() + 86400000),
      },
      body,
    });
  });
}

// Helper: mock URL detection to skip network calls
async function mockURLDetection(page: Page) {
  await page.route('**/api/detect-urls', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hasUrls: false, urls: [], remainingText: '' }),
    });
  });
}

// Auth is a server cookie checked via /api/auth/check; mock it true so the
// pattern lock never blocks the app. (The old localStorage key was a no-op.)
async function mockAuth(page: Page) {
  await page.route('**/api/auth/check', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authenticated: true }),
    });
  });
}

async function setupPage(page: Page) {
  // Set up route mocks BEFORE navigating
  await mockAuth(page);
  await mockURLDetection(page);

  await page.addInitScript(() => {
    localStorage.clear();
  });

  await page.goto('/');
  // Wait for the textarea to be present and interactive
  await page.waitForSelector('[data-testid="smart-input-textarea"]', { state: 'visible', timeout: 15000 });
}

// Helper: type text and submit
async function submitText(page: Page, text: string) {
  const textarea = page.locator('[data-testid="smart-input-textarea"]');
  await textarea.fill(text);
  await textarea.press('Meta+Enter');
}

// Helper: wait for events to appear after submission
async function waitForEvents(page: Page, count = 1) {
  await expect(page.locator('h3.font-bold')).toHaveCount(count, { timeout: 15000 });
}

test.describe('Event Extraction Scenarios', () => {
  test('Scenario 1: Single text event with specific time', async ({ page }) => {
    await setupPage(page);
    await mockParseAPI(page, [
      {
        title: "Dinner at Luigi's",
        startDate: '2026-03-13T19:00:00',
        endDate: '2026-03-13T20:00:00',
        location: "Luigi's Restaurant",
        confidence: 0.92,
        allDay: false,
        timezone: null,
      },
    ]);

    await submitText(page, "Dinner at Luigi's, Friday March 13 at 7pm");
    await waitForEvents(page, 1);

    await expect(page.locator('h3.font-bold').first()).toContainText("Dinner at Luigi's");
  });

  test('Scenario 2: All-day event (no times mentioned)', async ({ page }) => {
    await setupPage(page);
    await mockParseAPI(page, [
      {
        title: 'Company offsite',
        startDate: '2026-03-20',
        allDay: true,
        location: 'Napa Valley',
        confidence: 0.85,
        timezone: null,
      },
    ]);

    await submitText(page, 'Company offsite March 20, Napa Valley');
    await waitForEvents(page, 1);

    await expect(page.locator('h3.font-bold').first()).toContainText('Company offsite');
  });

  test('Scenario 3: Conference poster extracts as 1 event', async ({ page }) => {
    await setupPage(page);
    await mockParseAPI(page, [
      {
        title: 'AI Summit 2026',
        startDate: '2026-03-25T09:00:00',
        endDate: '2026-03-25T17:00:00',
        location: 'Convention Center, San Francisco',
        description:
          'Keynote by Dr. Smith at 9am. Panel discussion at 2pm. Networking reception at 5pm.',
        confidence: 0.82,
        allDay: false,
        timezone: 'PST',
      },
    ]);

    await submitText(
      page,
      'AI Summit 2026\nMarch 25, Convention Center SF\nKeynote: Dr. Smith 9am\nPanel: 2pm\nNetworking: 5pm'
    );
    await waitForEvents(page, 1);

    // Should be exactly 1 event (conference as a whole)
    await expect(page.locator('h3.font-bold')).toHaveCount(1);
    await expect(page.locator('h3.font-bold').first()).toContainText('AI Summit 2026');
  });

  test('Scenario 4: Schedule with multiple distinct events', async ({ page }) => {
    await setupPage(page);
    await mockParseAPI(page, [
      {
        title: 'Standup',
        startDate: '2026-03-09T09:00:00',
        endDate: '2026-03-09T09:30:00',
        confidence: 0.88,
        allDay: false,
        timezone: null,
      },
      {
        title: 'Design Review',
        startDate: '2026-03-10T14:00:00',
        endDate: '2026-03-10T15:00:00',
        confidence: 0.88,
        allDay: false,
        timezone: null,
      },
      {
        title: 'Retro',
        startDate: '2026-03-11T11:00:00',
        endDate: '2026-03-11T12:00:00',
        confidence: 0.85,
        allDay: false,
        timezone: null,
      },
    ]);

    await submitText(page, 'Monday 9am standup, Tuesday 2pm design review, Wednesday 11am retro');
    await waitForEvents(page, 3);

    const titles = page.locator('h3.font-bold');
    await expect(titles).toHaveCount(3);
    await expect(titles.nth(0)).toContainText('Standup');
    await expect(titles.nth(1)).toContainText('Design Review');
    await expect(titles.nth(2)).toContainText('Retro');
  });

  test('Scenario 5: No events found shows error', async ({ page }) => {
    await setupPage(page);
    await mockParseAPIError(
      page,
      'No events could be extracted from the provided input. The content may not contain calendar event information.'
    );

    await submitText(page, 'The weather is nice today');

    // Error should appear
    const errorAlert = page.locator('div[role="alert"]');
    await expect(errorAlert.first()).toBeVisible({ timeout: 15000 });
    await expect(errorAlert.first()).toContainText('Error processing');
  });

  test('Scenario 6: Multi-person meeting = 1 event', async ({ page }) => {
    await setupPage(page);
    await mockParseAPI(page, [
      {
        title: 'Lunch with Alice, Bob, and Carol',
        startDate: '2026-03-12T12:00:00',
        endDate: '2026-03-12T13:00:00',
        confidence: 0.9,
        allDay: false,
        timezone: null,
      },
    ]);

    await submitText(page, 'Lunch with Alice, Bob, and Carol Thursday at noon');
    await waitForEvents(page, 1);

    await expect(page.locator('h3.font-bold')).toHaveCount(1);
    await expect(page.locator('h3.font-bold').first()).toContainText('Lunch with Alice, Bob, and Carol');
  });

  test('Scenario 7: Event with timezone preserved', async ({ page }) => {
    await setupPage(page);
    await mockParseAPI(page, [
      {
        title: 'Team Sync',
        startDate: '2026-03-15T15:00:00',
        endDate: '2026-03-15T16:00:00',
        confidence: 0.93,
        allDay: false,
        timezone: 'UTC',
      },
    ]);

    await submitText(page, 'Team Sync at 3:00 PM UTC on March 15');
    await waitForEvents(page, 1);

    await expect(page.locator('h3.font-bold').first()).toContainText('Team Sync');
  });

  test('Scenario 8: Low-confidence events are filtered out', async ({ page }) => {
    await setupPage(page);
    await mockParseAPI(page, [
      {
        title: 'Real Meeting',
        startDate: '2026-03-16T10:00:00',
        confidence: 0.85,
        allDay: false,
        timezone: null,
      },
    ]);

    await submitText(page, 'Real Meeting at 10am March 16. Also the sky is blue.');
    await waitForEvents(page, 1);

    await expect(page.locator('h3.font-bold')).toHaveCount(1);
    await expect(page.locator('h3.font-bold').first()).toContainText('Real Meeting');
  });
});

test.describe('UI Interaction Tests', () => {
  test('Submit button is disabled with empty input', async ({ page }) => {
    await setupPage(page);

    const submitButton = page.locator('button[aria-label="Transform content to events"]');
    await expect(submitButton).toBeDisabled();
  });

  test('Submit button enables with 3+ chars', async ({ page }) => {
    await setupPage(page);

    const textarea = page.locator('[data-testid="smart-input-textarea"]');
    await textarea.fill('abc');

    const submitButton = page.locator('button[aria-label="Transform content to events"]');
    await expect(submitButton).toBeEnabled();
  });

  test('Event card expands to show details on click', async ({ page }) => {
    await setupPage(page);
    await mockParseAPI(page, [
      {
        title: 'Test Event',
        startDate: '2026-04-01T14:00:00',
        endDate: '2026-04-01T15:00:00',
        location: 'Room 42',
        description: 'A test event with details',
        confidence: 0.9,
        allDay: false,
        timezone: null,
      },
    ]);

    await submitText(page, 'Test Event April 1 at 2pm in Room 42');
    await waitForEvents(page, 1);

    // Click the event card to expand
    const eventCard = page.locator('h3.font-bold').first();
    await eventCard.click();

    // After expanding, location should be visible
    await expect(page.getByText('Room 42')).toBeVisible({ timeout: 5000 });
  });

  test('Error notification can be dismissed', async ({ page }) => {
    await setupPage(page);
    await mockParseAPIError(page, 'Something went wrong');

    await submitText(page, 'Some text input here');

    // Wait for the error notification with dismiss button
    const dismissButton = page.locator('button[aria-label="Dismiss error"]');
    await expect(dismissButton.first()).toBeVisible({ timeout: 15000 });

    // The error alert with border styling (not the textarea's aria-invalid alert)
    const errorNotification = page.locator('div.border-2.border-black[role="alert"]');
    await expect(errorNotification.first()).toBeVisible();

    await dismissButton.first().click();

    await expect(errorNotification).toHaveCount(0, { timeout: 5000 });
  });

  test('Cmd+Enter submits from textarea', async ({ page }) => {
    await setupPage(page);
    await mockParseAPI(page, [
      {
        title: 'Quick Event',
        startDate: '2026-05-01T10:00:00',
        confidence: 0.9,
        allDay: false,
        timezone: null,
      },
    ]);

    const textarea = page.locator('[data-testid="smart-input-textarea"]');
    await textarea.fill('Quick Event May 1 at 10am');
    await textarea.press('Meta+Enter');

    await waitForEvents(page, 1);
    await expect(page.locator('h3.font-bold').first()).toContainText('Quick Event');
  });
});

test.describe('API Route Tests', () => {
  test('Non-batch request returns 400', async ({ page }) => {
    const response = await page.request.post('/api/parse', {
      data: { text: 'Hello', batch: false },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Non-batch parsing is not supported');
  });

  test('Missing input returns 400', async ({ page }) => {
    const response = await page.request.post('/api/parse', {
      data: { batch: true },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Either text or image data is required');
  });
});
