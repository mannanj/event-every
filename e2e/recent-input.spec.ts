import { expect, test, type Page } from '@playwright/test';
import type { ScanResponse } from '../src/types/scannerHttp';
import {
  mockScanAPI,
  mockSummarize,
  mockSummarizeDelayed,
  setupLocal,
  submitText,
  TINY_PNG_BASE64,
} from './helpers';

type ScannerModule = typeof import('@event-every/scanner');

const importScannerModule = new Function(
  'return import("@event-every/scanner")',
) as () => Promise<ScannerModule>;

const claim = <Value,>(
  value: Value,
  sourceId: string,
  excerpt = 'Coffee with Dana',
) => ({
  value,
  confidence: 0.9,
  evidence: [{
    sourceId,
    locator: 'body',
    excerpt,
    startOffset: 0,
    endOffset: excerpt.length,
  }],
});

async function scanResponse(kind: 'text' | 'image' = 'text'): Promise<ScanResponse> {
  const { EventCandidateSchema } = await importScannerModule();
  const sourceId = kind === 'image' ? 'source-recent-image-1' : 'source-recent-text-1';
  return {
    source: {
      sourceId,
      kind,
      contentHandle: kind === 'image' ? 'opaque-recent-image-1' : 'opaque-recent-text-1',
    },
    candidates: [EventCandidateSchema.parse({
      candidateId: kind === 'image' ? 'candidate-recent-image-1' : 'candidate-recent-text-1',
      sourceUid: null,
      title: claim('Coffee with Dana', sourceId),
      description: claim(null, sourceId),
      location: claim(null, sourceId),
      url: claim(null, sourceId),
      temporal: claim({
        start: {
          kind: 'floating',
          date: { year: 2026, month: 7, day: 1 },
          time: { hour: 10, minute: 0, second: 0 },
        },
        end: null,
        duration: 'PT1H',
        allDay: false,
      }, sourceId),
      recurrence: claim(null, sourceId),
      issues: [],
    })],
    issues: [],
  };
}

async function waitForReview(page: Page, count = 1): Promise<void> {
  const review = page.getByRole('region', { name: 'Scanner review drafts' });
  await expect(review.getByRole('article')).toHaveCount(count, { timeout: 20000 });
}

test.describe('Input draft persistence', () => {
  test('text draft survives a page reload', async ({ page }) => {
    await setupLocal(page);
    const ta = page.locator('[data-testid="smart-input-textarea"]');
    await ta.fill('My unsaved draft text');
    await page.waitForTimeout(800); // debounce + IndexedDB write
    await page.reload();
    await page.waitForSelector('[data-testid="smart-input-textarea"]', { state: 'visible' });
    await expect(page.locator('[data-testid="smart-input-textarea"]')).toHaveText('My unsaved draft text', {
      timeout: 8000,
    });
  });

  test('an attached image survives a page reload', async ({ page }) => {
    await setupLocal(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'flyer.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });
    await expect(page.locator('img[alt="Uploaded 1"]')).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(800);
    await page.reload();
    await page.waitForSelector('[data-testid="smart-input-textarea"]', { state: 'visible' });
    const restored = page.locator('img[alt="Uploaded 1"]');
    await expect(restored).toBeVisible({ timeout: 8000 });
    await expect(restored).toHaveAttribute('src', /^(blob:|data:)/); // not an empty src
  });

  test('a stored image renders (valid src, not empty) when loaded back from history', async ({ page }) => {
    await setupLocal(page);
    await mockScanAPI(page, await scanResponse('image'));
    await page.locator('input[type="file"]').setInputFiles({
      name: 'flyer.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });
    await expect(page.locator('img[alt="Uploaded 1"]')).toBeVisible({ timeout: 8000 });
    await page.locator('button[aria-label="Transform content to events"]').click();
    await waitForReview(page, 1);

    await page.locator('[data-testid="input-history-button"]').click();
    await page.locator('[data-testid="input-history-card"]').first().click();
    const loaded = page.locator('img[alt="Uploaded 1"]');
    await expect(loaded).toBeVisible({ timeout: 8000 });
    await expect(loaded).toHaveAttribute('src', /^(blob:|data:)/);
  });
});

test.describe('Input history', () => {
  test('the history button is hidden until there is history', async ({ page }) => {
    await setupLocal(page);
    await expect(page.locator('[data-testid="input-history-button"]')).toHaveCount(0);
    await mockScanAPI(page, await scanResponse());
    await submitText(page, 'First summon');
    await waitForReview(page, 1);
    await expect(page.locator('[data-testid="input-history-button"]')).toBeVisible();
  });

  test('transforming saves the input to history', async ({ page }) => {
    await setupLocal(page);
    await mockScanAPI(page, await scanResponse());
    await submitText(page, 'Coffee with Dana');
    await waitForReview(page, 1);

    await page.locator('[data-testid="input-history-button"]').click();
    await expect(page.locator('[data-testid="input-history-modal"]')).toBeVisible();
    const cards = page.locator('[data-testid="input-history-card"]');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Coffee with Dana');
  });

  test('loading an entry (without changing it) never duplicates it in history', async ({ page }) => {
    await setupLocal(page);
    await mockScanAPI(page, await scanResponse());
    await submitText(page, 'Reusable summon text');
    await waitForReview(page, 1);

    await page.locator('[data-testid="input-history-button"]').click();
    await expect(page.locator('[data-testid="input-history-card"]')).toHaveCount(1);

    // Simply loading it back must NOT add a duplicate.
    await page.locator('[data-testid="input-history-card"]').first().click();
    await page.locator('[data-testid="input-history-button"]').click();
    await expect(page.locator('[data-testid="input-history-card"]')).toHaveCount(1);

    // Loading it again, still unchanged, also must not duplicate.
    await page.locator('[data-testid="input-history-card"]').first().click();
    await page.locator('[data-testid="input-history-button"]').click();
    await expect(page.locator('[data-testid="input-history-card"]')).toHaveCount(1);
  });

  test('loading an entry, modifying it, then transforming saves a new entry', async ({ page }) => {
    await setupLocal(page);
    await mockScanAPI(page, await scanResponse());
    await submitText(page, 'Original text');
    await waitForReview(page, 1);

    await page.locator('[data-testid="input-history-button"]').click();
    await page.locator('[data-testid="input-history-card"]').first().click();
    const ta = page.locator('[data-testid="smart-input-textarea"]');
    await ta.fill('Original text plus an edit');
    await ta.press('Meta+Enter');
    await waitForReview(page, 2);

    await page.locator('[data-testid="input-history-button"]').click();
    await expect(page.locator('[data-testid="input-history-card"]')).toHaveCount(2);
  });

  test('clicking a history entry loads it back into the input', async ({ page }) => {
    await setupLocal(page);
    await mockScanAPI(page, await scanResponse());
    await submitText(page, 'Lunch with Priya');
    await waitForReview(page, 1);
    await expect(page.locator('[data-testid="smart-input-textarea"]')).toHaveText('');

    await page.locator('[data-testid="input-history-button"]').click();
    await page.locator('[data-testid="input-history-card"]').first().click();
    await expect(page.locator('[data-testid="input-history-modal"]')).toBeHidden();
    await expect(page.locator('[data-testid="smart-input-textarea"]')).toHaveText('Lunch with Priya');
  });

  test('applying history with an unsaved draft auto-saves the draft first', async ({ page }) => {
    await setupLocal(page);
    await mockScanAPI(page, await scanResponse());
    await submitText(page, 'First input');
    await waitForReview(page, 1);

    // Type an un-transformed draft, then apply an older history entry.
    await page.locator('[data-testid="smart-input-textarea"]').fill('Unsaved scratch note');
    await page.waitForTimeout(800);

    await page.locator('[data-testid="input-history-button"]').click();
    await expect(page.locator('[data-testid="input-history-card"]')).toHaveCount(1);
    await page.locator('[data-testid="input-history-card"]').first().click();
    await expect(page.locator('[data-testid="smart-input-textarea"]')).toHaveText('First input');

    // The unsaved draft should have been auto-saved → now two history entries.
    await page.locator('[data-testid="input-history-button"]').click();
    await expect(page.locator('[data-testid="input-history-card"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="input-history-modal"]')).toContainText('Unsaved scratch note');
  });

  test('the history modal locks background page scroll while open', async ({ page }) => {
    await setupLocal(page);
    await mockScanAPI(page, await scanResponse());
    await submitText(page, 'scroll lock test');
    await waitForReview(page, 1);

    await page.locator('[data-testid="input-history-button"]').click();
    await expect(page.locator('[data-testid="input-history-modal"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="input-history-modal"]')).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });

  test('history groups entries into day sections', async ({ page }) => {
    await setupLocal(page);
    await mockScanAPI(page, await scanResponse());
    await submitText(page, 'Today input');
    await waitForReview(page, 1);

    // Seed an older entry directly into IndexedDB (the DB exists after the first save).
    await page.evaluate(
      (createdAt) =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open('summon-input', 1);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('history', 'readwrite');
            tx.objectStore('history').put({
              id: 'seed-old',
              createdAt,
              text: 'Older input',
              files: [],
              source: 'text',
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        }),
      Date.now() - 3 * 86400000
    );

    await page.reload();
    await page.waitForSelector('[data-testid="smart-input-textarea"]', { state: 'visible' });
    await page.locator('[data-testid="input-history-button"]').click();
    await expect(page.locator('[data-testid="input-history-day"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="input-history-card"]')).toHaveCount(2);
  });
});

test.describe('Recent — summaries', () => {
  test('a 2-3 word summary appears on the card after transform', async ({ page }) => {
    await setupLocal(page);
    await mockSummarize(page, 'Coffee Catchup');
    await mockScanAPI(page, await scanResponse());
    await submitText(page, 'Grab coffee with Dana tomorrow');
    await waitForReview(page, 1);

    await page.locator('[data-testid="input-history-button"]').click();
    await expect(
      page
        .locator('[data-testid="input-history-card"]')
        .first()
        .locator('[data-testid="input-history-summary"]')
    ).toHaveText('Coffee Catchup', { timeout: 10000 });
  });

  test('a shimmer shows while the summary is generating, then it resolves to the label', async ({ page }) => {
    await setupLocal(page);
    await mockSummarizeDelayed(page, 'Slow Label', 2500);
    await mockScanAPI(page, await scanResponse());
    await submitText(page, 'Something to summon');
    await waitForReview(page, 1);

    await page.locator('[data-testid="input-history-button"]').click();
    const card = page.locator('[data-testid="input-history-card"]').first();
    // In-flight: shimmer placeholder, no label yet.
    await expect(card.locator('[data-testid="input-history-summary-pending"]')).toBeVisible({ timeout: 4000 });
    // Resolved: real label, shimmer gone.
    await expect(card.locator('[data-testid="input-history-summary"]')).toHaveText('Slow Label', { timeout: 8000 });
    await expect(card.locator('[data-testid="input-history-summary-pending"]')).toHaveCount(0);
  });
});

test.describe('Recent — search', () => {
  test('search filters entries and clearing restores all', async ({ page }) => {
    await setupLocal(page);
    await mockScanAPI(page, await scanResponse());
    await submitText(page, 'Alpha planning meeting');
    await waitForReview(page, 1);
    await submitText(page, 'Beta workshop offsite');
    await waitForReview(page, 2);

    await page.locator('[data-testid="input-history-button"]').click();
    await expect(page.locator('[data-testid="input-history-card"]')).toHaveCount(2);

    const search = page.locator('[data-testid="input-history-search"]');
    await search.fill('alpha');
    const cards = page.locator('[data-testid="input-history-card"]');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Alpha planning meeting');

    await search.fill('');
    await expect(page.locator('[data-testid="input-history-card"]')).toHaveCount(2);
  });

  test('search matches on the generated summary, not just the input text', async ({ page }) => {
    await setupLocal(page);
    await mockSummarize(page, 'Birthday Party');
    await mockScanAPI(page, await scanResponse());
    await submitText(page, 'zzz unrelated input text');
    await waitForReview(page, 1);

    await page.locator('[data-testid="input-history-button"]').click();
    // Wait for the summary to attach to the card before searching by it.
    await expect(
      page
        .locator('[data-testid="input-history-card"]')
        .first()
        .locator('[data-testid="input-history-summary"]')
    ).toHaveText('Birthday Party', { timeout: 10000 });

    // 'birthday' is absent from the input text — a match proves the summary is searchable.
    await page.locator('[data-testid="input-history-search"]').fill('birthday');
    await expect(page.locator('[data-testid="input-history-card"]')).toHaveCount(1);

    // A query matching neither text nor summary shows the no-results state.
    await page.locator('[data-testid="input-history-search"]').fill('qqqqzz');
    await expect(page.locator('[data-testid="input-history-no-results"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-history-card"]')).toHaveCount(0);
  });
});
