import { expect, test } from '@playwright/test';
import type { ScanResponse } from '../src/types/scannerHttp';
import {
  mockAuth,
  mockScanAPI,
  mockSummarize,
  mockTriage,
  mockURLDetection,
  setupLocal,
  scanButton,
  waitForCards,
  waitForSmartInputReady,
  TINY_PNG_BASE64,
} from './helpers';

type ScannerModule = typeof import('@event-every/scanner');

// Playwright transforms test modules to CommonJS, so a normal dynamic import becomes require().
const importScannerModule = new Function(
  'return import("@event-every/scanner")',
) as () => Promise<ScannerModule>;

async function oneCandidate(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await importScannerModule();
  const claim = <Value>(value: Value) => ({ value, confidence: 0.9, evidence: [] });
  return {
    source: { sourceId: 'source-attach-1', kind: 'image', contentHandle: 'opaque-attach-1' },
    candidates: [
      EventCandidateSchema.parse({
        candidateId: 'candidate-attach-a',
        sourceUid: null,
        title: claim('Civic Signal'),
        description: claim(null),
        location: claim(null),
        url: claim(null),
        temporal: claim({
          start: { kind: 'floating', date: { year: 2026, month: 9, day: 22 }, time: { hour: 19, minute: 0, second: 0 } },
          end: null,
          duration: null,
          allDay: false,
        }),
        recurrence: claim(null),
        issues: [],
      }),
    ],
    issues: [],
  };
}

// setupLocal clears localStorage on every navigation, which a reload would
// undo the scan with; the reload case wires the same mocks without that.
async function setupSurvivingReload(page: import('@playwright/test').Page) {
  await mockAuth(page);
  await mockTriage(page);
  await mockURLDetection(page);
  await mockSummarize(page);
  await page.goto('/');
  await waitForSmartInputReady(page);
}

async function scanAnImage(page: import('@playwright/test').Page, name: string) {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
  });
  await expect(page.locator('img[alt="Uploaded 1"]')).toBeVisible();
  await scanButton(page).click();
}

test.describe('Review panel attachments', () => {
  test('shows the scanned image under the cards, and it survives a reload', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupSurvivingReload(page);
    await scanAnImage(page, 'meeting-invite.png');

    await waitForCards(page, 1);

    const attachments = page.getByTestId('unsaved-attachments');
    await expect(attachments).toBeVisible();
    await expect(attachments.getByText('ATTACHMENTS')).toBeVisible();
    await expect(attachments.locator('img[alt="Attachment 1"]')).toBeVisible();
    await expect(attachments.getByText('1 image')).toBeVisible();

    // The bytes live in the IndexedDB input history, so the panel can rebuild
    // the row after a reload rather than losing it with page state.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForCards(page, 1);
    await expect(page.getByTestId('unsaved-attachments').locator('img[alt="Attachment 1"]')).toBeVisible();
  });

  test('opens the full image in the lightbox', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);
    await scanAnImage(page, 'meeting-invite.png');
    await waitForCards(page, 1);

    await page.getByTestId('unsaved-attachments').getByRole('button', { name: /View attachment 1/ }).click();
    await expect(page.getByText('meeting-invite.png')).toBeVisible();
  });

  test('a second scan adds its file rather than replacing the first', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);

    await scanAnImage(page, 'first.png');
    await waitForCards(page, 1);
    await expect(page.getByTestId('unsaved-attachments').locator('img[alt="Attachment 1"]')).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'second.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });
    await scanButton(page).click();

    await expect(page.getByTestId('unsaved-attachments').locator('img[alt="Attachment 2"]')).toBeVisible();
  });

  test('discarding the batch takes the attachments with it', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);
    await scanAnImage(page, 'meeting-invite.png');
    await waitForCards(page, 1);

    await page.getByRole('button', { name: 'Unselect all' }).click();
    await page.getByTestId('save-events-button').click();

    await expect(page.getByTestId('unsaved-attachments')).toHaveCount(0);
  });
});
