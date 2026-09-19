import { expect, test, type Page } from '@playwright/test';
import type { ScanResponse } from '../src/types/scannerHttp';
import { mockScanAPI, mockSummarize, setupLocal, submitText, waitForCards } from './helpers';

type ScannerModule = typeof import('@event-every/scanner');

// Playwright transforms test modules to CommonJS, so a normal dynamic import becomes require().
const importScannerModule = new Function(
  'return import("@event-every/scanner")',
) as () => Promise<ScannerModule>;

async function oneCandidate(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await importScannerModule();
  const claim = <Value>(value: Value) => ({ value, confidence: 0.9, evidence: [] });
  return {
    source: { sourceId: 'source-dedup-1', kind: 'text', contentHandle: 'opaque-dedup-1' },
    candidates: [EventCandidateSchema.parse({
      candidateId: 'candidate-dedup-a',
      sourceUid: null,
      title: claim('Fun Time'),
      description: claim(null),
      location: claim(null),
      url: claim(null),
      temporal: claim({
        start: { kind: 'floating', date: { year: 2026, month: 9, day: 22 }, time: { hour: 20, minute: 0, second: 0 } },
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

const historyCards = (page: Page) => page.locator('[data-testid="input-history-card"]');

async function openHistory(page: Page): Promise<void> {
  await page.locator('[data-testid="input-history-button"]').click();
  await expect(page.locator('[data-testid="input-history-modal"]')).toBeVisible();
}

async function closeHistory(page: Page): Promise<void> {
  await page.locator('[data-testid="input-history-close"]').click();
  await expect(page.locator('[data-testid="input-history-modal"]')).toBeHidden();
}

test.describe('Recent keeps one row per input', () => {
  test('running the same input again moves its row instead of adding one', async ({ page }) => {
    await setupLocal(page);
    await mockSummarize(page);
    await mockScanAPI(page, await oneCandidate());

    await submitText(page, 'make an event for tomorrow at 8pm labeled Fun Time');
    await waitForCards(page, 1);
    await openHistory(page);
    await expect(historyCards(page)).toHaveCount(1);
    await closeHistory(page);

    await submitText(page, 'make an event for tomorrow at 8pm labeled Fun Time');
    await waitForCards(page, 2);
    await openHistory(page);
    // The repeat is the same input, so Recent still holds exactly one row for it.
    await expect(historyCards(page)).toHaveCount(1);
    await expect(historyCards(page).first()).toContainText('labeled Fun Time');
  });

  test('a repeat returns to the top, above inputs run since', async ({ page }) => {
    await setupLocal(page);
    await mockSummarize(page);
    await mockScanAPI(page, await oneCandidate());

    await submitText(page, 'first input');
    await waitForCards(page, 1);
    await submitText(page, 'second input');
    await waitForCards(page, 2);

    await openHistory(page);
    await expect(historyCards(page)).toHaveCount(2);
    await expect(historyCards(page).first()).toContainText('second input');
    await closeHistory(page);

    await submitText(page, 'first input');
    await waitForCards(page, 3);

    await openHistory(page);
    await expect(historyCards(page)).toHaveCount(2);
    await expect(historyCards(page).first()).toContainText('first input');
  });

  test('editing the input before running it makes a new row', async ({ page }) => {
    await setupLocal(page);
    await mockSummarize(page);
    await mockScanAPI(page, await oneCandidate());

    await submitText(page, 'dinner friday');
    await waitForCards(page, 1);
    await submitText(page, 'dinner friday at 8');
    await waitForCards(page, 2);

    await openHistory(page);
    await expect(historyCards(page)).toHaveCount(2);
  });
});
