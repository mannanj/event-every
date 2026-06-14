// Unit coverage for the server-side confidence filter. The E2E suite mocks /api/parse and so
// bypasses the server entirely — it can never exercise this filter (see task-197). The contract
// is pinned here instead, at the exact threshold boundary.
import { describe, expect, test } from 'bun:test';
import { CONFIDENCE_THRESHOLD, filterByConfidence } from '@/services/parser';
import { ParsedEvent } from '@/types/event';

function ev(title: string, confidence: number | undefined): ParsedEvent {
  return {
    title,
    startDate: '2026-03-16T10:00:00',
    allDay: false,
    confidence: confidence as number,
  };
}

describe('filterByConfidence', () => {
  test('the threshold is 0.4', () => {
    expect(CONFIDENCE_THRESHOLD).toBe(0.4);
  });

  test('drops strictly-below, keeps at-and-above — pinning the exact 0.4 boundary', () => {
    const events: ParsedEvent[] = [
      ev('high', 0.85),
      ev('speculative', 0.2),
      ev('just-below', 0.39),
      ev('exactly-at', 0.4),
      ev('just-above', 0.41),
    ];
    const kept = filterByConfidence(events);
    // 0.4 is NOT < 0.4 → 'exactly-at' survives; only strictly-below the threshold is dropped.
    // Catches a `<`→`<=` flip (would drop 'exactly-at') or a moved threshold (would keep 'just-below').
    expect(kept.map((e) => e.title)).toEqual(['high', 'exactly-at', 'just-above']);
  });

  test('a missing confidence defaults to 0.5 and survives', () => {
    const kept = filterByConfidence([ev('no-score', undefined)]);
    expect(kept).toHaveLength(1);
    expect(kept[0].confidence).toBe(0.5);
  });

  test('an all-low-confidence set yields an empty array (the route turns this into an error)', () => {
    expect(filterByConfidence([ev('a', 0.1), ev('b', 0.39)])).toHaveLength(0);
  });

  test('preserves input order of the survivors', () => {
    const kept = filterByConfidence([ev('first', 0.9), ev('drop', 0.1), ev('second', 0.6)]);
    expect(kept.map((e) => e.title)).toEqual(['first', 'second']);
  });
});
