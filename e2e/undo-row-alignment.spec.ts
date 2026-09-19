import { expect, test } from '@playwright/test';
import type { ScanResponse } from '../src/types/scannerHttp';
import { mockScanAPI, setupLocal } from './helpers';

type ScannerModule = typeof import('@event-every/scanner');
const importScannerModule = new Function(
  'return import("@event-every/scanner")',
) as () => Promise<ScannerModule>;

async function two(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await importScannerModule();
  const claim = <Value>(value: Value) => ({ value, confidence: 0.9, evidence: [] });
  return {
    source: { sourceId: 'm-1', kind: 'text', contentHandle: 'opaque-m-1' },
    candidates: ['Alpha', 'Beta'].map((title, index) => EventCandidateSchema.parse({
      candidateId: `c-${index}`, sourceUid: null, title: claim(title),
      description: claim(null), location: claim(null), url: claim(null),
      temporal: claim({
        start: { kind: 'floating', date: { year: 2026, month: 9, day: 22 + index }, time: { hour: 19, minute: 0, second: 0 } },
        end: null, duration: null, allDay: false,
      }),
      recurrence: claim(null), issues: [],
    })),
    issues: [],
  };
}

test('the undo row lines up with the card columns above it', async ({ page }) => {
  await mockScanAPI(page, await two());
  await setupLocal(page);
  await page.locator('[data-testid="smart-input-textarea"]').fill('measure');
  await page.locator('[data-testid="smart-input-textarea"]').press('Meta+Enter');
  await expect(page.getByTestId('event-card')).toHaveCount(2);

  const beta = page.getByTestId('event-card').nth(1);
  await beta.getByTestId('event-card-remove').click();
  await expect(page.getByTestId('undo-removal-row')).toHaveCount(1);

  const alphaTitle = page.getByTestId('event-card').first().getByTestId('event-card-title');
  const alphaTrashSvg = page.getByTestId('event-card').first().getByTestId('event-card-remove').locator('svg');
  const removedText = page.getByTestId('undo-removal-row').locator('p');
  const undoWord = page.getByTestId('undo-removal-button').locator('span');

  const box = async (l: import('@playwright/test').Locator) => {
    const b = await l.boundingBox();
    if (!b) throw new Error('no box');
    return b;
  };
  const title = await box(alphaTitle);
  const trash = await box(alphaTrashSvg);
  const removed = await box(removedText);
  const undo = await box(undoWord);

  // The row borrows the card's own columns. Pinned because "close enough" here
  // reads as a misalignment: the eye lines these up against the card above.
  expect(removed.x).toBeCloseTo(title.x, 1);
  expect(undo.x + undo.width).toBeCloseTo(trash.x + trash.width, 1);

  // The name and the action match each other, and both sit above the card's
  // 12px secondary text rather than at it.
  expect(await removedText.evaluate((n) => getComputedStyle(n).fontSize)).toBe('14px');
  expect(await undoWord.evaluate((n) => getComputedStyle(n).fontSize)).toBe('14px');
  expect(await removedText.evaluate((n) => getComputedStyle(n).fontStyle)).toBe('italic');
  // "Undo" is set like the name beside it: same size, same italic, no underline.
  expect(await undoWord.evaluate((n) => getComputedStyle(n).fontStyle)).toBe('italic');
  expect(await undoWord.evaluate((n) => getComputedStyle(n).textDecorationLine)).toBe('none');
  await expect(page.getByTestId('undo-removal-button').locator('svg')).toBeVisible();
});
