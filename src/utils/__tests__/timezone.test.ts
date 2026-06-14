// Tests for the timezone-resolution authority. Plan 003 stood these up as characterization
// tests; plan 012 reconciles them to the consolidated API: the old no-op IANA alias was deleted
// (it just forwarded to normalizeTimezone), parseTimezoneFromText is now internal, and the
// resolveTimezone mislabel is fixed (a zone that resolves but equals the browser zone is now
// reported 'resolved', not 'unknown'). The normalizeTimezone assertions below are unchanged —
// its observable output was verified byte-for-byte identical to the pre-012 implementation.
import { describe, expect, test } from 'bun:test';
import {
  getBrowserTimezone,
  isValidIANATimezone,
  normalizeTimezone,
  resolveTimezone,
  resolveTimezoneZone,
  sanitizeResolvedTimezone,
} from '@/utils/timezone';

describe('isValidIANATimezone', () => {
  test('accepts real IANA zones', () => {
    expect(isValidIANATimezone('America/New_York')).toBe(true);
    expect(isValidIANATimezone('Asia/Kolkata')).toBe(true);
    expect(isValidIANATimezone('UTC')).toBe(true);
  });

  test('rejects a nonsense zone', () => {
    expect(isValidIANATimezone('Not/AZone')).toBe(false);
  });
});

describe('getBrowserTimezone', () => {
  test('returns a valid IANA string', () => {
    const tz = getBrowserTimezone();
    expect(typeof tz).toBe('string');
    expect(isValidIANATimezone(tz)).toBe(true);
  });
});

describe('normalizeTimezone', () => {
  test('undefined falls back to the browser timezone (a valid, non-empty string)', () => {
    const tz = normalizeTimezone(undefined);
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
    expect(isValidIANATimezone(tz)).toBe(true);
    expect(tz).toBe(getBrowserTimezone());
  });

  test('maps US abbreviations to their IANA zone', () => {
    expect(normalizeTimezone('EST')).toBe('America/New_York');
    expect(normalizeTimezone('PST')).toBe('America/Los_Angeles');
    expect(normalizeTimezone('est')).toBe('America/New_York'); // case-insensitive
  });

  test('passes a valid IANA zone through unchanged', () => {
    expect(normalizeTimezone('America/Chicago')).toBe('America/Chicago');
  });

  test('UTC stays UTC', () => {
    expect(normalizeTimezone('UTC')).toBe('UTC');
  });

  // Free-text resolution (previously asserted via the now-internal parseTimezoneFromText;
  // rewritten against normalizeTimezone, which routes free text through the same parser).
  test('resolves a US abbreviation embedded in a sentence', () => {
    expect(normalizeTimezone('Meeting at 3pm EST')).toBe('America/New_York');
  });

  test('resolves an explicit IANA zone in free text', () => {
    expect(normalizeTimezone('Call scheduled for America/Chicago')).toBe('America/Chicago');
  });

  test('falls back to the browser zone when no timezone is present in free text', () => {
    expect(normalizeTimezone('lunch tomorrow at noon')).toBe(getBrowserTimezone());
  });
});

describe('resolveTimezoneZone', () => {
  test('resolves a US abbreviation and reports resolved=true', () => {
    expect(resolveTimezoneZone('EST')).toEqual({ timezone: 'America/New_York', resolved: true });
  });

  test('passes a valid IANA zone through and reports resolved=true', () => {
    expect(resolveTimezoneZone('America/Chicago')).toEqual({ timezone: 'America/Chicago', resolved: true });
  });

  test('garbage falls back to the browser zone with resolved=false', () => {
    const result = resolveTimezoneZone('total garbage zone');
    expect(result.resolved).toBe(false);
    expect(result.timezone).toBe(getBrowserTimezone());
  });

  test('undefined reports resolved=false', () => {
    const result = resolveTimezoneZone(undefined);
    expect(result.resolved).toBe(false);
    expect(result.timezone).toBe(getBrowserTimezone());
  });
});

describe('resolveTimezone', () => {
  // Mislabel fix (plan 012): when raw resolves to the SAME zone as the browser, the old service
  // returned status 'unknown'. The resolution status is now read from resolveTimezoneZone, so a
  // resolved zone is correctly 'resolved' regardless of whether it equals the browser zone.
  test('a resolved zone equal to the browser zone is now resolved/programmatic', () => {
    expect(resolveTimezone('UTC', 'UTC')).toEqual({
      timezone: 'UTC',
      status: 'resolved',
      source: 'programmatic',
    });
  });

  test('a resolved IANA zone equal to the browser zone is resolved', () => {
    const result = resolveTimezone('America/New_York', 'America/New_York');
    expect(result.status).toBe('resolved');
    expect(result.source).toBe('programmatic');
    expect(result.timezone).toBe('America/New_York');
  });

  test('garbage resolves to the browser zone with unknown/unknown', () => {
    expect(resolveTimezone('total garbage', 'UTC')).toEqual({
      timezone: 'UTC',
      status: 'unknown',
      source: 'unknown',
    });
  });

  test('undefined resolves to the supplied browser zone with unknown/unknown', () => {
    expect(resolveTimezone(undefined, 'Europe/Paris')).toEqual({
      timezone: 'Europe/Paris',
      status: 'unknown',
      source: 'unknown',
    });
  });
});

describe('numeric GMT/UTC offsets (parser ordering + POSIX sign)', () => {
  // Regression: the bare \bGMT\b / \bUTC\b abbreviation entries used to short-circuit any
  // "GMT-04:00" / "UTC+5" string (→ Europe/London / UTC) before the offset branch ran, leaving
  // that branch dead code. The offset branch now runs first and emits the correct Etc/GMT zone.
  test('GMT-04:00 → Etc/GMT+4 (UTC-4, Eastern), not Europe/London', () => {
    expect(resolveTimezoneZone('GMT-04:00')).toEqual({ timezone: 'Etc/GMT+4', resolved: true });
    expect(normalizeTimezone('GMT-04:00')).toBe('Etc/GMT+4');
  });

  test('UTC+5 → Etc/GMT-5 (UTC+5), not the bare UTC zone (POSIX sign is inverted)', () => {
    expect(normalizeTimezone('UTC+5')).toBe('Etc/GMT-5');
  });

  test('bare GMT (no offset) still maps to Europe/London', () => {
    expect(normalizeTimezone('GMT')).toBe('Europe/London');
  });
});

describe('sanitizeResolvedTimezone (LLM-output trust boundary)', () => {
  test('passes a valid IANA zone through with its confidence', () => {
    expect(sanitizeResolvedTimezone('America/New_York', 0.9))
      .toEqual({ timezone: 'America/New_York', confidence: 0.9 });
  });

  test('coerces an abbreviation (EDT) to its IANA zone', () => {
    expect(sanitizeResolvedTimezone('EDT', 0.9))
      .toEqual({ timezone: 'America/New_York', confidence: 0.9 });
  });

  test('coerces a numeric GMT offset to its Etc zone', () => {
    expect(sanitizeResolvedTimezone('GMT-04:00', 0.9))
      .toEqual({ timezone: 'Etc/GMT+4', confidence: 0.9 });
  });

  test('zeroes confidence for an unmappable label (the interview-email input)', () => {
    // "Eastern Time (US & Canada)" cannot be mapped to a real zone here; confidence 0 tells the
    // client to keep its already-correct browser-zone value rather than apply a garbage zone.
    expect(sanitizeResolvedTimezone('Eastern Time (US & Canada)', 0.95).confidence).toBe(0);
  });

  test('defaults a missing confidence to 0.5 for a valid zone', () => {
    expect(sanitizeResolvedTimezone('UTC', undefined))
      .toEqual({ timezone: 'UTC', confidence: 0.5 });
  });

  test('zeroes confidence for a non-string timezone', () => {
    expect(sanitizeResolvedTimezone(null, 0.9).confidence).toBe(0);
  });
});
