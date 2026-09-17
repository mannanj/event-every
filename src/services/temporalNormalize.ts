import type { EventCandidate } from '@event-every/scanner';

/**
 * Completes what the model returned into what a calendar needs.
 *
 * The model is given today's date and told to resolve years and relative
 * days itself, and usually does. This is the safety net for the shapes it
 * still produces on real input, each seen in the owner's own scan history:
 *
 *   - a month and a day with no year          -> assume the current year
 *   - a complete "partial" point               -> promote to a date or date-time
 *   - all-day true expressed as 00:00 - 23:59  -> a date-only point
 *   - a "missing start" issue beside a start   -> drop the bookkeeping, keep the data
 *
 * Data outranks the model's own flags and issues. Nothing here invents a
 * month, a day, or a clock time; readiness still blocks a point that has no
 * month or day at all.
 */

type Temporal = NonNullable<EventCandidate['temporal']['value']>;
type Point = Temporal['start'];

function completeYear(point: Point, year: number): Point {
  if (point === null) return point;
  if ((point.kind === 'date' || point.kind === 'partial') && point.year === null && point.month !== null && point.day !== null) {
    return { ...point, year };
  }
  return point;
}

function promotePartial(point: Point): Point {
  if (point === null || point.kind !== 'partial') return point;
  if (point.year === null || point.month === null || point.day === null) return point;
  const date = { year: point.year, month: point.month, day: point.day };
  if (point.hour === null || point.minute === null) return { kind: 'date', ...date };
  return { kind: 'floating', date, time: { hour: point.hour, minute: point.minute, second: point.second ?? 0 } };
}

function isMidnight(point: Point): boolean {
  return point !== null && (point.kind === 'floating' || point.kind === 'zoned') && point.time.hour === 0 && point.time.minute === 0;
}
function isDayEnd(point: Point): boolean {
  return point !== null && (point.kind === 'floating' || point.kind === 'zoned') && point.time.hour === 23 && point.time.minute === 59;
}
function toDate(point: Point): Point {
  if (point === null || point.kind === 'date' || point.kind === 'partial') return point;
  return { kind: 'date', ...point.date };
}

/** allDay:true written as a 00:00 start with a 23:59 or midnight end is a date, not a timed span. */
function collapseAllDayRange(temporal: Temporal): Temporal {
  if (temporal.allDay !== true || !isMidnight(temporal.start)) return temporal;
  const endIsWholeDay = temporal.end === null || isDayEnd(temporal.end) || isMidnight(temporal.end);
  if (!endIsWholeDay) return temporal;
  return { ...temporal, start: toDate(temporal.start), end: isDayEnd(temporal.end) ? null : toDate(temporal.end) };
}

export function normalizeTemporal(candidate: EventCandidate, now: Date): EventCandidate {
  const temporal = candidate.temporal.value;
  if (!temporal) return candidate;
  const year = now.getFullYear();
  let next: Temporal = {
    ...temporal,
    start: promotePartial(completeYear(temporal.start, year)),
    end: promotePartial(completeYear(temporal.end, year)),
  };
  next = collapseAllDayRange(next);
  const changed = next.start !== temporal.start || next.end !== temporal.end;
  const issues = candidate.issues.filter((issue) => {
    if (issue.code === 'missing_start' && next.start !== null) return false;
    if (!changed || issue.field !== 'temporal') return true;
    // The point was completed or collapsed above, so the flags that described
    // its old shape no longer apply. Readiness re-derives the rest.
    return !['missing_year', 'field_incomplete', 'incompatible_temporal_kinds'].includes(issue.code);
  });
  if (!changed && issues.length === candidate.issues.length) return candidate;
  return { ...candidate, temporal: { ...candidate.temporal, value: next }, issues };
}
