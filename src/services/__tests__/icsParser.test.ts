// Characterization tests for ICS import parsing. Several assertions pin known date quirks
// that plans/008 will deliberately fix (tagged KNOWN QUIRK).
import { describe, expect, test } from 'bun:test';
import { parseICSContent } from '@/services/icsParser';

function wrap(vevent: string): string {
  return `BEGIN:VCALENDAR\nVERSION:2.0\n${vevent}\nEND:VCALENDAR`;
}

describe('parseICSContent', () => {
  test('parses a Z-suffixed (UTC) datetime to the exact instant', () => {
    const ics = wrap('BEGIN:VEVENT\nSUMMARY:Team Sync\nDTSTART:20260313T190000Z\nDTEND:20260313T200000Z\nEND:VEVENT');
    const events = parseICSContent(ics);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Team Sync');
    expect(events[0].allDay).toBe(false);
    expect(events[0].startDate.toISOString()).toBe('2026-03-13T19:00:00.000Z');
    expect(events[0].endDate.toISOString()).toBe('2026-03-13T20:00:00.000Z');
  });

  test('an 8-char VALUE=DATE all-day event parses at LOCAL midnight', () => {
    const ics = wrap('BEGIN:VEVENT\nSUMMARY:Company Offsite\nDTSTART;VALUE=DATE:20260320\nEND:VEVENT');
    const events = parseICSContent(ics);
    expect(events).toHaveLength(1);
    expect(events[0].allDay).toBe(true);
    // KNOWN QUIRK (plans/008): an 8-digit DATE becomes new Date(y, m, d) — LOCAL midnight, not
    // UTC — so the absolute instant drifts by the runner's offset. Assert the local calendar
    // components, which round-trip regardless of the runner timezone.
    const d = events[0].startDate;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // March (0-indexed)
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(0);
  });

  test('a non-Z datetime ignores TZID and parses as LOCAL wall time', () => {
    const ics = wrap('BEGIN:VEVENT\nSUMMARY:Lunch\nDTSTART;TZID=America/New_York:20260313T190000\nEND:VEVENT');
    const events = parseICSContent(ics);
    expect(events).toHaveLength(1);
    // KNOWN QUIRK (plans/008): parseICSDate strips the TZID via /;.*$/ and the non-Z branch uses
    // new Date(y, m, d, h, m, s) — LOCAL — so the declared zone is silently ignored.
    const d = events[0].startDate;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getHours()).toBe(19);
    expect(d.getMinutes()).toBe(0);
  });

  test('unescapes \\n, \\, and \\; in text fields', () => {
    const ics = wrap('BEGIN:VEVENT\nSUMMARY:Dinner with Bob\\, Alice\\nand Carol\nLOCATION:5th Ave\\; Suite 2\nDTSTART:20260313T190000Z\nEND:VEVENT');
    const events = parseICSContent(ics);
    expect(events[0].title).toBe('Dinner with Bob, Alice\nand Carol');
    expect(events[0].location).toBe('5th Ave; Suite 2');
  });

  test('a VEVENT missing SUMMARY is dropped (the "Untitled Event" fallback is unreachable)', () => {
    const ics = wrap('BEGIN:VEVENT\nDTSTART:20260313T190000Z\nEND:VEVENT');
    const events = parseICSContent(ics);
    // convertICSEventToCalendarEvent returns null when !summary (guard at icsParser.ts:116),
    // BEFORE the `summary || 'Untitled Event'` fallback at line 129 — so that fallback is dead.
    expect(events).toHaveLength(0);
  });

  test('an unparseable DTSTART falls back to "now"', () => {
    const before = Date.now();
    const ics = wrap('BEGIN:VEVENT\nSUMMARY:Mystery\nDTSTART:garbage\nEND:VEVENT');
    const events = parseICSContent(ics);
    expect(events).toHaveLength(1);
    // KNOWN QUIRK (plans/008): parseICSDate returns new Date() (current time) for anything that
    // is not 8 chars or >=15 chars — a silent, non-deterministic fallback.
    const t = events[0].startDate.getTime();
    expect(t).toBeGreaterThanOrEqual(before - 1000);
    expect(t).toBeLessThanOrEqual(Date.now() + 1000);
  });

  test('defaults endDate to start + 1h when DTEND is absent', () => {
    const ics = wrap('BEGIN:VEVENT\nSUMMARY:No End\nDTSTART:20260313T190000Z\nEND:VEVENT');
    const events = parseICSContent(ics);
    expect(events[0].endDate.getTime() - events[0].startDate.getTime()).toBe(60 * 60 * 1000);
  });

  test('parses multiple VEVENTs and stamps source/originalInput', () => {
    const ics = wrap(
      'BEGIN:VEVENT\nSUMMARY:One\nDTSTART:20260313T190000Z\nEND:VEVENT\n' +
      'BEGIN:VEVENT\nSUMMARY:Two\nDTSTART:20260314T190000Z\nEND:VEVENT'
    );
    const events = parseICSContent(ics);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.title)).toEqual(['One', 'Two']);
    expect(events[0].source).toBe('text');
    expect(events[0].originalInput).toBe('Imported from ICS file');
  });

  test('returns an empty array for input with no VEVENTs', () => {
    expect(parseICSContent('BEGIN:VCALENDAR\nEND:VCALENDAR')).toHaveLength(0);
    expect(parseICSContent('')).toHaveLength(0);
  });
});
