import { expect, test, type Page, type Route } from '@playwright/test';

const scannerClaim = <Value>(value: Value) => ({ value, confidence: null, evidence: [] });

const recoveredScanResponse = {
  source: { sourceId: 'recovered-source-1', kind: 'text', contentHandle: 'opaque-recovered-source-1' },
  candidates: [{
    candidateId: 'recovered-candidate-1',
    sourceUid: null,
    title: scannerClaim('Recovered Scanner draft'),
    description: scannerClaim(null),
    location: scannerClaim(null),
    url: scannerClaim(null),
    temporal: scannerClaim({
      start: { kind: 'floating', date: { year: 2026, month: 8, day: 4 }, time: { hour: 12, minute: 0, second: 0 } },
      end: null,
      duration: 'PT1H',
      allDay: false,
    }),
    recurrence: scannerClaim(null),
    issues: [],
  }],
  issues: [],
};

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function requestFromPage(page: Page, method: 'GET' | 'POST', requestPath: string, data?: unknown) {
  const response = page.waitForResponse((candidate) => {
    return candidate.request().method() === method && new URL(candidate.url()).pathname === requestPath;
  });
  await page.evaluate(async ({ requestMethod, path, body }) => {
    const init: RequestInit = { method: requestMethod };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const result = await fetch(path, init);
    await result.arrayBuffer();
  }, { requestMethod: method, path: requestPath, body: data });
  return response;
}

test('owner budget exhaustion exposes no pattern or admin bypass', async ({ page }) => {
  await page.route('**/api/usage', (route) => fulfillJson(route, {
    status: 'available', policyVersion: 'owner-v1', authorityDay: '2026-08-13',
    limitNanodollars: 5_000_000_000, spentNanodollars: 5_000_000_000,
    reservedNanodollars: 0, remainingNanodollars: 0, exhausted: true, frozen: false,
    resetAt: '2026-08-14T00:00:00.000Z',
  }));
  await page.goto('/');

  await expect(page.getByTestId('owner-budget-screen')).toBeVisible();
  await expect(page.getByTestId('enter-pattern-link')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Draw Pattern to Unlock' })).toHaveCount(0);

  const verify = await requestFromPage(page, 'POST', '/api/auth/verify', { pattern: [0, 3, 6, 7, 8] });
  expect(verify.status()).toBe(410);
  const check = await requestFromPage(page, 'GET', '/api/auth/check');
  expect(await check.json()).toEqual({ authenticated: false });
  const logout = await requestFromPage(page, 'POST', '/api/auth/logout');
  expect(logout.status()).toBe(200);
  expect((await logout.allHeaders())['set-cookie']).toBeUndefined();

  await page.goto('/?unlock');
  await expect(page.getByRole('heading', { name: 'Draw Pattern to Unlock' })).toHaveCount(0);
  await expect(page.getByTestId('owner-budget-screen')).toBeVisible();
  await expect(page.getByTestId('input-box')).toHaveCount(0);
});

test('corrupt Scanner review storage recovers and persists the next scan', async ({ page }) => {
  const legacyRecent = JSON.stringify([{ id: 'legacy-recent-1', input: 'keep Recent input' }]);
  await page.route('**/api/auth/check', (route) => fulfillJson(route, { authenticated: false }));
  await page.route('**/api/usage', (route) => fulfillJson(route, {
    status: 'available', policyVersion: 'owner-v1', authorityDay: '2026-08-13',
    limitNanodollars: 5_000_000_000, spentNanodollars: 0, reservedNanodollars: 0,
    remainingNanodollars: 5_000_000_000, exhausted: false, frozen: false,
    resetAt: '2026-08-14T00:00:00.000Z',
  }));
  await page.route('**/api/detect-urls', (route) => fulfillJson(route, { hasUrls: false, urls: [], remainingText: '' }));
  await page.route('**/api/summarize', (route) => fulfillJson(route, { summary: 'Recovered draft' }));
  await page.route('**/api/scan', (route) => fulfillJson(route, recoveredScanResponse));
  await page.addInitScript(({ marker, recent }) => {
    if (sessionStorage.getItem(marker) === null) {
      sessionStorage.setItem(marker, 'seeded');
      localStorage.setItem('event-every:review-drafts:v1', '{corrupt Scanner review storage');
      localStorage.setItem('event_every_history', recent);
    }
  }, { marker: 'event-every:test:corrupt-review-seeded', recent: legacyRecent });

  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('input-box')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('event-every:review-drafts:v1'))).toBeNull();
  await expect(page.getByTestId('review-storage-recovery-notice')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Scanner review drafts' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('event_every_history'))).toBe(legacyRecent);

  const textarea = page.getByTestId('smart-input-textarea');
  await textarea.fill('Synthetic intercepted recovery scan.');
  await textarea.press('Meta+Enter');
  const review = page.getByRole('region', { name: 'Scanner review drafts' });
  await expect(review.getByRole('textbox', { name: 'Title' })).toHaveValue('Recovered Scanner draft');
  await expect(review.getByRole('button', { name: 'Export selected review drafts' })).toBeEnabled();
  await expect.poll(async () => page.evaluate(() => {
    const serialized = localStorage.getItem('event-every:review-drafts:v1');
    return serialized === null ? null : JSON.parse(serialized);
  })).not.toBeNull();
  const storedBeforeReload = await page.evaluate(() => JSON.parse(localStorage.getItem('event-every:review-drafts:v1')!));
  expect(await page.evaluate(() => localStorage.getItem('event_every_history'))).toBe(legacyRecent);

  await page.reload();
  await expect(page.getByTestId('review-storage-recovery-notice')).toHaveCount(0);
  await expect(review.getByRole('textbox', { name: 'Title' })).toHaveValue('Recovered Scanner draft');
  await expect(review.getByRole('button', { name: 'Export selected review drafts' })).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('event-every:review-drafts:v1')!))).toEqual(storedBeforeReload);
  expect(await page.evaluate(() => localStorage.getItem('event_every_history'))).toBe(legacyRecent);
});

test('draft reload hydrates without React errors', async ({ page }) => {
  const reactMessages: string[] = [];
  page.on('pageerror', (error) => reactMessages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') reactMessages.push(message.text());
  });
  await page.addInitScript(() => {
    const snapshots: Array<{ text: string; editable: string | null }> = [];
    Object.defineProperty(window, '__c1InitialSmartInput', { value: snapshots, configurable: true });
    const capture = () => {
      if (snapshots.length) return;
      const editor = document.querySelector('[data-testid="smart-input-textarea"]');
      if (editor) snapshots.push({ text: editor.textContent ?? '', editable: editor.getAttribute('contenteditable') });
    };
    new MutationObserver(capture).observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', capture, { once: true });
  });
  await page.route('**/api/usage', (route) => fulfillJson(route, {
    status: 'available', policyVersion: 'owner-v1', authorityDay: '2026-08-13',
    limitNanodollars: 5_000_000_000, spentNanodollars: 0, reservedNanodollars: 0,
    remainingNanodollars: 5_000_000_000, exhausted: false, frozen: false,
    resetAt: '2026-08-14T00:00:00.000Z',
  }));

  await page.goto('/');
  const editor = page.getByTestId('smart-input-textarea');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  expect(await page.evaluate(() => (window as typeof window & { __c1InitialSmartInput: unknown }).__c1InitialSmartInput))
    .toEqual([{ text: '', editable: 'false' }]);

  await editor.fill('Lunch with Priya');
  await expect.poll(() => page.evaluate(async () => new Promise<string | null>((resolve) => {
    const opened = indexedDB.open('summon-input', 2);
    opened.onerror = () => resolve(null);
    opened.onsuccess = () => {
      const request = opened.result.transaction('draft', 'readonly').objectStore('draft').get('current');
      request.onerror = () => resolve(null);
      request.onsuccess = () => resolve(typeof request.result?.text === 'string' ? request.result.text : null);
    };
  }))).toBe('Lunch with Priya');

  await page.reload();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __c1InitialSmartInput: unknown[] }
  ).__c1InitialSmartInput.length)).toBe(1);
  expect(await page.evaluate(() => (window as typeof window & { __c1InitialSmartInput: unknown }).__c1InitialSmartInput))
    .toEqual([{ text: '', editable: 'false' }]);
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await expect(editor).toHaveText('Lunch with Priya');

  const forbidden = /Hydration failed|didn't match the client|did not match|React error boundary|invalid(?: HTML)? nesting|validateDOMNesting/i;
  expect(reactMessages.filter((message) => forbidden.test(message))).toEqual([]);
});
