import { Page, Route, expect } from '@playwright/test';

export function buildSSE(events: Record<string, unknown>[], chunkSize = 3): string {
  const chunks: string[] = [];
  for (let i = 0; i < events.length; i += chunkSize) {
    const slice = events.slice(i, i + chunkSize);
    chunks.push(
      `data: ${JSON.stringify({ events: slice, chunkIndex: Math.floor(i / chunkSize), isComplete: false })}\n\n`
    );
  }
  chunks.push(
    `data: ${JSON.stringify({ events: [], chunkIndex: Math.ceil(events.length / chunkSize), isComplete: true })}\n\n`
  );
  return chunks.join('');
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-RateLimit-Limit': '50',
  'X-RateLimit-Remaining': '49',
  'X-RateLimit-Reset': String(Date.now() + 86400000),
};

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

// The 2-3 word Recent-summons label. Re-registering later (per-test) overrides the
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

export async function mockParseAPI(page: Page, events: Record<string, unknown>[]) {
  await page.route('**/api/parse', async (route: Route) => {
    await route.fulfill({ status: 200, headers: SSE_HEADERS, body: buildSSE(events) });
  });
}

// Delays the parse response so the processing card is visible long enough to cancel.
export async function mockParseAPIDelayed(page: Page, events: Record<string, unknown>[], delayMs: number) {
  await page.route('**/api/parse', async (route: Route) => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    try {
      await route.fulfill({ status: 200, headers: SSE_HEADERS, body: buildSSE(events) });
    } catch {
      // request was aborted by the client mid-delay — expected for the cancel test
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

export async function waitForEvents(page: Page, count = 1) {
  await expect(page.locator('h3.font-bold')).toHaveCount(count, { timeout: 20000 });
}

// A tiny valid 1x1 PNG for file-upload tests.
export const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
