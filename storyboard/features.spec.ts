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
// v1 keeps the "We see / Next, we will / This will" scaffolding. v2 drops the
// openers and the consequence beat: the mark shows which control and the next
// page shows the result, so saying it as well repeats what is coming.
const VOICE = process.env.STORYBOARD_VOICE === 'v2' ? 'v2' : 'v1';

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
async function shoot(page: Page, caption: Readonly<{ v1: string; v2: string }>, target?: Locator): Promise<void> {
  await page.waitForTimeout(350);
  // The review list sits below the fold, so bring the control the caption talks
  // about into frame before the shot; the mark is placed from the box it has
  // after that scroll, never before.
  if (target) {
    // Centre rather than minimally scroll: the default brings the control just
    // inside the frame, which left the cards clipped against the bottom edge.
    await target.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(250);
  }
  if (target) await mark(page, target);
  const file = `${String(shots.length + 1).padStart(2, '0')}.png`;
  await page.screenshot({ path: `${OUT}/${file}` });
  shots.push({ file, caption: caption[VOICE] });
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
    {
      v1: 'We see three event cards in Review, all ticked, and "Save (3)" below them. Next, we will click the trash icon on "Beta", the middle card. This will remove Beta from the list and leave a slim row in its place.',
      v2: 'Three event cards sit in Review, all ticked, with "Save (3)" below them. We want to remove "Beta", the middle card, with its trash icon.',
    },
    trashIn(cardNamed(page, 'Beta')));
  await trashIn(cardNamed(page, 'Beta')).click();
  await expect(undoRow(page)).toHaveCount(1);

  await shoot(page,
    {
      v1: 'We see a slim "Removed Beta" row between "Alpha" and "Gamma", exactly where the card was, and "Save (2)". Next, we will click "Undo". This will put Beta back in its old spot with its tick still on.',
      v2: 'A slim "Removed Beta" row sits between "Alpha" and "Gamma", exactly where the card was, and Save reads (2). We want to bring Beta back with "Undo".',
    },
    page.getByTestId('undo-removal-button'));
  await page.getByTestId('undo-removal-button').click();
  await expect(cards(page)).toHaveCount(3);

  await shoot(page,
    {
      v1: 'We see Beta back between Alpha and Gamma, still ticked, and "Save (3)" again. Next, we will click the trash icon on "Alpha". This will remove Alpha and leave its own undo row at the top.',
      v2: 'Beta is back between Alpha and Gamma, still ticked, and Save reads (3) again. We want to remove "Alpha" this time.',
    },
    trashIn(cardNamed(page, 'Alpha')));
  await trashIn(cardNamed(page, 'Alpha')).click();
  await expect(undoRow(page)).toContainText('Alpha');

  await shoot(page,
    {
      v1: 'We see an "Removed Alpha" row at the top of the list. Next, we will click the trash icon on "Beta". This will remove Beta as well, leaving both rows waiting on their own clocks.',
      v2: 'A "Removed Alpha" row sits at the top of the list. We want to remove "Beta" as well.',
    },
    trashIn(cardNamed(page, 'Beta')));
  await trashIn(cardNamed(page, 'Beta')).click();
  await expect(undoRow(page)).toHaveCount(2);

  await shoot(page,
    {
      v1: 'We see two rows, "Removed Alpha" and "Removed Beta", with only Gamma still a card. Next, we will click the trash icon on "Gamma", the last card left. This will empty the list but hold the section open for the rows.',
      v2: 'Two rows, "Removed Alpha" and "Removed Beta", leave Gamma as the only card. We want to remove "Gamma" too.',
    },
    trashIn(cardNamed(page, 'Gamma')));
  await trashIn(cardNamed(page, 'Gamma')).click();
  await expect(cards(page)).toHaveCount(0);
  await expect(undoRow(page)).toHaveCount(3);

  await shoot(page,
    {
      v1: 'We see an empty list holding all three rows, and no Save button. Next, we will wait five seconds without touching anything. This will let every row time out and close the section.',
      v2: 'The list is empty, holding all three rows, and the Save button is gone. We want to wait five seconds and touch nothing.',
    },
    undoRow(page).first());
  await expect(undoRow(page)).toHaveCount(0, { timeout: 15_000 });

  // ---- Act two: one row per input ----
  await clearStoredInputs(page);
  await page.unroute('**/api/scan');
  await mockScanAPI(page, await scanResponse(['Dinner'], 'sb-2'));

  await shoot(page,
    {
      v1: 'We see the page back at rest, Review gone and the input empty. Next, we will type "dinner friday" into the input. This will leave the text ready to scan.',
      v2: 'The page is back at rest, Review gone and the input empty. We want to type "dinner friday" into it.',
    },
    textarea(page));
  await textarea(page).fill('dinner friday');

  await shoot(page,
    {
      v1: 'We see "dinner friday" in the input. Next, we will press "Scan". This will produce a card and write the input to Recent.',
      v2: '"dinner friday" sits in the input. We want to scan it.',
    },
    scanButton(page));
  await textarea(page).press('Meta+Enter');
  await expect(cards(page)).toHaveCount(1);

  await shoot(page,
    {
      v1: 'We see the card that "dinner friday" produced. Next, we will open "Recent" from the clock icon. This will show every input we have run.',
      v2: 'The card from "dinner friday" is on screen. We want to open "Recent" from the clock icon.',
    },
    historyButton(page));
  await historyButton(page).click();
  await expect(historyCards(page)).toHaveCount(1);

  await shoot(page,
    {
      v1: 'We see Recent holding one row, "dinner friday". Next, we will close Recent. This will take us back to the input to run that same text again.',
      v2: 'Recent holds one row, "dinner friday". We want to close Recent and go back to the input.',
    },
    page.locator('[data-testid="input-history-close"]'));
  await page.locator('[data-testid="input-history-close"]').click();

  await shoot(page,
    {
      v1: 'We see the input empty again. Next, we will type "dinner friday", character for character as before. This will set up a second run of an input Recent already holds.',
      v2: 'The input is empty again. We want to type "dinner friday", character for character as before.',
    },
    textarea(page));
  await textarea(page).fill('dinner friday');

  await shoot(page,
    {
      v1: 'We see "dinner friday" in the input a second time. Next, we will press "Scan". This will add a second card, and move Recent\'s existing row rather than adding one.',
      v2: '"dinner friday" sits in the input a second time. We want to scan it again.',
    },
    scanButton(page));
  await textarea(page).press('Meta+Enter');
  await expect(cards(page)).toHaveCount(2);

  await shoot(page,
    {
      v1: 'We see two cards now, one from each run. Next, we will open "Recent" again. This will show whether the repeat added a row.',
      v2: 'Two cards are on screen, one from each run. We want to open "Recent" again.',
    },
    historyButton(page));
  await historyButton(page).click();
  await expect(historyCards(page)).toHaveCount(1);

  await shoot(page,
    {
      v1: 'We see Recent still holding a single row after two identical runs. Next, we will close Recent. This will return us to the input, where we will change the text this time.',
      v2: 'Recent still holds a single row after two identical runs. We want to close Recent and change the text this time.',
    },
    page.locator('[data-testid="input-history-close"]'));
  await page.locator('[data-testid="input-history-close"]').click();

  await shoot(page,
    {
      v1: 'We see the input empty once more. Next, we will type "dinner friday at 8", the same line with an ending added. This will make an input Recent has not seen before.',
      v2: 'The input is empty once more. We want to type "dinner friday at 8", the same line with an ending added.',
    },
    textarea(page));
  await textarea(page).fill('dinner friday at 8');

  await shoot(page,
    {
      v1: 'We see "dinner friday at 8" in the input. Next, we will press "Scan". This will give Recent a second row rather than moving the first.',
      v2: '"dinner friday at 8" sits in the input. We want to scan it.',
    },
    scanButton(page));
  await textarea(page).press('Meta+Enter');
  await expect(cards(page)).toHaveCount(3);
  await historyButton(page).click();
  await expect(historyCards(page)).toHaveCount(2);

  // ---- The ending: nothing marked, no "next" ----
  await shoot(page,
    {
      v1: 'We see Recent holding two rows, "dinner friday at 8" above "dinner friday". Three runs of two inputs left two rows, where before this change every run left one of its own.',
      v2: 'Recent holds two rows, "dinner friday at 8" above "dinner friday". Three runs of two inputs left two rows, where before this change every run left one of its own.',
    });

  writeFileSync(`${OUT}/captions.json`, JSON.stringify(shots, null, 2));
});
