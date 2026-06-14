// Characterization tests for the raw-ISO → UTC-instant conversion math. Offsets are computed
// via Intl, so these are independent of the runner's own timezone.
import { describe, expect, test } from 'bun:test';
import {
  convertRawToDate,
  formatTimeInTimezone,
  getTimezoneAbbreviation,
  formatRawInTimezone,
  resyncRawFields,
  shiftEndPreservingDuration,
  clampEndNotBeforeStart,
  parseAllDayDate,
  formatDateForInput,
} from '@/utils/timeConversion';
import { getBrowserTimezone } from '@/utils/timezone';
import { CalendarEvent } from '@/types/event';

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

  test('an invalid timezone falls back to the browser zone, never a silent UTC-0 offset', () => {
    // Regression (interview-email bug): an unrecognized zone used to return a 0 (UTC) offset,
    // stamping wall-clock time as UTC and shifting the event (10:30 ET → 6:30 ET). It must now
    // match the browser-zone interpretation — the same fallback resolveTimezone uses.
    const raw = '2026-07-04T19:00:00';
    expect(convertRawToDate(raw, 'Bad/Zone').toISOString())
      .toBe(convertRawToDate(raw, getBrowserTimezone()).toISOString());
  });

  test('the interview email: 10:30 ET wall time → 14:30Z (not 10:30Z → 6:30 ET)', () => {
    // "Jun 15, 2026 10:30am ... Eastern Time". 14:30Z renders as 10:30 AM EDT; the bug stored
    // 10:30Z (DTSTART:20260615T103000Z), which renders as 6:30 AM EDT.
    expect(convertRawToDate('2026-06-15T10:30:00', 'America/New_York').toISOString())
      .toBe('2026-06-15T14:30:00.000Z');
    // Same instant when the zone arrives as a numeric GMT-04:00 offset (Etc/GMT+4 = UTC-4).
    expect(convertRawToDate('2026-06-15T10:30:00', 'Etc/GMT+4').toISOString())
      .toBe('2026-06-15T14:30:00.000Z');
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

// ---- Inline-edit ↔ timezone integrity helpers (task-195) ----

describe('formatRawInTimezone (inverse of convertRawToDate)', () => {
  test('round-trips an instant through its source zone back to the same wall string + instant', () => {
    for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo', 'America/Los_Angeles']) {
      const raw = '2026-03-13T19:00:00';
      const instant = convertRawToDate(raw, zone);
      const recovered = formatRawInTimezone(instant, zone);
      expect(recovered).toBe(raw);
      expect(convertRawToDate(recovered, zone).toISOString()).toBe(instant.toISOString());
    }
  });

  test('expresses the same instant differently in different zones', () => {
    // 7:00 PM ET (EDT, UTC-4 on Mar 13 2026) == 23:00 UTC.
    const instant = convertRawToDate('2026-03-13T19:00:00', 'America/New_York');
    expect(formatRawInTimezone(instant, 'America/New_York')).toBe('2026-03-13T19:00:00');
    expect(formatRawInTimezone(instant, 'UTC')).toBe('2026-03-13T23:00:00');
  });
});

describe('resyncRawFields', () => {
  function timed(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
    return {
      id: 'e1',
      title: 'X',
      startDate: convertRawToDate('2026-03-13T19:00:00', 'America/New_York'),
      endDate: convertRawToDate('2026-03-13T20:00:00', 'America/New_York'),
      allDay: false,
      timezone: 'America/New_York',
      rawStartDate: 'STALE',
      rawEndDate: 'STALE',
      created: new Date('2026-03-01T00:00:00.000Z'),
      source: 'text',
      ...overrides,
    };
  }

  test('rewrites raw fields so convertRawToDate(raw, timezone) === the current instant', () => {
    const e = resyncRawFields(timed());
    expect(e.rawStartDate).toBe('2026-03-13T19:00:00');
    expect(e.rawEndDate).toBe('2026-03-13T20:00:00');
    expect(convertRawToDate(e.rawStartDate!, e.timezone!).toISOString()).toBe(e.startDate.toISOString());
    expect(convertRawToDate(e.rawEndDate!, e.timezone!).toISOString()).toBe(e.endDate.toISOString());
  });

  test('is a no-op for all-day events (raw left untouched)', () => {
    const out = resyncRawFields(timed({ allDay: true, rawStartDate: 'KEEP', rawEndDate: 'KEEP' }));
    expect(out.rawStartDate).toBe('KEEP');
    expect(out.rawEndDate).toBe('KEEP');
  });
});

describe('shiftEndPreservingDuration', () => {
  test('moves the end by the same delta as the start (duration preserved exactly)', () => {
    const oldStart = new Date('2026-03-13T12:00:00.000Z');
    const oldEnd = new Date('2026-03-13T13:30:00.000Z'); // 90 minutes
    const newStart = new Date('2026-03-13T18:00:00.000Z');
    const newEnd = shiftEndPreservingDuration(oldStart, oldEnd, newStart);
    expect(newEnd.getTime() - newStart.getTime()).toBe(90 * 60 * 1000);
    expect(newEnd.toISOString()).toBe('2026-03-13T19:30:00.000Z');
  });

  test('never yields an end before the new start (non-positive duration collapses to zero)', () => {
    const oldStart = new Date('2026-03-13T14:00:00.000Z');
    const oldEnd = new Date('2026-03-13T13:00:00.000Z'); // already inverted
    const newStart = new Date('2026-03-13T20:00:00.000Z');
    expect(shiftEndPreservingDuration(oldStart, oldEnd, newStart).getTime()).toBe(newStart.getTime());
  });
});

describe('clampEndNotBeforeStart', () => {
  test('pulls an end that precedes the start up to the start', () => {
    const start = new Date('2026-03-13T15:00:00.000Z');
    const end = new Date('2026-03-13T14:00:00.000Z');
    expect(clampEndNotBeforeStart(start, end).getTime()).toBe(start.getTime());
  });

  test('leaves a valid (start <= end) range untouched', () => {
    const start = new Date('2026-03-13T15:00:00.000Z');
    const end = new Date('2026-03-13T16:00:00.000Z');
    expect(clampEndNotBeforeStart(start, end).toISOString()).toBe('2026-03-13T16:00:00.000Z');
  });
});

// ---- All-day date representation (task-194) ----

describe('parseAllDayDate / formatDateForInput(allDay)', () => {
  test('parseAllDayDate yields UTC midnight (timezone-independent)', () => {
    expect(parseAllDayDate('2026-03-20').toISOString()).toBe('2026-03-20T00:00:00.000Z');
  });

  test('formatDateForInput(allDay=true) reads UTC components — stable in any runner zone', () => {
    expect(formatDateForInput(parseAllDayDate('2026-03-20'), true)).toBe('2026-03-20');
    // A late-UTC instant: UTC date is Dec 31, but a runner east of UTC would see Jan 1 locally.
    // The all-day path must report the UTC calendar date, never the local one.
    expect(formatDateForInput(new Date('2026-12-31T23:30:00.000Z'), true)).toBe('2026-12-31');
  });

  test('formatDateForInput(allDay=false) reads LOCAL components (timed events, unchanged)', () => {
    // Construct an instant at local midnight so local getters give a deterministic Y-M-D in any zone.
    const localMidnight = new Date(2026, 2, 20, 0, 0, 0);
    expect(formatDateForInput(localMidnight, false)).toBe('2026-03-20');
  });
});
