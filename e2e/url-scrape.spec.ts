import { expect, test, type Route } from '@playwright/test';
import { ScanRequestSchema } from '../src/types/scanRequest';
import type { ScanResponse } from '../src/types/scannerHttp';
import {
  setupLocal,
  mockURLDetectionWithUrls,
  mockScrape,
  submitText,
} from './helpers';

const EVENT_URL = 'https://example.com/my-event';
const SOURCE_TEXT = 'See ' + EVENT_URL + ' for details.';
const ENRICHED_TEXT = 'See\n\nOriginal Event: https://example.com/my-event\nJoin us June 30 2026 at 6pm at HQ\n\nfor details.';
const excerpt = 'Join us June 30 2026 at 6pm at HQ';
type ScannerModule = typeof import('@event-every/scanner');

// Playwright transforms test modules to CommonJS, so a normal dynamic import becomes require().
const importScannerModule = new Function(
  'return import("@event-every/scanner")',
) as () => Promise<ScannerModule>;

function loadScannerModule(): Promise<ScannerModule> {
  return importScannerModule();
}

function claim<Value>(value: Value, sourceId: string) {
  return {
    value,
    confidence: 0.9,
    evidence: [{
      sourceId,
      locator: 'body',
      excerpt,
      startOffset: 0,
      endOffset: excerpt.length,
    }],
  };
}

async function urlEnrichedScanResponse(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await loadScannerModule();
  const sourceId = 'source-url-enriched-1';
  return {
    source: {
      sourceId,
      kind: 'text',
      contentHandle: 'opaque-url-enriched-1',
    },
    candidates: [EventCandidateSchema.parse({
      candidateId: 'candidate-url-enriched-1',
      sourceUid: null,
      title: claim('Launch Party scanner candidate', sourceId),
      description: claim(null, sourceId),
      location: claim('HQ', sourceId),
      url: claim(EVENT_URL, sourceId),
      temporal: claim({
        start: {
          kind: 'floating',
          date: { year: 2026, month: 6, day: 30 },
          time: { hour: 18, minute: 0, second: 0 },
        },
        end: null,
        duration: 'PT1H',
        allDay: false,
      }, sourceId),
      recurrence: claim(null, sourceId),
      issues: [],
    })],
    issues: [],
  };
}

test.describe('URL paste → scrape → parse', () => {
  test('a URL pill renders from the typed text alone', async ({ page }) => {
    await setupLocal(page);
    // The pill is driven purely by the client-side URL_REGEX in SmartInput,
    // independent of the /api/detect-urls mock.
    await page.locator('[data-testid="smart-input-textarea"]').fill(`See ${EVENT_URL} for details`);
    await expect(page.getByTestId('url-pill')).toHaveCount(1);
  });

  test('the scrape branch sends host-enriched text to Scanner and renders its review candidate', async ({ page }) => {
    await setupLocal(page);
    await mockURLDetectionWithUrls(page, EVENT_URL, 'See for details.');
    await mockScrape(page, EVENT_URL, 'Launch Party', 'Join us June 30 2026 at 6pm at HQ');
    const response = await urlEnrichedScanResponse();
    const requests: unknown[] = [];
    await page.route('**/api/scan', async (route: Route) => {
      const request = ScanRequestSchema.parse(route.request().postDataJSON());
      requests.push(request);
      expect(request).toEqual({ kind: 'text', text: ENRICHED_TEXT });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    });

    await submitText(page, SOURCE_TEXT);

    const review = page.getByRole('region', { name: 'Scanner review drafts' });
    await expect(review).toBeVisible();
    await expect(review.getByRole('textbox', { name: 'Title' })).toHaveValue('Launch Party scanner candidate');
    expect(requests).toHaveLength(1);
  });
});
