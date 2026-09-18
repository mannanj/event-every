import { expect, test, type Route } from '@playwright/test';
import { ScanRequestSchema } from '../src/types/scanRequest';
import type { ScanResponse } from '../src/types/scannerHttp';
import {
  cardTitled,
  downloadedCalendar,
  eventCards,
  mockAuth,
  mockRawScanAPI,
  mockScanAPI,
  mockSummarize,
  mockURLDetection,
  readTempUnsaved,
  scanButton,
  setCardDate,
  setCardTime,
  setupLocal,
  submitText,
  TINY_PNG_BASE64,
  waitForCards,
  mockTriage,
} from './helpers';

/**
 * Scan results are the ordinary event cards (task 206). Floating times are read
 * in the viewer's zone, so the viewer is pinned to UTC and a floating 19:00
 * exports as 190000Z. The all-day cases below override the zone on purpose.
 */
test.use({ timezoneId: 'UTC', locale: 'en-US' });

type ScannerModule = typeof import('@event-every/scanner');

// Playwright transforms test modules to CommonJS, so a normal dynamic import becomes require().
const importScannerModule = new Function(
  'return import("@event-every/scanner")',
) as () => Promise<ScannerModule>;

function loadScannerModule(): Promise<ScannerModule> {
  return importScannerModule();
}

const claim = <Value,>(
  value: Value,
  sourceId = 'source-text-1',
  excerpt = 'Planning lunch at noon',
) => ({
  value,
  confidence: 0.9,
  evidence: [{
    sourceId,
    locator: 'body',
    excerpt,
    startOffset: 0,
    endOffset: excerpt.length,
  }],
});

async function textScanResponse(
  title = 'Team lunch',
  candidateId = 'candidate-text-1',
  sourceId = 'source-text-1',
): Promise<ScanResponse> {
  const { EventCandidateSchema } = await loadScannerModule();
  return {
    source: {
      sourceId,
      kind: 'text',
      contentHandle: 'opaque-text-1',
    },
    candidates: [EventCandidateSchema.parse({
      candidateId,
      sourceUid: null,
      title: claim(title, sourceId),
      description: claim(null),
      location: claim('Cafe Example'),
      url: claim(null),
      temporal: claim({
        start: {
          kind: 'floating',
          date: { year: 2026, month: 8, day: 4 },
          time: { hour: 12, minute: 0, second: 0 },
        },
        end: null,
        duration: 'PT1H',
        allDay: false,
      }),
      recurrence: claim(null),
      issues: [],
    })],
    issues: [],
  };
}

async function missingTitleScanResponse(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await loadScannerModule();
  return {
    source: {
      sourceId: 'source-text-1',
      kind: 'text',
      contentHandle: 'opaque-text-1',
    },
    candidates: [EventCandidateSchema.parse({
      candidateId: 'candidate-missing-title-1',
      sourceUid: null,
      title: claim(null),
      description: claim(null),
      location: claim(null),
      url: claim(null),
      temporal: claim({
        start: {
          kind: 'floating',
          date: { year: 2026, month: 8, day: 4 },
          time: { hour: 12, minute: 0, second: 0 },
        },
        end: null,
        duration: 'PT1H',
        allDay: false,
      }),
      recurrence: claim(null),
      issues: [],
    })],
    issues: [],
  };
}

async function missingStartScanResponse(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await loadScannerModule();
  return {
    source: {
      sourceId: 'source-text-1',
      kind: 'text',
      contentHandle: 'opaque-text-1',
    },
    candidates: [EventCandidateSchema.parse({
      candidateId: 'candidate-missing-start-1',
      sourceUid: null,
      title: claim('Planning meeting'),
      description: claim('Discuss launch details'),
      location: claim('Room 4'),
      url: claim('https://example.com/meeting'),
      temporal: claim({
        start: null,
        end: null,
        duration: 'PT1H',
        allDay: false,
      }),
      recurrence: claim(null),
      issues: [],
    })],
    issues: [],
  };
}

async function narrowAccessibilityScanResponse(): Promise<ScanResponse> {
  const { EventCandidateSchema, ScannerIssueSchema } = await loadScannerModule();
  const sourceId = 'source-narrow-accessibility-1';
  return {
    source: {
      sourceId,
      kind: 'text',
      contentHandle: 'opaque-narrow-accessibility-1',
    },
    candidates: [EventCandidateSchema.parse({
      candidateId: 'candidate-narrow-accessibility-1',
      sourceUid: null,
      title: claim('Narrow accessibility candidate', sourceId),
      description: claim('Accessible description', sourceId),
      location: claim('Accessible room', sourceId),
      url: claim('https://example.com/accessibility', sourceId),
      temporal: claim({
        start: {
          kind: 'floating',
          date: { year: 2026, month: 8, day: 10 },
          time: { hour: 11, minute: 30, second: 0 },
        },
        end: null,
        duration: 'PT1H',
        allDay: false,
      }, sourceId),
      recurrence: claim(null, sourceId),
      issues: [ScannerIssueSchema.parse({
        code: 'field_not_found',
        kind: 'not_found',
        severity: 'warning',
        field: 'recurrence',
        message: 'The candidate recurrence was not found.',
        evidence: [],
      })],
    })],
    issues: [ScannerIssueSchema.parse({
      code: 'field_not_found',
      kind: 'not_found',
      severity: 'warning',
      field: 'scan',
      message: 'The scan reported an accessible review warning.',
      evidence: [],
    })],
  };
}

async function imageScanResponse(
  title = 'Vision flyer lunch',
  candidateId = 'candidate-image-1',
  sourceId = 'source-image-1',
  day = 5,
): Promise<ScanResponse> {
  const { EventCandidateSchema } = await loadScannerModule();
  return {
    source: {
      sourceId,
      kind: 'image',
      contentHandle: 'opaque-image-1',
    },
    candidates: [EventCandidateSchema.parse({
      candidateId,
      sourceUid: null,
      title: claim(title, sourceId, 'Lunch on the flyer'),
      description: claim(null, sourceId, 'Lunch on the flyer'),
      location: claim('Courtyard', sourceId, 'Lunch on the flyer'),
      url: claim(null, sourceId, 'Lunch on the flyer'),
      temporal: claim({
        start: {
          kind: 'floating',
          date: { year: 2026, month: 8, day },
          time: { hour: 13, minute: 0, second: 0 },
        },
        end: null,
        duration: 'PT1H',
        allDay: false,
      }, sourceId, 'Lunch on the flyer'),
      recurrence: claim(null, sourceId, 'Lunch on the flyer'),
      issues: [],
    })],
    issues: [],
  };
}

async function multipleSelectionScanResponse(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await loadScannerModule();
  const sourceId = 'source-multi-selection-1';
  const candidate = (
    candidateId: string,
    title: string,
    location: string,
    day: number,
    hour: number,
  ) => EventCandidateSchema.parse({
    candidateId,
    sourceUid: null,
    title: claim(title, sourceId),
    description: claim(null, sourceId),
    location: claim(location, sourceId),
    url: claim(null, sourceId),
    temporal: claim({
      start: {
        kind: 'floating',
        date: { year: 2026, month: 8, day },
        time: { hour, minute: 0, second: 0 },
      },
      end: null,
      duration: 'PT1H',
      allDay: false,
    }, sourceId),
    recurrence: claim(null, sourceId),
    issues: [],
  });
  return {
    source: {
      sourceId,
      kind: 'text',
      contentHandle: 'opaque-multi-selection-1',
    },
    candidates: [
      candidate('candidate-multi-omit', 'Omit multi candidate', 'Archive room', 7, 9),
      candidate('candidate-multi-keep-one', 'Keep multi candidate one', 'North room', 8, 10),
      candidate('candidate-multi-keep-two', 'Keep multi candidate two', 'South room', 9, 11),
    ],
    issues: [],
  };
}

async function partialRetentionScanResponse(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await loadScannerModule();
  const sourceId = 'source-partial-retention-1';
  const candidate = (
    candidateId: string,
    title: string,
    location: string,
    start: { day: number; hour: number } | null,
  ) => EventCandidateSchema.parse({
    candidateId,
    sourceUid: null,
    title: claim(title, sourceId),
    description: claim(null, sourceId),
    location: claim(location, sourceId),
    url: claim(null, sourceId),
    temporal: claim({
      start: start === null ? null : {
        kind: 'floating',
        date: { year: 2026, month: 8, day: start.day },
        time: { hour: start.hour, minute: 0, second: 0 },
      },
      end: null,
      duration: 'PT1H',
      allDay: false,
    }, sourceId),
    recurrence: claim(null, sourceId),
    issues: [],
  });
  return {
    source: {
      sourceId,
      kind: 'text',
      contentHandle: 'opaque-partial-retention-1',
    },
    candidates: [
      candidate('candidate-partial-exported-1', 'Exported partial candidate', 'Export pier', { day: 12, hour: 9 }),
      candidate('candidate-partial-retained-1', 'Retained partial candidate', 'Keep room', null),
    ],
    issues: [],
  };
}

test('editing the start time on a card is what gets exported', async ({ page }) => {
  const sourceId = 'source-buffered-start-time-1';
  const submittedText = 'Scanner buffered start-time fixture: March 13 at 7pm.';
  const { EventCandidateSchema } = await loadScannerModule();
  const candidate = EventCandidateSchema.parse({
    candidateId: 'candidate-buffered-start-time-1',
    sourceUid: null,
    title: claim('Buffered start-time review', sourceId, submittedText),
    description: claim(null, sourceId, submittedText),
    location: claim(null, sourceId, submittedText),
    url: claim(null, sourceId, submittedText),
    temporal: claim({
      start: { kind: 'floating', date: { year: 2026, month: 3, day: 13 }, time: { hour: 19, minute: 0, second: 0 } },
      end: { kind: 'floating', date: { year: 2026, month: 3, day: 13 }, time: { hour: 20, minute: 0, second: 0 } },
      duration: null,
      allDay: false,
    }, sourceId, submittedText),
    recurrence: claim(null, sourceId, submittedText),
    issues: [],
  });
  let scanRequestCount = 0;
  await page.route('**/api/scan', async (route: Route) => {
    scanRequestCount += 1;
    if (scanRequestCount !== 1) throw new Error(`Expected exactly one Scanner request, received ${scanRequestCount}`);
    expect(ScanRequestSchema.parse(route.request().postDataJSON())).toEqual({ kind: 'text', text: submittedText });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: { sourceId, kind: 'text', contentHandle: 'opaque-buffered-start-time-1' },
        candidates: [candidate],
        issues: [],
      } satisfies ScanResponse),
    });
  });
  await setupLocal(page);

  await submitText(page, submittedText);

  await waitForCards(page, 1);
  const card = cardTitled(page, 'Buffered start-time review');
  await expect(card).toContainText('Mar 13 at 7:00 PM');
  await expect.poll(async () => (await readTempUnsaved(page))[0]?.startDate).toBe('2026-03-13T19:00:00.000Z');

  await setCardTime(card, '7:00 PM', '19:45');
  await expect(card).toContainText('Mar 13 at 7:45 PM');
  // The end moved with the start, so the hour-long event is still an hour.
  await expect.poll(async () => {
    const [event] = await readTempUnsaved(page);
    return [event?.startDate, event?.endDate];
  }).toEqual(['2026-03-13T19:45:00.000Z', '2026-03-13T20:45:00.000Z']);
  expect(scanRequestCount).toBe(1);

  const calendarText = await downloadedCalendar(page);
  expect(calendarText).toMatch(/DTSTART(;[^:]*)?:20260313T194500Z/);
  expect(calendarText).not.toContain('20260313T190000');
  expect(scanRequestCount).toBe(1);
});

test('image scan sends a strict data URL, shows the vision candidate, exports it, and stores no image bytes', async ({ page }) => {
  await mockScanAPI(page, await imageScanResponse());
  await setupLocal(page);

  const dataUrl = `data:image/png;base64,${TINY_PNG_BASE64}`;
  const scanRequestPromise = page.waitForRequest('**/api/scan');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'vision-flyer.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
  });
  await expect(page.locator('img[alt="Uploaded 1"]')).toBeVisible();
  await scanButton(page).click();

  const scanRequest = await scanRequestPromise;
  expect(scanRequest.postDataJSON()).toEqual({ kind: 'image', dataUrl });

  await waitForCards(page, 1);
  await expect(page.getByTestId('event-card-title')).toHaveText('Vision flyer lunch');
  await expect(page.getByTestId('save-events-button')).toBeEnabled();

  // Privacy: what persists is the card, never the image or a scan request.
  await expect.poll(() => readTempUnsaved(page)).toHaveLength(1);
  const serialized = await page.evaluate(() => Object.entries(localStorage).map(([key, value]) => `${key}=${value}`).join('\n'));
  expect(serialized).not.toContain(dataUrl);
  expect(serialized).not.toContain('"dataUrl"');
  expect(await page.evaluate(() => localStorage.getItem('event-every:last-scan-source'))).toBeNull();

  const calendarText = await downloadedCalendar(page);
  expect(calendarText).toContain('SUMMARY:Vision flyer lunch');
  expect(calendarText).toContain('LOCATION:Courtyard');
  expect(calendarText).toMatch(/DTSTART(;[^:]*)?:20260805T130000Z/);
});

test('two named images scan strictly in order and produce both cards in that order', async ({ page }) => {
  const firstResponse = await imageScanResponse('First sequential flyer', 'candidate-image-sequential-first', 'source-image-sequential-first', 6);
  const secondResponse = await imageScanResponse('Second sequential flyer', 'candidate-image-sequential-second', 'source-image-sequential-second', 7);
  let requestCount = 0;
  let firstResponseReleased = false;
  let secondStartedBeforeFirstResponseReleased = false;
  let releaseFirstResponse!: () => void;
  let resolveFirstRequest!: () => void;
  let resolveSecondRequest!: () => void;
  const firstResponseRelease = new Promise<void>((resolve) => { releaseFirstResponse = resolve; });
  const firstRequest = new Promise<void>((resolve) => { resolveFirstRequest = resolve; });
  const secondRequest = new Promise<void>((resolve) => { resolveSecondRequest = resolve; });

  await page.route('**/api/scan', async (route: Route) => {
    ScanRequestSchema.parse(route.request().postDataJSON());
    requestCount += 1;
    if (requestCount === 1) {
      resolveFirstRequest();
      await firstResponseRelease;
      firstResponseReleased = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(firstResponse) });
      return;
    }
    if (requestCount === 2) {
      secondStartedBeforeFirstResponseReleased = !firstResponseReleased;
      resolveSecondRequest();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(secondResponse) });
      return;
    }
    throw new Error(`Unexpected scan request ${requestCount}`);
  });
  await setupLocal(page);

  await page.locator('input[type="file"]').setInputFiles([
    { name: 'sequential-first.png', mimeType: 'image/png', buffer: Buffer.from(TINY_PNG_BASE64, 'base64') },
    { name: 'sequential-second.png', mimeType: 'image/png', buffer: Buffer.from(TINY_PNG_BASE64, 'base64') },
  ]);
  await expect(page.locator('img[alt="Uploaded 1"]')).toBeVisible();
  await expect(page.locator('img[alt="Uploaded 2"]')).toBeVisible();
  await page.locator('img[alt="Uploaded 1"]').hover();
  await expect(page.getByText('sequential-first.png', { exact: true })).toBeVisible();
  await page.locator('img[alt="Uploaded 2"]').hover();
  await expect(page.getByText('sequential-second.png', { exact: true })).toBeVisible();
  await scanButton(page).click();
  await firstRequest;
  await page.waitForTimeout(500);
  expect(requestCount).toBe(1);

  releaseFirstResponse();
  await secondRequest;
  expect(secondStartedBeforeFirstResponseReleased).toBe(false);

  await waitForCards(page, 2);
  await expect(page.getByTestId('event-card-title')).toHaveText(['First sequential flyer', 'Second sequential flyer']);
  await expect.poll(async () => (await readTempUnsaved(page)).map((event) => event.title)).toEqual([
    'First sequential flyer',
    'Second sequential flyer',
  ]);
});

test('canceling after a held first image scan prevents the second request and leaves no card', async ({ page }) => {
  const firstResponse = await imageScanResponse('Canceled sequential flyer', 'candidate-image-sequential-canceled', 'source-image-sequential-canceled', 8);
  let requestCount = 0;
  let releaseFirstResponse!: () => void;
  let resolveFirstRequest!: () => void;
  let resolveFirstRouteSettled!: () => void;
  const firstResponseRelease = new Promise<void>((resolve) => { releaseFirstResponse = resolve; });
  const firstRequest = new Promise<void>((resolve) => { resolveFirstRequest = resolve; });
  const firstRouteSettled = new Promise<void>((resolve) => { resolveFirstRouteSettled = resolve; });

  await page.route('**/api/scan', async (route: Route) => {
    ScanRequestSchema.parse(route.request().postDataJSON());
    requestCount += 1;
    if (requestCount !== 1) throw new Error(`Canceled image batch unexpectedly started request ${requestCount}`);
    resolveFirstRequest();
    await firstResponseRelease;
    try {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(firstResponse) });
    } catch {
      // Cancellation is expected to abort this held request.
    } finally {
      resolveFirstRouteSettled();
    }
  });
  await setupLocal(page);

  await page.locator('input[type="file"]').setInputFiles([
    { name: 'cancel-first.png', mimeType: 'image/png', buffer: Buffer.from(TINY_PNG_BASE64, 'base64') },
    { name: 'cancel-second.png', mimeType: 'image/png', buffer: Buffer.from(TINY_PNG_BASE64, 'base64') },
  ]);
  const transform = scanButton(page);
  await expect(page.locator('img[alt="Uploaded 1"]')).toBeVisible();
  await expect(page.locator('img[alt="Uploaded 2"]')).toBeVisible();
  await expect(transform).toBeEnabled();
  await transform.click();
  await firstRequest;
  await page.getByTestId('cancel-job-button').click();
  releaseFirstResponse();
  await firstRouteSettled;
  await page.waitForTimeout(500);

  expect(requestCount).toBe(1);
  await expect(eventCards(page)).toHaveCount(0);
  await expect(page.getByTestId('cancel-job-button')).toHaveCount(0);
  await expect.poll(() => readTempUnsaved(page)).toEqual([]);
});

test('mixed text and image input stays drafted, reports the deferral, and makes no scan request', async ({ page }) => {
  let scanRequestCount = 0;
  await page.route('**/api/scan', async (route: Route) => {
    scanRequestCount += 1;
    await route.fulfill({ status: 500, body: 'Mixed input must not scan.' });
  });
  await setupLocal(page);

  const mixedText = 'Keep this mixed draft ready for separate scans.';
  const textarea = page.getByTestId('smart-input-textarea');
  const draftImage = page.locator('img[alt="Uploaded 1"]');
  await textarea.fill(mixedText);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'mixed-flyer.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
  });
  await expect(draftImage).toBeVisible();

  await scanButton(page).click();

  await expect(textarea).toHaveText(mixedText);
  await expect(draftImage).toBeVisible();
  await draftImage.hover();
  await expect(page.getByText('mixed-flyer.png', { exact: true })).toBeVisible();
  const deferralAlert = page.getByRole('alert').filter({
    has: page.getByText('Scan text and images separately for now.', { exact: true }),
  });
  await expect(deferralAlert).toBeVisible();
  await page.waitForTimeout(500);
  expect(scanRequestCount).toBe(0);
});

test('multiple Scanner candidates export exactly the selected subset in one calendar download', async ({ page }) => {
  await mockScanAPI(page, await multipleSelectionScanResponse());
  await setupLocal(page);

  await submitText(page, 'Three event candidates; export only the selected subset.');

  await waitForCards(page, 3);
  const omittedCandidate = page.getByRole('checkbox', { name: 'Select Omit multi candidate' });
  const selectedOne = page.getByRole('checkbox', { name: 'Select Keep multi candidate one' });
  const selectedTwo = page.getByRole('checkbox', { name: 'Select Keep multi candidate two' });
  await expect(omittedCandidate).toBeChecked();
  await expect(selectedOne).toBeChecked();
  await expect(selectedTwo).toBeChecked();
  await omittedCandidate.uncheck();
  await expect(omittedCandidate).not.toBeChecked();
  await expect(selectedOne).toBeChecked();
  await expect(selectedTwo).toBeChecked();
  await expect(page.getByTestId('save-events-button')).toHaveText('Save (2)');
  await expect(page.getByText('1 event will be lost')).toBeVisible();

  expect((await readTempUnsaved(page)).map((event) => event.title)).toEqual([
    'Omit multi candidate',
    'Keep multi candidate one',
    'Keep multi candidate two',
  ]);

  const calendarText = await downloadedCalendar(page);
  expect(calendarText.match(/BEGIN:VEVENT\r\n/g)).toHaveLength(2);
  expect(calendarText).not.toContain('SUMMARY:Omit multi candidate');
  expect(calendarText).toContain('SUMMARY:Keep multi candidate one');
  expect(calendarText).toContain('SUMMARY:Keep multi candidate two');
  expect(calendarText).toMatch(/DTSTART(;[^:]*)?:20260808T100000Z/);
  expect(calendarText).toMatch(/DTSTART(;[^:]*)?:20260809T110000Z/);

  // Saving is the end of the batch: the two go to history, the unselected one is gone.
  await expect(eventCards(page)).toHaveCount(0);
  await expect.poll(() => readTempUnsaved(page)).toEqual([]);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('event_every_history') ?? '[]') as Array<{ title: string }>);
  expect(saved.map((event) => event.title).sort()).toEqual(['Keep multi candidate one', 'Keep multi candidate two']);
});

test('a card with no source start survives a reload, and an unselected card does not survive a save', async ({ page }) => {
  await mockScanAPI(page, await partialRetentionScanResponse());
  await mockAuth(page);
  await mockTriage(page);
  await mockURLDetection(page);
  await mockSummarize(page);
  await page.goto('/');
  await page.waitForSelector('[data-testid="smart-input-textarea"]', { state: 'visible', timeout: 20000 });

  await submitText(page, 'Export the first strict Scanner draft and retain the second draft.');

  await waitForCards(page, 2);
  await expect(page.getByTestId('event-card-title')).toHaveText(['Exported partial candidate', 'Retained partial candidate']);
  await expect(cardTitled(page, 'Exported partial candidate')).toContainText('Export pier');
  await expect(cardTitled(page, 'Retained partial candidate')).toContainText('Keep room');

  // Reload: both unsaved cards come back, in order, with what they had.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await waitForCards(page, 2);
  await expect(page.getByTestId('event-card-title')).toHaveText(['Exported partial candidate', 'Retained partial candidate']);
  await expect(cardTitled(page, 'Retained partial candidate')).toContainText('Keep room');

  const retainedSelection = page.getByRole('checkbox', { name: 'Select Retained partial candidate' });
  await expect(retainedSelection).toBeChecked();
  await retainedSelection.uncheck();
  await expect(page.getByTestId('save-events-button')).toHaveText('Save (1)');

  const calendarText = await downloadedCalendar(page);
  expect(calendarText.match(/BEGIN:VEVENT\r\n/g)).toHaveLength(1);
  expect(calendarText).toContain('SUMMARY:Exported partial candidate');
  expect(calendarText).toMatch(/DTSTART(;[^:]*)?:20260812T090000Z/);

  await expect(eventCards(page)).toHaveCount(0);
  await expect.poll(() => readTempUnsaved(page)).toEqual([]);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(eventCards(page)).toHaveCount(0);
});

test('a candidate with no title is shown and exported as Untitled Event', async ({ page }) => {
  await mockScanAPI(page, await missingTitleScanResponse());
  await setupLocal(page);

  await submitText(page, 'Planning lunch at noon');

  await waitForCards(page, 1);
  await expect(page.getByTestId('event-card-title')).toHaveText('Untitled Event');
  await expect(page.getByTestId('save-events-button')).toBeEnabled();

  const calendarText = await downloadedCalendar(page);
  expect(calendarText).toContain('SUMMARY:Untitled Event');
  expect(calendarText).toMatch(/DTSTART(;[^:]*)?:20260804T120000Z/);
});

test('a candidate with no start can be given one on the card and exports it', async ({ page }) => {
  await mockScanAPI(page, await missingStartScanResponse());
  await setupLocal(page);

  await submitText(page, 'Planning meeting with no start time');

  await waitForCards(page, 1);
  const card = cardTitled(page, 'Planning meeting');
  await expect(card).toContainText('Room 4');
  // No source start: the card is placed at the moment it was created so it can be edited.
  const dateText = card.locator('p span.cursor-pointer').first();
  const timeText = card.locator('p span.cursor-pointer').nth(1);
  await dateText.click();
  const dateInput = card.getByTestId('event-card-date-input');
  await dateInput.fill('2026-08-06');
  await dateInput.press('Enter');
  await expect(card).toContainText('Aug 6 at');
  await timeText.click();
  const timeInput = card.getByTestId('event-card-time-input');
  await timeInput.fill('09:15');
  await timeInput.press('Enter');
  await expect(card).toContainText('Aug 6 at 9:15 AM');
  await expect.poll(async () => (await readTempUnsaved(page))[0]?.startDate).toBe('2026-08-06T09:15:00.000Z');

  const calendarText = await downloadedCalendar(page);
  expect(calendarText).toContain('SUMMARY:Planning meeting');
  expect(calendarText).toContain('LOCATION:Room 4');
  expect(calendarText).toContain('DESCRIPTION:Discuss launch details');
  expect(calendarText).toMatch(/DTSTART(;[^:]*)?:20260806T091500Z/);
});

test('narrow viewport keeps every card control keyboard reachable with stable accessible names', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mockScanAPI(page, await narrowAccessibilityScanResponse());
  await setupLocal(page);

  await submitText(page, 'Show every card control at a narrow viewport.');

  await waitForCards(page, 1);
  const card = cardTitled(page, 'Narrow accessibility candidate');
  const selection = card.getByRole('checkbox', { name: 'Select Narrow accessibility candidate' });
  const timezone = card.getByRole('combobox', { name: 'Timezone' });
  const timezoneInfo = card.getByRole('button', { name: 'Timezone info' });
  const expand = card.getByRole('button', { name: 'Expand' });
  const save = page.getByTestId('save-events-button');
  const selectAll = page.getByRole('button', { name: 'Unselect all' });

  for (const control of [selection, timezone, timezoneInfo, expand, save, selectAll]) {
    await expect(control).toBeEnabled();
  }
  await expect(save).toHaveAccessibleName('Save 1 event');

  // DOM keyboard order, forward from the checkbox through every control. WebKit
  // models macOS Safari, where Option+Tab is what includes buttons in Tab order.
  const forwardKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await selection.focus();
  await expect(selection).toBeFocused();
  for (const control of [timezone, timezoneInfo, expand, save, selectAll]) {
    await page.keyboard.press(forwardKey);
    await expect(control).toBeFocused();
    await expect(control).toBeInViewport();
  }

  await expand.click();
  await expect(card.getByRole('button', { name: 'Collapse' })).toBeVisible();
  await expect(card).toContainText('Accessible description');
});

test('reload restores the unsaved cards without storing the raw submission', async ({ page }) => {
  await mockScanAPI(page, await missingStartScanResponse());
  await mockAuth(page);
  await mockTriage(page);
  await mockURLDetection(page);
  await mockSummarize(page);
  await page.goto('/');
  await page.waitForSelector('[data-testid="smart-input-textarea"]', { state: 'visible', timeout: 20000 });
  const legacyStorage = JSON.stringify([{ id: 'legacy-event-storage-1' }]);
  await page.evaluate((value) => localStorage.setItem('event_every_history', value), legacyStorage);

  const rawSubmission = 'Private raw reload source that must not enter card storage.';
  await submitText(page, rawSubmission);

  await waitForCards(page, 1);
  await expect(page.getByTestId('event-card-title')).toHaveText('Planning meeting');

  const readStored = () => page.evaluate(() => localStorage.getItem('event_every_temp_unsaved'));
  await expect.poll(readStored).not.toBeNull();
  const storedBeforeReload = await readStored();
  expect(storedBeforeReload).not.toContain(rawSubmission);
  expect(storedBeforeReload).not.toContain('"dataUrl"');

  await page.reload();
  await page.waitForLoadState('networkidle');

  await waitForCards(page, 1);
  await expect(page.getByTestId('event-card-title')).toHaveText('Planning meeting');
  expect(await readStored()).toBe(storedBeforeReload);
  expect(await page.evaluate(() => localStorage.getItem('event_every_history'))).toBe(legacyStorage);
});

test('edited title, time and location are what get exported, not the scanned values', async ({ page }) => {
  await mockScanAPI(page, await textScanResponse());
  await setupLocal(page);

  const submittedSource = 'Raw submission that must never be stored as a scan request.';
  await submitText(page, submittedSource);

  await waitForCards(page, 1);
  // By position, not title: the title is about to be edited and the heading
  // becomes an input while it is.
  const card = eventCards(page).first();
  await expect(card.getByTestId('event-card-title')).toHaveText('Team lunch');
  await expect(card).toContainText('Aug 4 at 12:00 PM');
  await expect(card).toContainText('Cafe Example');

  await card.getByTestId('event-card-title').click();
  const title = card.getByTestId('event-card-title-input');
  await title.fill('Edited team lunch');
  await title.press('Enter');
  await setCardTime(card, '12:00 PM', '14:30');
  await card.getByText('Cafe Example', { exact: true }).click();
  const location = card.locator('input[type="text"]').last();
  await location.fill('Edited Cafe');
  await location.press('Enter');

  await expect(card.getByTestId('event-card-title')).toHaveText('Edited team lunch');
  await expect(card).toContainText('Aug 4 at 2:30 PM');
  await expect(card).toContainText('Edited Cafe');

  const [stored] = await readTempUnsaved(page);
  expect(stored).toMatchObject({ title: 'Edited team lunch', location: 'Edited Cafe', startDate: '2026-08-04T14:30:00.000Z' });
  expect(JSON.stringify(stored)).not.toContain(submittedSource);
  expect(JSON.stringify(stored)).not.toContain('data:image/');

  const calendarText = await downloadedCalendar(page);
  expect(calendarText).toContain('SUMMARY:Edited team lunch');
  expect(calendarText).toContain('LOCATION:Edited Cafe');
  expect(calendarText).toMatch(/DTSTART(;[^:]*)?:20260804T143000Z/);
  expect(calendarText).not.toContain('SUMMARY:Team lunch');
  expect(calendarText).not.toContain('LOCATION:Cafe Example');
  expect(calendarText).not.toContain('20260804T120000');
});

test('canceling a delayed first scan leaves the succeeding second scan as the only card', async ({ page }) => {
  const canceledFirstResponse = await textScanResponse('Canceled first scan', 'candidate-canceled-first', 'source-canceled-first');
  const successfulSecondResponse = await textScanResponse('Successful second scan', 'candidate-successful-second', 'source-successful-second');
  let requestCount = 0;
  let resolveFirstRequest!: () => void;
  let releaseFirstResponse!: () => void;
  let resolveFirstResponseSettled!: () => void;
  let resolveSecondRequest!: () => void;
  const firstRequest = new Promise<void>((resolve) => { resolveFirstRequest = resolve; });
  const firstResponseRelease = new Promise<void>((resolve) => { releaseFirstResponse = resolve; });
  const firstResponseSettled = new Promise<void>((resolve) => { resolveFirstResponseSettled = resolve; });
  const secondRequest = new Promise<void>((resolve) => { resolveSecondRequest = resolve; });

  await page.route('**/api/scan', async (route: Route) => {
    ScanRequestSchema.parse(route.request().postDataJSON());
    requestCount += 1;
    if (requestCount === 1) {
      resolveFirstRequest();
      await firstResponseRelease;
      try {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(canceledFirstResponse) });
      } catch {
        // The production cancellation guard aborts this delayed request.
      } finally {
        resolveFirstResponseSettled();
      }
      return;
    }
    if (requestCount === 2) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(successfulSecondResponse) });
      resolveSecondRequest();
      return;
    }
    throw new Error(`Unexpected scan request ${requestCount}`);
  });
  await setupLocal(page);

  await submitText(page, 'This delayed result will be canceled.');
  await firstRequest;
  const cancel = page.getByTestId('cancel-job-button');
  await expect(cancel).toBeVisible();
  await cancel.click();

  await submitText(page, 'This second result must survive.');
  await secondRequest;
  await waitForCards(page, 1);
  await expect(page.getByTestId('event-card-title')).toHaveText('Successful second scan');
  releaseFirstResponse();
  await firstResponseSettled;
  await page.waitForLoadState('networkidle');

  // The stale-result guard: the canceled request may not append a card after
  // the successful replacement submission.
  await expect(page.getByTestId('event-card-title')).toHaveCount(1);
  await expect.poll(async () => (await readTempUnsaved(page)).map((event) => event.title)).toEqual(['Successful second scan']);
});

test('malformed successful scan response creates no card and reports a processing error', async ({ page }) => {
  await mockRawScanAPI(page, {
    ...(await textScanResponse()),
    unexpectedTopLevel: true,
  });
  await setupLocal(page);

  await submitText(page, 'Planning lunch at noon');

  const error = page.getByTestId('error-notification');
  await expect(error).toBeVisible();
  await expect(error).toContainText('Error processing text');
  await expect(eventCards(page)).toHaveCount(0);
});

const ALL_DAY_SOURCE_ID = 'all-day-source-1';
const ALL_DAY_TEXT = 'Scanner all-day provider fixture: Company offsite March 20.';

async function allDayScanResponse(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await loadScannerModule();
  return {
    source: { sourceId: ALL_DAY_SOURCE_ID, kind: 'text', contentHandle: 'opaque-all-day-1' },
    candidates: [EventCandidateSchema.parse({
      candidateId: 'all-day-provider-1',
      sourceUid: null,
      title: claim('Company offsite', ALL_DAY_SOURCE_ID, ALL_DAY_TEXT),
      description: claim(null, ALL_DAY_SOURCE_ID, ALL_DAY_TEXT),
      location: claim('Napa Valley', ALL_DAY_SOURCE_ID, ALL_DAY_TEXT),
      url: claim(null, ALL_DAY_SOURCE_ID, ALL_DAY_TEXT),
      temporal: claim({ start: { kind: 'date', year: 2026, month: 3, day: 20 }, end: null, duration: null, allDay: true }, ALL_DAY_SOURCE_ID, ALL_DAY_TEXT),
      recurrence: claim(null, ALL_DAY_SOURCE_ID, ALL_DAY_TEXT),
      issues: [],
    })],
    issues: [],
  };
}

/** An all-day date must stay the same calendar day for a viewer in any zone (task 194). */
async function proveAllDayCardEdit(page: import('@playwright/test').Page) {
  let requestCount = 0;
  await page.route('**/api/scan', async (route: Route) => {
    requestCount += 1;
    if (requestCount !== 1) throw new Error(`Unexpected scan request ${requestCount}`);
    expect(ScanRequestSchema.parse(route.request().postDataJSON())).toEqual({ kind: 'text', text: ALL_DAY_TEXT });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(await allDayScanResponse()) });
  });
  await setupLocal(page);
  await submitText(page, ALL_DAY_TEXT);

  await waitForCards(page, 1);
  const card = cardTitled(page, 'Company offsite');
  await expect(card).toContainText('Napa Valley');
  await expect(card).toContainText('Mar 20');
  await expect(card).not.toContainText(' at ');
  await expect(card.getByTestId('tz-chip')).toHaveCount(0);
  expect(requestCount).toBe(1);
  await expect.poll(async () => {
    const [event] = await readTempUnsaved(page);
    return [event?.allDay, event?.startDate, event?.endDate];
  }).toEqual([true, '2026-03-20T00:00:00.000Z', '2026-03-21T00:00:00.000Z']);

  await setCardDate(card, 'Mar 20', '2026-03-21');
  await expect(card).toContainText('Mar 21');
  await expect(card).not.toContainText(' at ');
  await expect.poll(async () => {
    const [event] = await readTempUnsaved(page);
    return [event?.allDay, event?.startDate, event?.endDate];
  }).toEqual([true, '2026-03-21T00:00:00.000Z', '2026-03-22T00:00:00.000Z']);

  const calendarText = await downloadedCalendar(page);
  const dtstartLines = calendarText.split(/\r?\n/).filter((line) => line.startsWith('DTSTART'));
  expect(dtstartLines).toEqual(['DTSTART;VALUE=DATE:20260321']);
  expect(calendarText).not.toContain('TZID=');
  expect((calendarText.match(/BEGIN:VEVENT/g) ?? [])).toHaveLength(1);
  expect(requestCount).toBe(1);
}

test.describe('Scanner all-day provider date - Asia/Tokyo viewer', () => {
  test.use({ timezoneId: 'Asia/Tokyo', locale: 'en-US' });

  test('preserves the calendar date through card editing and DATE export', async ({ page }) => {
    await proveAllDayCardEdit(page);
  });
});

test.describe('Scanner all-day provider date - America/Los_Angeles viewer', () => {
  test.use({ timezoneId: 'America/Los_Angeles', locale: 'en-US' });

  test('preserves the calendar date through card editing and DATE export', async ({ page }) => {
    await proveAllDayCardEdit(page);
  });
});
