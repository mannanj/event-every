import { test, expect } from '@playwright/test';
import {
  setupLocal,
  mockParseAPI,
  mockParseAPIDelayed,
  submitText,
  waitForEvents,
  buildSSE,
  TINY_PNG_BASE64,
} from './helpers';

const SINGLE_EVENT = [
  {
    title: 'Coffee with Dana',
    startDate: '2026-07-01T10:00:00',
    endDate: '2026-07-01T11:00:00',
    confidence: 0.9,
    allDay: false,
    timezone: null,
  },
];

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
    await mockParseAPI(page, SINGLE_EVENT);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'flyer.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });
    await expect(page.locator('img[alt="Uploaded 1"]')).toBeVisible({ timeout: 8000 });
    await page.locator('button[aria-label="Transform content to events"]').click();
    await waitForEvents(page, 1);

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
    await mockParseAPI(page, SINGLE_EVENT);
    await submitText(page, 'First summon');
    await waitForEvents(page, 1);
    await expect(page.locator('[data-testid="input-history-button"]')).toBeVisible();
  });

  test('transforming saves the input to history', async ({ page }) => {
    await setupLocal(page);
    await mockParseAPI(page, SINGLE_EVENT);
    await submitText(page, 'Coffee with Dana');
    await waitForEvents(page, 1);

    await page.locator('[data-testid="input-history-button"]').click();
    await expect(page.locator('[data-testid="input-history-modal"]')).toBeVisible();
    const cards = page.locator('[data-testid="input-history-card"]');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Coffee with Dana');
  });

  test('loading an entry (without changing it) never duplicates it in history', async ({ page }) => {
    await setupLocal(page);
    await mockParseAPI(page, SINGLE_EVENT);
    await submitText(page, 'Reusable summon text');
    await waitForEvents(page, 1);

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
    await mockParseAPI(page, SINGLE_EVENT);
    await submitText(page, 'Original text');
    await waitForEvents(page, 1);

    await page.locator('[data-testid="input-history-button"]').click();
    await page.locator('[data-testid="input-history-card"]').first().click();
    const ta = page.locator('[data-testid="smart-input-textarea"]');
    await ta.fill('Original text plus an edit');
    await ta.press('Meta+Enter');

    await page.locator('[data-testid="input-history-button"]').click();
    await expect(page.locator('[data-testid="input-history-card"]')).toHaveCount(2);
  });

  test('clicking a history entry loads it back into the input', async ({ page }) => {
    await setupLocal(page);
    await mockParseAPI(page, SINGLE_EVENT);
    await submitText(page, 'Lunch with Priya');
    await waitForEvents(page, 1);
    await expect(page.locator('[data-testid="smart-input-textarea"]')).toHaveText('');

    await page.locator('[data-testid="input-history-button"]').click();
    await page.locator('[data-testid="input-history-card"]').first().click();
    await expect(page.locator('[data-testid="input-history-modal"]')).toBeHidden();
    await expect(page.locator('[data-testid="smart-input-textarea"]')).toHaveText('Lunch with Priya');
  });

  test('applying history with an unsaved draft auto-saves the draft first', async ({ page }) => {
    await setupLocal(page);
    await mockParseAPI(page, SINGLE_EVENT);
    await submitText(page, 'First input');
    await waitForEvents(page, 1);

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
    await mockParseAPI(page, SINGLE_EVENT);
    await submitText(page, 'scroll lock test');
    await waitForEvents(page, 1);

    await page.locator('[data-testid="input-history-button"]').click();
    await expect(page.locator('[data-testid="input-history-modal"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="input-history-modal"]')).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });

  test('history groups entries into day sections', async ({ page }) => {
    await setupLocal(page);
    await mockParseAPI(page, SINGLE_EVENT);
    await submitText(page, 'Today input');
    await waitForEvents(page, 1);

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

test.describe('Job cancellation', () => {
  test('cancel aborts an in-flight parse and clears the processing card', async ({ page }) => {
    await setupLocal(page);
    await mockParseAPIDelayed(page, SINGLE_EVENT, 6000);
    await submitText(page, 'Some event happening sometime soon');

    const cancelBtn = page.locator('[data-testid="cancel-job-button"]');
    await expect(cancelBtn).toBeVisible({ timeout: 8000 });
    await cancelBtn.click();

    await expect(cancelBtn).toBeHidden({ timeout: 8000 });
    await expect(page.locator('h3.font-bold')).toHaveCount(0);
  });
});

test.describe('Streaming selection', () => {
  test('events that stream in do not reset the user\'s manual selection', async ({ page }) => {
    await setupLocal(page);

    let nextBatch: Record<string, unknown>[] = [
      { title: 'Alpha event', startDate: '2026-07-01T10:00:00', endDate: '2026-07-01T11:00:00', confidence: 0.9, allDay: false, timezone: null },
      { title: 'Beta event', startDate: '2026-07-02T10:00:00', endDate: '2026-07-02T11:00:00', confidence: 0.9, allDay: false, timezone: null },
    ];
    await page.route('**/api/parse', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-RateLimit-Limit': '50',
          'X-RateLimit-Remaining': '49',
          'X-RateLimit-Reset': String(Date.now() + 86400000),
        },
        body: buildSSE(nextBatch),
      });
    });

    await submitText(page, 'first batch of events');
    await waitForEvents(page, 2);

    // Deselect one event mid-session.
    const alpha = page.locator('input[aria-label="Select Alpha event"]');
    await alpha.uncheck();
    await expect(alpha).not.toBeChecked();

    // A new event streams in (appends to the batch).
    nextBatch = [
      { title: 'Gamma event', startDate: '2026-07-03T10:00:00', endDate: '2026-07-03T11:00:00', confidence: 0.9, allDay: false, timezone: null },
    ];
    await submitText(page, 'second batch streams in');
    await waitForEvents(page, 3);

    // Manual deselection must persist; the newly-arrived event defaults to selected.
    await expect(page.locator('input[aria-label="Select Alpha event"]')).not.toBeChecked();
    await expect(page.locator('input[aria-label="Select Gamma event"]')).toBeChecked();
  });
});
