import { afterEach, describe, expect, mock, test } from 'bun:test';
import { scan } from '@/services/scanClient';
import { setProviderOperationDependenciesForTests, type ProviderOperationRecord } from '@/services/providerOperation';
import type { ScanResponse } from '@/types/scannerHttp';

const validResponse = {
  source: { sourceId: 'source-1', kind: 'text', contentHandle: 'opaque-1' },
  candidates: [],
  issues: [],
} satisfies ScanResponse;

const operation: ProviderOperationRecord = {
  requestId: '11111111-1111-4111-8111-111111111111', route: '/api/scan', consumerKind: 'scan_text',
  consumerRef: '22222222-2222-4222-8222-222222222222', createdAtMs: 1, transportDeadlineMs: null, state: 'pending',
};

afterEach(() => setProviderOperationDependenciesForTests(undefined));

describe('scan client', () => {
  test('posts exactly one strict request to the scan endpoint and forwards abort signal', async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify(validResponse), { status: 200 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const controller = new AbortController();

    try {
      await expect(scan({ kind: 'text', text: 'Office hours' }, operation, controller.signal)).resolves.toEqual(validResponse);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Event-Every-Request-Id': operation.requestId },
        body: JSON.stringify({ kind: 'text', text: 'Office hours' }),
        signal: controller.signal,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('network ambiguity polls status with the same UUID and never repeats the provider POST', async () => {
    const replay = { source: { sourceId: operation.requestId, kind: 'text' as const, contentHandle: operation.consumerRef }, candidates: [], issues: [] };
    const fetchMock = mock(async (url: RequestInfo | URL, _init?: RequestInit) => {
      if (url === '/api/scan') throw new TypeError('lost response');
      return new Response(JSON.stringify({ status: 'completed', replay }));
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setProviderOperationDependenciesForTests({
      wait: async () => undefined,
      store: { save: async () => undefined, list: async () => [], delete: async () => undefined },
    });
    try {
      await expect(scan({ kind: 'text', text: 'Office hours' }, operation)).resolves.toEqual(replay);
      expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/scan', '/api/provider-status']);
      expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBe(JSON.stringify({ requestId: operation.requestId }));
    } finally { globalThis.fetch = originalFetch; }
  });

  test('rejects a nominal success response that contains an invented field', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ ...validResponse, rawInput: 'secret' }))) as unknown as typeof fetch;
    try {
      await expect(scan({ kind: 'text', text: 'Office hours' }, operation)).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('validates a request before making a browser fetch', async () => {
    const fetchMock = mock(async () => new Response());
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await expect(scan({ kind: 'text', text: '', extra: true } as unknown as Parameters<typeof scan>[0], operation)).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test.each([
    [402, { error: 'Owner budget exhausted.', code: 'owner_budget_exhausted', resetAt: '2026-08-01T00:00:00.000Z' }, 'owner_budget_exhausted', '2026-08-01T00:00:00.000Z'],
    [503, { error: 'Provider request failed.', code: 'provider_rate_limited' }, 'provider_rate_limited', null],
  ] as const)('retains fixed provider information for HTTP %i', async (status, body, code, resetAt) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    try {
      await expect(scan({ kind: 'text', text: 'Office hours' }, operation)).rejects.toMatchObject({
        name: 'ScanClientError',
        status,
        code,
        resetAt,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
