import type { TemporalPoint } from '@event-every/scanner';
import type { CalendarEvent } from '@/types/event';
import type { ReviewDraft } from '@/types/review';
import { convertRawToDate, parseAllDayDate } from '@/utils/timeConversion';
import { getBrowserTimezone, resolveTimezone } from '@/utils/timezone';
import { normalizeUrl } from '@/utils/url';

/**
 * Scanner candidate -> CalendarEvent.
 *
 * The Scanner is a library and answers only what a source actually said: no end,
 * no zone, no year unless they were written down. The app has always been the
 * layer that turns that into something a calendar will accept - an hour-long
 * default, the reader's zone, a title for an untitled thing. That layer left
 * with `/api/parse`; this is it, restored against the Scanner's shapes.
 *
 * Every default is recorded as well as applied: `rawStartDate` / `rawTimezone`
 * keep what the source said, so the card can re-derive the instant when the
 * reader changes the zone, and `timezoneStatus` drives the card's explanation of
 * where the zone came from.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

type RawPoint = Readonly<{ raw: string; timeZone: string | null; dateOnly: boolean }>;

/**
 * A point as the raw wall-clock string the app's time utilities expect, or null
 * when the source never pinned it down far enough to place on a calendar.
 */
function rawFromPoint(point: TemporalPoint | null): RawPoint | null {
  if (point === null) return null;

  if (point.kind === 'date') {
    if (point.year === null) return null;
    return { raw: `${pad(point.year, 4)}-${pad(point.month)}-${pad(point.day)}`, timeZone: null, dateOnly: true };
  }

  if (point.kind === 'partial') {
    // A partial is what the model returns when it could not complete the date.
    // Anything short of a full Y/M/D cannot be placed, and guessing the missing
    // half would be inventing the event rather than defaulting around it.
    if (point.year === null || point.month === null || point.day === null) return null;
    const date = `${pad(point.year, 4)}-${pad(point.month)}-${pad(point.day)}`;
    if (point.hour === null) {
      return { raw: date, timeZone: null, dateOnly: true };
    }
    return {
      raw: `${date}T${pad(point.hour)}:${pad(point.minute ?? 0)}:${pad(point.second ?? 0)}`,
      timeZone: null,
      dateOnly: false,
    };
  }

  const { date, time } = point;
  const raw = `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}T${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`;
  return { raw, timeZone: point.kind === 'zoned' ? point.timeZone : null, dateOnly: false };
}

export type ReviewEventIdentity = Readonly<{ id: string; created: Date }>;

export function reviewDraftToCalendarEvent(
  draft: ReviewDraft,
  identity: ReviewEventIdentity,
  originalInput?: string,
): CalendarEvent {
  const candidate = draft.candidate;
  const temporal = candidate.temporal.value;

  const startPoint = rawFromPoint(temporal?.start ?? null);
  const endPoint = rawFromPoint(temporal?.end ?? null);

  // The source's own zone wins, then the reader's. `resolveTimezone` reports
  // which happened, and the card shows the difference.
  const rawTimezone = startPoint?.timeZone ?? endPoint?.timeZone ?? undefined;
  const tz = resolveTimezone(rawTimezone, getBrowserTimezone());

  // The points outrank the flag. Seen from the model on real input: `allDay:
  // false` beside a date with no time (which put the event at midnight), and
  // `allDay: true` beside a 20:00 start (which would have thrown the time away).
  // The flag only decides when no point says anything.
  const anchor = startPoint ?? endPoint;
  const allDay = anchor === null
    ? temporal?.allDay === true
    : anchor.dateOnly && (startPoint === null || startPoint.dateOnly) && (endPoint === null || endPoint.dateOnly);

  let startDate: Date;
  let endDate: Date;

  if (allDay) {
    // All-day dates are stored at UTC midnight and read back with UTC getters so
    // the calendar day never drifts with the viewer's zone (task-194).
    startDate = startPoint ? parseAllDayDate(startPoint.raw.slice(0, 10)) : new Date(identity.created);
    // A stated all-day end names the last day; the calendar wants the day
    // after it (exclusive DTEND), or "Sep 20-22" imports as Sep 20-21.
    endDate = endPoint
      ? new Date(parseAllDayDate(endPoint.raw.slice(0, 10)).getTime() + DAY_MS)
      : new Date(startDate.getTime() + DAY_MS);
  } else {
    startDate = startPoint
      ? convertRawToDate(startPoint.raw, tz.timezone)
      : new Date(identity.created);
    endDate = endPoint
      ? convertRawToDate(endPoint.raw, tz.timezone)
      : new Date(startDate.getTime() + HOUR_MS);
  }

  if (Number.isNaN(startDate.getTime())) startDate = new Date(identity.created);
  // An end at or before its start exports as a zero-length or backwards event.
  // For an all-day event the source's single date is both start and end, and
  // the calendar wants the exclusive next day.
  if (Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
    endDate = new Date(startDate.getTime() + (allDay ? DAY_MS : HOUR_MS));
  }

  // The clock never fills a missing date. The placeholder keeps sorting and
  // storage working; the flag keeps the card honest and export closed.
  const startMissing = startPoint === null;

  return {
    id: identity.id,
    title: candidate.title.value?.trim() || 'Untitled Event',
    startDate,
    endDate,
    ...(startMissing ? { startMissing: true } : {}),
    ...(draft.assumedYear ? { assumedYear: true } : {}),
    location: candidate.location.value ?? undefined,
    description: candidate.description.value ?? undefined,
    url: normalizeUrl(candidate.url.value),
    allDay,
    timezone: tz.timezone,
    rawStartDate: allDay ? undefined : startPoint?.raw,
    rawEndDate: allDay ? undefined : endPoint?.raw,
    rawTimezone,
    timezoneStatus: tz.status,
    timezoneSource: tz.source === 'unknown' ? undefined : tz.source,
    created: identity.created,
    source: draft.source.handle.kind === 'image' ? 'image' : 'text',
    originalInput,
  };
}

export function reviewDraftsToCalendarEvents(
  drafts: readonly ReviewDraft[],
  originalInput?: string,
): CalendarEvent[] {
  return drafts.map((draft) => reviewDraftToCalendarEvent(
    draft,
    { id: draft.id, created: new Date(draft.createdAt) },
    originalInput,
  ));
}
