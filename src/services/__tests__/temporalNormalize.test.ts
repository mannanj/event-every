import { describe, expect, test } from 'bun:test';
import type { EventCandidate } from '@event-every/scanner';
import { normalizeTemporal } from '../temporalNormalize';

const now = new Date('2026-09-16T12:00:00Z');
const zoned = (hour: number, minute: number, second = 0) => ({
  kind: 'zoned' as const, date: { year: 2026, month: 9, day: 12 }, time: { hour, minute, second }, timeZone: 'America/New_York',
  resolution: 'exact' as const, possibleOffsets: ['-04:00'], sourceOffset: null, chosenOffset: '-04:00',
});
function withTemporal(value: unknown, issues: unknown[] = []): EventCandidate {
  return { temporal: { value, confidence: 0.8, evidence: [] }, issues } as unknown as EventCandidate;
}
const startOf = (c: EventCandidate) => c.temporal.value?.start;

describe('normalizeTemporal', () => {
  test('fills the current year and promotes a complete partial to a date-time', () => {
    const out = normalizeTemporal(withTemporal({ start: { kind: 'partial', year: null, month: 7, day: 29, hour: 11, minute: 0, second: null }, end: null, duration: null, allDay: false }), now);
    expect(startOf(out)).toEqual({ kind: 'floating', date: { year: 2026, month: 7, day: 29 }, time: { hour: 11, minute: 0, second: 0 } });
  });

  test('a partial with a day and month but no time becomes a date-only point', () => {
    const out = normalizeTemporal(withTemporal({ start: { kind: 'partial', year: null, month: 9, day: 12, hour: null, minute: null, second: null }, end: null, duration: null, allDay: 'unknown' }), now);
    expect(startOf(out)).toEqual({ kind: 'date', year: 2026, month: 9, day: 12 });
  });

  test('a partial missing the day is left as it is, so readiness still blocks it', () => {
    const input = withTemporal({ start: { kind: 'partial', year: null, month: 9, day: null, hour: null, minute: null, second: null }, end: null, duration: null, allDay: false });
    expect(normalizeTemporal(input, now)).toBe(input);
  });

  test('all-day written as 00:00 to 23:59:59 collapses to a date (the fire-station flyer)', () => {
    const out = normalizeTemporal(withTemporal({ start: zoned(0, 0), end: zoned(23, 59, 59), duration: null, allDay: true }), now);
    expect(out.temporal.value).toEqual({ start: { kind: 'date', year: 2026, month: 9, day: 12 }, end: null, duration: null, allDay: true });
  });

  test('a real midnight event is not touched when all-day is false', () => {
    const input = withTemporal({ start: zoned(0, 0), end: zoned(2, 0), duration: null, allDay: false });
    expect(normalizeTemporal(input, now)).toBe(input);
  });

  test('drops model bookkeeping that contradicts the data', () => {
    const out = normalizeTemporal(withTemporal(
      { start: { kind: 'floating', date: { year: 2026, month: 7, day: 29 }, time: { hour: 11, minute: 0, second: 0 } }, end: null, duration: null, allDay: false },
      [{ code: 'missing_start', field: 'temporal' }, { code: 'field_not_found', field: 'location' }],
    ), now);
    expect(out.issues.map((issue) => issue.code)).toEqual(['field_not_found']);
  });

  test('leaves a candidate without a temporal alone', () => {
    const input = withTemporal(null);
    expect(normalizeTemporal(input, now)).toBe(input);
  });
});
