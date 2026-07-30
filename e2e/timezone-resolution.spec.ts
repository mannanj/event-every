import { test, expect, Page, Route } from '@playwright/test';

/**
 * WebKit E2E regression for the interview-email timezone bug.
 *
 * A pasted event whose timezone is a human LABEL ("Eastern Time (US & Canada)") rendered correctly
 * at 10:30 AM, then — after the async /api/resolve-timezone round-trip (the spinner) returned a
 * string that is not a valid IANA zone — the wall-clock time was re-stamped as UTC and shifted to
 * 6:30 AM ET (the exported .ics showed DTSTART:20260615T103000Z instead of ...T143000Z).
 *
 * These tests drive the REAL UI (SmartInput → /api/parse SSE → EventCard) with the network fully
 * mocked, so they validate the CLIENT-side defenses — convertRawToDate's invalid-zone fallback,
 * the isValidIANATimezone guard before auto-apply, and the spinner "settle" — independently of the
 * server-side sanitizer (covered by the timezone.ts unit tests). The browser timezone is pinned so
 * the wall-clock assertions are exact and reproduce the reporter's environment.
 */

const PARSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-RateLimit-Limit': '50',
  'X-RateLimit-Remaining': '49',
  'X-RateLimit-Reset': String(Date.now() + 86_400_000),
};

function sse(events: Record<string, unknown>[]): string {
  return (
    `data: ${JSON.stringify({ events, chunkIndex: 0, isComplete: false })}\n\n` +
    `data: ${JSON.stringify({ events: [], chunkIndex: 1, isComplete: true })}\n\n`
  );
}

async function mockParse(page: Page, events: Record<string, unknown>[]) {
  await page.route('**/api/parse', (route: Route) =>
    route.fulfill({ status: 200, headers: PARSE_HEADERS, body: sse(events) })
  );
}

async function mockResolveTimezone(
  page: Page,
  payload: { timezone: string; confidence: number },
  delayMs = 300
) {
  await page.route('**/api/resolve-timezone', async (route: Route) => {
    // A small delay makes the 'resolving' spinner observable — the exact spinner the user saw.
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });
}

async function createTimezoneResponseGate(
  page: Page,
  payload: { timezone: string; confidence: number }
) {
  let releaseResponse!: () => void;
  let requestStarted!: () => void;
  const responseReleased = new Promise<void>((resolve) => (releaseResponse = resolve));
  const requestReceived = new Promise<void>((resolve) => (requestStarted = resolve));

  await page.route('**/api/resolve-timezone', async (route: Route) => {
    requestStarted();
    await responseReleased;
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });

  return {
    release: releaseResponse,
    waitForRequest: () => requestReceived,
  };
}

function jsonRoute(body: unknown) {
  return (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
}

async function setupPage(page: Page) {
  await page.route('**/api/auth/check', jsonRoute({ authenticated: true }));
  await page.route('**/api/detect-urls', jsonRoute({ hasUrls: false, urls: [], remainingText: '' }));
  await page.route('**/api/summarize', jsonRoute({ summary: 'Test Summary' }));
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.waitForSelector('[data-testid="smart-input-textarea"]', { state: 'visible', timeout: 15_000 });
}

async function submitText(page: Page, text: string) {
  const ta = page.locator('[data-testid="smart-input-textarea"]');
  await ta.fill(text);
  await ta.press('Meta+Enter');
}

// The reporter's event: "Jun 15, 2026 10:30am-11:00am (GMT-04:00) Eastern Time (US & Canada)".
const INTERVIEW_EVENT = {
  title: 'Sr. Software Engineer Frontend - Virtual Phone Screen Interview',
  startDate: '2026-06-15T10:30:00',
  endDate: '2026-06-15T11:00:00',
  location: 'Microsoft Teams',
  confidence: 0.9,
  allDay: false,
  // A human LABEL, not an IANA id — this is what makes the client mark the zone 'unknown' and fire
  // the async resolver, which is the path where the corruption used to happen.
  timezone: 'Eastern Time (US & Canada)',
};
const INTERVIEW_TEXT =
  'Sr. Software Engineer Frontend phone screen — Jun 15, 2026 10:30am-11:00am (GMT-04:00) Eastern Time (US & Canada) via Microsoft Teams.';

test.describe("interview email in the reporter's zone (America/New_York)", () => {
  test.use({ timezoneId: 'America/New_York' });

  test('stays 10:30 AM when the resolver returns a non-IANA zone (the reported bug)', async ({ page }) => {
    await setupPage(page);
    await mockParse(page, [INTERVIEW_EVENT]);
    // deepseek sometimes returns a non-IANA string like "EDT" with high confidence — the exact
    // trigger. The client must NOT apply it and must NOT shift the time.
    await mockResolveTimezone(page, { timezone: 'EDT', confidence: 0.95 });

    const resolved = page.waitForResponse('**/api/resolve-timezone');
    await submitText(page, INTERVIEW_TEXT);
    await expect(page.getByTestId('event-card-title')).toHaveCount(1, { timeout: 15_000 });

    const card = page.getByTestId('event-card').first();
    await expect(card).toContainText('Jun 15');
    await expect(card).toContainText('10:30 AM'); // correct initial render, before resolution

    await resolved; // the async resolution (the spinner) has now run
    await expect(card.locator('.animate-spin')).toHaveCount(0, { timeout: 10_000 }); // spinner settled

    // The crux: the time must still be 10:30 AM, never the 6:30 AM the bug produced.
    await expect(card).toContainText('10:30 AM');
    await expect(card).not.toContainText('6:30');
  });

  test('stays 10:30 AM when the resolver returns a valid IANA zone', async ({ page }) => {
    await setupPage(page);
    await mockParse(page, [INTERVIEW_EVENT]);
    await mockResolveTimezone(page, { timezone: 'America/New_York', confidence: 0.95 });

    const resolved = page.waitForResponse('**/api/resolve-timezone');
    await submitText(page, INTERVIEW_TEXT);
    await expect(page.getByTestId('event-card-title')).toHaveCount(1, { timeout: 15_000 });
    const card = page.getByTestId('event-card').first();

    await resolved;
    await expect(card.locator('.animate-spin')).toHaveCount(0, { timeout: 10_000 });

    await expect(card).toContainText('10:30 AM');
    await expect(card).not.toContainText('6:30');
  });

  test('low-confidence resolution leaves the time alone and the spinner terminates', async ({ page }) => {
    await setupPage(page);
    await mockParse(page, [INTERVIEW_EVENT]);
    // confidence ≤ 0.8 → the client skips applying. Before the fix this left the spinner spinning
    // forever; it must now settle to a terminal (non-resolving) state.
    await mockResolveTimezone(page, { timezone: 'Eastern Time', confidence: 0.3 });

    const resolved = page.waitForResponse('**/api/resolve-timezone');
    await submitText(page, INTERVIEW_TEXT);
    await expect(page.getByTestId('event-card-title')).toHaveCount(1, { timeout: 15_000 });
    const card = page.getByTestId('event-card').first();

    await resolved;
    await expect(card.locator('.animate-spin')).toHaveCount(0, { timeout: 10_000 }); // no infinite spinner
    await expect(card).toContainText('10:30 AM');
    await expect(card).not.toContainText('6:30');
  });
});

test.describe('cross-zone apply (viewer in America/Los_Angeles)', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('a valid resolved zone re-converts: 10:30 ET renders as 7:30 AM PT', async ({ page }) => {
    await setupPage(page);
    await mockParse(page, [INTERVIEW_EVENT]);
    const timezoneResponse = await createTimezoneResponseGate(page, {
      timezone: 'America/New_York',
      confidence: 0.95,
    });

    const resolved = page.waitForResponse('**/api/resolve-timezone');
    await submitText(page, INTERVIEW_TEXT);
    await expect(page.getByTestId('event-card-title')).toHaveCount(1, { timeout: 15_000 });
    const card = page.getByTestId('event-card').first();

    // Before resolution, the unknown-zone fallback assumes the viewer's own zone (PT) → 10:30 AM.
    await expect(card).toContainText('10:30 AM');

    await timezoneResponse.waitForRequest();
    timezoneResponse.release();
    await resolved;
    await expect(card.locator('.animate-spin')).toHaveCount(0, { timeout: 10_000 });

    // After applying America/New_York, 10:30 ET correctly re-renders as 7:30 AM PT.
    await expect(card).toContainText('7:30 AM');
    await expect(card).not.toContainText('10:30 AM');
  });
});
