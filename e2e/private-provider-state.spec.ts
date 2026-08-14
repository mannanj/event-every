import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Build canary values at runtime so Playwright's transform cache does not itself
// become a false-positive generated artifact containing the forbidden values.
const RAW = ['raw-only', 'marker-2f84d1'].join('-');
const PROVIDER = ['provider-envelope', 'marker-91cb30'].join('-');
const SECRET = ['private-secret', 'marker-7e13f0'].join('-');
const RESULT = ['Documented', 'Result'].join(' ');
const BASE_URL = 'http://127.0.0.1:8789';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ALLOWED_FIELDS = ['consumerKind', 'consumerRef', 'createdAtMs', 'requestId', 'route', 'state', 'transportDeadlineMs'];
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const externalAttempts = new WeakMap<Page, string[]>();

type ProviderState = Readonly<{ calls: number; started: boolean }>;

async function control(request: APIRequestContext, action: 'state' | 'resume' | 'reset'): Promise<ProviderState> {
  const response = action === 'state'
    ? await request.get(`${BASE_URL}/__private-canary/state`)
    : await request.post(`${BASE_URL}/__private-canary/${action}`);
  expect(response.ok()).toBe(true);
  return action === 'state' ? response.json() : { calls: 0, started: false };
}

async function providerOperations(page: Page): Promise<unknown[]> {
  return page.evaluate(async () => new Promise<unknown[]>((resolve, reject) => {
    const opened = indexedDB.open('summon-input', 2);
    opened.onerror = () => reject(opened.error);
    opened.onsuccess = () => {
      const transaction = opened.result.transaction('provider-operations', 'readonly');
      const get = transaction.objectStore('provider-operations').getAll();
      get.onerror = () => reject(get.error);
      get.onsuccess = () => resolve(get.result);
    };
  }));
}

async function installPostOrderingProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    Object.defineProperty(window, '__privateRecordBeforePost', { value: null, writable: true, configurable: true });
    Object.defineProperty(window, '__privateStatusObservations', { value: [], writable: false, configurable: true });
    const observedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const pathname = new URL(target, location.href).pathname;
      if (pathname === '/api/scan' && init?.method === 'POST') {
        const records = await new Promise<unknown[]>((resolve) => {
          const opened = indexedDB.open('summon-input', 2);
          opened.onerror = () => resolve([]);
          opened.onsuccess = () => {
            const get = opened.result.transaction('provider-operations', 'readonly').objectStore('provider-operations').getAll();
            get.onerror = () => resolve([]); get.onsuccess = () => resolve(get.result);
          };
        });
        (window as typeof window & { __privateRecordBeforePost: unknown }).__privateRecordBeforePost = records;
      }
      const response = await nativeFetch(input, init);
      if (pathname === '/api/provider-status' && init?.method === 'POST') {
        let body: Record<string, unknown> = {};
        try { body = await response.clone().json() as Record<string, unknown>; } catch { /* asserted below */ }
        let requestId: unknown;
        try { requestId = JSON.parse(String(init.body)).requestId; } catch { requestId = null; }
        (window as typeof window & { __privateStatusObservations: unknown[] }).__privateStatusObservations.push({
          requestId,
          responseStatus: response.status,
          status: body.status ?? null,
          code: body.code ?? null,
        });
      }
      return response;
    };
    Object.defineProperty(window, 'fetch', { value: observedFetch, configurable: true, writable: true });
  });
}

async function statusObservations(page: Page): Promise<unknown[]> {
  return page.evaluate(() => (window as typeof window & { __privateStatusObservations: unknown[] }).__privateStatusObservations);
}

function collectReactErrors(page: Page): string[] {
  const messages: string[] = [];
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') messages.push(message.text()); });
  return messages;
}

function assertNoReactErrors(messages: readonly string[]): void {
  const forbidden = /Hydration failed|didn't match the client|did not match|React error boundary|invalid(?: HTML)? nesting|validateDOMNesting/i;
  expect(messages.filter((message) => forbidden.test(message))).toEqual([]);
  for (const marker of [RAW, PROVIDER, SECRET, RESULT]) expect(messages.join('\n')).not.toContain(marker);
}

test.beforeEach(async ({ page, request }) => {
  expect((globalThis as typeof globalThis & { __PRIVATE_OFFLINE_GUARD__?: boolean }).__PRIVATE_OFFLINE_GUARD__).toBe(true);
  await control(request, 'reset');
  const attempts: string[] = []; externalAttempts.set(page, attempts);
  await page.route('**/*', async (route) => {
    const url = route.request().url(); const host = new URL(url).hostname;
    if (LOOPBACK.has(host)) await route.continue();
    else { attempts.push(url); await route.abort('blockedbyclient'); }
  });
  await page.routeWebSocket('**/*', async (socket) => {
    const url = socket.url(); const host = new URL(url).hostname;
    if (LOOPBACK.has(host)) socket.connectToServer();
    else { attempts.push(url); await socket.close({ code: 1008, reason: 'offline canary' }); }
  });
  await installPostOrderingProbe(page);
});

test.afterEach(async ({ page }) => {
  expect(externalAttempts.get(page) ?? []).toEqual([]);
});

test('reload recovers the original private provider UUID and deletes its content-free record', async ({ page, request }) => {
  const reactErrors = collectReactErrors(page);
  await page.goto('/');
  const editor = page.getByTestId('smart-input-textarea');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.fill(`Planning notes ${RAW}`);
  await editor.press('Meta+Enter');

  await expect.poll(() => control(request, 'state')).toEqual({ calls: 1, started: true });
  const beforePost = await page.evaluate(() => (window as typeof window & { __privateRecordBeforePost: unknown }).__privateRecordBeforePost);
  expect(Array.isArray(beforePost) && beforePost).toHaveLength(1);
  const records = await providerOperations(page);
  expect(records).toHaveLength(1);
  const record = records[0] as Record<string, unknown>;
  expect(Object.keys(record).sort()).toEqual(ALLOWED_FIELDS);
  expect(record.requestId).toMatch(UUID); expect(record.consumerRef).toMatch(UUID);
  const serialized = JSON.stringify(record);
  for (const marker of [RAW, PROVIDER, SECRET, RESULT]) expect(serialized).not.toContain(marker);
  const originalRequestId = record.requestId;

  await page.reload();
  await expect(page.getByTestId('provider-operation-recovery')).toBeVisible();
  const restored = await providerOperations(page);
  expect((restored[0] as Record<string, unknown>).requestId).toBe(originalRequestId);
  await control(request, 'resume');

  await expect.poll(() => statusObservations(page)).toContainEqual({
    requestId: originalRequestId,
    responseStatus: 200,
    status: 'completed',
    code: null,
  });
  const review = page.getByRole('region', { name: 'Scanner review drafts' });
  await expect(review.getByRole('textbox', { name: 'Title' })).toHaveValue(RESULT);
  await expect.poll(() => providerOperations(page)).toEqual([]);
  await expect.poll(() => control(request, 'state')).toEqual({ calls: 1, started: true });
  assertNoReactErrors(reactErrors);
});

test('explicit Cancel removes the pending record without a replacement transport', async ({ page, request }) => {
  const reactErrors = collectReactErrors(page);
  await page.goto('/');
  const editor = page.getByTestId('smart-input-textarea');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.fill(`Cancel notes ${RAW}`);
  await editor.press('Meta+Enter');
  await expect.poll(() => control(request, 'state')).toEqual({ calls: 1, started: true });
  await expect(page.getByRole('button', { name: 'Cancel pending request' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel pending request' }).click();
  await expect.poll(() => providerOperations(page)).toEqual([]);
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await control(request, 'resume');
  await expect.poll(() => control(request, 'state')).toEqual({ calls: 1, started: true });
  assertNoReactErrors(reactErrors);
});
