import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { ReviewDraft } from '../src/types/review';

const EDITED_TITLE = ['Edited', 'Private', 'Artifact'].join(' ');
const EDITED_LOCATION = ['Edited', 'Private', 'Location'].join(' ');

type ScannerModule = typeof import('@event-every/scanner');
type StoredReviewRecord = Readonly<{
  version: 1;
  id: string;
  exportUid: string;
  createdAt: string;
  candidate: ReviewDraft['candidate'];
  scanIssues: ReviewDraft['scanIssues'];
  source: ReviewDraft['source'];
}>;

// Playwright transforms test modules to CommonJS, so use the repository's established
// runtime-import seam for the ESM Scanner package.
const importScannerModule = new Function(
  'return import("@event-every/scanner")',
) as () => Promise<ScannerModule>;

function loadScannerModule(): Promise<ScannerModule> {
  return importScannerModule();
}

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

type BudgetState = Readonly<{
  status: 'available';
  policyVersion: 'owner-v1';
  authorityDay: string;
  limitNanodollars: number;
  spentNanodollars: number;
  reservedNanodollars: number;
  remainingNanodollars: number;
  exhausted: boolean;
  frozen: boolean;
  resetAt: string;
}>;

async function control(request: APIRequestContext, action: 'state' | 'resume' | 'reset'): Promise<ProviderState> {
  const response = action === 'state'
    ? await request.get(`${BASE_URL}/__private-canary/state`)
    : await request.post(`${BASE_URL}/__private-canary/${action}`);
  expect(response.ok()).toBe(true);
  return action === 'state' ? response.json() : { calls: 0, started: false };
}

async function budget(request: APIRequestContext): Promise<BudgetState> {
  const response = await request.get(`${BASE_URL}/api/usage`);
  expect(response.ok()).toBe(true);
  expect(response.headers()['cache-control']).toBe('no-store');
  return response.json();
}

async function storedReviewDraft(page: Page): Promise<StoredReviewRecord> {
  return page.evaluate(() => {
    const serialized = localStorage.getItem('event-every:review-drafts:v1');
    if (serialized === null) throw new Error('Missing persisted Scanner review draft');
    const records = JSON.parse(serialized) as StoredReviewRecord[];
    if (records.length !== 1 || records[0] === undefined) {
      throw new Error('Expected exactly one persisted Scanner review draft');
    }
    return records[0];
  });
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
  await expect.poll(async () => (await budget(request)).reservedNanodollars).toBe(0);
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

test.afterEach(async ({ page, request }) => {
  await control(request, 'resume');
  await expect.poll(async () => (await budget(request)).reservedNanodollars).toBe(0);
  expect(externalAttempts.get(page) ?? []).toEqual([]);
});

test('private artifact scans once, recovers, edits, reloads, and exports within the owner budget', async ({ page, request }) => {
  const reactErrors = collectReactErrors(page);
  const budgetBefore = await budget(request);
  expect(budgetBefore.reservedNanodollars).toBe(0);
  expect(budgetBefore.frozen).toBe(false);
  const stableBudgetWindowMs = Date.parse(budgetBefore.resetAt) - Date.now();
  expect(Number.isFinite(stableBudgetWindowMs)).toBe(true);
  expect(stableBudgetWindowMs, 'private artifact requires a stable UTC budget day').toBeGreaterThan(120_000);
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
  let review = page.getByRole('region', { name: 'Scanner review drafts' });
  await expect(review.getByRole('textbox', { name: 'Title' })).toHaveValue(RESULT);
  await expect.poll(() => providerOperations(page)).toEqual([]);
  await expect.poll(() => control(request, 'state')).toEqual({ calls: 1, started: true });

  const title = review.getByRole('textbox', { name: 'Title' });
  const location = review.getByRole('textbox', { name: 'Location' });
  const startTime = review.getByRole('textbox', { name: 'Start time' });

  await title.fill(EDITED_TITLE);
  await title.press('Tab');
  await location.fill(EDITED_LOCATION);
  await location.press('Tab');
  await startTime.fill('14:30');
  await startTime.press('Tab');

  await expect.poll(() => page.evaluate(() => {
    const serialized = localStorage.getItem('event-every:review-drafts:v1');
    if (serialized === null) return null;
    const [draft] = JSON.parse(serialized) as StoredReviewRecord[];
    const start = draft?.candidate.temporal.value?.start;
    return {
      title: draft?.candidate.title.value ?? null,
      location: draft?.candidate.location.value ?? null,
      startTime: start && start.kind !== 'date' && start.kind !== 'partial'
        ? { hour: start.time.hour, minute: start.time.minute, second: start.time.second }
        : null,
    };
  })).toEqual({
    title: EDITED_TITLE,
    location: EDITED_LOCATION,
    startTime: { hour: 14, minute: 30, second: 0 },
  });

  const storedDraft = await storedReviewDraft(page);
  const serializedDraft = JSON.stringify(storedDraft);
  for (const marker of [RAW, PROVIDER, SECRET, RESULT]) expect(serializedDraft).not.toContain(marker);

  const { generateIcs } = await loadScannerModule();
  const expectedExport = generateIcs(storedDraft.candidate, {
    uid: storedDraft.exportUid,
    dtstamp: storedDraft.createdAt,
    prodId: '-//Event Every//Scanner//EN',
  });
  if (!expectedExport.ok) throw new Error('Expected edited private draft to remain exportable');

  await page.reload();
  await page.waitForLoadState('networkidle');
  expect(await storedReviewDraft(page)).toEqual(storedDraft);
  review = page.getByRole('region', { name: 'Scanner review drafts' });
  await expect(review.getByRole('textbox', { name: 'Title' })).toHaveValue(EDITED_TITLE);
  await expect(review.getByRole('textbox', { name: 'Location' })).toHaveValue(EDITED_LOCATION);
  await expect(review.getByRole('textbox', { name: 'Start time' })).toHaveValue('14:30');

  const downloadPromise = page.waitForEvent('download');
  await review.getByRole('button', { name: 'Export selected review drafts' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const calendarText = await readFile(downloadPath!, 'utf8');
  expect(calendarText).toBe(expectedExport.calendarText);
  for (const marker of [RAW, PROVIDER, SECRET, RESULT]) expect(calendarText).not.toContain(marker);

  await expect.poll(() => providerOperations(page)).toEqual([]);
  await expect.poll(() => control(request, 'state')).toEqual({ calls: 1, started: true });
  await expect.poll(() => budget(request)).toMatchObject({
    status: 'available',
    policyVersion: 'owner-v1',
    authorityDay: budgetBefore.authorityDay,
    limitNanodollars: budgetBefore.limitNanodollars,
    spentNanodollars: budgetBefore.spentNanodollars + 1,
    reservedNanodollars: 0,
    remainingNanodollars: budgetBefore.remainingNanodollars - 1,
    exhausted: false,
    frozen: false,
    resetAt: budgetBefore.resetAt,
  });
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
  await expect.poll(async () => (await budget(request)).reservedNanodollars).toBe(0);
  assertNoReactErrors(reactErrors);
});
