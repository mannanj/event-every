import type { CalendarEvent } from '@/types/event';
import { eventStorage } from '@/services/storage';

/**
 * Client half of encrypted event sync.
 *
 * Events are sent as ordinary JSON and sealed on the server before they reach
 * D1 — see `src/server/accounts/crypto.ts` for why that is the guarantee on
 * offer and what it does not cover. Nothing here holds a key.
 *
 * The cursor is the newest `updatedAt` this browser has seen, kept next to the
 * events themselves so a reinstall re-pulls everything rather than believing it
 * is already caught up.
 */

const CURSOR_KEY = 'event-every:sync-cursor';

export interface SyncSummary {
  pulled: number;
  pushed: number;
  removed: number;
}

interface RemoteEvent {
  id: string;
  event: unknown;
  updatedAt: string;
  deleted: boolean;
}

function readCursor(): string | null {
  try {
    return localStorage.getItem(CURSOR_KEY);
  } catch {
    return null;
  }
}

function writeCursor(value: string): void {
  try {
    localStorage.setItem(CURSOR_KEY, value);
  } catch {
    // A browser refusing storage still syncs; it just re-pulls next time.
  }
}

/**
 * Dates survive the round trip as ISO strings, so they are revived on the way
 * back in. Without this every synced event returns with a string where the rest
 * of the app expects a Date, and the failure surfaces far from here.
 */
function reviveEvent(raw: unknown): CalendarEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== 'string' || typeof value.title !== 'string') return null;
  const start = new Date(String(value.startDate));
  const end = new Date(String(value.endDate ?? value.startDate));
  if (Number.isNaN(start.getTime())) return null;
  return {
    ...(value as unknown as CalendarEvent),
    startDate: start,
    endDate: Number.isNaN(end.getTime()) ? start : end,
    created: new Date(String(value.created ?? new Date().toISOString())),
  };
}

async function pullPage(since: string | null): Promise<{ events: RemoteEvent[]; cursor: string | null }> {
  const url = new URL('/api/sync/pull', window.location.origin);
  if (since) url.searchParams.set('since', since);
  const response = await fetch(url.toString(), { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`pull failed (${response.status})`);
  return response.json();
}

async function pushBatch(events: readonly { id: string; event?: unknown; deleted?: boolean }[]): Promise<void> {
  const response = await fetch('/api/sync/push', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });
  if (!response.ok) throw new Error(`push failed (${response.status})`);
}

/**
 * Reconcile this browser with the account.
 *
 * Pull first, then push whatever the server has not seen. Merging by id and
 * preferring the remote copy on a collision: the server's row is the one every
 * other device already agreed on, and silently overwriting it with whatever
 * this browser happens to hold is how one stale tab erases an edit made
 * somewhere else.
 */
export async function syncNow(): Promise<SyncSummary> {
  const summary: SyncSummary = { pulled: 0, pushed: 0, removed: 0 };

  let cursor = readCursor();
  let newest = cursor;
  const remoteIds = new Set<string>();

  for (;;) {
    const page = await pullPage(cursor);
    for (const row of page.events) {
      remoteIds.add(row.id);
      newest = row.updatedAt;
      if (row.deleted) {
        eventStorage.deleteEvent(row.id);
        summary.removed += 1;
        continue;
      }
      const revived = reviveEvent(row.event);
      if (!revived) continue;
      const existing = eventStorage.getAllEvents().data ?? [];
      if (existing.some((event) => event.id === revived.id)) eventStorage.updateEvent(revived);
      else eventStorage.saveEvent(revived);
      summary.pulled += 1;
    }
    if (!page.cursor) break;
    cursor = page.cursor;
  }

  // Anything local the server has never seen. On a first sign-in this is the
  // whole existing history, which is the point: the events someone already has
  // become the account's events rather than being stranded on one device.
  const local = eventStorage.getAllEvents().data ?? [];
  const unsent = local.filter((event) => !remoteIds.has(event.id));
  for (let i = 0; i < unsent.length; i += 100) {
    const batch = unsent.slice(i, i + 100).map((event) => ({ id: event.id, event }));
    await pushBatch(batch);
    summary.pushed += batch.length;
  }

  if (newest) writeCursor(newest);
  return summary;
}

/** Push one event immediately, for a save or edit made while signed in. */
export async function syncEvent(event: CalendarEvent): Promise<void> {
  await pushBatch([{ id: event.id, event }]);
}

/** Tell the account an event is gone, so other devices drop it too. */
export async function syncDelete(id: string): Promise<void> {
  await pushBatch([{ id, deleted: true }]);
}

/** Forget the cursor, so the next sync re-pulls from the beginning. */
export function resetSyncCursor(): void {
  try {
    localStorage.removeItem(CURSOR_KEY);
  } catch {
    // Nothing to do; a failed clear only costs a redundant pull.
  }
}
