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

const savedCard = (page: Page) => page.getByTestId('saved-event-card').first();
const savedTitle = (page: Page) => savedCard(page).getByTestId('event-card-title');
const titleColumn = (page: Page) =>
  savedTitle(page).locator('xpath=ancestor::div[contains(@class,"min-w-0")][1]');

test.describe('Saved event card', () => {
  test('is the same card as the review list, arriving shut and without a checkbox', async ({ page }) => {
    await saveOneEvent(page, 'Civic Signal');

    const saved = savedCard(page);
    await expect(saved).toBeVisible();
    // Shut on arrival: the chevron offers to open it.
    await expect(saved.getByRole('button', { name: 'Expand' })).toBeVisible();
    // Selection is meaningless once saved, so no checkbox.
    await expect(saved.getByRole('checkbox', { name: /^Select / })).toHaveCount(0);
    // Everything else is the review card: same title, bin and chevron testids.
    await expect(saved.getByTestId('event-card-title')).toHaveText('Civic Signal');
    await expect(saved.getByTestId('event-card-remove')).toBeVisible();
  });

  test('the review card arrives open, and carries a checkbox', async ({ page }) => {
    await mockScanAPI(page, await oneTitled('Civic Signal'));
    await setupLocal(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'flyer.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });
    await scanButton(page).click();
    await waitForCards(page, 1);

    const review = page.getByTestId('event-card').first();
    await expect(review.getByRole('button', { name: 'Collapse' })).toBeVisible();
    await expect(review.getByRole('checkbox', { name: /^Select / })).toHaveCount(1);
    await expect(page.getByText('All-day event')).toBeVisible();
  });

  test('the title is only as clickable as its text', async ({ page }) => {
    await saveOneEvent(page, 'Civic Signal');

    const [titleBox, rowBox] = await Promise.all([
      savedTitle(page).boundingBox(),
      titleColumn(page).boundingBox(),
    ]);
    if (!titleBox || !rowBox) throw new Error('missing layout box');
    expect(titleBox.width).toBeLessThan(rowBox.width / 2);
  });

  test('a long title truncates rather than pushing the controls off', async ({ page }) => {
    await saveOneEvent(
      page,
      'An extremely long event title that would otherwise shove the bin and chevron clean off the card edge',
    );

    const [titleBox, rowBox] = await Promise.all([
      savedTitle(page).boundingBox(),
      titleColumn(page).boundingBox(),
    ]);
    if (!titleBox || !rowBox) throw new Error('missing layout box');
    expect(titleBox.width).toBeLessThanOrEqual(rowBox.width + 1);
    await expect(savedCard(page).getByRole('button', { name: 'Expand' })).toBeVisible();
  });

  test('opens an edit box at two thirds of the row', async ({ page }) => {
    await saveOneEvent(page, 'Civic Signal');

    const rowBox = await titleColumn(page).boundingBox();
    await savedTitle(page).click();

    const input = savedCard(page).getByTestId('event-card-title-input');
    const inputBox = await input.boundingBox();
    if (!inputBox || !rowBox) throw new Error('missing layout box');
    expect(inputBox.width / rowBox.width).toBeCloseTo(2 / 3, 1);
  });

  test('the title stays bold and in the same seat when the card opens', async ({ page }) => {
    await saveOneEvent(page, 'Civic Signal');

    const title = savedTitle(page);
    const collapsed = await title.boundingBox();
    const weight = await title.evaluate((n) => getComputedStyle(n).fontWeight);

    await savedCard(page).getByRole('button', { name: 'Expand' }).click();
    const expanded = await title.boundingBox();

    if (!collapsed || !expanded) throw new Error('missing layout box');
    expect(expanded.x).toBe(collapsed.x);
    expect(expanded.width).toBe(collapsed.width);
    expect(Number(weight)).toBeGreaterThanOrEqual(700);
  });

  test('clicking anywhere on the header toggles the card', async ({ page }) => {
    await saveOneEvent(page, 'Civic Signal');
    const saved = savedCard(page);

    // Blank header space - not the title or the date, which are click-to-edit
    // in their own right, and not the chevron.
    const header = saved.locator('> div').first();
    const box = await header.boundingBox();
    if (!box) throw new Error('missing header box');
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height / 2);
    await expect(saved.getByRole('button', { name: 'Collapse' })).toBeVisible();

    await saved.getByRole('button', { name: 'Collapse' }).click();
    await expect(saved.getByRole('button', { name: 'Expand' })).toBeVisible();
  });

  test('clicking the title edits it without folding the card', async ({ page }) => {
    await saveOneEvent(page, 'Civic Signal');
    const saved = savedCard(page);

    await saved.getByRole('button', { name: 'Expand' }).click();
    await savedTitle(page).click();

    await expect(saved.getByTestId('event-card-title-input')).toBeVisible();
    await expect(saved.getByRole('button', { name: 'Collapse' })).toBeVisible();
  });

  test('the bin does not toggle the card on its way to the confirm', async ({ page }) => {
    await saveOneEvent(page, 'Civic Signal');
    const saved = savedCard(page);

    await saved.getByTestId('event-card-remove').click();
    await expect(saved.getByRole('button', { name: 'Expand' })).toBeVisible();
  });

  test('the summary date gives way to the Start and End rows', async ({ page }) => {
    await saveOneEvent(page, 'Civic Signal');
    const saved = savedCard(page);

    await expect(saved.getByText('Sep 22', { exact: false }).first()).toBeVisible();

    await saved.getByRole('button', { name: 'Expand' }).click();
    await expect(saved.getByText('Start:')).toBeVisible();
    await expect(saved.getByText('End:')).toBeVisible();
    // The one-line summary is gone, not merely hidden.
    await expect(saved.locator('p.text-gray-600')).toHaveCount(0);
  });

  test('a saved card keeps Created and Export in its body', async ({ page }) => {
    await saveOneEvent(page, 'Civic Signal');
    const saved = savedCard(page);

    await expect(saved.getByRole('button', { name: 'Export Civic Signal' })).toHaveCount(0);
    await saved.getByRole('button', { name: 'Expand' }).click();
    await expect(saved.getByText('Created:', { exact: false })).toBeVisible();
    await expect(saved.getByRole('button', { name: 'Export Civic Signal' })).toBeVisible();
  });
});
