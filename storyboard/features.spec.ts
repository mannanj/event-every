import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { ScanResponse } from '../src/types/scannerHttp';
import { mockScanAPI, scanButton, setupLocal, waitForSmartInputReady } from '../e2e/helpers';

type ScannerModule = typeof import('@event-every/scanner');

// Playwright transforms test modules to CommonJS, so a normal dynamic import becomes require().
const importScannerModule = new Function(
  'return import("@event-every/scanner")',
) as () => Promise<ScannerModule>;

const OUT = process.env.STORYBOARD_OUT ?? 'storyboard-shots';

type Shot = { file: string; caption: string };
const shots: Shot[] = [];

async function scanResponse(titles: string[], sourceId: string): Promise<ScanResponse> {
  const { EventCandidateSchema } = await importScannerModule();
  const claim = <Value>(value: Value) => ({ value, confidence: 0.9, evidence: [] });
  return {
    source: { sourceId, kind: 'text', contentHandle: `opaque-${sourceId}` },
    candidates: titles.map((title, index) => EventCandidateSchema.parse({
      candidateId: `candidate-${sourceId}-${index}`,
      sourceUid: null,
      title: claim(title),
      description: claim(null),
      location: claim(null),
      url: claim(null),
      temporal: claim({
        start: { kind: 'floating', date: { year: 2026, month: 9, day: 22 + index }, time: { hour: 19, minute: 0, second: 0 } },
        end: null,
        duration: null,
        allDay: false,
      }),
      recurrence: claim(null),
      issues: [],
    })),
    issues: [],
  };
}

/**
 * Ring the control and point at it, drawn into the live page so it photographs
 * with the app rather than being pasted on afterwards.
 */
async function mark(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (!box) throw new Error('cannot mark a control with no box');
  await page.evaluate(({ x, y, width, height }) => {
    const ring = document.createElement('div');
    ring.id = '__storyboard_mark';
    ring.style.cssText = [
      'position:fixed', `left:${x - 8}px`, `top:${y - 8}px`,
      `width:${width + 16}px`, `height:${height + 16}px`,
      'border:3px solid #e11d48', 'border-radius:10px',
      'box-shadow:0 0 0 4px rgba(225,29,72,0.22)',
      'pointer-events:none', 'z-index:2147483647',
    ].join(';');
    const pointsLeft = x + width + 46 < window.innerWidth;
    const arrow = document.createElement('div');
    arrow.textContent = pointsLeft ? '◀' : '▶';
    arrow.style.cssText = [
      'position:fixed',
      pointsLeft ? `left:${x + width + 16}px` : `left:${x - 42}px`,
      `top:${y + height / 2 - 15}px`,
      'font:700 24px/1 ui-sans-serif,system-ui,sans-serif',
      'color:#e11d48', 'pointer-events:none', 'z-index:2147483647',
    ].join(';');
    ring.appendChild(arrow);
    document.body.appendChild(ring);
  }, box);
}

async function unmark(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById('__storyboard_mark')?.remove());
}

/** settle → mark → shoot → unmark. The caller then acts. */
async function shoot(page: Page, caption: string, target?: Locator): Promise<void> {
  await page.waitForTimeout(350);
  // The review list sits below the fold, so bring the control the caption talks
  // about into frame before the shot; the mark is placed from the box it has
  // after that scroll, never before.
  if (target) {
    await target.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
  }
  if (target) await mark(page, target);
  const file = `${String(shots.length + 1).padStart(2, '0')}.png`;
  await page.screenshot({ path: `${OUT}/${file}` });
  shots.push({ file, caption });
  if (target) await unmark(page);
}

const cards = (page: Page) => page.getByTestId('event-card');
const cardNamed = (page: Page, title: string) =>
  cards(page).filter({ has: page.getByTestId('event-card-title').filter({ hasText: title }) });
const trashIn = (card: Locator) => card.getByTestId('event-card-remove');
const undoRow = (page: Page) => page.getByTestId('undo-removal-row');
const historyButton = (page: Page) => page.locator('[data-testid="input-history-button"]');
const historyCards = (page: Page) => page.locator('[data-testid="input-history-card"]');
const textarea = (page: Page) => page.locator('[data-testid="smart-input-textarea"]');

async function clearStoredInputs(page: Page): Promise<void> {
  await page.evaluate(async () => {
    localStorage.clear();
    const databases = (await indexedDB.databases?.()) ?? [];
    await Promise.all(databases.map((entry) => new Promise<void>((resolve) => {
      if (!entry.name) return resolve();
      const request = indexedDB.deleteDatabase(entry.name);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    })));
  });
  await page.reload();
  await waitForSmartInputReady(page);
}

test('storyboard: removing a card, and one row per input', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });

  // ---- Setup, deliberately off camera ----
  await setupLocal(page);
  await mockScanAPI(page, await scanResponse(['Alpha', 'Beta', 'Gamma'], 'sb-1'));
  await textarea(page).fill('three events to review');
  await textarea(page).press('Meta+Enter');
  await expect(cards(page)).toHaveCount(3);

  // ---- Act one: removing a card ----
  await shoot(page,
    'We see three event cards in Review, all ticked, and "Save (3)" below them. Next, we will click the trash icon on "Beta", the middle card. Beta leaves the list and a slim row takes its place.',
    trashIn(cardNamed(page, 'Beta')));
  await trashIn(cardNamed(page, 'Beta')).click();
  await expect(undoRow(page)).toHaveCount(1);

  await shoot(page,
    'We see "Removed Beta" sitting between "Alpha" and "Gamma", exactly where the card was, and "Save (2)". Next, we will click "Undo". Beta returns to its old spot with its tick still on.',
    page.getByTestId('undo-removal-button'));
  await page.getByTestId('undo-removal-button').click();
  await expect(cards(page)).toHaveCount(3);

  await shoot(page,
    'We see Beta back between Alpha and Gamma, still ticked, and "Save (3)" again. Next, we will click the trash icon on "Alpha". Alpha leaves and its own undo row appears at the top.',
    trashIn(cardNamed(page, 'Alpha')));
  await trashIn(cardNamed(page, 'Alpha')).click();
  await expect(undoRow(page)).toContainText('Alpha');

  await shoot(page,
    'We see "Removed Alpha" at the top of the list. Next, we will click the trash icon on "Beta". Alpha\'s removal becomes final and only Beta can still be undone.',
    trashIn(cardNamed(page, 'Beta')));
  await trashIn(cardNamed(page, 'Beta')).click();
  await expect(undoRow(page)).toContainText('Beta');

  await shoot(page,
    'We see one row, "Removed Beta", and Alpha is nowhere in the list. Next, we will click the trash icon on "Gamma", the last card left. The section stays open holding only the undo row.',
    trashIn(cardNamed(page, 'Gamma')));
  await trashIn(cardNamed(page, 'Gamma')).click();
  await expect(cards(page)).toHaveCount(0);
  await expect(undoRow(page)).toHaveCount(1);

  await shoot(page,
    'We see an empty list with a single "Removed Gamma" row and no Save button. Next, we will wait five seconds without touching anything. The section closes itself.',
    undoRow(page));
  await expect(undoRow(page)).toHaveCount(0, { timeout: 15_000 });

  // ---- Act two: one row per input ----
  await clearStoredInputs(page);
  await page.unroute('**/api/scan');
  await mockScanAPI(page, await scanResponse(['Dinner'], 'sb-2'));

  await shoot(page,
    'We see the page back at rest, Review gone and the input empty. Next, we will type "dinner friday" into the input. The text is ready to scan.',
    textarea(page));
  await textarea(page).fill('dinner friday');

  await shoot(page,
    'We see "dinner friday" in the input. Next, we will press "Scan". A card appears and the input is written to Recent.',
    scanButton(page));
  await textarea(page).press('Meta+Enter');
  await expect(cards(page)).toHaveCount(1);

  await shoot(page,
    'We see the card that "dinner friday" produced. Next, we will open "Recent" from the clock icon. Recent lists every input we have run.',
    historyButton(page));
  await historyButton(page).click();
  await expect(historyCards(page)).toHaveCount(1);

  await shoot(page,
    'We see Recent holding one row, "dinner friday". Next, we will close Recent. We go back to the input to run that same text again.',
    page.locator('[data-testid="input-history-close"]'));
  await page.locator('[data-testid="input-history-close"]').click();

  await shoot(page,
    'We see the input empty again. Next, we will type "dinner friday", character for character as before. The same input is ready for a second run.',
    textarea(page));
  await textarea(page).fill('dinner friday');

  await shoot(page,
    'We see "dinner friday" in the input a second time. Next, we will press "Scan". A second card appears, and Recent moves its existing row instead of adding one.',
    scanButton(page));
  await textarea(page).press('Meta+Enter');
  await expect(cards(page)).toHaveCount(2);

  await shoot(page,
    'We see two cards now, one from each run. Next, we will open "Recent" again. Recent still holds a single row for "dinner friday".',
    historyButton(page));
  await historyButton(page).click();
  await expect(historyCards(page)).toHaveCount(1);

  await shoot(page,
    'We see Recent with one row after two identical runs. Next, we will close Recent. This time we will change the text before running it.',
    page.locator('[data-testid="input-history-close"]'));
  await page.locator('[data-testid="input-history-close"]').click();

  await shoot(page,
    'We see the input empty once more. Next, we will type "dinner friday at 8", the same line with an ending added. An input we edited is a different input.',
    textarea(page));
  await textarea(page).fill('dinner friday at 8');

  await shoot(page,
    'We see "dinner friday at 8" in the input. Next, we will press "Scan". Recent gains a second row rather than moving the first.',
    scanButton(page));
  await textarea(page).press('Meta+Enter');
  await expect(cards(page)).toHaveCount(3);
  await historyButton(page).click();
  await expect(historyCards(page)).toHaveCount(2);

  // ---- The ending: nothing marked, no "next" ----
  await shoot(page,
    'We see Recent holding two rows, "dinner friday at 8" above "dinner friday". Three runs of two inputs left two rows, where before every run left one of its own.');

  writeFileSync(`${OUT}/captions.json`, JSON.stringify(shots, null, 2));
});
