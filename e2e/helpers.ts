import { expect, type Download, type Locator, type Page, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ScanRequestSchema } from '../src/types/scanRequest';
import type { ScanResponse } from '../src/types/scannerHttp';

// The retired auth endpoint is fixed anonymous; retain this helper so existing
// E1 setup call sites stay byte-stable while exercising that public contract.
export async function mockAuth(page: Page) {
  await page.route('**/api/auth/check', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authenticated: false }),
    });
  });
  await page.route('**/api/usage', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'available',
        policyVersion: 'owner-v1',
        authorityDay: '2026-08-04',
        limitNanodollars: 5_000_000_000,
        spentNanodollars: 0,
        reservedNanodollars: 0,
        remainingNanodollars: 5_000_000_000,
        exhausted: false,
        frozen: false,
        resetAt: '2026-08-04T00:00:00.000Z',
      }),
    });
  });
}

export async function mockURLDetection(page: Page) {
  await page.route('**/api/detect-urls', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hasUrls: false, urls: [], remainingText: '' }),
    });
  });
}

// Forces the URL-paste→scrape branch ON: detect-urls reports a URL, scrape-url
// returns canned page content. Register AFTER setupLocal so it overrides the
// hasUrls:false default.
export async function mockURLDetectionWithUrls(page: Page, url: string, remainingText = '') {
  await page.route('**/api/detect-urls', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hasUrls: true, urls: [url], remainingText }),
    });
  });
}

export async function mockScrape(page: Page, url: string, title: string, text: string) {
  await page.route('**/api/scrape-url', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, text, title, status: 'success' }),
    });
  });
}

// The 2-3 word Recent label. Re-registering later (per-test) overrides the
// default wired into setupLocal — Playwright matches the most recently added route first.
export async function mockSummarize(page: Page, summary = 'Test Summary') {
  await page.route('**/api/summarize', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary }),
    });
  });
}

// Delays the summary response so the in-flight shimmer is observable before it resolves.
export async function mockSummarizeDelayed(page: Page, summary: string, delayMs: number) {
  await page.route('**/api/summarize', async (route: Route) => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    try {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      });
    } catch {
      // page navigated/closed mid-delay — fine for this test
    }
  });
}

export async function mockScanAPI(page: Page, response: ScanResponse): Promise<void> {
  await page.route('**/api/scan', async (route: Route) => {
    ScanRequestSchema.parse(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

// Deliberately accepts unknown fixture data so rejection of malformed successful
// responses is exercised at the browser's production scan-client boundary.
export async function mockRawScanAPI(page: Page, response: unknown): Promise<void> {
  await page.route('**/api/scan', async (route: Route) => {
    ScanRequestSchema.parse(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

export async function mockScanAPIDelayed(
  page: Page,
  response: ScanResponse,
  delayMs: number,
): Promise<void> {
  await page.route('**/api/scan', async (route: Route) => {
    ScanRequestSchema.parse(route.request().postDataJSON());
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    } catch {
      // The active scan was canceled before the delayed fixture resolved.
    }
  });
}

export async function waitForSmartInputReady(page: Page) {
  await page.waitForSelector('[data-testid="smart-input-textarea"]', { state: 'visible', timeout: 20000 });
  await page.waitForFunction(() => (
    document.querySelector('[data-testid="smart-input-textarea"]')?.getAttribute('contenteditable') === 'true'
  ), undefined, { timeout: 20000 });
}

/**
 * Pre-scan triage (Task 212) runs for real against the dev server when the
 * TypeSafe key is present, and would skip or split the plain test texts. The
 * suite pins it to "unavailable" so every scan behaves as it did before triage;
 * the triage spec overrides this with explicit verdicts.
 */
export async function mockTriage(page: Page, body: unknown = { available: false }) {
  await page.route('**/api/triage', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

export async function setupLocal(page: Page) {
  await mockAuth(page);
  await mockURLDetection(page);
  await mockSummarize(page);
  await mockTriage(page);
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await waitForSmartInputReady(page);
}

export async function submitText(page: Page, text: string) {
  await waitForSmartInputReady(page);
  const textarea = page.locator('[data-testid="smart-input-textarea"]');
  await textarea.fill(text);
  await textarea.press('Meta+Enter');
}

// A tiny valid 1x1 PNG for file-upload tests.
export const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// The submit button. Its label changed with the landing rework and again to
// "Scan it"; every spec goes through here so the next rename is one line.
export const SCAN_BUTTON_NAME = 'Scan - turn your input into events';
export function scanButton(page: Page): Locator {
  return page.getByRole('button', { name: SCAN_BUTTON_NAME });
}

// Scan results render as the ordinary event cards (task 206 put them back).
export function eventCards(page: Page): Locator {
  return page.getByTestId('event-card');
}
export async function waitForCards(page: Page, count: number, timeout = 20000): Promise<void> {
  await expect(eventCards(page)).toHaveCount(count, { timeout });
}
export function cardTitled(page: Page, title: string): Locator {
  return eventCards(page).filter({ has: page.getByTestId('event-card-title').filter({ hasText: title }) });
}

// Unsaved cards persist under this key across a reload; nothing else about a
// scan is stored until the user saves.
export const TEMP_UNSAVED_KEY = 'event_every_temp_unsaved';
export function readTempUnsaved(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), TEMP_UNSAVED_KEY);
}

// "Save (n)" exports the selected cards as one .ics download.
export async function downloadSelectedEvents(page: Page): Promise<Download> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('save-events-button').click(),
  ]);
  return download;
}
export async function downloadedCalendar(page: Page): Promise<string> {
  const download = await downloadSelectedEvents(page);
  const path = await download.path();
  if (path === null) throw new Error('export did not create a download');
  return readFile(path, 'utf8');
}

// Card inline editors: the text is the control until clicked.
export async function setCardTime(card: Locator, currentText: string, value: string): Promise<void> {
  await card.getByText(currentText, { exact: true }).click();
  const input = card.getByTestId('event-card-time-input');
  await input.fill(value);
  await input.press('Enter');
}
export async function setCardDate(card: Locator, currentText: string, value: string): Promise<void> {
  await card.getByText(currentText, { exact: true }).click();
  const input = card.getByTestId('event-card-date-input');
  await input.fill(value);
  await input.press('Enter');
}
