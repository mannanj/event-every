import { describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const outbound = mock(() => {
  throw new Error('public keep-alive must not construct state');
});

mock.module('@upstash/redis', () => ({ Redis: outbound }));

describe('public keep-alive route', () => {
  test('returns gone without state or outbound work', async () => {
    const source = readFileSync('src/app/api/keep-alive/route.ts', 'utf8');
    expect(source).not.toMatch(/(?:Redis|Upstash|KV_REST|\bfetch\s*\(|from\s+['"]@upstash)/);
    const fetch = mock(() => {
      throw new Error('public keep-alive must not call fetch');
    });
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
      const { GET } = await import('../route');
      const response = await GET();

      expect(response.status).toBe(410);
      expect(await response.text()).toBe('');
      expect(outbound).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
