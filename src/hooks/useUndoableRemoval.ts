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

interface UndoableRemovalInput {
  events: CalendarEvent[];
  setEvents: (update: (previous: CalendarEvent[]) => CalendarEvent[]) => void;
  isSelected: (id: string) => boolean;
  setSelected: (id: string, selected: boolean) => void;
  windowMs?: number;
}

export interface UndoableRemoval {
  pending: PendingRemoval | null;
  remove: (id: string) => void;
  undo: () => void;
}

/**
 * Removing a card leaves an undo row in its place for a few seconds.
 *
 * The event leaves the list immediately rather than being flagged in place, so
 * a card awaiting undo can never be counted by the footer or swept into an
 * export. The snapshot needed to put it back lives here instead.
 *
 * Only one removal is undoable at a time: removing a second card makes the
 * first permanent, so the row never has to explain which event it would bring
 * back.
 */
export function useUndoableRemoval({
  events,
  setEvents,
  isSelected,
  setSelected,
  windowMs = UNDO_WINDOW_MS,
}: UndoableRemovalInput): UndoableRemoval {
  const [pending, setPending] = useState<PendingRemoval | null>(null);
  const pendingRef = useRef<PendingRemoval | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `remove` reaches the memoized cards, so it must not change identity when the
  // list or the selection does - that would re-render every card on every edit.
  const latest = useRef({ events, isSelected });
  latest.current = { events, isSelected };

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const remove = useCallback((id: string) => {
    const current = latest.current;
    const index = current.events.findIndex((candidate) => candidate.id === id);
    if (index === -1) return;
    const event = current.events[index];

    clearTimer();
    const removal = { event, index, wasSelected: current.isSelected(id) };
    pendingRef.current = removal;
    setPending(removal);
    setEvents((previous) => previous.filter((candidate) => candidate.id !== id));
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pendingRef.current = null;
      setPending(null);
    }, windowMs);
  }, [setEvents, clearTimer, windowMs]);

  const undo = useCallback(() => {
    // Read the snapshot from a ref, never from inside a state updater: React
    // invokes updaters twice under StrictMode, which restored the event twice
    // and left a duplicate card behind.
    const current = pendingRef.current;
    if (current === null) return;
    clearTimer();
    pendingRef.current = null;
    setPending(null);
    setEvents((previous) => restoreAt(previous, current));
    setSelected(current.event.id, current.wasSelected);
  }, [setEvents, setSelected, clearTimer]);

  return { pending, remove, undo };
}
