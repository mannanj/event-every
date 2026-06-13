// Unit tests for the single URL authority (plans/012). Includes the interior-space
// regression test that proves the normalizeUrl whitespace-strip bug is fixed.
import { describe, expect, test } from 'bun:test';
import {
  getUrlDisplayParts,
  normalizeUrl,
  safeParseUrl,
} from '@/utils/url';

describe('normalizeUrl', () => {
  // Regression: the old regex led with \s and stripped ALL interior whitespace, silently
  // corrupting 'https://example.com/my event' into '.../myevent'. The fix strips only
  // zero-width junk and lets new URL() percent-encode a real space to %20.
  test('preserves an interior space as %20 (does NOT delete it)', () => {
    const result = normalizeUrl('https://example.com/my event');
    expect(result).toBeDefined();
    expect(result).toContain('%20');
    expect(result).not.toBe('https://example.com/myevent');
    expect(result).toBe('https://example.com/my%20event');
  });

  test('strips zero-width junk (ZWSP/BOM) but keeps the rest of the path', () => {
    // U+200B (ZWSP) then U+FEFF (BOM) embedded before "path".
    const result = normalizeUrl('https://example.com/​﻿path');
    expect(result).toBe('https://example.com/path');
    expect(result).not.toContain('%E2%80%8B'); // no encoded ZWSP leaked through
    expect(result).not.toContain('​');
    expect(result).not.toContain('﻿');
  });

  test('prefixes a bare host with https://', () => {
    const result = normalizeUrl('example.com/event');
    expect(result).toBeDefined();
    expect(result!.startsWith('https://example.com/event')).toBe(true);
  });

  test('returns undefined for a dotless host (host guard still holds after the fix)', () => {
    // After the space fix, 'not a url with no dot' -> 'https://not a url with no dot';
    // the parsed hostname ('not') has no dot and is not localhost -> undefined.
    expect(normalizeUrl('not a url with no dot')).toBeUndefined();
  });

  test('returns undefined for empty / null / undefined', () => {
    expect(normalizeUrl('')).toBeUndefined();
    expect(normalizeUrl(null)).toBeUndefined();
    expect(normalizeUrl(undefined)).toBeUndefined();
  });
});

describe('getUrlDisplayParts', () => {
  test('strips www., splits path+search, flags meetup', () => {
    expect(getUrlDisplayParts('https://www.meetup.com/group/events/123')).toEqual({
      hostname: 'meetup.com',
      path: '/group/events/123',
      isMeetup: true,
    });
  });

  test('non-meetup host with query string', () => {
    expect(getUrlDisplayParts('https://www.example.com/x?y=1')).toEqual({
      hostname: 'example.com',
      path: '/x?y=1',
      isMeetup: false,
    });
  });

  test('returns null for an unparseable string', () => {
    expect(getUrlDisplayParts('not a url')).toBeNull();
  });
});

describe('safeParseUrl', () => {
  test('returns null instead of throwing on garbage', () => {
    expect(safeParseUrl('not a url')).toBeNull();
  });

  test('returns a URL for a valid absolute string', () => {
    const parsed = safeParseUrl('https://a.com');
    expect(parsed).not.toBeNull();
    expect(parsed!.hostname).toBe('a.com');
  });
});
