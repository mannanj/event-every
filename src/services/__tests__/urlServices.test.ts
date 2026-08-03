import { describe, expect, mock, test } from 'bun:test';
import { buildEnrichedUrlText, detectURLs, detectUrlsDeterministically } from '@/services/urlDetector';
import { scrapeURLsBatch } from '@/services/webScraper';
import { POST as detectUrlsPost } from '@/app/api/detect-urls/route';
import { NextRequest } from 'next/server';

describe('URL enrichment cancellation', () => {
  test('deterministic detector preserves source order, punctuation, canonicalization, and maximum ten', () => {
    const input = 'See (one.test), then https://two.test/path?x=1. ' + Array.from({ length: 10 }, (_, index) => `https://e${index}.test/x`).join(' ');
    const result = detectUrlsDeterministically(input);
    expect(result.urls).toEqual(['https://one.test/', 'https://two.test/path?x=1', ...Array.from({ length: 8 }, (_, index) => `https://e${index}.test/x`)]);
    expect(result.remainingText).toContain('See (), then .');
    expect(result.hasUrls).toBe(true);
  });

  test('deterministic detector performs no provider call', () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = mock(async () => { calls++; return new Response('{}'); }) as unknown as typeof fetch;
    try {
      expect(detectUrlsDeterministically('Details at https://one.test/event.').urls).toEqual(['https://one.test/event']);
      expect(calls).toBe(0);
    } finally { globalThis.fetch = originalFetch; }
  });

  test('deterministic detector performs no provider call through the route and issues a capability', async () => {
    const originalFetch = globalThis.fetch;
    const originalCapabilityKey = process.env.RESOLVER_CAPABILITY_HMAC;
    let calls = 0;
    globalThis.fetch = mock(async () => { calls++; return new Response('{}'); }) as unknown as typeof fetch;
    process.env.RESOLVER_CAPABILITY_HMAC = 'synthetic-route-capability-key';
    try {
      const response = await detectUrlsPost(new NextRequest('https://event-every.test/api/detect-urls', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-event-every-identity': 'unknown' },
        body: JSON.stringify({ text: 'Details at https://one.test/event.' }),
      }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.urls).toEqual(['https://one.test/event']);
      expect(body.resolverCapability).toMatch(/^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalCapabilityKey === undefined) delete process.env.RESOLVER_CAPABILITY_HMAC;
      else process.env.RESOLVER_CAPABILITY_HMAC = originalCapabilityKey;
    }
  });

  test('resolver concurrency is bounded at two and each attempt carries one stable UUID and capability', async () => {
    const originalFetch = globalThis.fetch;
    let active = 0;
    let maximum = 0;
    const release: Array<() => void> = [];
    const calls: Array<{ requestId: string; capability: string; urls: string[] }> = [];
    globalThis.fetch = mock(async (_input, init) => {
      active++; maximum = Math.max(maximum, active);
      const body = JSON.parse(String(init?.body));
      calls.push({ requestId: body.requestId, capability: body.resolverCapability, urls: body.urls });
      await new Promise<void>((resolve) => release.push(resolve));
      active--;
      return Response.json({ url: body.url, text: 'ok', status: 'success' });
    }) as unknown as typeof fetch;
    try {
      const pending = scrapeURLsBatch(['https://one.test', 'https://two.test', 'https://three.test'], undefined, 'capability-value');
      await Bun.sleep(0);
      expect(maximum).toBe(2);
      expect(calls).toHaveLength(2);
      release.splice(0).forEach((resolve) => resolve());
      await Bun.sleep(0);
      expect(calls).toHaveLength(3);
      release.splice(0).forEach((resolve) => resolve());
      await pending;
      expect(calls.every((call) => /^[0-9a-f-]{36}$/.test(call.requestId))).toBe(true);
      expect(new Set(calls.map((call) => call.requestId)).size).toBe(3);
      expect(calls.every((call) => call.capability === 'capability-value')).toBe(true);
      expect(calls.every((call) => JSON.stringify(call.urls) === JSON.stringify([
        'https://one.test', 'https://two.test', 'https://three.test',
      ]))).toBe(true);
    } finally { release.splice(0).forEach((resolve) => resolve()); globalThis.fetch = originalFetch; }
  });

  test('busy retry preserves one UUID and succeeds on the same authority record', async () => {
    const originalFetch = globalThis.fetch;
    const originalTimeout = globalThis.setTimeout;
    const requestIds: string[] = [];
    let calls = 0;
    globalThis.setTimeout = ((callback: TimerHandler) => { queueMicrotask(callback as () => void); return 1; }) as typeof setTimeout;
    globalThis.fetch = mock(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      requestIds.push(body.requestId);
      calls++;
      return calls === 1
        ? Response.json({ code: 'resolver_busy', retryAfterSeconds: 1 }, { status: 429 })
        : Response.json({ url: body.url, text: 'resolved', status: 'success' });
    }) as unknown as typeof fetch;
    try {
      await expect(scrapeURLsBatch(['https://one.test'], undefined, 'capability-value')).resolves.toMatchObject({ successCount: 1 });
      expect(requestIds).toHaveLength(2);
      expect(new Set(requestIds).size).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.setTimeout = originalTimeout;
    }
  });

  test('already-aborted busy delay rejects immediately', async () => {
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    globalThis.fetch = mock(async () => {
      controller.abort(new DOMException('cancelled before delay', 'AbortError'));
      return Response.json({ code: 'resolver_busy', retryAfterSeconds: 10 }, { status: 429 });
    }) as unknown as typeof fetch;
    try {
      const result = scrapeURLsBatch(['https://one.test'], controller.signal, 'capability-value');
      await expect(Promise.race([
        result,
        Bun.sleep(50).then(() => { throw new Error('busy delay did not abort'); }),
      ])).rejects.toMatchObject({ name: 'AbortError' });
    } finally { globalThis.fetch = originalFetch; }
  });
  test('forwards the active signal to URL detection and scraping', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/detect-urls') {
        return new Response(JSON.stringify({ urls: ['https://example.test/event'], remainingText: 'details', hasUrls: true }));
      }
      return new Response(JSON.stringify({ url: 'https://example.test/event', text: 'Event details', status: 'success' }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const controller = new AbortController();

    try {
      await detectURLs('https://example.test/event', controller.signal);
      await scrapeURLsBatch(['https://example.test/event'], controller.signal);
      const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>;
      expect(calls.map(([, init]) => init.signal)).toEqual([
        controller.signal,
        controller.signal,
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('rethrows an abort instead of turning it into a scrape error record', async () => {
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    const abort = new DOMException('cancelled', 'AbortError');
    globalThis.fetch = mock(async () => { throw abort; }) as unknown as typeof fetch;

    try {
      await expect(scrapeURLsBatch(['https://example.test/event'], controller.signal)).rejects.toBe(abort);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('rethrows a detection abort without converting it to a detection error', async () => {
    const originalFetch = globalThis.fetch;
    const abort = new DOMException('cancelled', 'AbortError');
    globalThis.fetch = mock(async () => { throw abort; }) as unknown as typeof fetch;
    try {
      await expect(detectURLs('https://example.test/event', new AbortController().signal)).rejects.toBe(abort);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('orders normalized detector URLs by their original source occurrences', () => {
    const text = 'First www.one.test then https://two.test/path and done.';
    expect(buildEnrichedUrlText(text, ['https://two.test/path', 'https://www.one.test/'], 'First then and done.', [
      { url: 'https://two.test/path', text: 'Two', status: 'success' },
      { url: 'https://www.one.test/', text: 'One', status: 'success' },
    ])).toBe('First\n\nOriginal Event: https://www.one.test/\nOne\n\nthen\n\nOriginal Event: https://two.test/path\nTwo\n\nand done.');
  });

  test('uses detector prose and keeps bare-host punctuation and duplicate successes distinct', () => {
    expect(buildEnrichedUrlText('See one.test, then one.test.', ['https://one.test/'], 'See , then .', [
      { url: 'https://one.test/', text: 'First success', status: 'success' },
      { url: 'https://one.test/', text: '', status: 'error', error: 'later failure' },
      { url: 'https://one.test/', text: 'Second success', status: 'success' },
    ])).toBe('See\n\nOriginal Event: https://one.test/\nFirst success\n\n, then\n\nOriginal Event: https://one.test/\nSecond success\n\n.');
  });

  test('interleaves a successful URL with a balanced parenthesized path', () => {
    expect(buildEnrichedUrlText('Read https://example.test/wiki/Foo_(bar) then finish.', ['https://example.test/wiki/Foo_(bar)'], 'Read then finish.', [
      { url: 'https://example.test/wiki/Foo_(bar)', text: 'Wiki event', status: 'success' },
    ])).toBe('Read\n\nOriginal Event: https://example.test/wiki/Foo_(bar)\nWiki event\n\nthen finish.');
  });

  test('keeps wrapping parentheses and Markdown brackets as source prose around blocks', () => {
    const result = [{ url: 'https://one.test/', text: 'One', status: 'success' as const }];
    expect(buildEnrichedUrlText('See (https://one.test) now.', ['https://one.test/'], 'See () now.', result)).toBe('See (\n\nOriginal Event: https://one.test/\nOne\n\n) now.');
    expect(buildEnrichedUrlText('[label](https://one.test)', ['https://one.test/'], '[label]()', result)).toBe('[label](\n\nOriginal Event: https://one.test/\nOne\n\n)');
  });
});
