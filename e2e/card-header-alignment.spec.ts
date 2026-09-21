import { expect, test, type Page } from '@playwright/test';
import type { ScanResponse } from '../src/types/scannerHttp';
import { mockScanAPI, setupLocal, submitText, waitForCards } from './helpers';

type ScannerModule = typeof import('@event-every/scanner');

// Playwright transforms test modules to CommonJS, so a normal dynamic import becomes require().
const importScannerModule = new Function(
  'return import("@event-every/scanner")',
) as () => Promise<ScannerModule>;

async function oneCandidate(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await importScannerModule();
  const claim = <Value>(value: Value) => ({ value, confidence: 0.9, evidence: [] });
  return {
    source: { sourceId: 'source-align-1', kind: 'text', contentHandle: 'opaque-align-1' },
    candidates: [
      EventCandidateSchema.parse({
        candidateId: 'candidate-align-a',
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

/** Geometry of the header, measured against the card so it survives page reflow. */
function readHeader(page: Page) {
  return page.getByTestId('event-card').first().evaluate((root) => {
    const inkOf = (el: Element) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let top = Infinity;
      let bottom = -Infinity;
      let n: Node | null;
      while ((n = walker.nextNode())) {
        if (!n.textContent?.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        const b = r.getBoundingClientRect();
        if (b.height === 0) continue;
        top = Math.min(top, b.top);
        bottom = Math.max(bottom, b.bottom);
      }
      return { top, bottom };
    };

    const card = root.getBoundingClientRect();
    const title = root.querySelector('[data-testid="event-card-title"]')!;
    const box = root.querySelector('input[type=checkbox][aria-label^="Select"]')!;
    const ink = inkOf(title);
    const b = box.getBoundingClientRect();

    return {
      boxFromCardTop: +(b.top - card.top).toFixed(1),
      boxFromCardLeft: +(b.left - card.left).toFixed(1),
      boxMid: +(b.top + b.height / 2).toFixed(1),
      titleMid: +((ink.top + ink.bottom) / 2).toFixed(1),
      titleSize: parseFloat(getComputedStyle(title).fontSize),
    };
  });
}

async function scanOne(page: Page) {
  await mockScanAPI(page, await oneCandidate());
  await setupLocal(page);
  await submitText(page, 'Civic Signal Sept 22 7pm');
  await waitForCards(page, 1);
  await expect(page.getByText('All-day event')).toBeVisible();
}

test.describe('Card header alignment', () => {
  test('the checkbox is centred on the title, not on the block below it', async ({ page }) => {
    await scanOne(page);

    const open = await readHeader(page);
    expect(Math.abs(open.boxMid - open.titleMid)).toBeLessThanOrEqual(1);
  });

  test('the checkbox holds its place when the card opens and shuts', async ({ page }) => {
    await scanOne(page);
    const card = page.getByTestId('event-card').first();

    const open = await readHeader(page);
    await card.getByRole('button', { name: 'Collapse' }).click();
    await expect(page.getByText('All-day event')).toBeHidden();
    const shut = await readHeader(page);

    // Measured from the card, so the page reflowing underneath does not count.
    expect(shut.boxFromCardTop).toBe(open.boxFromCardTop);
    expect(shut.boxFromCardLeft).toBe(open.boxFromCardLeft);
    // Still centred on the title in the shut state, where a date sits below it.
    expect(Math.abs(shut.boxMid - shut.titleMid)).toBeLessThanOrEqual(1);
  });

  test('the title carries the larger size', async ({ page }) => {
    await scanOne(page);

    const { titleSize } = await readHeader(page);
    expect(titleSize).toBeGreaterThanOrEqual(18);
  });
});
