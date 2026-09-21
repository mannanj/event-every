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

    // The row lives in the card body, under the fields, and review cards open
    // by default so it is there straight away.

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
    await expect(page.getByTestId('unsaved-attachments').first().locator('img[alt="Attachment 1"]')).toBeVisible();
  });

  test('sits on the same rhythm as the fields, left-aligned with the labels', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);
    await scanAnImage(page, 'meeting-invite.png');
    await waitForCards(page, 1);

    const attachments = page.getByTestId('unsaved-attachments').first();
    await expect(attachments).toBeVisible();

    // Measured between glyphs, not margins: the rows carry their own leading,
    // so equal margins would not read as equal space.
    const gaps = await attachments.evaluate((node) => {
      const row = node as HTMLElement;
      const parent = row.parentElement!;
      const kids = Array.from(parent.children) as HTMLElement[];

      const ink = (el: Element) => {
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

      const textRows = kids.filter((k) => k !== row && isFinite(ink(k).top));
      const between: number[] = [];
      for (let i = 1; i < textRows.length; i++) {
        between.push(ink(textRows[i]).top - ink(textRows[i - 1]).bottom);
      }
      const last = textRows[textRows.length - 1];

      return {
        rowGaps: between,
        attachments: row.getBoundingClientRect().top - ink(last).bottom,
      };
    });

    // Every element sits at one gap: the files are not set apart any more.
    const all = [...gaps.rowGaps, gaps.attachments];
    expect(Math.min(...all)).toBeGreaterThan(0);
    expect(Math.max(...all) - Math.min(...all)).toBeLessThanOrEqual(1.5);

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

    const tile = page.getByTestId('unsaved-attachments').first().locator('img[alt="Attachment 1"]');
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

    await page.getByTestId('unsaved-attachments').first().getByRole('button', { name: /View attachment 1/ }).click();
    await expect(page.getByText('meeting-invite.png')).toBeVisible();
  });

  test('a second scan adds its file rather than replacing the first', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);

    await scanAnImage(page, 'first.png');
    await waitForCards(page, 1);
    await expect(page.getByTestId('unsaved-attachments').first().locator('img[alt="Attachment 1"]')).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'second.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });
    await scanButton(page).click();

    await expect(page.getByTestId('unsaved-attachments').first().locator('img[alt="Attachment 2"]')).toBeVisible();
  });

  test('discarding the batch takes the attachments with it', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);
    await scanAnImage(page, 'meeting-invite.png');
    await waitForCards(page, 1);
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

    // Saved cards are the same card, arriving shut: no fields, no files.
    const saved = page.getByTestId('saved-event-card').first();
    await expect(saved).toBeVisible();
    await expect(page.getByTestId('unsaved-attachments')).toHaveCount(0);

    await saved.getByRole('button', { name: 'Expand' }).click();
    const attachments = saved.getByTestId('unsaved-attachments');
    await expect(attachments).toBeVisible();
    await expect(attachments.locator('img[alt="Attachment 1"]')).toBeVisible();

    await saved.getByRole('button', { name: 'Collapse' }).click();
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

    const saved = page.getByTestId('saved-event-card').first();
    const [bin, chevron] = await Promise.all([
      saved.getByTestId('event-card-remove').boundingBox(),
      saved.getByRole('button', { name: 'Expand' }).boundingBox(),
    ]);
    if (!bin || !chevron) throw new Error('missing control box');
    expect(bin.x).toBeLessThan(chevron.x);
  });

  test('the lightbox fills the viewport from the input and from a card alike', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'meeting-invite.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });

    // From the smart input. Its files row sets [container-type:size], which
    // would otherwise make the modal's `fixed` resolve against the input box.
    await page.locator('img[alt="Uploaded 1"]').click();
    const fromInput = await page.locator('.fixed.inset-0.z-50').boundingBox();
    expect(fromInput).toEqual({ x: 0, y: 0, width: 900, height: 800 });
    await page.keyboard.press('Escape');

    // From a card, which must land in exactly the same place.
    await scanButton(page).click();
    await waitForCards(page, 1);
    await page.getByTestId('unsaved-attachments').first().getByRole('button', { name: /View attachment 1/ }).click();
    const fromCard = await page.locator('.fixed.inset-0.z-50').boundingBox();
    expect(fromCard).toEqual(fromInput);
  });

  test('the lightbox is portalled out of the input so nothing can clip it', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'meeting-invite.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });
    await page.locator('img[alt="Uploaded 1"]').click();

    const parentIsBody = await page
      .locator('.fixed.inset-0.z-50')
      .evaluate((node) => node.parentElement === document.body);
    expect(parentIsBody).toBe(true);
  });

  test('the header, the fields and the files all sit on one rhythm', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);
    await scanAnImage(page, 'meeting-invite.png');
    await waitForCards(page, 1);

    const card = page.getByTestId('event-card').first();
    await expect(card.getByTestId('unsaved-attachments')).toBeVisible();

    const measured = await card.evaluate((root) => {
      const ink = (el: Element) => {
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

      const title = root.querySelector('[data-testid="event-card-title"]')!;
      const files = root.querySelector('[data-testid="unsaved-attachments"]')!;
      const wrap = files.parentElement!;
      const rows = (Array.from(wrap.children) as HTMLElement[]).filter(
        (r) => r !== files && isFinite(ink(r).top),
      );
      const lastRow = rows[rows.length - 1];

      return {
        headerGap: ink(rows[0]).top - ink(title).bottom,
        filesGap: files.getBoundingClientRect().top - ink(lastRow).bottom,
        titleLeft: title.getBoundingClientRect().left + parseFloat(getComputedStyle(title).paddingLeft),
        rowLeft: rows[0].getBoundingClientRect().left,
      };
    });

    // Header, fields and files all sit at one gap.
    expect(Math.abs(measured.headerGap - measured.filesGap)).toBeLessThanOrEqual(1.5);
    // And the body lines up under the title, which the checkbox offsets.
    expect(Math.abs(measured.titleLeft - measured.rowLeft)).toBeLessThanOrEqual(1);
  });

  test('no rule under the header once the card is open', async ({ page }) => {
    await mockScanAPI(page, await oneCandidate());
    await setupLocal(page);
    await scanAnImage(page, 'meeting-invite.png');
    await waitForCards(page, 1);

    const body = page.getByTestId('event-card').first().locator('div.bg-gray-50');
    await expect(body).toBeVisible();
    expect(await body.evaluate((n) => getComputedStyle(n).borderTopWidth)).toBe('0px');
  });
});
