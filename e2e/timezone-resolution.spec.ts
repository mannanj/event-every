import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { ScanRequestSchema } from '../src/types/scanRequest';
import type { ScanResponse } from '../src/types/scannerHttp';
import { downloadedCalendar, readTempUnsaved, setupLocal, submitText, waitForCards } from './helpers';

type ScannerModule = typeof import('@event-every/scanner');

// Playwright transforms test modules to CommonJS, so a normal dynamic import becomes require().
const importScannerModule = new Function(
  'return import("@event-every/scanner")',
) as () => Promise<ScannerModule>;

function loadScannerModule(): Promise<ScannerModule> {
  return importScannerModule();
}

const SCAN_TEXT = 'Timezone authority fixture: June 15, 2026 at 10:30 AM.';
const SOURCE_ID = 'timezone-source-1';

const claim = <Value,>(value: Value) => ({
  value,
  confidence: 0.9,
  evidence: [{
    sourceId: SOURCE_ID,
    locator: 'body',
    excerpt: SCAN_TEXT,
    startOffset: 0,
    endOffset: SCAN_TEXT.length,
  }],
});

const ZONED_START = {
  kind: 'zoned' as const,
  date: { year: 2026, month: 6, day: 15 },
  time: { hour: 10, minute: 30, second: 0 },
  timeZone: 'America/New_York',
  resolution: 'exact' as const,
  possibleOffsets: [],
  sourceOffset: null,
  chosenOffset: null,
};

const FLOATING_START = {
  kind: 'floating' as const,
  date: { year: 2026, month: 6, day: 15 },
  time: { hour: 10, minute: 30, second: 0 },
};

async function timezoneResponse(
  candidateId: string,
  title: string,
  start: typeof ZONED_START | typeof FLOATING_START,
): Promise<ScanResponse> {
  const { EventCandidateSchema } = await loadScannerModule();
  return {
    source: { sourceId: SOURCE_ID, kind: 'text', contentHandle: 'opaque-timezone-source-1' },
    candidates: [EventCandidateSchema.parse({
      candidateId,
      sourceUid: null,
      title: claim(title),
      description: claim('Scanner temporal-authority fixture'),
      location: claim('Remote'),
      url: claim('https://example.test/timezone-authority'),
      temporal: claim({ start, end: null, duration: 'PT30M', allDay: false }),
      recurrence: claim(null),
      issues: [],
    })],
    issues: [],
  };
}

async function floatingAndZonedResponse(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await loadScannerModule();
  const candidate = (
    candidateId: string,
    title: string,
    start: typeof ZONED_START | typeof FLOATING_START,
  ) => EventCandidateSchema.parse({
    candidateId,
    sourceUid: null,
    title: claim(title),
    description: claim('Scanner temporal-authority fixture'),
    location: claim('Remote'),
    url: claim('https://example.test/timezone-authority'),
    temporal: claim({ start, end: null, duration: 'PT30M', allDay: false }),
    recurrence: claim(null),
    issues: [],
  });
  return {
    source: { sourceId: SOURCE_ID, kind: 'text', contentHandle: 'opaque-timezone-source-1' },
    candidates: [
      candidate('timezone-floating-provider-1', 'Floating provider interview', FLOATING_START),
      candidate('timezone-zoned-control-1', 'Zoned provider control', ZONED_START),
    ],
    issues: [],
  };
}

async function mockTimezoneScan(page: Page, response: ScanResponse) {
  let requestCount = 0;
  await page.route('**/api/scan', async (route: Route) => {
    requestCount += 1;
    const request = ScanRequestSchema.parse(route.request().postDataJSON());
    expect(request).toEqual({ kind: 'text', text: SCAN_TEXT });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
  return () => requestCount;
}

function cardBy(page: Page, title: string): Locator {
  return page.getByTestId('event-card').filter({ has: page.getByTestId('event-card-title').filter({ hasText: title }) });
}

function calendarEventForSummary(calendarText: string, summary: string): string {
  const event = (calendarText.match(/BEGIN:VEVENT\r\n[\s\S]*?END:VEVENT\r\n/g) ?? [])
    .find((value) => value.includes(`SUMMARY:${summary}\r\n`));
  if (event === undefined) throw new Error(`Missing VEVENT for ${summary}`);
  return event;
}

/**
 * The cards show every time in the viewer's zone and keep the source zone on
 * the card's zone chip; the export writes UTC instants. So a provider point in
 * New York and a floating point read in Los Angeles are told apart by the
 * instant they become, not by a TZID.
 */
test.describe('Scanner temporal authority (viewer in America/Los_Angeles)', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('a zoned provider point keeps its zone: shown in the viewer zone, exported as that instant', async ({ page }) => {
    const candidateId = 'timezone-zoned-provider-1';
    const requestCount = await mockTimezoneScan(
      page,
      await timezoneResponse(candidateId, 'Zoned provider interview', ZONED_START),
    );
    await setupLocal(page);

    await submitText(page, SCAN_TEXT);

    await waitForCards(page, 1);
    const card = cardBy(page, 'Zoned provider interview');
    // 10:30 in New York is 07:30 for the Los Angeles reader. The chip names the
    // zone the time is shown in; the picker behind it still holds the source zone.
    await expect(card).toContainText('Jun 15 at 7:30 AM');
    await expect(card.getByTestId('tz-chip')).toHaveText('PT');
    await expect(card.locator('select[aria-label="Timezone"]')).toHaveValue('America/New_York');
    expect(requestCount()).toBe(1);
    const stored = await readTempUnsaved(page);
    expect(stored.map((event) => [event.timezone, event.rawStartDate, event.startDate])).toEqual([
      ['America/New_York', '2026-06-15T10:30:00', '2026-06-15T14:30:00.000Z'],
    ]);

    const calendarText = await downloadedCalendar(page);
    expect(calendarText).toContain('SUMMARY:Zoned provider interview');
    expect(calendarText).toMatch(/DTSTART(;[^:]*)?:20260615T143000Z/);
    expect(calendarText).not.toContain('20260615T103000');
  });

  test('a floating provider point is read in the viewer zone, beside a zoned control', async ({ page }) => {
    const requestCount = await mockTimezoneScan(
      page,
      await floatingAndZonedResponse(),
    );
    await setupLocal(page);

    await submitText(page, SCAN_TEXT);

    await waitForCards(page, 2);
    const floatingCard = cardBy(page, 'Floating provider interview');
    const zonedControlCard = cardBy(page, 'Zoned provider control');
    // No zone on the source: 10:30 is the reader's own 10:30, Pacific.
    await expect(floatingCard).toContainText('Jun 15 at 10:30 AM');
    await expect(floatingCard.locator('select[aria-label="Timezone"]')).toHaveValue('America/Los_Angeles');
    await expect(zonedControlCard).toContainText('Jun 15 at 7:30 AM');
    await expect(zonedControlCard.locator('select[aria-label="Timezone"]')).toHaveValue('America/New_York');
    expect(requestCount()).toBe(1);
    const stored = await readTempUnsaved(page);
    expect(stored.map((event) => [event.title, event.timezone, event.startDate])).toEqual([
      ['Floating provider interview', 'America/Los_Angeles', '2026-06-15T17:30:00.000Z'],
      ['Zoned provider control', 'America/New_York', '2026-06-15T14:30:00.000Z'],
    ]);

    const calendarText = await downloadedCalendar(page);
    const floatingEvent = calendarEventForSummary(calendarText, 'Floating provider interview');
    const zonedControlEvent = calendarEventForSummary(calendarText, 'Zoned provider control');
    expect(floatingEvent).toMatch(/DTSTART(;[^:]*)?:20260615T173000Z/);
    expect(zonedControlEvent).toMatch(/DTSTART(;[^:]*)?:20260615T143000Z/);
  });
});
