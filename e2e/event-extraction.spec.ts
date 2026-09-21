import { expect, test } from '@playwright/test';
import type { ScanResponse } from '../src/types/scannerHttp';
import { ScanRequestSchema } from '../src/types/scanRequest';
import { collapseCards, eventCards, mockRawScanAPI, mockScanAPI, scanButton, setupLocal, submitText, waitForCards } from './helpers';

type ScannerModule = typeof import('@event-every/scanner');

// Playwright transforms test modules to CommonJS, so a normal dynamic import becomes require().
const importScannerModule = new Function(
  'return import("@event-every/scanner")',
) as () => Promise<ScannerModule>;

function loadScannerModule(): Promise<ScannerModule> {
  return importScannerModule();
}

const MULTIPLE_CANDIDATES_EXCERPT =
  'Monday 9am standup, Tuesday 2pm design review, Wednesday 11am retro';

const scannerClaim = <Value,>(
  value: Value,
  sourceId: string,
  excerpt: string,
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

async function multipleCandidatesScanResponse(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await loadScannerModule();
  const sourceId = 'source-m20-multiple-candidates';
  const candidate = (
    candidateId: string,
    title: string,
    location: string,
    day: number,
    hour: number,
  ) => EventCandidateSchema.parse({
    candidateId,
    sourceUid: null,
    title: scannerClaim(title, sourceId, MULTIPLE_CANDIDATES_EXCERPT),
    description: scannerClaim(null, sourceId, MULTIPLE_CANDIDATES_EXCERPT),
    location: scannerClaim(location, sourceId, MULTIPLE_CANDIDATES_EXCERPT),
    url: scannerClaim(null, sourceId, MULTIPLE_CANDIDATES_EXCERPT),
    temporal: scannerClaim({
      start: {
        kind: 'floating',
        date: { year: 2026, month: 3, day },
        time: { hour, minute: 0, second: 0 },
      },
      end: null,
      duration: 'PT30M',
      allDay: false,
    }, sourceId, MULTIPLE_CANDIDATES_EXCERPT),
    recurrence: scannerClaim(null, sourceId, MULTIPLE_CANDIDATES_EXCERPT),
    issues: [],
  });

  return {
    source: {
      sourceId,
      kind: 'text',
      contentHandle: 'opaque-m20-multiple-candidates',
    },
    candidates: [
      candidate('candidate-m20-standup', 'Standup', 'Daily room', 9, 9),
      candidate('candidate-m20-design-review', 'Design Review', 'Design room', 10, 14),
      candidate('candidate-m20-retro', 'Retro', 'Retrospective room', 11, 11),
    ],
    issues: [],
  };
}

async function quickEventScanResponse(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await loadScannerModule();
  const sourceId = 'source-cmd-enter';
  const excerpt = 'Quick Event May 1 at 10am';
  return {
    source: {
      sourceId,
      kind: 'text',
      contentHandle: 'opaque-cmd-enter',
    },
    candidates: [EventCandidateSchema.parse({
      candidateId: 'candidate-cmd-enter',
      sourceUid: null,
      title: scannerClaim('Quick Event', sourceId, excerpt),
      description: scannerClaim(null, sourceId, excerpt),
      location: scannerClaim(null, sourceId, excerpt),
      url: scannerClaim(null, sourceId, excerpt),
      temporal: scannerClaim({
        start: {
          kind: 'floating',
          date: { year: 2026, month: 5, day: 1 },
          time: { hour: 10, minute: 0, second: 0 },
        },
        end: null,
        duration: 'PT1H',
        allDay: false,
      }, sourceId, excerpt),
      recurrence: scannerClaim(null, sourceId, excerpt),
      issues: [],
    })],
    issues: [],
  };
}

test.describe('Event Extraction Scenarios', () => {
  test('Scenario 4: one strict Scanner response becomes one selectable card per candidate, in order', async ({ page }) => {
    await mockScanAPI(page, await multipleCandidatesScanResponse());
    await setupLocal(page);
    let scanRequestCount = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/scan') scanRequestCount += 1;
    });

    await submitText(page, MULTIPLE_CANDIDATES_EXCERPT);

    await waitForCards(page, 3);
    // The one-line "when" summary belongs to the shut card.
    await collapseCards(page);
    const cards = eventCards(page);
    const expectedCandidates = [
      { title: 'Standup', location: 'Daily room', when: 'Mar 9 at 9:00 AM' },
      { title: 'Design Review', location: 'Design room', when: 'Mar 10 at 2:00 PM' },
      { title: 'Retro', location: 'Retrospective room', when: 'Mar 11 at 11:00 AM' },
    ];
    for (const [index, expectedCandidate] of expectedCandidates.entries()) {
      const card = cards.nth(index);
      await expect(card.getByTestId('event-card-title')).toHaveText(expectedCandidate.title);
      await expect(card.getByRole('checkbox', { name: `Select ${expectedCandidate.title}` })).toBeChecked();
      await expect(card).toContainText(expectedCandidate.when);
      await expect(card).toContainText(expectedCandidate.location);
    }
    expect(scanRequestCount).toBe(1);
    await expect(page.getByTestId('save-events-button')).toHaveText('Save (3)');

    await cards.nth(0).getByRole('checkbox', { name: 'Select Standup' }).uncheck();
    await expect(cards.nth(0).getByRole('checkbox', { name: 'Select Standup' })).not.toBeChecked();
    await expect(cards.nth(1).getByRole('checkbox', { name: 'Select Design Review' })).toBeChecked();
    await expect(cards.nth(2).getByRole('checkbox', { name: 'Select Retro' })).toBeChecked();
    await expect(page.getByTestId('save-events-button')).toHaveText('Save (2)');
  });

  test('Scenario 5: zero Scanner candidates leave no cards and say so once', async ({ page }) => {
    const requestText = 'The weather is nice today';
    const emptyResponse: ScanResponse = {
      source: {
        sourceId: 'source-valid-zero',
        kind: 'text',
        contentHandle: 'opaque-valid-zero',
      },
      candidates: [],
      issues: [],
    };
    let scanRequestCount = 0;
    await page.route('**/api/scan', async (route) => {
      scanRequestCount += 1;
      expect(ScanRequestSchema.parse(route.request().postDataJSON())).toEqual({
        kind: 'text',
        text: requestText,
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptyResponse),
      });
    });
    await setupLocal(page);
    const response = page.waitForResponse((candidate) => (
      new URL(candidate.url()).pathname === '/api/scan'
    ));

    await submitText(page, requestText);
    await response;

    await expect(page.getByTestId('cancel-job-button')).toHaveCount(0);
    await expect(eventCards(page)).toHaveCount(0);
    // Finding nothing is said, not swallowed (task 205): one notice, no cards.
    const notice = page.getByTestId('error-notification');
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText('No event found in that.');
    expect(scanRequestCount).toBe(1);
  });
});

test.describe('UI Interaction Tests', () => {
  test('Submit button is disabled with empty input', async ({ page }) => {
    await setupLocal(page);
    await expect(scanButton(page)).toBeDisabled();
  });

  test('Submit button enables with 3+ chars', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/_next/static/**/*.js', async route => {
      await new Promise(resolve => setTimeout(resolve, 750));
      await route.continue();
    });
    await setupLocal(page);
    await page.getByTestId('smart-input-textarea').fill('abc');
    await expect(scanButton(page)).toBeEnabled();
    expect(pageErrors).toEqual([]);
  });

  test('Error notification can be dismissed', async ({ page }) => {
    await mockRawScanAPI(page, {
      source: {
        sourceId: 'source-malformed-dismissal',
        kind: 'text',
        contentHandle: 'opaque-malformed-dismissal',
      },
      candidates: [{ candidateId: 'malformed-success' }],
      issues: [],
    });
    await setupLocal(page);

    await submitText(page, 'Some text input here');

    const dismissButton = page.locator('button[aria-label="Dismiss error"]');
    await expect(dismissButton.first()).toBeVisible({ timeout: 15000 });
    const errorNotification = page.getByTestId('error-notification');
    await expect(errorNotification.first()).toBeVisible();
    await dismissButton.first().click();
    await expect(errorNotification).toHaveCount(0, { timeout: 5000 });
  });

  test('Cmd+Enter submits from textarea', async ({ page }) => {
    await mockScanAPI(page, await quickEventScanResponse());
    await setupLocal(page);

    const textarea = page.getByTestId('smart-input-textarea');
    await textarea.fill('Quick Event May 1 at 10am');
    await textarea.press('Meta+Enter');

    await waitForCards(page, 1);
    await expect(page.getByTestId('event-card').getByTestId('event-card-title')).toHaveText('Quick Event');
    expect(await page.evaluate(() => localStorage.getItem('event-every:last-scan-source'))).toBeNull();
  });
});
