import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarEvent } from '@/types/event';

export const UNDO_WINDOW_MS = 5000;

export interface PendingRemoval {
  event: CalendarEvent;
  /** Where the card sat, so undo puts it back rather than appending it. */
  index: number;
  /** Restored on undo: the reconciler treats a returning id as already seen, so it would come back unselected. */
  wasSelected: boolean;
}

/**
 * Pure reducer for undo: put the event back where it was taken from.
 *
 * Splice rather than append. An index past the current end still lands at the
 * end, which is what happens when the cards behind it were removed too.
 */
export function restoreAt(events: CalendarEvent[], removal: PendingRemoval): CalendarEvent[] {
  const next = [...events];
  next.splice(Math.min(removal.index, next.length), 0, removal.event);
  return next;
}

/**
 * The rows to draw before the card at `position`, in the order they were removed.
 *
 * Several removals can be waiting at once and two of them can name the same
 * position, because removing a card pulls the ones behind it forward. Removal
 * order breaks that tie, which happens to be their original order too.
 */
export function removalsAtPosition(
  pending: readonly PendingRemoval[],
  position: number,
  isLastPosition: boolean,
): readonly PendingRemoval[] {
  return pending.filter((removal) => (
    removal.index === position || (isLastPosition && removal.index > position)
  ));
}

interface UndoableRemovalInput {
  events: CalendarEvent[];
  setEvents: (update: (previous: CalendarEvent[]) => CalendarEvent[]) => void;
  isSelected: (id: string) => boolean;
  setSelected: (id: string, selected: boolean) => void;
  windowMs?: number;
}

export interface UndoableRemoval {
  pending: readonly PendingRemoval[];
  remove: (id: string) => void;
  undo: (id: string) => void;
}

/**
 * Removing a card leaves an undo row in its place for a few seconds.
 *
 * The event leaves the list immediately rather than being flagged in place, so
 * a card awaiting undo can never be counted by the footer or swept into an
 * export. The snapshot needed to put it back lives here instead.
 *
 * Every removal is undoable on its own clock. Removing a second card does not
 * retire the first: each row simply times out five seconds after the card it
 * names was removed.
 */
export function useUndoableRemoval({
  events,
  setEvents,
  isSelected,
  setSelected,
  windowMs = UNDO_WINDOW_MS,
}: UndoableRemovalInput): UndoableRemoval {
  const [pending, setPending] = useState<readonly PendingRemoval[]>([]);
  const pendingRef = useRef<readonly PendingRemoval[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // `remove` reaches the memoized cards, so it must not change identity when the
  // list or the selection does - that would re-render every card on every edit.
  const latest = useRef({ events, isSelected });
  latest.current = { events, isSelected };

  const forget = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  const drop = useCallback((id: string) => {
    pendingRef.current = pendingRef.current.filter((removal) => removal.event.id !== id);
    setPending(pendingRef.current);
  }, []);

  const remove = useCallback((id: string) => {
    const current = latest.current;
    const index = current.events.findIndex((candidate) => candidate.id === id);
    if (index === -1) return;

    const removal = { event: current.events[index], index, wasSelected: current.isSelected(id) };
    pendingRef.current = [...pendingRef.current, removal];
    setPending(pendingRef.current);
    setEvents((previous) => previous.filter((candidate) => candidate.id !== id));
    timersRef.current.set(id, setTimeout(() => {
      timersRef.current.delete(id);
      drop(id);
    }, windowMs));
  }, [setEvents, drop, windowMs]);

  const undo = useCallback((id: string) => {
    // Read the snapshot from a ref, never from inside a state updater: React
    // invokes updaters twice under StrictMode, which restored the event twice
    // and left a duplicate card behind.
    const removal = pendingRef.current.find((candidate) => candidate.event.id === id);
    if (removal === undefined) return;
    forget(id);
    drop(id);
    setEvents((previous) => restoreAt(previous, removal));
    setSelected(removal.event.id, removal.wasSelected);
  }, [setEvents, setSelected, forget, drop]);

  return { pending, remove, undo };
}
