import { describe, it, expect } from 'bun:test';
import { CalendarEvent } from '@/types/event';
import { removalsAtPosition, restoreAt, type PendingRemoval } from './useUndoableRemoval';

const event = (id: string): CalendarEvent => ({
  id,
  title: id,
  startDate: new Date('2026-09-22T19:00:00Z'),
  endDate: new Date('2026-09-22T20:00:00Z'),
  allDay: false,
  created: new Date('2026-09-18T00:00:00Z'),
  source: 'text',
});

const removalOf = (id: string, index: number): PendingRemoval => ({
  event: event(id),
  index,
  wasSelected: true,
});

const ids = (events: CalendarEvent[]) => events.map((candidate) => candidate.id);

describe('restoreAt', () => {
  it('puts the event back where it was taken from, not at the end', () => {
    const remaining = [event('a'), event('c')];
    expect(ids(restoreAt(remaining, removalOf('b', 1)))).toEqual(['a', 'b', 'c']);
  });

  it('restores the first card to the front', () => {
    const remaining = [event('b'), event('c')];
    expect(ids(restoreAt(remaining, removalOf('a', 0)))).toEqual(['a', 'b', 'c']);
  });

  it('restores the only card of an emptied list', () => {
    expect(ids(restoreAt([], removalOf('a', 0)))).toEqual(['a']);
  });

  it('clamps to the end when the cards behind it went away too', () => {
    // Removed from index 3, but the list has since shrunk to one card.
    expect(ids(restoreAt([event('a')], removalOf('d', 3)))).toEqual(['a', 'd']);
  });

  it('does not mutate the list it was handed', () => {
    const remaining = [event('a')];
    restoreAt(remaining, removalOf('b', 1));
    expect(ids(remaining)).toEqual(['a']);
  });
});

describe('removalsAtPosition', () => {
  const at = (id: string, index: number) => removalOf(id, index);

  it('draws a row before the card that took its place', () => {
    const pending = [at('b', 1)];
    expect(removalsAtPosition(pending, 1, false).map((r) => r.event.id)).toEqual(['b']);
    expect(removalsAtPosition(pending, 0, false)).toEqual([]);
  });

  it('keeps two removals that collapsed onto one position in removal order', () => {
    // Beta went first from index 1; Gamma was pulled forward into index 1 and went next.
    const pending = [at('beta', 1), at('gamma', 1)];
    expect(removalsAtPosition(pending, 1, false).map((r) => r.event.id)).toEqual(['beta', 'gamma']);
  });

  it('gathers rows past the end onto the last position', () => {
    const pending = [at('c', 2), at('d', 5)];
    expect(removalsAtPosition(pending, 1, true).map((r) => r.event.id)).toEqual(['c', 'd']);
  });

  it('does not gather rows past the end onto an ordinary position', () => {
    expect(removalsAtPosition([at('c', 2)], 1, false)).toEqual([]);
  });

  it('holds every row when the list has been emptied', () => {
    const pending = [at('a', 0), at('b', 1), at('c', 2)];
    expect(removalsAtPosition(pending, 0, true).map((r) => r.event.id)).toEqual(['a', 'b', 'c']);
  });
});
