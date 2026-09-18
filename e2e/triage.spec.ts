import { expect, test, type Route } from '@playwright/test';
import type { ScanResponse } from '../src/types/scannerHttp';
import { eventCards, mockTriage, setupLocal, submitText, waitForCards } from './helpers';

/**
 * Pre-scan triage (Tasks 212-214) decides WHEN and HOW MANY scans run, never
 * what they return. The verdict is mocked here; the shared setup pins triage
 * to "unavailable" for every other spec so their scans behave as before.
 */

test.use({ timezoneId: 'UTC', locale: 'en-US' });

type ScannerModule = typeof import('@event-every/scanner');
const importScannerModule = new Function('return import("@event-every/scanner")') as () => Promise<ScannerModule>;

const claim = <Value,>(value: Value, sourceId = 'source-text-1') => ({
  value,
  confidence: 0.9,
  evidence: [{ sourceId, locator: 'body', excerpt: 'evidence', startOffset: 0, endOffset: 8 }],
});

async function responseFor(title: string, n: number): Promise<ScanResponse> {
  const { EventCandidateSchema } = await importScannerModule();
  return {
    source: { sourceId: `source-${n}`, kind: 'text', contentHandle: `opaque-${n}` },
    candidates: [EventCandidateSchema.parse({
      candidateId: `candidate-${n}`,
      sourceUid: null,
      title: claim(title, `source-${n}`),
      description: claim(null),
      location: claim(null),
      url: claim(null),
      temporal: claim({
        start: { kind: 'floating', date: { year: 2026, month: 8, day: n }, time: { hour: 12, minute: 0, second: 0 } },
        end: null,
        duration: null,
        allDay: false,
      }),
      recurrence: claim(null),
      issues: [],
    })],
    issues: [],
  };
}

test('a confident no-event verdict shows a notice at once and never calls the scanner', async ({ page }) => {
  let scanRequests = 0;
  await page.route('**/api/scan', async (route: Route) => {
    scanRequests += 1;
    await route.fulfill({ status: 500, body: 'must not be called' });
  });
  await setupLocal(page);
  await mockTriage(page, {
    available: true, decision: { kind: 'skip', reason: 'no_event' }, shape: 'no_event', hasEvent: 0.02, complete: 0.1, durationMinutes: null,
  });

  await submitText(page, 'milk, eggs, coffee filters');
  await expect(page.getByTestId('error-notification')).toContainText('No date or time found');
  await expect(eventCards(page)).toHaveCount(0);
  expect(scanRequests).toBe(0);
});

test('a split verdict scans each chunk and shows every card', async ({ page }) => {
  const seen: string[] = [];
  await page.route('**/api/scan', async (route: Route) => {
    const body = route.request().postDataJSON() as { kind: string; text: string };
    seen.push(body.text);
    const n = body.text.startsWith('Dentist') ? 1 : 2;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(await responseFor(n === 1 ? 'Dentist' : 'Dinner with Sam', n)),
    });
  });
  await setupLocal(page);
  await mockTriage(page, {
    available: true,
    decision: { kind: 'split', chunks: ['Dentist Tue Apr 7 2pm', 'Dinner with Sam Fri Apr 10 7pm'] },
    shape: 'several_independent_events', hasEvent: 0.99, complete: 0.9, durationMinutes: null,
  });

  await submitText(page, 'Dentist Tue Apr 7 2pm\n\nDinner with Sam Fri Apr 10 7pm');
  await waitForCards(page, 2);
  expect(seen.sort()).toEqual(['Dentist Tue Apr 7 2pm', 'Dinner with Sam Fri Apr 10 7pm']);
  await expect(page.getByTestId('event-card-title')).toContainText(['Dentist', 'Dinner with Sam']);
});

test('an unavailable triage runs exactly one scan as before', async ({ page }) => {
  const seen: string[] = [];
  await page.route('**/api/scan', async (route: Route) => {
    seen.push((route.request().postDataJSON() as { text: string }).text);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(await responseFor('Team lunch', 4)) });
  });
  await setupLocal(page);

  await submitText(page, 'Team lunch Aug 4 at noon');
  await waitForCards(page, 1);
  expect(seen).toEqual(['Team lunch Aug 4 at noon']);
});

test('a slow triage does not hold the scan hostage', async ({ page }) => {
  await page.route('**/api/scan', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(await responseFor('Team lunch', 4)) });
  });
  await setupLocal(page);
  await page.route('**/api/triage', async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false }) });
  });

  await submitText(page, 'Team lunch Aug 4 at noon');
  await waitForCards(page, 1, 10000);
});
