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
  const offsetMinutes = getTimezoneOffsetMinutes(year, month, day, hour, minute, sourceTimezone);

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
