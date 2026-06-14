import { getBrowserTimezone, isValidIANATimezone } from '@/utils/timezone';
import { CalendarEvent } from '@/types/event';

/**
 * Convert a raw ISO string (no tz suffix, e.g. "2026-03-14T15:00:00") from a source timezone
 * to a JS Date representing the correct UTC moment.
 *
 * Example: rawISO="2026-03-14T15:00:00", sourceTimezone="UTC"
 *   → Date representing 2026-03-14T15:00:00Z
 *
 * Example: rawISO="2026-03-14T15:00:00", sourceTimezone="America/New_York"
 *   → Date representing 2026-03-14T20:00:00Z (ET is UTC-5 in March)
 */
export function convertRawToDate(rawISO: string, sourceTimezone: string): Date {
  // An unrecognized zone must never fall through to getTimezoneOffsetMinutes' 0 (UTC) offset —
  // that stamps wall-clock time as UTC and shifts the event (10:30 ET → 6:30 ET). Treat an
  // invalid zone the way resolveTimezone does: fall back to the browser's zone.
  const zone = isValidIANATimezone(sourceTimezone) ? sourceTimezone : getBrowserTimezone();

  // Parse the raw ISO components
  const match = rawISO.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) {
    return new Date(rawISO);
  }

  const [, yearStr, monthStr, dayStr, hourStr, minStr, secStr] = match;
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const day = parseInt(dayStr);
  const hour = parseInt(hourStr || '0');
  const minute = parseInt(minStr || '0');
  const second = parseInt(secStr || '0');

  // Use Intl to figure out the UTC offset for this date+time in the source timezone
  const offsetMinutes = getTimezoneOffsetMinutes(year, month, day, hour, minute, zone);

  // Create UTC date by subtracting the offset
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
  return new Date(utcMs);
}

/**
 * Get the UTC offset in minutes for a given local time in a timezone.
 * Positive = east of UTC (e.g. +330 for IST), negative = west (e.g. -300 for ET)
 */
function getTimezoneOffsetMinutes(
  year: number, month: number, day: number, hour: number, minute: number,
  timezone: string
): number {
  // Format the date in the target timezone and in UTC, then compute the difference
  try {
    const dt = new Date(Date.UTC(year, month - 1, day, hour, minute));

    const tzParts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(dt);

    const get = (type: string) => parseInt(tzParts.find(p => p.type === type)?.value || '0');
    const tzYear = get('year');
    const tzMonth = get('month');
    const tzDay = get('day');
    let tzHour = get('hour');
    if (tzHour === 24) tzHour = 0;
    const tzMinute = get('minute');
    const tzSecond = get('second');

    const utcMs = dt.getTime();
    const localMs = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond);

    return (localMs - utcMs) / 60_000;
  } catch {
    return 0;
  }
}

/**
 * Inverse of convertRawToDate: the wall-clock ISO string ("YYYY-MM-DDTHH:mm:ss") that `date` reads
 * as in `sourceTimezone`. By construction convertRawToDate(formatRawInTimezone(d, tz), tz) returns
 * the same instant as `d`. Used to resync an event's raw wall-clock fields after a manual edit so
 * the timezone picker reinterprets the EDITED time, not the stale parsed time.
 */
export function formatRawInTimezone(date: Date, sourceTimezone: string): string {
  const zone = isValidIANATimezone(sourceTimezone) ? sourceTimezone : getBrowserTimezone();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
}

/**
 * Resync a timed event's rawStartDate/rawEndDate to its current instants, expressed in the event's
 * own timezone — preserving the convertRawToDate(raw, timezone) === instant invariant. Call after
 * any manual start/end edit so a later timezone change transforms the edited time. No-op for all-day
 * events (their raw handling is timezone-independent; see task-194).
 */
export function resyncRawFields(event: CalendarEvent): CalendarEvent {
  if (event.allDay) return event;
  const zone = event.timezone || getBrowserTimezone();
  return {
    ...event,
    rawStartDate: formatRawInTimezone(event.startDate, zone),
    rawEndDate: formatRawInTimezone(event.endDate, zone),
  };
}

/**
 * When a start instant moves to `newStart`, shift the end so the original [oldStart, oldEnd]
 * duration is preserved. Guarantees the returned end is never before newStart (a non-positive
 * original duration collapses to zero) — so editing the start can never produce start > end.
 */
export function shiftEndPreservingDuration(oldStart: Date, oldEnd: Date, newStart: Date): Date {
  const duration = Math.max(0, oldEnd.getTime() - oldStart.getTime());
  return new Date(newStart.getTime() + duration);
}

/** Clamp `end` up to `start` when it precedes it, enforcing start <= end at edit time. */
export function clampEndNotBeforeStart(start: Date, end: Date): Date {
  return end.getTime() < start.getTime() ? new Date(start.getTime()) : new Date(end.getTime());
}

/**
 * Format a Date for display in a given timezone.
 * Returns e.g. "3:00 PM ET"
 */
export function formatTimeInTimezone(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }
}

// Normalize US timezone abbreviations: EDT/EST→ET, CDT/CST→CT, MDT/MST→MT, PDT/PST→PT, etc.
const US_TZ_NORMALIZE: Record<string, string> = {
  'EDT': 'ET', 'EST': 'ET',
  'CDT': 'CT', 'CST': 'CT',
  'MDT': 'MT', 'MST': 'MT',
  'PDT': 'PT', 'PST': 'PT',
  'AKDT': 'AKT', 'AKST': 'AKT',
  'HDT': 'HT', 'HST': 'HT',
};

/**
 * Get the short timezone abbreviation for a timezone at a given date.
 * US timezones are normalized to ET/CT/MT/PT (no daylight/standard distinction).
 */
export function getTimezoneAbbreviation(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(date);
    const raw = parts.find(p => p.type === 'timeZoneName')?.value || timezone;
    return US_TZ_NORMALIZE[raw] || raw;
  } catch {
    return timezone;
  }
}

/**
 * Parse an all-day "YYYY-MM-DD" date as UTC midnight, so the calendar date is timezone-independent.
 * Read it back with getUTC* getters / a UTC formatter (see formatDateForInput(date, true)). This is
 * the all-day counterpart to convertRawToDate; it never shifts the day with the viewer's zone.
 */
export function parseAllDayDate(ymd: string): Date {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`);
}

/**
 * Format a Date as the 'YYYY-MM-DD' value an <input type="date"> expects. Timed events use LOCAL
 * getters (the editor edits wall-clock dates in the viewer's zone); all-day events are stored as
 * UTC midnight and read back with UTC getters so the date is stable across timezones (task-194).
 */
export function formatDateForInput(date: Date, allDay = false): string {
  const year = allDay ? date.getUTCFullYear() : date.getFullYear();
  const month = String((allDay ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, '0');
  const day = String(allDay ? date.getUTCDate() : date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a Date as the 'HH:mm' value an <input type="time"> expects, using LOCAL getters.
 */
export function formatTimeForInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
