import { expect, test } from '@playwright/test';
import type { ScanResponse } from '../src/types/scannerHttp';
import { mockScanAPI, setupLocal, submitText } from './helpers';

type ScannerModule = typeof import('@event-every/scanner');

// Playwright transforms test modules to CommonJS, so a normal dynamic import becomes require().
const importScannerModule = new Function(
  'return import("@event-every/scanner")',
) as () => Promise<ScannerModule>;

const SOURCE_TEXT = 'Civic Signal, Tuesday September 22 2026, 7pm';

async function candidates(count: number): Promise<ScanResponse> {
  const { EventCandidateSchema } = await importScannerModule();
  const claim = <Value>(value: Value) => ({ value, confidence: 0.9, evidence: [] });
  const candidate = (id: string, title: string, day: number) => EventCandidateSchema.parse({
    candidateId: id,
    sourceUid: null,
    title: claim(title),
    description: claim(null),
    location: claim(null),
    url: claim(null),
    temporal: claim({
      start: { kind: 'floating', date: { year: 2026, month: 9, day }, time: { hour: 19, minute: 0, second: 0 } },
      end: null,
      duration: null,
      allDay: false,
    }),
    recurrence: claim(null),
    issues: [],
  });
  const titles = ['Alpha', 'Beta', 'Gamma'];
  return {
    source: { sourceId: 'source-remove-1', kind: 'text', contentHandle: 'opaque-remove-1' },
    candidates: titles.slice(0, count).map((title, index) => candidate(`candidate-${title}`, title, 22 + index)),
    issues: [],
  };
}

const cards = (page: import('@playwright/test').Page) => page.getByTestId('event-card');
const undoRow = (page: import('@playwright/test').Page) => page.getByTestId('undo-removal-row');
const removeButtonIn = (card: import('@playwright/test').Locator) => card.getByTestId('event-card-remove');

test.describe('Remove a card with undo', () => {
  test('removes the card, offers undo in its place, and restores it still selected', async ({ page }) => {
    await mockScanAPI(page, await candidates(3));
    await setupLocal(page);
    await submitText(page, SOURCE_TEXT);

    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByTestId('save-events-button')).toHaveText('Save (3)');

    // Remove the middle card.
    await removeButtonIn(cards(page).nth(1)).click();

    await expect(cards(page)).toHaveCount(2);
    await expect(undoRow(page)).toHaveCount(1);
    await expect(undoRow(page)).toContainText('Beta');
    // The removed card no longer counts toward what would be saved.
    await expect(page.getByTestId('save-events-button')).toHaveText('Save (2)');

    await page.getByTestId('undo-removal-button').click();

    await expect(cards(page)).toHaveCount(3);
    await expect(undoRow(page)).toHaveCount(0);
    // Back in its original slot, and still selected as it was.
    await expect(cards(page).nth(1)).toContainText('Beta');
    await expect(page.getByTestId('save-events-button')).toHaveText('Save (3)');
  });

  test('every removal keeps its own undo row', async ({ page }) => {
    await mockScanAPI(page, await candidates(3));
    await setupLocal(page);
    await submitText(page, SOURCE_TEXT);
    await expect(cards(page)).toHaveCount(3);

    await removeButtonIn(cards(page).first()).click();
    await expect(undoRow(page)).toHaveCount(1);

    await removeButtonIn(cards(page).first()).click();
    // The first removal is still undoable: two cards gone, two rows waiting.
    await expect(undoRow(page)).toHaveCount(2);
    await expect(undoRow(page).nth(0)).toContainText('Alpha');
    await expect(undoRow(page).nth(1)).toContainText('Beta');
    await expect(cards(page)).toHaveCount(1);

    // Undoing the older one leaves the newer one's row alone.
    await page.getByTestId('undo-removal-button').first().click();
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).first()).toContainText('Alpha');
    await expect(undoRow(page)).toHaveCount(1);
    await expect(undoRow(page)).toContainText('Beta');
  });

  test('removing the last card keeps the section open, then closes it', async ({ page }) => {
    await mockScanAPI(page, await candidates(1));
    await setupLocal(page);
    await submitText(page, SOURCE_TEXT);
    await expect(cards(page)).toHaveCount(1);

    await removeButtonIn(cards(page).first()).click();

    // Nothing but the undo row is left, and the save footer is gone with the cards.
    await expect(cards(page)).toHaveCount(0);
    await expect(undoRow(page)).toHaveCount(1);
    await expect(page.getByTestId('save-events-button')).toHaveCount(0);

    // The window closes the whole section on its own.
    await expect(undoRow(page)).toHaveCount(0, { timeout: 15000 });
    await expect(cards(page)).toHaveCount(0);
  });

  test('rows removed together all time out', async ({ page }) => {
    await mockScanAPI(page, await candidates(3));
    await setupLocal(page);
    await submitText(page, SOURCE_TEXT);
    await expect(cards(page)).toHaveCount(3);

    await removeButtonIn(cards(page).first()).click();
    await removeButtonIn(cards(page).first()).click();
    await removeButtonIn(cards(page).first()).click();
    await expect(undoRow(page)).toHaveCount(3);
    await expect(cards(page)).toHaveCount(0);

    // Each row is on its own clock; none of them needs a click to go away.
    await expect(undoRow(page)).toHaveCount(0, { timeout: 15000 });
    await expect(cards(page)).toHaveCount(0);
  });

  test('an expired undo leaves the removal permanent', async ({ page }) => {
    await mockScanAPI(page, await candidates(2));
    await setupLocal(page);
    await submitText(page, SOURCE_TEXT);
    await expect(cards(page)).toHaveCount(2);

    await removeButtonIn(cards(page).first()).click();
    await expect(undoRow(page)).toHaveCount(1);
    await expect(undoRow(page)).toHaveCount(0, { timeout: 15000 });

    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByText('Alpha')).toHaveCount(0);
    await expect(page.getByTestId('save-events-button')).toHaveText('Save (1)');
  });
});
