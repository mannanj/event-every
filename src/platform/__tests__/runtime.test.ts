import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { recordClosedEvent } from '@/platform/logger';

const cloudflare = { env: {} as Record<string, unknown> };
mock.module('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: cloudflare.env }) }));
const { getPlatformRuntime, setPlatformRuntimeForTests } = await import('@/platform/runtime');

afterEach(() => setPlatformRuntimeForTests(undefined));
beforeEach(() => { cloudflare.env = {}; });

const deleted = [
  'src/platform/legacy/provider.ts',
  'src/platform/legacy/usage.ts',
  'src/platform/legacy/waitlist.ts',
  'src/platform/legacy/index.ts',
  'src/lib/budget.ts',
  'src/lib/limits.ts',
  'src/lib/llm.ts',
  'src/lib/ratelimit.ts',
  'src/lib/redisClient.ts',
  'src/app/api/waitlist/route.ts',
] as const;

describe('Cloudflare-only platform runtime', () => {
  test('has one no-argument accessor and returns the exact injected authority seam', () => {
    const runProviderOperation = mock(async () => ({ status: 'unavailable' as const }));
    const providerRequestStatus = mock(async () => ({ status: 'not-found' as const }));
    const ownerBudgetStatus = mock(async () => ({ status: 'day-mismatch' as const }));
    const shapeKeys = mock(() => ({ current: { version: 'test-v1', key: 'synthetic' } }));
    setPlatformRuntimeForTests({ runProviderOperation, providerRequestStatus, ownerBudgetStatus, shapeKeys });

    expect(getPlatformRuntime.length).toBe(0);
    expect(getPlatformRuntime()).toEqual({ runProviderOperation, providerRequestStatus, ownerBudgetStatus, shapeKeys });
  });

  test('has no runtime authority-mode fallback or legacy selector', () => {
    const source = readFileSync('src/platform/runtime.ts', 'utf8');
    expect(source).not.toMatch(/STATE_AUTHORITY_MODE|process\.env|getProviderPort|getUsagePort|getWaitlistPort/);
    expect(source).not.toMatch(/platform\/legacy|lib\/(?:budget|limits|llm|ratelimit|redisClient)/);
    expect(source).toContain('getCloudflareContext');
  });

  test('derives the request authority name and invokes only read-only status', async () => {
    const status = mock(async () => ({ status: 'not-found' as const }));
    const forbidden = {
      begin: mock(() => { throw new Error('begin forbidden'); }),
      reserve: mock(() => { throw new Error('reserve forbidden'); }),
      commit: mock(() => { throw new Error('commit forbidden'); }),
      release: mock(() => { throw new Error('release forbidden'); }),
      settle: mock(() => { throw new Error('settle forbidden'); }),
      claimTransport: mock(() => { throw new Error('claim forbidden'); }),
    };
    const get = mock(() => ({ status, ...forbidden }));
    const idFromName = mock((name: string) => name);
    cloudflare.env = { PROVIDER_REQUEST_AUTHORITY: { idFromName, get } };

    const requestId = '11111111-1111-4111-8111-111111111111';
    const bytes = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`event-every/provider-request/v1\0${requestId}`),
    );
    const expectedName = Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
    expect(await getPlatformRuntime().providerRequestStatus(requestId)).toEqual({ status: 'not-found' });
    expect(idFromName).toHaveBeenCalledWith(expectedName);
    expect(get).toHaveBeenCalledWith(expectedName);
    expect(status).toHaveBeenCalledWith({});
    expect(Object.values(forbidden).every((value) => value.mock.calls.length === 0)).toBe(true);
  });

  test('uses only the current-day budget status RPC', async () => {
    const status = mock(async (_input: { authorityDay: string }) => ({ status: 'day-mismatch' as const }));
    const get = mock(() => ({ status }));
    const idFromName = mock((name: string) => name);
    cloudflare.env = { OWNER_BUDGET_AUTHORITY: { idFromName, get } };
    expect(await getPlatformRuntime().ownerBudgetStatus('2026-08-13')).toEqual({ status: 'day-mismatch' });
    expect(idFromName).toHaveBeenCalledWith('2026-08-13');
    expect(get).toHaveBeenCalledWith('2026-08-13');
    expect(status).toHaveBeenCalledWith({ authorityDay: '2026-08-13' });
  });

  test('provider routes reach neither legacy dispatch nor a second provider fetch', () => {
    for (const route of ['scan', 'resolve-timezone', 'summarize']) {
      const source = readFileSync(`src/app/api/${route}/route.ts`, 'utf8');
      expect(source).not.toMatch(/platform\/legacy|legacy\/dispatch|lib\/(?:budget|limits|llm|ratelimit|redisClient)/);
      expect(source).not.toMatch(/OPENROUTER_(?:BASE_URL|SUMMARY_MODEL|TZ_MODEL)|fetch\s*\(/);
    }
    expect(readFileSync('src/platform/provider/transport.ts', 'utf8')).toContain('fetcher(OWNER_PROVIDER_URL');
  });

  test('accepts only the dedicated owner key with no API-key fallback', () => {
    const source = readFileSync('src/platform/cloudflare-context.ts', 'utf8');
    expect(source).toContain('OPENROUTER_OWNER_KEY');
    expect(source).not.toContain('OPENROUTER_API_KEY');
  });

  test('deletes the product-reachable legacy stack and Upstash dependency', () => {
    for (const path of deleted) expect(existsSync(path), path).toBe(false);
    expect(existsSync('src/platform/legacy/dispatch.ts')).toBe(true);
    const packageJson = readFileSync('package.json', 'utf8');
    const lock = readFileSync('bun.lock', 'utf8');
    expect(packageJson).not.toMatch(/@upstash\/redis/);
    expect(lock).not.toMatch(/@upstash\/redis/);
  });

  test('app Worker has no Upstash or scheduled capability', () => {
    const source = readFileSync('cloudflare/app-worker.ts', 'utf8');
    const config = readFileSync('wrangler.jsonc', 'utf8');
    expect(source).not.toMatch(/scheduled|KV_REST|upstash/i);
    expect(config).not.toMatch(/KV_REST|upstash/i);
  });
});

if (false) {
  recordClosedEvent('deferred_work_failed');
  recordClosedEvent({ code: 'legacy_provider_unavailable', id: 'opaque-id', route: 'scan', phase: 'dispatch', statusClass: 5, retryable: true, durationBucket: 'under_1s', outcome: 'unavailable' });
  // @ts-expect-error arbitrary event names are not part of the closed API
  recordClosedEvent('customer_email_received');
  // @ts-expect-error headers are forbidden logger fields
  recordClosedEvent({ code: 'deferred_work_failed', headers: new Headers() });
  // @ts-expect-error bodies are forbidden logger fields
  recordClosedEvent({ code: 'deferred_work_failed', body: 'raw body' });
  // @ts-expect-error native errors cannot cross the logger API
  recordClosedEvent(new Error('native failure'));
}
