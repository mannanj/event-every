// Characterization tests for the raw-ISO → UTC-instant conversion math. Offsets are computed
// via Intl, so these are independent of the runner's own timezone.
import { describe, expect, test } from 'bun:test';
import {
  convertRawToDate,
  formatTimeInTimezone,
  getTimezoneAbbreviation,
} from '@/utils/timeConversion';

describe('convertRawToDate', () => {
  test('summer ET (UTC-4): 19:00 wall time → 23:00Z', () => {
    expect(convertRawToDate('2026-07-04T19:00:00', 'America/New_York').toISOString())
      .toBe('2026-07-04T23:00:00.000Z');
  });

  test('winter ET (UTC-5): 19:00 wall time → next-day 00:00Z (DST boundary)', () => {
    expect(convertRawToDate('2026-01-15T19:00:00', 'America/New_York').toISOString())
      .toBe('2026-01-16T00:00:00.000Z');
  });

  test('India (UTC+5:30): 19:00 wall time → 13:30Z', () => {
    expect(convertRawToDate('2026-07-04T19:00:00', 'Asia/Kolkata').toISOString())
      .toBe('2026-07-04T13:30:00.000Z');
  });

  test('UTC source is the identity transform', () => {
    expect(convertRawToDate('2026-03-14T15:00:00', 'UTC').toISOString())
      .toBe('2026-03-14T15:00:00.000Z');
  });

  test('a date-only raw string is treated as midnight in the source zone', () => {
    // No T component → hour/minute default to 0; ET-4 midnight → 04:00Z.
    expect(convertRawToDate('2026-07-04', 'America/New_York').toISOString())
      .toBe('2026-07-04T04:00:00.000Z');
  });

  test('an unparseable string yields an Invalid Date (regex miss → new Date(raw))', () => {
    expect(Number.isNaN(convertRawToDate('not-an-iso', 'UTC').getTime())).toBe(true);
  });

  test('an invalid timezone silently falls back to a 0 (UTC) offset', () => {
    // getTimezoneOffsetMinutes catches the Intl throw and returns 0.
    expect(convertRawToDate('2026-07-04T19:00:00', 'Bad/Zone').toISOString())
      .toBe('2026-07-04T19:00:00.000Z');
  });
});

describe('formatTimeInTimezone', () => {
  test('renders an instant as wall time in the target zone', () => {
    const instant = new Date('2026-07-04T23:00:00.000Z'); // 7:00 PM EDT
    const s = formatTimeInTimezone(instant, 'America/New_York');
    expect(s).toContain('7:00');
    expect(s).toContain('PM');
  });

  test('falls back to a bare local time string for an invalid zone', () => {
    const s = formatTimeInTimezone(new Date('2026-07-04T23:00:00.000Z'), 'Bad/Zone');
    expect(s).toMatch(/\d{1,2}:\d{2}\s?[AP]M/);
  });
});

describe('getTimezoneAbbreviation', () => {
  test('US zones normalize to ET/CT/MT/PT with no DST distinction', () => {
    const summer = new Date('2026-07-04T16:00:00.000Z');
    const winter = new Date('2026-01-15T16:00:00.000Z');
    expect(getTimezoneAbbreviation(summer, 'America/New_York')).toBe('ET');
    expect(getTimezoneAbbreviation(winter, 'America/New_York')).toBe('ET');
    expect(getTimezoneAbbreviation(summer, 'America/Los_Angeles')).toBe('PT');
  });

  test('UTC stays UTC', () => {
    expect(getTimezoneAbbreviation(new Date('2026-07-04T16:00:00.000Z'), 'UTC')).toBe('UTC');
  });

  test('an invalid zone returns the input string (catch path)', () => {
    expect(getTimezoneAbbreviation(new Date('2026-07-04T16:00:00.000Z'), 'Bad/Zone')).toBe('Bad/Zone');
  });
});
