import { expect, test } from '@playwright/test';
import type { ScanResponse } from '../src/types/scannerHttp';
import { mockScanAPI, setupLocal, submitText } from './helpers';

type ScannerModule = typeof import('@event-every/scanner');

// Playwright transforms test modules to CommonJS, so a normal dynamic import becomes require().
const importScannerModule = new Function(
  'return import("@event-every/scanner")',
) as () => Promise<ScannerModule>;

const SOURCE_TEXT = 'Civic Signal, Tuesday September 22 2026, 7pm';

async function twoCandidates(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await importScannerModule();
  const sourceId = 'source-discard-1';
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
  return {
    source: { sourceId, kind: 'text', contentHandle: 'opaque-discard-1' },
    candidates: [candidate('candidate-discard-a', 'Civic Signal', 22), candidate('candidate-discard-b', 'Civic Signal encore', 23)],
    issues: [],
  };
}

test.describe('Discard all', () => {
  test('removes every unsaved card and nothing is stored', async ({ page }) => {
    await mockScanAPI(page, await twoCandidates());
    await setupLocal(page);
    await submitText(page, SOURCE_TEXT);

    const cards = page.getByTestId('event-card');
    await expect(cards).toHaveCount(2);
    await expect(page.getByTestId('save-events-button')).toHaveText('Save (2)');

    await page.getByRole('button', { name: 'Unselect all' }).click();
    const discard = page.getByTestId('save-events-button');
    await expect(discard).toHaveText('Discard all');
    await discard.click();

    await expect(cards).toHaveCount(0);
    await expect(page.getByTestId('save-events-button')).toHaveCount(0);
    const stored = await page.evaluate(() => Object.keys(localStorage).filter((key) => /event/i.test(key)).map((key) => [key, localStorage.getItem(key)]));
    for (const [, value] of stored) expect(value ?? '').not.toContain('Civic Signal');
  });
});
