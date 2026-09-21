import { describe, expect, test } from 'bun:test';

import { IntakeError, decodeBase64, encodeBase64, fetchImageAsDataUrl, fetchPageText } from '@/server/mcp/intake';

/**
 * Fetching what an assistant pointed at.
 *
 * "Retrieve whatever this says" inside a Worker that sits beside the account
 * database is the server-side request forgery shape, and a model choosing the
 * URL makes it EASIER to arrange rather than safer - a model can be talked into
 * passing one. These check that the refusals hold, which is the half that
 * matters; the happy path needs a network and belongs in the live run.
 */

const never = new AbortController().signal;

describe('addresses that must be refused', () => {
  const refused = [
    ['loopback by name', 'http://localhost/poster.png'],
    ['loopback by address', 'http://127.0.0.1/poster.png'],
    ['IPv6 loopback', 'http://[::1]/poster.png'],
    ['private class A', 'http://10.0.0.1/poster.png'],
    ['private class B', 'http://172.16.0.1/poster.png'],
    ['private class C', 'http://192.168.1.1/poster.png'],
    ['link-local, the cloud metadata address', 'http://169.254.169.254/latest/meta-data/'],
    ['a scheme that is not http', 'file:///etc/passwd'],
    ['another one', 'gopher://example.com/'],
    ['nonsense', 'not a url at all'],
  ] as const;

  for (const [what, url] of refused) {
    test(`an image at ${what} is refused`, async () => {
      await expect(fetchImageAsDataUrl(url, never)).rejects.toBeInstanceOf(IntakeError);
    });

    test(`a page at ${what} is refused`, async () => {
      await expect(fetchPageText(url, never)).rejects.toBeInstanceOf(IntakeError);
    });
  }

  test('the refusal never says which check failed', async () => {
    // Uniform on purpose. "That host is private" is a probe result; whether an
    // internal name resolves is not something to hand back.
    const messages = new Set<string>();
    for (const [, url] of refused.slice(0, 7)) {
      await fetchImageAsDataUrl(url, never).catch((error: Error) => messages.add(error.message));
    }
    expect(messages.size).toBe(1);
  });
});

describe('base64', () => {
  test('round-trips bytes unchanged', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    const back = decodeBase64(encodeBase64(bytes));
    expect(Array.from(back!)).toEqual(Array.from(bytes));
  });

  test('handles more than one chunk', () => {
    // 8192 is the chunking boundary, and the reason it is chunked at all:
    // spreading a multi-megabyte array into fromCharCode throws.
    const bytes = new Uint8Array(20_000).map((_, at) => at % 256);
    const back = decodeBase64(encodeBase64(bytes));
    expect(back?.byteLength).toBe(20_000);
    expect(back?.[19_999]).toBe(19_999 % 256);
  });

  test('nonsense decodes to null rather than throwing', () => {
    expect(decodeBase64('not base64 !!!')).toBeNull();
  });
});
