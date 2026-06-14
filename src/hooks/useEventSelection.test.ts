import { describe, it, expect } from 'bun:test';
import { reconcileSelection } from './useEventSelection';

const asSorted = (s: Set<string>) => [...s].sort();

describe('reconcileSelection', () => {
  it('new-arrivals-selected: unseen ids default to selected', () => {
    const next = reconcileSelection(new Set(), new Set(), ['a', 'b']);
    expect(asSorted(next)).toEqual(['a', 'b']);
  });

  it('manual-deselect-preserved: a seen, deselected id stays out; an unseen id joins', () => {
    // prev {a} means b was manually deselected. seen {a,b}. New event c arrives.
    const next = reconcileSelection(new Set(['a']), new Set(['a', 'b']), ['a', 'b', 'c']);
    expect(asSorted(next)).toEqual(['a', 'c']); // b stays out (seen + not in prev); c joins (unseen)
  });

  it('deleted-dropped: selections for ids no longer present are removed', () => {
    const next = reconcileSelection(new Set(['a', 'b']), new Set(['a', 'b']), ['a']);
    expect(asSorted(next)).toEqual(['a']);
  });

  it('combined stream step mirroring the e2e streaming-selection guard', () => {
    // 1. First batch streams in, nothing seen yet → both default selected.
    const afterFirst = reconcileSelection(new Set(), new Set(), ['Alpha', 'Beta']);
    expect(asSorted(afterFirst)).toEqual(['Alpha', 'Beta']);

    // 2. User deselects Alpha → live selection is {Beta}; both are now seen.
    const userSelection = new Set(['Beta']);
    const seen = new Set(['Alpha', 'Beta']);

    // 3. Gamma streams in (appends). Alpha must stay out, Gamma defaults in.
    const afterStream = reconcileSelection(userSelection, seen, ['Alpha', 'Beta', 'Gamma']);
    expect(asSorted(afterStream)).toEqual(['Beta', 'Gamma']);
  });

  it('idempotent re-render: re-running with the same seen + current set does not churn', () => {
    const prev = new Set(['a', 'b']);
    const next = reconcileSelection(prev, new Set(['a', 'b']), ['a', 'b']);
    expect(asSorted(next)).toEqual(['a', 'b']);
  });

  it('does not mutate the prev set it is handed', () => {
    const prev = new Set(['a']);
    reconcileSelection(prev, new Set(['a']), ['a', 'b']);
    expect(asSorted(prev)).toEqual(['a']); // prev untouched; a fresh set is returned
  });

  it('an event deleted then re-arriving with the same id re-selects (it is unseen-again only if dropped from seen)', () => {
    // If an id is still in `seen`, a later re-appearance does NOT auto-reselect — matching the
    // original effect, where seenIdsRef is append-only and never cleared mid-session.
    const next = reconcileSelection(new Set(), new Set(['a']), ['a']);
    expect(asSorted(next)).toEqual([]); // a is seen and not in prev → stays unselected
  });
});
