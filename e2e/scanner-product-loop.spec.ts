import { readFile } from 'node:fs/promises';
import { expect, test, type Route } from '@playwright/test';
import { ScanRequestSchema } from '../src/types/scanRequest';
import type { ScanResponse } from '../src/types/scannerHttp';
import type { ReviewDraft } from '../src/types/review';
import {
  mockAuth,
  mockRawScanAPI,
  mockScanAPI,
  mockSummarize,
  mockURLDetection,
  setupLocal,
  submitText,
  TINY_PNG_BASE64,
} from './helpers';

type ScannerModule = typeof import('@event-every/scanner');

type StoredReviewRecord = Readonly<{
  version: 1;
  id: string;
  exportUid: string;
  createdAt: string;
  candidate: ReviewDraft['candidate'];
  scanIssues: ReviewDraft['scanIssues'];
  source: ReviewDraft['source'];
}>;

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

function calendarEventSection(calendarText: string): string {
  const match = calendarText.match(/BEGIN:VEVENT\r\n[\s\S]*?END:VEVENT\r\n/);
  if (!match) throw new Error('Scanner calendar did not contain one complete VEVENT section');
  return match[0];
}

function calendarHeader(calendarText: string): string {
  const eventStart = calendarText.indexOf('BEGIN:VEVENT\r\n');
  if (eventStart < 0) throw new Error('Scanner calendar did not contain a VEVENT start');
  return calendarText.slice(0, eventStart);
}

function calendarFooter(calendarText: string): string {
  const eventEnd = calendarText.indexOf('END:VEVENT\r\n');
  if (eventEnd < 0) throw new Error('Scanner calendar did not contain a VEVENT end');
  return calendarText.slice(eventEnd + 'END:VEVENT\r\n'.length);
}

test('Scanner ReviewDraftFields buffers start-time edits until commit and exports the committed value', async ({ page }) => {
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
      start: {
        kind: 'floating',
        date: { year: 2026, month: 3, day: 13 },
        time: { hour: 19, minute: 0, second: 0 },
      },
      end: {
        kind: 'floating',
        date: { year: 2026, month: 3, day: 13 },
        time: { hour: 20, minute: 0, second: 0 },
      },
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
    expect(ScanRequestSchema.parse(route.request().postDataJSON())).toEqual({
      kind: 'text',
      text: submittedText,
    });
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

  const review = page.getByRole('region', { name: 'Scanner review drafts' });
  const startTime = review.getByRole('textbox', { name: 'Start time', exact: true });
  const readStoredDraft = () => page.evaluate(() => {
    const serialized = localStorage.getItem('event-every:review-drafts:v1');
    return serialized === null ? null : JSON.parse(serialized)[0];
  });
  await expect(startTime).toHaveValue('19:00');
  await expect.poll(readStoredDraft).not.toBeNull();

  await startTime.focus();
  await startTime.fill('19:45');

  // This is the regression discriminator: only the controlled input buffer changes before blur.
  await expect(startTime).toHaveValue('19:45');
  const beforeCommit = await readStoredDraft();
  expect(beforeCommit!.candidate.temporal.value.start).toEqual({
    kind: 'floating',
    date: { year: 2026, month: 3, day: 13 },
    time: { hour: 19, minute: 0, second: 0 },
  });
  expect(beforeCommit!.candidate.temporal.evidence).toHaveLength(1);

  await startTime.press('Enter');
  await expect.poll(async () => (await readStoredDraft())?.candidate.temporal.value.start).toEqual({
    kind: 'floating',
    date: { year: 2026, month: 3, day: 13 },
    time: { hour: 19, minute: 45, second: 0 },
  });
  const afterCommit = await readStoredDraft();
  expect(afterCommit!.candidate.temporal).toMatchObject({ confidence: null, evidence: [] });
  expect(scanRequestCount).toBe(1);

  const downloadPromise = page.waitForEvent('download');
  await review.getByRole('button', { name: 'Export selected review drafts' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const calendarText = await readFile(downloadPath!, 'utf8');
  expect(calendarText).toContain('DTSTART:20260313T194500');
  expect(calendarText).not.toContain('DTSTART:20260313T190000');
  expect(scanRequestCount).toBe(1);
});

test('image scan sends a strict data URL, reviews a vision candidate, exports Scanner bytes, and keeps review storage raw-free', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Transform content to events' }).click();

  const scanRequest = await scanRequestPromise;
  expect(scanRequest.postDataJSON()).toEqual({ kind: 'image', dataUrl });

  const review = page.getByRole('region', { name: 'Scanner review drafts' });
  await expect(review.getByRole('textbox', { name: 'Title' })).toHaveValue('Vision flyer lunch');
  const exportButton = review.getByRole('button', { name: 'Export selected review drafts' });
  await expect(exportButton).toBeEnabled();

  await expect.poll(async () => page.evaluate(() => {
    const reviewDrafts = localStorage.getItem('event-every:review-drafts:v1');
    return reviewDrafts === null ? null : {
      reviewDrafts,
      lastScanSource: localStorage.getItem('event-every:last-scan-source'),
    };
  })).not.toBeNull();
  const storedReview = await page.evaluate(() => localStorage.getItem('event-every:review-drafts:v1'));
  expect(storedReview).not.toBeNull();
  expect(storedReview).not.toContain(dataUrl);
  expect(storedReview).not.toContain('"dataUrl"');
  expect(JSON.parse(storedReview!)[0]).toMatchObject({
    candidate: { candidateId: 'candidate-image-1' },
    source: { handle: { sourceId: 'source-image-1', kind: 'image', contentHandle: 'opaque-image-1' } },
  });
  expect(await page.evaluate(() => localStorage.getItem('event-every:last-scan-source'))).toBeNull();

  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const calendarText = await readFile(downloadPath!, 'utf8');
  expect(calendarText).toContain('SUMMARY:Vision flyer lunch');
  expect(calendarText).toContain('LOCATION:Courtyard');
  expect(calendarText).toContain('DTSTART:20260805T130000');
});

test('two named images scan strictly in order and retain both distinct Scanner candidates', async ({ page }) => {
  const firstResponse = await imageScanResponse(
    'First sequential flyer',
    'candidate-image-sequential-first',
    'source-image-sequential-first',
    6,
  );
  const secondResponse = await imageScanResponse(
    'Second sequential flyer',
    'candidate-image-sequential-second',
    'source-image-sequential-second',
    7,
  );
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
  await page.getByRole('button', { name: 'Transform content to events' }).click();
  await firstRequest;
  await page.waitForTimeout(500);
  expect(requestCount).toBe(1);

  releaseFirstResponse();
  await secondRequest;
  expect(secondStartedBeforeFirstResponseReleased).toBe(false);

  const titles = page.getByRole('region', { name: 'Scanner review drafts' }).getByRole('textbox', { name: 'Title' });
  await expect(titles).toHaveCount(2);
  expect(await titles.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).toEqual([
    'First sequential flyer',
    'Second sequential flyer',
  ]);
  await expect.poll(async () => page.evaluate(() => {
    const stored = localStorage.getItem('event-every:review-drafts:v1');
    return stored === null ? [] : JSON.parse(stored).map((draft: { candidate: { candidateId: string } }) => draft.candidate.candidateId);
  })).toEqual(['candidate-image-sequential-first', 'candidate-image-sequential-second']);
});

test('canceling after a held first image scan prevents the second request and creates no Scanner draft', async ({ page }) => {
  const firstResponse = await imageScanResponse(
    'Canceled sequential flyer',
    'candidate-image-sequential-canceled',
    'source-image-sequential-canceled',
    8,
  );
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
  const transform = page.getByRole('button', { name: 'Transform content to events' });
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
  await expect(page.getByRole('region', { name: 'Scanner review drafts' })).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => {
    const stored = localStorage.getItem('event-every:review-drafts:v1');
    return stored === null ? [] : JSON.parse(stored);
  })).toEqual([]);
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

  await page.getByRole('button', { name: 'Transform content to events' }).click();

  await expect(textarea).toHaveText(mixedText);
  await expect(draftImage).toBeVisible();
  await draftImage.hover();
  await expect(page.getByText('mixed-flyer.png', { exact: true })).toBeVisible();
  const deferralAlert = page.getByRole('alert').filter({
    has: page.getByText('Scan text and images separately for now.', { exact: true }),
  });
  await expect(deferralAlert).toBeVisible();
  await expect(deferralAlert.getByText('Scan text and images separately for now.', { exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  expect(scanRequestCount).toBe(0);
});

test('multiple Scanner candidates export exactly the selected VEVENT subset in one calendar download', async ({ page }) => {
  await mockScanAPI(page, await multipleSelectionScanResponse());
  await setupLocal(page);

  await submitText(page, 'Three event candidates; export only the selected subset.');

  const review = page.getByRole('region', { name: 'Scanner review drafts' });
  const omittedCandidate = review.getByRole('checkbox', { name: /Select Omit multi candidate/ });
  const selectedOne = review.getByRole('checkbox', { name: /Select Keep multi candidate one/ });
  const selectedTwo = review.getByRole('checkbox', { name: /Select Keep multi candidate two/ });
  await expect(omittedCandidate).toBeChecked();
  await expect(selectedOne).toBeChecked();
  await expect(selectedTwo).toBeChecked();
  await omittedCandidate.uncheck();
  await expect(omittedCandidate).not.toBeChecked();
  await expect(selectedOne).toBeChecked();
  await expect(selectedTwo).toBeChecked();

  const storedDrafts = await page.evaluate(() => {
    const serialized = localStorage.getItem('event-every:review-drafts:v1');
    if (serialized === null) throw new Error('Missing persisted Scanner review drafts');
    return JSON.parse(serialized) as Array<Pick<ReviewDraft, 'candidate' | 'exportUid' | 'createdAt'>>;
  });
  expect(storedDrafts.map((draft) => draft.candidate.title.value)).toEqual([
    'Omit multi candidate',
    'Keep multi candidate one',
    'Keep multi candidate two',
  ]);

  const { generateIcs } = await loadScannerModule();
  const scannerCalendars = storedDrafts.map((draft) => {
    const result = generateIcs(draft.candidate, {
      uid: draft.exportUid,
      dtstamp: draft.createdAt,
      prodId: '-//Event Every//Scanner//EN',
    });
    if (!result.ok) throw new Error('Expected selection fixture to remain Scanner-exportable');
    return result.calendarText;
  });
  const expectedCalendar = `${calendarHeader(scannerCalendars[0])}${calendarEventSection(scannerCalendars[1])}${calendarEventSection(scannerCalendars[2])}${calendarFooter(scannerCalendars[0])}`;

  const downloadPromise = page.waitForEvent('download');
  await review.getByRole('button', { name: 'Export selected review drafts' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const calendarText = await readFile(downloadPath!, 'utf8');
  expect(calendarText).toBe(expectedCalendar);
  expect(calendarText.match(/BEGIN:VEVENT\r\n/g)).toHaveLength(2);
  expect(calendarText).not.toContain('SUMMARY:Omit multi candidate');
  expect(calendarText).toContain('SUMMARY:Keep multi candidate one');
  expect(calendarText).toContain('SUMMARY:Keep multi candidate two');
});

test('partial Scanner export removes only the selected draft and reload recomputes retained readiness', async ({ page }) => {
  await mockScanAPI(page, await partialRetentionScanResponse());
  await mockAuth(page);
  await mockURLDetection(page);
  await mockSummarize(page);
  await page.goto('/');
  await page.waitForSelector('[data-testid="smart-input-textarea"]', { state: 'visible', timeout: 20000 });

  await submitText(page, 'Export the first strict Scanner draft and retain the second draft.');

  let review = page.getByRole('region', { name: 'Scanner review drafts' });
  const exportedSelection = review.getByRole('checkbox', { name: 'Select Exported partial candidate' });
  const retainedSelection = review.getByRole('checkbox', { name: 'Select Retained partial candidate' });
  await expect(review.getByRole('article')).toHaveCount(2);
  await expect(exportedSelection).toBeChecked();
  await expect(retainedSelection).toBeChecked();
  await expect(review.getByRole('textbox', { name: 'Title' })).toHaveCount(2);
  expect(await review.getByRole('textbox', { name: 'Title' }).evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  )).toEqual(['Exported partial candidate', 'Retained partial candidate']);
  expect(await review.getByRole('textbox', { name: 'Location' }).evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  )).toEqual(['Export pier', 'Keep room']);

  const storedBeforeExport = await page.evaluate(() => {
    const serialized = localStorage.getItem('event-every:review-drafts:v1');
    if (serialized === null) throw new Error('Missing persisted partial-retention Scanner drafts');
    return JSON.parse(serialized) as StoredReviewRecord[];
  });
  expect(storedBeforeExport.map((draft) => draft.candidate.candidateId)).toEqual([
    'candidate-partial-exported-1',
    'candidate-partial-retained-1',
  ]);
  expect(storedBeforeExport[1]).not.toHaveProperty('readiness');

  const { generateIcs } = await loadScannerModule();
  const exported = storedBeforeExport[0];
  const expectedExport = generateIcs(exported.candidate, {
    uid: exported.exportUid,
    dtstamp: exported.createdAt,
    prodId: '-//Event Every//Scanner//EN',
  });
  if (!expectedExport.ok) throw new Error('Expected selected partial-retention fixture to be exportable');

  await retainedSelection.uncheck();
  await expect(exportedSelection).toBeChecked();
  await expect(retainedSelection).not.toBeChecked();
  const downloadPromise = page.waitForEvent('download');
  await review.getByRole('button', { name: 'Export selected review drafts' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  expect(await readFile(downloadPath!, 'utf8')).toBe(expectedExport.calendarText);

  await expect(review.getByRole('article')).toHaveCount(1);
  await expect(review.getByRole('textbox', { name: 'Title' })).toHaveValue('Retained partial candidate');
  await expect(review.getByRole('textbox', { name: 'Location' })).toHaveValue('Keep room');
  await expect(review.getByRole('checkbox', { name: 'Select Retained partial candidate' })).not.toBeChecked();

  await page.reload();
  await page.waitForLoadState('networkidle');

  review = page.getByRole('region', { name: 'Scanner review drafts' });
  const exportButton = review.getByRole('button', { name: 'Export selected review drafts' });
  const restoredSelection = review.getByRole('checkbox', { name: 'Select Retained partial candidate' });
  await expect(review.getByRole('article')).toHaveCount(1);
  await expect(review.getByRole('textbox', { name: 'Title' })).toHaveValue('Retained partial candidate');
  await expect(review.getByRole('textbox', { name: 'Location' })).toHaveValue('Keep room');
  await restoredSelection.check();
  await expect(restoredSelection).toBeChecked();
  await expect(review.getByRole('region', { name: 'Export blockers for candidate-partial-retained-1' })).toContainText(
    'temporal · missing_start: The event start is missing.',
  );
  await expect(exportButton).toBeDisabled();

  const storedAfterReload = await page.evaluate(() => {
    const serialized = localStorage.getItem('event-every:review-drafts:v1');
    if (serialized === null) throw new Error('Reload did not retain the unselected Scanner draft');
    return JSON.parse(serialized) as StoredReviewRecord[];
  });
  expect(storedAfterReload).toHaveLength(1);
  expect(storedAfterReload[0]).toEqual(storedBeforeExport[1]);
  expect(storedAfterReload[0]).not.toHaveProperty('readiness');
});

test('missing Scanner title stays visible as a warning and exports calendar bytes without SUMMARY', async ({ page }) => {
  await mockScanAPI(page, await missingTitleScanResponse());
  await setupLocal(page);

  await submitText(page, 'Planning lunch at noon');

  const review = page.getByRole('region', { name: 'Scanner review drafts' });
  await expect(review.getByLabel('Title is missing')).toBeVisible();
  await expect(review.getByRole('region', { name: 'Export warnings for candidate-missing-title-1' })).toContainText('title · field_not_found');
  await expect(review.getByRole('button', { name: 'Export selected review drafts' })).toBeEnabled();

  const downloadPromise = page.waitForEvent('download');
  await review.getByRole('button', { name: 'Export selected review drafts' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const calendarText = await readFile(downloadPath!, 'utf8');
  expect(calendarText).not.toMatch(/(?:^|\r\n)SUMMARY(?:;[^:\r\n]*)?:/);
  expect(calendarText).toContain('DTSTART:20260804T120000');
});

test('missing Scanner start blocks export until a complete temporal edit supplies it', async ({ page }) => {
  await mockScanAPI(page, await missingStartScanResponse());
  await setupLocal(page);

  await submitText(page, 'Planning meeting with no start time');

  const review = page.getByRole('region', { name: 'Scanner review drafts' });
  const exportButton = review.getByRole('button', { name: 'Export selected review drafts' });
  await expect(review.getByRole('region', { name: 'Export blockers for candidate-missing-start-1' })).toContainText('temporal · missing_start: The event start is missing.');
  await expect(exportButton).toBeDisabled();

  const startDate = review.getByRole('textbox', { name: 'Start date' });
  const startTime = review.getByRole('textbox', { name: 'Start time' });
  await page.evaluate(() => {
    const dateInput = document.querySelector<HTMLInputElement>('input[aria-label="Start date"]');
    const timeInput = document.querySelector<HTMLInputElement>('input[aria-label="Start time"]');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!dateInput || !timeInput || !setValue) throw new Error('Missing Scanner temporal inputs');
    setValue.call(dateInput, '2026-08-06');
    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
    setValue.call(timeInput, '09:15');
    timeInput.dispatchEvent(new Event('input', { bubbles: true }));
    timeInput.focus();
    timeInput.blur();
  });

  await expect(startDate).toHaveValue('2026-08-06');
  await expect(startTime).toHaveValue('09:15');
  await expect(review.getByRole('region', { name: 'Export blockers for candidate-missing-start-1' })).toHaveCount(0);
  await expect(exportButton).toBeEnabled();

  const readStoredDraft = () => page.evaluate(() => {
    const serialized = localStorage.getItem('event-every:review-drafts:v1');
    return serialized === null ? null : JSON.parse(serialized)[0];
  });
  await expect.poll(readStoredDraft).not.toBeNull();
  const storedDraft = await readStoredDraft();
  expect(storedDraft!.candidate.temporal).toEqual({
    value: {
      start: {
        kind: 'floating',
        date: { year: 2026, month: 8, day: 6 },
        time: { hour: 9, minute: 15, second: 0 },
      },
      end: null,
      duration: 'PT1H',
      allDay: false,
    },
    confidence: null,
    evidence: [],
  });
  expect(storedDraft!.candidate.title).toEqual(claim('Planning meeting'));
  expect(storedDraft!.candidate.description).toEqual(claim('Discuss launch details'));
  expect(storedDraft!.candidate.location).toEqual(claim('Room 4'));
  expect(storedDraft!.candidate.url).toEqual(claim('https://example.com/meeting'));
  expect(storedDraft!.candidate.recurrence).toEqual(claim(null));

  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const calendarText = await readFile(downloadPath!, 'utf8');
  expect(calendarText).toContain('DTSTART:20260806T091500');
});

test('evidence-free DST-fold edit stays blocked until clearing timezone makes it a floating warning', async ({ page }) => {
  await mockScanAPI(page, await textScanResponse(
    'DST fold review candidate',
    'candidate-dst-fold-1',
    'source-dst-fold-1',
  ));
  await setupLocal(page);

  await submitText(page, 'Edit this candidate into the autumn DST fold.');

  const review = page.getByRole('region', { name: 'Scanner review drafts' });
  const exportButton = review.getByRole('button', { name: 'Export selected review drafts' });
  const startDate = review.getByRole('textbox', { name: 'Start date' });
  const startTime = review.getByRole('textbox', { name: 'Start time' });
  const timezone = review.getByRole('textbox', { name: 'Timezone' });

  await startDate.fill('2026-11-01');
  await startTime.fill('01:30');
  await timezone.fill('America/New_York');
  await timezone.press('Tab');

  const readStoredDraft = () => page.evaluate(() => {
    const serialized = localStorage.getItem('event-every:review-drafts:v1');
    return serialized === null ? null : JSON.parse(serialized)[0];
  });
  await expect.poll(readStoredDraft).not.toBeNull();
  await expect.poll(async () => (await readStoredDraft())?.candidate.temporal.value?.start).toMatchObject({
    kind: 'zoned',
    date: { year: 2026, month: 11, day: 1 },
    time: { hour: 1, minute: 30, second: 0 },
    timeZone: 'America/New_York',
    resolution: 'fold',
    sourceOffset: null,
    chosenOffset: null,
  });
  const foldedDraft = await readStoredDraft();
  expect(foldedDraft!.candidate.temporal.evidence).toEqual([]);
  expect(foldedDraft!.candidate.temporal.value.start.possibleOffsets).toHaveLength(2);
  await expect(review.getByRole('region', { name: 'Export blockers for candidate-dst-fold-1' })).toContainText(
    'temporal · dst_fold: This local time occurs twice and requires an explicit offset.',
  );
  await expect(exportButton).toBeDisabled();

  await timezone.fill('');
  await timezone.press('Tab');

  await expect.poll(async () => (await readStoredDraft())?.candidate.temporal.value?.start).toEqual({
    kind: 'floating',
    date: { year: 2026, month: 11, day: 1 },
    time: { hour: 1, minute: 30, second: 0 },
  });
  const floatingDraft = await readStoredDraft();
  expect(floatingDraft!.candidate.temporal.evidence).toEqual([]);
  await expect(review.getByRole('region', { name: 'Export blockers for candidate-dst-fold-1' })).toHaveCount(0);
  await expect(review.getByRole('region', { name: 'Export warnings for candidate-dst-fold-1' })).toContainText(
    "temporal · floating_time: This floating time will use the importing calendar's local timezone.",
  );
  await expect(exportButton).toBeEnabled();

  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const calendarText = await readFile(downloadPath!, 'utf8');
  expect(calendarText).toContain('DTSTART:20261101T013000');
  expect(calendarText).not.toContain('TZID=America/New_York');
});

test('narrow viewport keeps every Scanner review control keyboard reachable with stable accessible names', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mockScanAPI(page, await narrowAccessibilityScanResponse());
  await setupLocal(page);

  await submitText(page, 'Show every Scanner review control at a narrow viewport.');

  const review = page.getByRole('region', { name: 'Scanner review drafts' });
  const exportButton = review.getByRole('button', { name: 'Export selected review drafts', exact: true });
  const selectionName = /^Select Narrow accessibility candidate \([0-9a-f-]{36}\)$/;
  const dismissName = /^Dismiss Narrow accessibility candidate \([0-9a-f-]{36}\)$/;
  const selection = review.getByRole('checkbox', {
    name: selectionName,
  });
  const dismiss = review.getByRole('button', {
    name: dismissName,
  });
  const editableFields = [
    review.getByRole('textbox', { name: 'Title', exact: true }),
    review.getByRole('textbox', { name: 'Description', exact: true }),
    review.getByRole('textbox', { name: 'Location', exact: true }),
    review.getByRole('textbox', { name: 'URL', exact: true }),
    review.getByRole('textbox', { name: 'Start date', exact: true }),
    review.getByRole('textbox', { name: 'Start time', exact: true }),
    review.getByRole('textbox', { name: 'End date', exact: true }),
    review.getByRole('textbox', { name: 'End time', exact: true }),
    review.getByRole('textbox', { name: 'Timezone', exact: true }),
    review.getByRole('combobox', { name: 'All day', exact: true }),
    review.getByRole('textbox', { name: 'Recurrence', exact: true }),
  ];

  await expect(exportButton).toBeEnabled();
  await expect(selection).toHaveAccessibleName(selectionName);
  await expect(dismiss).toHaveAccessibleName(dismissName);
  for (const control of [selection, dismiss, ...editableFields]) {
    await expect(control).toBeEnabled();
  }

  for (const name of [
    'Scan issues for candidate-narrow-accessibility-1',
    'Candidate issues for candidate-narrow-accessibility-1',
    'Export warnings for candidate-narrow-accessibility-1',
  ]) {
    const issueRegion = review.getByRole('region', { name, exact: true });
    await issueRegion.scrollIntoViewIfNeeded();
    await expect(issueRegion).toBeInViewport();
  }

  // Start at the export control and traverse forward through every remaining control. This
  // exercises the DOM keyboard order directly. WebKit models macOS Safari, where Option+Tab is
  // the platform shortcut for including buttons and checkboxes in keyboard navigation.
  await exportButton.focus();
  await expect(exportButton).toBeFocused();
  const forwardKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  for (const control of [selection, dismiss, ...editableFields]) {
    await page.keyboard.press(forwardKey);
    await expect(control).toBeFocused();
    await expect(control).toBeInViewport();
  }
});

test('reload restores raw-free Scanner drafts with recomputed readiness', async ({ page }) => {
  await mockScanAPI(page, await missingStartScanResponse());
  await mockAuth(page);
  await mockURLDetection(page);
  await mockSummarize(page);
  await page.goto('/');
  await page.waitForSelector('[data-testid="smart-input-textarea"]', { state: 'visible', timeout: 20000 });
  const legacyStorage = JSON.stringify([{ id: 'legacy-event-storage-1' }]);
  await page.evaluate((value) => localStorage.setItem('event_every_history', value), legacyStorage);

  const rawSubmission = 'Private raw reload source that must not enter review storage.';
  await submitText(page, rawSubmission);

  let review = page.getByRole('region', { name: 'Scanner review drafts' });
  let exportButton = review.getByRole('button', { name: 'Export selected review drafts' });
  await expect(review.getByRole('textbox', { name: 'Title' })).toHaveValue('Planning meeting');
  await expect(review.getByRole('region', { name: 'Export blockers for candidate-missing-start-1' })).toContainText(
    'temporal · missing_start: The event start is missing.',
  );
  await expect(exportButton).toBeDisabled();

  const readStoredDraft = () => page.evaluate(() => {
    const serialized = localStorage.getItem('event-every:review-drafts:v1');
    return serialized === null ? null : {
      serialized,
      record: JSON.parse(serialized)[0] as Record<string, unknown>,
    };
  });
  await expect.poll(readStoredDraft).not.toBeNull();
  const storedBeforeReload = await readStoredDraft();
  expect(Object.keys(storedBeforeReload!.record).sort()).toEqual([
    'candidate',
    'createdAt',
    'exportUid',
    'id',
    'scanIssues',
    'source',
    'version',
  ]);
  expect(storedBeforeReload!.record).not.toHaveProperty('readiness');
  expect(storedBeforeReload!.serialized).not.toContain(rawSubmission);

  await page.reload();
  await page.waitForLoadState('networkidle');

  review = page.getByRole('region', { name: 'Scanner review drafts' });
  exportButton = review.getByRole('button', { name: 'Export selected review drafts' });
  await expect(review.getByRole('textbox', { name: 'Title' })).toHaveValue('Planning meeting');
  await expect(review.getByRole('region', { name: 'Export blockers for candidate-missing-start-1' })).toContainText(
    'temporal · missing_start: The event start is missing.',
  );
  await expect(exportButton).toBeDisabled();

  const storedAfterReload = await readStoredDraft();
  expect(storedAfterReload).toEqual(storedBeforeReload);
  expect(await page.evaluate(() => localStorage.getItem('event_every_history'))).toBe(legacyStorage);
});

test('edited claims clear only their evidence and export fresh Scanner calendar bytes', async ({ page }) => {
  await mockScanAPI(page, await textScanResponse());
  await setupLocal(page);

  const submittedSource = 'Raw submission that must never be stored as a scan request.';
  await submitText(page, submittedSource);

  const review = page.getByRole('region', { name: 'Scanner review drafts' });
  const title = review.getByRole('textbox', { name: 'Title' });
  const startTime = review.getByRole('textbox', { name: 'Start time' });
  const location = review.getByRole('textbox', { name: 'Location' });
  const exportButton = review.getByRole('button', { name: 'Export selected review drafts' });

  // This reaches generateIcs and then fails inside createBrowserDownloadEffects before
  // handleReviewDraftExport can remove the draft. A later edit must therefore cause a
  // fresh generation instead of reusing this pre-edit calendar.
  const downloadFailureMessage = 'E1 test download interruption';
  let downloadFailure: string | null = null;
  const captureDownloadFailure = (error: Error) => {
    if (error.message === downloadFailureMessage) downloadFailure = error.message;
  };
  page.on('pageerror', captureDownloadFailure);
  await page.evaluate(() => {
    const testWindow = window as typeof window & { __e1OriginalAnchorClick?: typeof HTMLAnchorElement.prototype.click };
    testWindow.__e1OriginalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = () => { throw new Error('E1 test download interruption'); };
  });
  try {
    await exportButton.click();
    await expect.poll(() => downloadFailure).toBe(downloadFailureMessage);
    await expect(review).toBeVisible();
    await expect(exportButton).toBeEnabled();
  } finally {
    await page.evaluate(() => {
      const testWindow = window as typeof window & { __e1OriginalAnchorClick?: typeof HTMLAnchorElement.prototype.click };
      if (!testWindow.__e1OriginalAnchorClick) throw new Error('Missing original anchor click');
      HTMLAnchorElement.prototype.click = testWindow.__e1OriginalAnchorClick;
      delete testWindow.__e1OriginalAnchorClick;
    });
    page.off('pageerror', captureDownloadFailure);
  }

  await title.fill('Edited team lunch');
  await title.press('Tab');
  await startTime.fill('14:30');
  await startTime.press('Tab');
  await location.fill('Edited Cafe');
  await location.press('Tab');

  await expect(title).toHaveValue('Edited team lunch');
  await expect(startTime).toHaveValue('14:30');
  await expect(location).toHaveValue('Edited Cafe');

  const readStoredDraft = () => page.evaluate(() => {
    const serialized = localStorage.getItem('event-every:review-drafts:v1');
    return serialized === null ? null : JSON.parse(serialized)[0];
  });
  await expect.poll(readStoredDraft).not.toBeNull();
  const storedDraft = await readStoredDraft();

  expect(storedDraft!.candidate.title).toEqual({
    value: 'Edited team lunch',
    confidence: null,
    evidence: [],
  });
  expect(storedDraft!.candidate.location).toEqual({
    value: 'Edited Cafe',
    confidence: null,
    evidence: [],
  });
  expect(storedDraft!.candidate.temporal).toEqual({
    value: {
      start: {
        kind: 'floating',
        date: { year: 2026, month: 8, day: 4 },
        time: { hour: 14, minute: 30, second: 0 },
      },
      end: null,
      duration: 'PT1H',
      allDay: false,
    },
    confidence: null,
    evidence: [],
  });
  expect(storedDraft!.candidate.description).toEqual(claim(null));
  expect(JSON.stringify(storedDraft)).not.toContain(submittedSource);
  expect(JSON.stringify(storedDraft)).not.toContain('data:image/');

  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const calendarText = await readFile(downloadPath!, 'utf8');
  expect(calendarText).toContain('SUMMARY:Edited team lunch');
  expect(calendarText).toContain('LOCATION:Edited Cafe');
  expect(calendarText).toContain('DTSTART:20260804T143000');
  expect(calendarText).not.toContain('SUMMARY:Team lunch');
  expect(calendarText).not.toContain('LOCATION:Cafe Example');
  expect(calendarText).not.toContain('DTSTART:20260804T120000');
});

test('canceling a delayed first scan leaves the succeeding second scan as the only review draft', async ({ page }) => {
  const canceledFirstResponse = await textScanResponse(
    'Canceled first scan',
    'candidate-canceled-first',
    'source-canceled-first',
  );
  const successfulSecondResponse = await textScanResponse(
    'Successful second scan',
    'candidate-successful-second',
    'source-successful-second',
  );
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
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(canceledFirstResponse),
        });
      } catch {
        // The production cancellation guard aborts this delayed request.
      } finally {
        resolveFirstResponseSettled();
      }
      return;
    }

    if (requestCount === 2) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(successfulSecondResponse),
      });
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
  const review = page.getByRole('region', { name: 'Scanner review drafts' });
  await expect(review.getByRole('textbox', { name: 'Title' })).toHaveValue('Successful second scan');
  releaseFirstResponse();
  await firstResponseSettled;
  await page.waitForLoadState('networkidle');

  // This is the stale-result guard: once the delayed canceled request finishes, it may
  // not append a second draft after the successful replacement submission.
  await expect(review.getByRole('textbox', { name: 'Title' })).toHaveCount(1);
  await expect.poll(async () => page.evaluate(() => {
    const serialized = localStorage.getItem('event-every:review-drafts:v1');
    return serialized === null
      ? []
      : JSON.parse(serialized).map((draft: { candidate: { title: { value: string | null } } }) => draft.candidate.title.value);
  })).toEqual(['Successful second scan']);
});

test('malformed successful scan response creates no draft and reports a processing error', async ({ page }) => {
  await mockRawScanAPI(page, {
    ...(await textScanResponse()),
    unexpectedTopLevel: true,
  });
  await setupLocal(page);

  await submitText(page, 'Planning lunch at noon');

  const error = page.getByTestId('error-notification');
  await expect(error).toBeVisible();
  await expect(error).toContainText('Error processing text');
  await expect(page.getByRole('region', { name: 'Scanner review drafts' })).toHaveCount(0);
});

const ALL_DAY_SOURCE_ID = 'all-day-source-1';
const ALL_DAY_TEXT = 'Scanner all-day provider fixture: Company offsite March 20.';

async function allDayScanResponse(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await loadScannerModule();
  return {
    source: {
      sourceId: ALL_DAY_SOURCE_ID,
      kind: 'text',
      contentHandle: 'opaque-all-day-1',
    },
    candidates: [EventCandidateSchema.parse({
      candidateId: 'all-day-provider-1',
      sourceUid: null,
      title: claim('Company offsite', ALL_DAY_SOURCE_ID, ALL_DAY_TEXT),
      description: claim(null, ALL_DAY_SOURCE_ID, ALL_DAY_TEXT),
      location: claim('Napa Valley', ALL_DAY_SOURCE_ID, ALL_DAY_TEXT),
      url: claim(null, ALL_DAY_SOURCE_ID, ALL_DAY_TEXT),
      temporal: claim({
        start: { kind: 'date', year: 2026, month: 3, day: 20 },
        end: null,
        duration: null,
        allDay: true,
      }, ALL_DAY_SOURCE_ID, ALL_DAY_TEXT),
      recurrence: claim(null, ALL_DAY_SOURCE_ID, ALL_DAY_TEXT),
      issues: [],
    })],
    issues: [],
  };
}

async function proveAllDayReviewEdit(page: import('@playwright/test').Page) {
  let requestCount = 0;
  await page.route('**/api/scan', async (route: Route) => {
    requestCount += 1;
    if (requestCount !== 1) throw new Error(`Unexpected scan request ${requestCount}`);
    expect(ScanRequestSchema.parse(route.request().postDataJSON())).toEqual({
      kind: 'text',
      text: ALL_DAY_TEXT,
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(await allDayScanResponse()),
    });
  });
  await setupLocal(page);
  await submitText(page, ALL_DAY_TEXT);

  const review = page.getByRole('region', { name: 'Scanner review drafts' });
  const startDate = review.getByRole('textbox', { name: 'Start date' });
  const allDay = review.getByRole('combobox', { name: 'All day' });
  await expect(review.getByRole('textbox', { name: 'Title' })).toHaveValue('Company offsite');
  await expect(review.getByRole('textbox', { name: 'Location' })).toHaveValue('Napa Valley');
  await expect(startDate).toHaveValue('2026-03-20');
  await expect(allDay).toHaveValue('true');
  await expect(review.getByRole('textbox', { name: 'Start time' })).toHaveCount(0);
  await expect(review.getByRole('textbox', { name: 'Timezone' })).toHaveValue('');
  expect(requestCount).toBe(1);

  await startDate.fill('2026-03-21');
  await startDate.blur();
  await expect(allDay).toHaveValue('true');
  await expect(review.getByRole('textbox', { name: 'Start time' })).toHaveCount(0);
  const readStoredTemporal = () => page.evaluate(() => {
    const serialized = localStorage.getItem('event-every:review-drafts:v1');
    return serialized === null ? null : JSON.parse(serialized)[0].candidate.temporal.value;
  });
  await expect.poll(readStoredTemporal).toEqual({
    start: { kind: 'date', year: 2026, month: 3, day: 21 },
    end: null,
    duration: null,
    allDay: true,
  });
  const downloadPromise = page.waitForEvent('download');
  await review.getByRole('button', { name: 'Export selected review drafts' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const calendarText = await readFile(downloadPath!, 'utf8');
  const dtstartLines = calendarText.split(/\r?\n/).filter((line) => line.startsWith('DTSTART'));
  expect(dtstartLines).toEqual(['DTSTART;VALUE=DATE:20260321']);
  const dtstartValue = dtstartLines[0].slice(dtstartLines[0].indexOf(':') + 1);
  expect(dtstartValue).toMatch(/^\d{8}$/);
  expect(dtstartValue).not.toContain('T');
  expect(dtstartValue).not.toContain('Z');
  expect(calendarText).not.toContain('TZID=');
  expect((calendarText.match(/BEGIN:VEVENT/g) ?? [])).toHaveLength(1);
  expect(requestCount).toBe(1);
}

test.describe('Scanner all-day provider date — Asia/Tokyo viewer', () => {
  test.use({ timezoneId: 'Asia/Tokyo', locale: 'en-US' });

  test('preserves the calendar date through review editing and DATE export', async ({ page }) => {
    await proveAllDayReviewEdit(page);
  });
});

test.describe('Scanner all-day provider date — America/Los_Angeles viewer', () => {
  test.use({ timezoneId: 'America/Los_Angeles', locale: 'en-US' });

  test('preserves the calendar date through review editing and DATE export', async ({ page }) => {
    await proveAllDayReviewEdit(page);
  });
});
