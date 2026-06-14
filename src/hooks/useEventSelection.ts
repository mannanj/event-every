import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Pure reducer — given the previous selection, the set of ids we've already
 * seen, and the current event ids, return the next selection. New ids default
 * to selected; manual choices on existing ids are preserved; deleted ids drop.
 *
 * This is the unit-testable twin of the old streaming-reconcile effect that the
 * card list used to own: a newly-arrived id is "new" exactly once (the caller marks it seen
 * after this runs), so it auto-selects on its first appearance only.
 */
export function reconcileSelection(
  prev: Set<string>,
  seen: Set<string>,
  currentIds: string[],
): Set<string> {
  const currentIdSet = new Set(currentIds);
  const next = new Set(prev);
  for (const id of currentIds) {
    if (!seen.has(id)) next.add(id); // newly-arrived → selected
  }
  for (const id of next) {
    if (!currentIdSet.has(id)) next.delete(id); // deleted → dropped
  }
  return next;
}

export interface EventSelection {
  selectedIds: Set<string>;
  selectedCount: number;
  toggle: (id: string) => void;
  toggleAll: () => void;
}

/**
 * Owns batch-event selection. Streamed arrivals default to selected without
 * resetting the user's manual select/deselect on existing events; deleted
 * events drop out. Selection is the only state lifted to the page — expand
 * stays card-local.
 */
export function useEventSelection(events: { id: string }[]): EventSelection {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Event ids we've already auto-selected. Lets events that stream in default to
  // selected WITHOUT resetting the user's manual select/deselect on existing ones.
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = events.map((e) => e.id);
    // Snapshot `seen` and compute the next selection BEFORE marking ids seen. The
    // functional updater must NOT read seenIdsRef directly — React defers it, and
    // the forEach below would mutate the ref first, making every id look already-seen
    // (so nothing would auto-select). Capturing `seenSnapshot` here preserves the
    // original effect's "newly-arrived id is new exactly once" semantics.
    const seenSnapshot = new Set(seenIdsRef.current);
    setSelectedIds((prev) => reconcileSelection(prev, seenSnapshot, currentIds));
    currentIds.forEach((id) => seenIdsRef.current.add(id));
  }, [events]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const moreThanHalf = prev.size > events.length / 2;
      return moreThanHalf ? new Set() : new Set(events.map((e) => e.id));
    });
  }, [events]);

  return { selectedIds, selectedCount: selectedIds.size, toggle, toggleAll };
}
