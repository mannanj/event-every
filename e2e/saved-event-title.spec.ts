import { expect, test, type Page } from '@playwright/test';
import type { ScanResponse } from '../src/types/scannerHttp';
import { mockScanAPI, setupLocal, scanButton, waitForCards, TINY_PNG_BASE64 } from './helpers';

type ScannerModule = typeof import('@event-every/scanner');

// Playwright transforms test modules to CommonJS, so a normal dynamic import becomes require().
const importScannerModule = new Function(
  'return import("@event-every/scanner")',
) as () => Promise<ScannerModule>;

async function oneTitled(title: string): Promise<ScanResponse> {
  const { EventCandidateSchema } = await importScannerModule();
  const claim = <Value>(value: Value) => ({ value, confidence: 0.9, evidence: [] });
  return {
    source: { sourceId: 'source-title-1', kind: 'image', contentHandle: 'opaque-title-1' },
    candidates: [
      EventCandidateSchema.parse({
        candidateId: 'candidate-title-a',
        sourceUid: null,
        title: claim(title),
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

async function saveOneEvent(page: Page, title: string) {
  await mockScanAPI(page, await oneTitled(title));
  await setupLocal(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'flyer.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
  });
  await scanButton(page).click();
  await waitForCards(page, 1);
  const download = page.waitForEvent('download');
  await page.getByTestId('save-events-button').click();
  await download;
}

function titleAndRow(page: Page) {
  const title = page.getByTestId('saved-event-title').first();
  return {
    title,
    row: title.locator('xpath=ancestor::div[contains(@class,"flex-1")][1]'),
  };
}

test.describe('Saved event title', () => {
  test('is only as clickable as the title text itself', async ({ page }) => {
    await saveOneEvent(page, 'Civic Signal');

    const { title, row } = titleAndRow(page);
    const [titleBox, rowBox] = await Promise.all([title.boundingBox(), row.boundingBox()]);
    if (!titleBox || !rowBox) throw new Error('missing layout box');

    // A short title must not hand the whole row a click target.
    expect(titleBox.width).toBeLessThan(rowBox.width / 2);
  });

  test('a long title truncates rather than pushing the controls off', async ({ page }) => {
    await saveOneEvent(
      page,
      'An extremely long event title that would otherwise shove the bin and chevron clean off the card edge',
    );

    const { title, row } = titleAndRow(page);
    const [titleBox, rowBox] = await Promise.all([title.boundingBox(), row.boundingBox()]);
    if (!titleBox || !rowBox) throw new Error('missing layout box');

    expect(titleBox.width).toBeLessThanOrEqual(rowBox.width + 1);

    // Still on one line, and the chevron keeps its seat.
    await expect(page.getByTestId('saved-event-toggle').first()).toBeVisible();
  });

  test('opens an edit box at two thirds of the row', async ({ page }) => {
    await saveOneEvent(page, 'Civic Signal');

    const { title, row } = titleAndRow(page);
    const rowBox = await row.boundingBox();
    await title.click();

    const input = page.getByRole('textbox', { name: /Title for/ });
    const inputBox = await input.boundingBox();
    if (!inputBox || !rowBox) throw new Error('missing layout box');

    expect(inputBox.width / rowBox.width).toBeCloseTo(2 / 3, 2);
  });

  test('stays bold and in the same seat when the card expands', async ({ page }) => {
    await saveOneEvent(page, 'Civic Signal');

    const { title } = titleAndRow(page);
    const collapsed = await title.boundingBox();
    const weight = await title.evaluate((node) => getComputedStyle(node).fontWeight);

    await page.getByTestId('saved-event-toggle').first().click();
    const expanded = await title.boundingBox();
    const weightAfter = await title.evaluate((node) => getComputedStyle(node).fontWeight);

    if (!collapsed || !expanded) throw new Error('missing layout box');
    expect(expanded.x).toBe(collapsed.x);
    expect(expanded.width).toBe(collapsed.width);
    expect(weightAfter).toBe(weight);
    expect(Number(weight)).toBeGreaterThanOrEqual(700);
  });
});
