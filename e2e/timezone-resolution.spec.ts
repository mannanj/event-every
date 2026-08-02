import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { ScanRequestSchema } from '../src/types/scanRequest';
import type { ScanResponse } from '../src/types/scannerHttp';
import { setupLocal, submitText } from './helpers';

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

async function storedStart(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const serialized = localStorage.getItem('event-every:review-drafts:v1');
    if (serialized === null) throw new Error('Scanner review draft was not persisted');
    const [draft] = JSON.parse(serialized) as Array<{
      candidate: { temporal: { value: { start: unknown } } };
    }>;
    return draft.candidate.temporal.value.start;
  });
}

async function storedStarts(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const serialized = localStorage.getItem('event-every:review-drafts:v1');
    if (serialized === null) throw new Error('Scanner review drafts were not persisted');
    return (JSON.parse(serialized) as Array<{
      candidate: { temporal: { value: { start: unknown } } };
    }>).map((draft) => draft.candidate.temporal.value.start);
  });
}

async function downloadCalendar(page: Page, review: Locator): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await review.getByRole('button', { name: 'Export selected review drafts' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (downloadPath === null) throw new Error('Scanner export did not create a download');
  return readFile(downloadPath, 'utf8');
}

function calendarEventForSummary(calendarText: string, summary: string): string {
  const event = (calendarText.match(/BEGIN:VEVENT\r\n[\s\S]*?END:VEVENT\r\n/g) ?? [])
    .find((value) => value.includes(`SUMMARY:${summary}\r\n`));
  if (event === undefined) throw new Error(`Missing Scanner VEVENT for ${summary}`);
  return event;
}

test.describe('Scanner temporal authority (viewer in America/Los_Angeles)', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('zoned provider point stays zoned in review and exports its explicit TZID', async ({ page }) => {
    const candidateId = 'timezone-zoned-provider-1';
    const requestCount = await mockTimezoneScan(
      page,
      await timezoneResponse(candidateId, 'Zoned provider interview', ZONED_START),
    );
    await setupLocal(page);

    await submitText(page, SCAN_TEXT);

    const review = page.getByRole('region', { name: 'Scanner review drafts' });
    await expect(review.getByRole('textbox', { name: 'Start date' })).toHaveValue('2026-06-15');
    // The reviewer is in Los Angeles, but Scanner preserves the provider's New York wall time.
    await expect(review.getByRole('textbox', { name: 'Start time' })).toHaveValue('10:30');
    await expect(review.getByRole('textbox', { name: 'Timezone' })).toHaveValue('America/New_York');
    await expect(review.getByText('temporal · floating_time', { exact: false })).toHaveCount(0);
    await expect(review.getByRole('button', { name: 'Export selected review drafts' })).toBeEnabled();
    await expect.poll(() => storedStart(page)).toEqual(ZONED_START);
    expect(requestCount()).toBe(1);

    const calendarText = await downloadCalendar(page, review);
    expect(calendarText).toContain('DTSTART;TZID=America/New_York:20260615T103000');
    expect(calendarText).not.toContain('DTSTART:20260615T103000');
    expect(calendarText).not.toContain('DTSTART:20260615T103000Z');
  });

  test('floating provider point remains a truthful floating-time warning without TZID', async ({ page }) => {
    const requestCount = await mockTimezoneScan(
      page,
      await floatingAndZonedResponse(),
    );
    await setupLocal(page);

    await submitText(page, SCAN_TEXT);

    const review = page.getByRole('region', { name: 'Scanner review drafts' });
    const floatingCard = review.getByRole('article').filter({ hasText: 'Floating provider interview' });
    const zonedControlCard = review.getByRole('article').filter({ hasText: 'Zoned provider control' });
    await expect(floatingCard.getByRole('textbox', { name: 'Start date' })).toHaveValue('2026-06-15');
    await expect(floatingCard.getByRole('textbox', { name: 'Start time' })).toHaveValue('10:30');
    await expect(floatingCard.getByRole('textbox', { name: 'Timezone' })).toHaveValue('');
    await expect(floatingCard.getByText('temporal · floating_time', { exact: false })).toHaveCount(1);
    await expect(zonedControlCard.getByRole('textbox', { name: 'Start date' })).toHaveValue('2026-06-15');
    await expect(zonedControlCard.getByRole('textbox', { name: 'Start time' })).toHaveValue('10:30');
    await expect(zonedControlCard.getByRole('textbox', { name: 'Timezone' })).toHaveValue('America/New_York');
    await expect(zonedControlCard.getByText('temporal · floating_time', { exact: false })).toHaveCount(0);
    await expect(review.getByRole('button', { name: 'Export selected review drafts' })).toBeEnabled();
    await expect.poll(() => storedStarts(page)).toEqual([FLOATING_START, ZONED_START]);
    expect(requestCount()).toBe(1);

    const calendarText = await downloadCalendar(page, review);
    const floatingEvent = calendarEventForSummary(calendarText, 'Floating provider interview');
    const zonedControlEvent = calendarEventForSummary(calendarText, 'Zoned provider control');
    expect(floatingEvent).toContain('DTSTART:20260615T103000');
    expect(floatingEvent).not.toContain('TZID=');
    expect(floatingEvent).not.toContain('DTSTART:20260615T103000Z');
    expect(zonedControlEvent).toContain('DTSTART;TZID=America/New_York:20260615T103000');
    expect(zonedControlEvent).not.toContain('DTSTART:20260615T103000');
    expect(zonedControlEvent).not.toContain('DTSTART:20260615T103000Z');
  });
});
