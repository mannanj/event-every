import { describe, expect, test } from 'bun:test';
import { sanitizeResolvedContent, truncateUtf8 } from '../html-to-text';

const bytes = (value: string) => new TextEncoder().encode(value).byteLength;

describe('deterministic resolver sanitization', () => {
  test('removes active/non-content markup, decodes entities, and tolerates malformed HTML', () => {
    expect(sanitizeResolvedContent('<title>A &amp; B</title><body>Hello&nbsp;<b>world<script>bad()</script><style>x</style><!--c--> tail'))
      .toEqual({ title: 'A & B', text: 'Hello world tail' });
  });

  test('sanitized text is capped at 100000 UTF-8 bytes', () => {
    const result = sanitizeResolvedContent(`<title>${'😀'.repeat(200)}</title><body>${'界'.repeat(40_000)}</body>`);
    expect(bytes(result.text)).toBeLessThanOrEqual(100_000);
    expect(result.text.endsWith('\ud83d')).toBe(false);
  });

  test('sanitized title is capped at 512 UTF-8 bytes', () => {
    const result = sanitizeResolvedContent(`<title>${'😀'.repeat(200)}</title><body>details</body>`);
    expect(bytes(result.title ?? '')).toBe(512);
    expect(result.title?.endsWith('\ud83d')).toBe(false);
  });

  test('truncateUtf8 preserves exact ASCII and multibyte ceilings without splitting code points', () => {
    expect(truncateUtf8('a'.repeat(100_000), 100_000)).toHaveLength(100_000);
    expect(truncateUtf8(`${'a'.repeat(99_999)}é`, 100_000)).toBe('a'.repeat(99_999));
    expect(truncateUtf8('é界😀e\u0301', 9)).toBe('é界😀');
    expect(bytes(truncateUtf8('😀'.repeat(200), 512))).toBe(512);
  });
});
