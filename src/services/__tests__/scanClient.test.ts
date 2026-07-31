import { describe, expect, mock, test } from 'bun:test';
import { scan } from '@/services/scanClient';
import type { ScanResponse } from '@/types/scannerHttp';

const validResponse = {
  source: { sourceId: 'source-1', kind: 'text', contentHandle: 'opaque-1' },
  candidates: [],
  issues: [],
} satisfies ScanResponse;

describe('scan client', () => {
  test('posts exactly one strict request to the scan endpoint and forwards abort signal', async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify(validResponse), { status: 200 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const controller = new AbortController();

    try {
      await expect(scan({ kind: 'text', text: 'Office hours' }, controller.signal)).resolves.toEqual(validResponse);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'text', text: 'Office hours' }),
        signal: controller.signal,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('rejects a nominal success response that contains an invented field', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ ...validResponse, rawInput: 'secret' }))) as unknown as typeof fetch;
    try {
      await expect(scan({ kind: 'text', text: 'Office hours' })).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('validates a request before making a browser fetch', async () => {
    const fetchMock = mock(async () => new Response());
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await expect(scan({ kind: 'text', text: '', extra: true } as unknown as Parameters<typeof scan>[0])).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test.each([
    [402, { error: 'limit', code: 'community_limit', resetAt: '2026-08-01T00:00:00.000Z' }, 'community_limit'],
    [429, { error: 'slow down', reset: '2026-08-01T00:00:00.000Z' }, null],
  ] as const)('retains stable limit information for HTTP %i', async (status, body, code) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    try {
      await expect(scan({ kind: 'text', text: 'Office hours' })).rejects.toMatchObject({
        name: 'ScanClientError',
        status,
        code,
        resetAt: '2026-08-01T00:00:00.000Z',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
