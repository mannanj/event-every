import { describe, expect, test } from 'bun:test';
import { buildScanContextMessage, resolveScanTimeZone } from '../scanContext';

describe('resolveScanTimeZone', () => {
  test('keeps a real IANA zone', () => {
    expect(resolveScanTimeZone('America/New_York')).toBe('America/New_York');
  });

  test('falls back rather than trusting a caller-supplied string', () => {
    for (const bad of [null, undefined, '', '   ', 'Not/AZone', 'x'.repeat(65)]) {
      expect(resolveScanTimeZone(bad)).toBe('UTC');
    }
  });
});

describe('buildScanContextMessage', () => {
  const nowMs = Date.parse('2026-09-16T02:30:00.000Z');

  test('states the date as the reader sees it, not as UTC does', () => {
    // 02:30Z on the 16th is still the evening of the 15th in New York.
    const message = buildScanContextMessage({ nowMs, timeZone: 'America/New_York' });
    expect(message).toContain('The current date is 2026-09-15 (Tuesday).');
    expect(message).toContain('The reader time zone is America/New_York.');

    expect(buildScanContextMessage({ nowMs, timeZone: 'UTC' }))
      .toContain('The current date is 2026-09-16 (Wednesday).');
  });

  test('carries the rules that let an omitted year be derived', () => {
    const message = buildScanContextMessage({ nowMs, timeZone: 'UTC' });
    expect(message).toContain('next');
    expect(message).toContain('weekday');
    expect(message).toContain('Never null a start that the source states.');
    // The context is a frame, not content: it must never become an event itself.
    expect(message).toContain('Never emit a candidate for the current date alone.');
  });
});
