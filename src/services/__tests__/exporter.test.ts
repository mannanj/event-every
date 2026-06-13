// exportToICS / exportMultipleToICS funnel their success path through downloadICS(), which
// touches document/URL — unavailable under `bun test`. So this file covers the exported pure
// surface (validateEvent / validateEvents) plus the DOM-free early-return and failure branches
// of the export functions. The real .ics byte output is asserted in e2e (plans/009, browser).
import { describe, expect, test } from 'bun:test';
import {
  exportMultipleToICS,
  exportToICS,
  validateEvent,
  validateEvents,
} from '@/services/exporter';
import { CalendarEvent } from '@/types/event';

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1',
    title: 'Sample Event',
    startDate: new Date('2026-03-13T19:00:00.000Z'),
    endDate: new Date('2026-03-13T20:00:00.000Z'),
    allDay: false,
    created: new Date('2026-03-01T00:00:00.000Z'),
    source: 'text',
    ...overrides,
  };
}

describe('validateEvent', () => {
  test('a well-formed event is valid', () => {
    const r = validateEvent(makeEvent());
    expect(r.isValid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  test('requires a non-empty (non-whitespace) title', () => {
    expect(validateEvent(makeEvent({ title: '' })).errors).toContain('Event title is required');
    expect(validateEvent(makeEvent({ title: '   ' })).errors).toContain('Event title is required');
  });

  test('requires a valid start date', () => {
    const r = validateEvent(makeEvent({ startDate: new Date('nonsense') }));
    expect(r.isValid).toBe(false);
    expect(r.errors).toContain('Valid start date is required');
  });

  test('requires a valid end date', () => {
    expect(validateEvent(makeEvent({ endDate: new Date('nonsense') })).errors)
      .toContain('Valid end date is required');
  });

  test('rejects a start that is after the end', () => {
    const r = validateEvent(makeEvent({
      startDate: new Date('2026-03-13T21:00:00.000Z'),
      endDate: new Date('2026-03-13T20:00:00.000Z'),
    }));
    expect(r.errors).toContain('Start date must be before end date');
  });
});

describe('validateEvents', () => {
  test('aggregates per-event errors with a 1-based prefix', () => {
    const r = validateEvents([makeEvent(), makeEvent({ id: 'e2', title: '' })]);
    expect(r.isValid).toBe(false);
    expect(r.errors.some((e) => e.startsWith('Event 2'))).toBe(true);
    expect(r.errors.some((e) => e.includes('Event title is required'))).toBe(true);
  });

  test('an all-valid set passes', () => {
    expect(validateEvents([makeEvent(), makeEvent({ id: 'e2' })]).isValid).toBe(true);
  });
});

describe('exportMultipleToICS — DOM-free early returns', () => {
  test('refuses an empty list', () => {
    const r = exportMultipleToICS([]);
    expect(r.success).toBe(false);
    expect(r.error).toBe('No events to export');
  });

  test('refuses an invalid event before any download is attempted', () => {
    const r = exportMultipleToICS([makeEvent({ title: '' })]);
    expect(r.success).toBe(false);
    expect(r.error).toContain('Validation failed');
  });
});

describe('exportToICS — DOM-free failure path', () => {
  test('an invalid event fails at ICS generation, before the DOM download', () => {
    // dateToArray on an Invalid Date yields a NaN tuple → ics.createEvent errors (or the later
    // downloadICS throws on the missing `document`); either way success is false without a file.
    const r = exportToICS(makeEvent({ startDate: new Date('nonsense') }));
    expect(r.success).toBe(false);
  });
});
