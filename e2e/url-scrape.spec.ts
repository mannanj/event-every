import { test, expect } from '@playwright/test';
import {
  setupLocal,
  mockParseAPI,
  mockURLDetectionWithUrls,
  mockScrape,
  submitText,
  waitForEvents,
} from './helpers';

const EVENT_URL = 'https://example.com/my-event';

test.describe('URL paste → scrape → parse', () => {
  test('a URL pill renders from the typed text alone', async ({ page }) => {
    await setupLocal(page);
    // The pill is driven purely by the client-side URL_REGEX in SmartInput,
    // independent of the /api/detect-urls mock.
    await page.locator('[data-testid="smart-input-textarea"]').fill(`See ${EVENT_URL} for details`);
    await expect(page.getByTestId('url-pill')).toHaveCount(1);
  });

  test('the scrape branch feeds combined text to parse and renders the card', async ({ page }) => {
    await setupLocal(page);
    // Override setupLocal's hasUrls:false default so the scrape branch in
    // page.tsx (handleTextSubmit) actually executes.
    await mockURLDetectionWithUrls(page, EVENT_URL, '');
    await mockScrape(page, EVENT_URL, 'Launch Party', 'Join us June 30 2026 at 6pm at HQ');
    await mockParseAPI(page, [
      {
        title: 'Launch Party',
        startDate: '2026-06-30T18:00:00',
        endDate: '2026-06-30T19:00:00',
        location: 'HQ',
        confidence: 0.9,
        allDay: false,
        timezone: null,
      },
    ]);

    await submitText(page, `See ${EVENT_URL} for details`);
    await waitForEvents(page, 1);

    // Proves detect → scrape → parse end-to-end: the parse mock stands in for
    // the LLM, but the real scrape branch ran and built combinedText.
    await expect(page.getByTestId('event-card-title').first()).toContainText('Launch Party');
  });
});
