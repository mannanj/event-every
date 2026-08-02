import { Page, Route } from '@playwright/test';
import { ScanRequestSchema } from '../src/types/scanRequest';
import type { ScanResponse } from '../src/types/scannerHttp';

// Auth is a server cookie checked via /api/auth/check; mocking it true keeps the
// pattern lock from blocking the app. (The old localStorage key was a no-op.)
export async function mockAuth(page: Page) {
  await page.route('**/api/auth/check', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authenticated: true }),
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

export async function setupLocal(page: Page) {
  await mockAuth(page);
  await mockURLDetection(page);
  await mockSummarize(page);
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.waitForSelector('[data-testid="smart-input-textarea"]', { state: 'visible', timeout: 20000 });
}

export async function submitText(page: Page, text: string) {
  const textarea = page.locator('[data-testid="smart-input-textarea"]');
  await textarea.fill(text);
  await textarea.press('Meta+Enter');
}

// A tiny valid 1x1 PNG for file-upload tests.
export const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
