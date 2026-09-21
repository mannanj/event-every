import { expect, test, type Page } from '@playwright/test';
import type { ScanResponse } from '../src/types/scannerHttp';
import { mockScanAPI, setupLocal, submitText, waitForCards } from './helpers';

type ScannerModule = typeof import('@event-every/scanner');

// Playwright transforms test modules to CommonJS, so a normal dynamic import becomes require().
const importScannerModule = new Function(
  'return import("@event-every/scanner")',
) as () => Promise<ScannerModule>;

async function fullyPopulated(): Promise<ScanResponse> {
  const { EventCandidateSchema } = await importScannerModule();
  const claim = <Value>(value: Value) => ({ value, confidence: 0.9, evidence: [] });
  return {
    source: { sourceId: 'source-hitbox-1', kind: 'text', contentHandle: 'opaque-hitbox-1' },
    candidates: [
      EventCandidateSchema.parse({
        candidateId: 'candidate-hitbox-a',
        sourceUid: null,
        title: claim('Civic Signal'),
        description: claim('A description line'),
        location: claim('Somewhere Hall'),
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

async function openCard(page: Page) {
  await page.setViewportSize({ width: 900, height: 1100 });
  await mockScanAPI(page, await fullyPopulated());
  await setupLocal(page);
  await submitText(page, 'Civic Signal Sept 22 7pm');
  await waitForCards(page, 1);
  // Review cards arrive open.
  await expect(page.getByText('All-day event')).toBeVisible();
}

const editableTargets = (page: Page) =>
  page.locator('[role="button"][aria-label*="Click to edit"]');

test.describe('Click-to-edit hit areas', () => {
  test('every editable field carries grace beyond its text', async ({ page }) => {
    await openCard(page);

    const targets = editableTargets(page);
    const count = await targets.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const box = await targets.nth(i).boundingBox();
      if (!box) throw new Error('missing hitbox');
      // A bare line box is ~17px; the padded target must clear that.
      expect(box.height).toBeGreaterThanOrEqual(24);
    }
  });

  test('no editable hit area overlaps another control', async ({ page }) => {
    await openCard(page);

    const overlaps = await page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll('button, [role="button"], input, a'),
      ) as HTMLElement[];
      const shown = nodes.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const isEditable = (el: HTMLElement) =>
        (el.getAttribute('aria-label') || '').includes('Click to edit');

      const found: string[] = [];
      for (let i = 0; i < shown.length; i++) {
        for (let j = i + 1; j < shown.length; j++) {
          const a = shown[i];
          const b = shown[j];
          // Only care when at least one side is a click-to-edit target, and
          // never compare a node with its own ancestor.
          if (!isEditable(a) && !isEditable(b)) continue;
          if (a.contains(b) || b.contains(a)) continue;

          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (ix > 0 && iy > 0) {
            const name = (el: HTMLElement) =>
              (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30);
            found.push(`${name(a)} <-> ${name(b)}`);
          }
        }
      }
      return found;
    });

    expect(overlaps).toEqual([]);
  });

  test('the grace does not shift the text it wraps', async ({ page }) => {
    await openCard(page);

    // Padding is cancelled by an equal negative margin, so the glyphs sit where
    // they did: the target's left edge is exactly its padding outside the text.
    const offsets = await editableTargets(page).evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        return {
          padLeft: parseFloat(cs.paddingLeft),
          marginLeft: parseFloat(cs.marginLeft),
          padTop: parseFloat(cs.paddingTop),
        };
      }),
    );

    expect(offsets.length).toBeGreaterThan(0);
    for (const o of offsets) {
      expect(o.padTop).toBeGreaterThan(0);
      expect(o.padLeft + o.marginLeft).toBeCloseTo(4, 1);
    }
  });

  test('clicking the grace margin opens the editor, not just the glyphs', async ({ page }) => {
    await openCard(page);

    const target = page.locator('[role="button"][aria-label*="Location"]').first();
    const box = await target.boundingBox();
    if (!box) throw new Error('missing hitbox');

    // Two pixels inside the top-left corner: padding, not text.
    await page.mouse.click(box.x + 2, box.y + 2);
    await expect(page.getByRole('textbox', { name: 'Location' })).toBeVisible();
  });
});
