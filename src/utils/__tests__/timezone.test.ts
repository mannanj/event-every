// Characterization tests for the timezone authority. These pin CURRENT behavior so the
// timezone consolidation (plans/012) can change it deliberately and visibly.
import { describe, expect, test } from 'bun:test';
import {
  convertToIANATimezone,
  getBrowserTimezone,
  isValidIANATimezone,
  normalizeTimezone,
  parseTimezoneFromText,
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
});

describe('parseTimezoneFromText', () => {
  test('finds a US abbreviation embedded in a sentence', () => {
    expect(parseTimezoneFromText('Meeting at 3pm EST')).toBe('America/New_York');
  });

  test('finds an explicit IANA zone in free text', () => {
    expect(parseTimezoneFromText('Call scheduled for America/Chicago')).toBe('America/Chicago');
  });

  test('returns null when no timezone is present', () => {
    expect(parseTimezoneFromText('lunch tomorrow at noon')).toBeNull();
  });
});

describe('convertToIANATimezone', () => {
  test('delegates to normalizeTimezone', () => {
    expect(convertToIANATimezone('PST')).toBe('America/Los_Angeles');
    expect(convertToIANATimezone('America/New_York')).toBe('America/New_York');
  });
});
