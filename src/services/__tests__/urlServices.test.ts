import { describe, expect, mock, test } from 'bun:test';
import { buildEnrichedUrlText, detectURLs } from '@/services/urlDetector';
import { scrapeURLsBatch } from '@/services/webScraper';

describe('URL enrichment cancellation', () => {
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
