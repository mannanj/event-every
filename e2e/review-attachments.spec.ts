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
        url: claim('https://meet.google.com/odi-xddv-kez'),
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

async function expandFirstCard(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Expand' }).first().click();
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

    // The row lives in the expanded card body, under the fields.
    await expect(page.getByTestId('unsaved-attachments')).toHaveCount(0);
    await expandFirstCard(page);

    const attachments = page.getByTestId('unsaved-attachments');
    await expect(attachments).toBeVisible();
    await expect(attachments.locator('img[alt="Attachment 1"]')).toBeVisible();
    // No header, and no count badge at this size.
    await expect(attachments.getByText('ATTACHMENTS')).toHaveCount(0);

    // The bytes live in the IndexedDB input history, so the panel can rebuild
    // the row after a reload rather than losing it with page state.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForCards(page, 1);
    await expandFirstCard(page);
    await expect(page.getByTestId('unsaved-attachments').locator('img[alt="Attachment 1"]')).toBeVisible();
  });

  test('sits twice the field gap below the last field, left-aligned with the labels', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);
    await scanAnImage(page, 'meeting-invite.png');
    await waitForCards(page, 1);
    await expandFirstCard(page);

    const attachments = page.getByTestId('unsaved-attachments');
    await expect(attachments).toBeVisible();

    // Every field row is a sibling under the same space-y rule, so the gap the
    // user sees is that rule's margin-top. The attachments row must carry twice it.
    const gaps = await attachments.evaluate((node) => {
      const row = node as HTMLElement;
      const siblings = Array.from(row.parentElement!.children);
      const fieldRow = siblings[siblings.indexOf(row) - 1];
      const px = (el: Element) => parseFloat(getComputedStyle(el).marginTop);
      return { field: px(fieldRow), attachments: px(row) };
    });

    expect(gaps.field).toBeGreaterThan(0);
    expect(gaps.attachments).toBe(gaps.field * 2);

    // First tile starts at the same left edge as the "URL:" label.
    const [urlBox, rowBox] = await Promise.all([
      page.getByText('URL:', { exact: true }).boundingBox(),
      attachments.boundingBox(),
    ]);
    if (!urlBox || !rowBox) throw new Error('missing layout box');
    expect(Math.abs(rowBox.x - urlBox.x)).toBeLessThanOrEqual(1);
  });

  test('renders at half the smart input tile size', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);
    await scanAnImage(page, 'meeting-invite.png');
    await waitForCards(page, 1);
    await expandFirstCard(page);

    const tile = page.getByTestId('unsaved-attachments').locator('img[alt="Attachment 1"]');
    const box = await tile.boundingBox();
    if (!box) throw new Error('missing tile box');
    expect(Math.round(box.width)).toBe(60);
    expect(Math.round(box.height)).toBe(60);
  });

  test('opens the full image in the lightbox', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);
    await scanAnImage(page, 'meeting-invite.png');
    await waitForCards(page, 1);
    await expandFirstCard(page);

    await page.getByTestId('unsaved-attachments').getByRole('button', { name: /View attachment 1/ }).click();
    await expect(page.getByText('meeting-invite.png')).toBeVisible();
  });

  test('a second scan adds its file rather than replacing the first', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);

    await scanAnImage(page, 'first.png');
    await waitForCards(page, 1);
    await expandFirstCard(page);
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
    await expandFirstCard(page);
    await expect(page.getByTestId('unsaved-attachments')).toBeVisible();

    await page.getByRole('button', { name: 'Unselect all' }).click();
    await page.getByTestId('save-events-button').click();

    await expect(page.getByTestId('unsaved-attachments')).toHaveCount(0);
  });

  test('a saved event keeps its files behind a new accordion', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);
    await scanAnImage(page, 'meeting-invite.png');
    await waitForCards(page, 1);

    const download = page.waitForEvent('download');
    await page.getByTestId('save-events-button').click();
    await download;

    // Saved cards start collapsed: no fields, no files, just the toggle.
    const toggle = page.getByTestId('saved-event-toggle').first();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('unsaved-attachments')).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const attachments = page.getByTestId('unsaved-attachments');
    await expect(attachments).toBeVisible();
    await expect(attachments.locator('img[alt="Attachment 1"]')).toBeVisible();

    await toggle.click();
    await expect(page.getByTestId('unsaved-attachments')).toHaveCount(0);
  });

  test('the saved card keeps the bin to the left of the accordion', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);
    await scanAnImage(page, 'meeting-invite.png');
    await waitForCards(page, 1);

    const download = page.waitForEvent('download');
    await page.getByTestId('save-events-button').click();
    await download;

    const [bin, chevron] = await Promise.all([
      page.getByRole('button', { name: 'Delete Civic Signal' }).boundingBox(),
      page.getByTestId('saved-event-toggle').first().boundingBox(),
    ]);
    if (!bin || !chevron) throw new Error('missing control box');
    expect(bin.x).toBeLessThan(chevron.x);
  });
});
