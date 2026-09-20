import { describe, expect, test } from 'bun:test';
import { withTypicalDuration } from '../scanTriage';
import type { CalendarEvent } from '@/types/event';

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e', title: 'Dinner', startDate: new Date('2026-09-18T19:00:00Z'), endDate: new Date('2026-09-18T20:00:00Z'),
  allDay: false, created: new Date(), source: 'text', ...over,
});

describe('withTypicalDuration', () => {
  test('replaces the default hour when the source stated no end', () => {
    expect(withTypicalDuration(event(), false, 120).endDate.toISOString()).toBe('2026-09-18T21:00:00.000Z');
  });
  test('leaves a stated end, an all-day event, and a missing verdict alone', () => {
    expect(withTypicalDuration(event(), true, 120).endDate.toISOString()).toBe('2026-09-18T20:00:00.000Z');
    expect(withTypicalDuration(event({ allDay: true }), false, 120).endDate.toISOString()).toBe('2026-09-18T20:00:00.000Z');
    const untouched = event();
    expect(withTypicalDuration(untouched, false, null)).toBe(untouched);
  });
});
