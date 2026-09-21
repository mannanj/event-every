import type { D1Like } from '@/server/accounts/d1';
import { pullEvents, pushEvents } from '@/server/accounts/store';

/**
 * The account's events, as an assistant is allowed to see them.
 *
 * WHAT THIS HANDS OVER, STATED PLAINLY. Synced rows are encrypted at rest and
 * only this Worker holds the key, but a tool that answers "what is on my
 * calendar" necessarily hands that plaintext to whichever client connected.
 * That was decided deliberately: full detail, because an assistant that can see
 * a title and not a location cannot do the thing it was connected to do. It is
 * the reason connecting is an OAuth flow somebody has to complete in a browser
 * rather than a key you can paste.
 *
 * The stored blob is a CalendarEvent that a browser serialised, so its dates
 * are ISO strings and its shape is whatever the app wrote. Nothing here trusts
 * it: every field is read defensively and a row that will not read is skipped,
 * because one bad blob must not break "list my events".
 */

/** How many stored rows a single read will page through before it stops. */
const SCAN_CEILING = 1000;
const PAGE = 200;

export interface McpEventView {
  id: string;
  title: string;
  /** ISO 8601. */
  start: string;
  end: string;
  allDay: boolean;
  timezone: string | null;
  location: string | null;
  description: string | null;
  url: string | null;
  updatedAt: string;
}

export interface McpEventInput {
  title: string;
  start: string;
  end?: string | null;
  allDay?: boolean;
  timezone?: string | null;
  location?: string | null;
  description?: string | null;
  url?: string | null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function iso(value: unknown): string | null {
  const raw = typeof value === 'string' || typeof value === 'number' ? value : null;
  if (raw === null) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function view(row: { id: string; event: unknown; updatedAt: string }): McpEventView | null {
  if (!row.event || typeof row.event !== 'object') return null;
  const stored = row.event as Record<string, unknown>;

  const title = text(stored.title);
  const start = iso(stored.startDate);
  // A title-less or date-less row exists - the app allows an event whose source
  // stated no start, and marks it `startMissing` so export refuses it. Leaving
  // it out here is the same refusal: there is nothing an assistant could
  // usefully say about it, and inventing a date would be worse than silence.
  if (!title || !start) return null;

  return {
    id: row.id,
    title,
    start,
    end: iso(stored.endDate) ?? start,
    allDay: stored.allDay === true,
    timezone: text(stored.timezone),
    location: text(stored.location),
    description: text(stored.description),
    url: text(stored.url),
    updatedAt: row.updatedAt,
  };
}

/**
 * Every readable event on the account.
 *
 * Paged by `updated_at` because that is the only order the table can be read
 * in - there is deliberately no title, date or location column to index, which
 * is the cost of the rows being ciphertext. So a range filter is applied here,
 * after decryption, rather than in SQL.
 */
async function scanAll(db: D1Like, dek: CryptoKey, accountId: string): Promise<McpEventView[]> {
  const found: McpEventView[] = [];
  let cursor: string | null = null;
  let scanned = 0;

  for (;;) {
    const page = await pullEvents(db, dek, accountId, cursor, PAGE);
    if (page.length === 0) break;
    scanned += page.length;

    for (const row of page) {
      if (row.deleted) continue;
      const one = view(row);
      if (one) found.push(one);
    }

    cursor = page[page.length - 1]!.updatedAt;
    if (page.length < PAGE || scanned >= SCAN_CEILING) break;
  }

  return found;
}

export async function readEvents(
  db: D1Like,
  dek: CryptoKey,
  accountId: string,
  options: { from?: string | null; to?: string | null; limit?: number } = {},
): Promise<McpEventView[]> {
  const found = await scanAll(db, dek, accountId);

  const from = options.from ? iso(options.from) : null;
  const to = options.to ? iso(options.to) : null;
  const filtered = found.filter((one) => {
    if (from && one.end < from) return false;
    if (to && one.start > to) return false;
    return true;
  });

  filtered.sort((a, b) => a.start.localeCompare(b.start));
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 200);
  return filtered.slice(0, limit);
}

/**
 * Read back a specific set of ids, for confirming a write.
 *
 * Not `readEvents` with a big limit: that sorts by start and slices, so an
 * event an assistant just added for last year would be reported as not saved.
 */
export async function readEventsByIds(
  db: D1Like,
  dek: CryptoKey,
  accountId: string,
  ids: ReadonlySet<string>,
): Promise<McpEventView[]> {
  const all = await scanAll(db, dek, accountId);
  return all.filter((one) => ids.has(one.id)).sort((a, b) => a.start.localeCompare(b.start));
}

export async function readEvent(
  db: D1Like,
  dek: CryptoKey,
  accountId: string,
  id: string,
): Promise<McpEventView | null> {
  // No index to look one up by, so this is the whole scan with a filter. The
  // ceiling still applies, which is honest: an account past it cannot address
  // its oldest events by id, and the fix is a column this table will not have.
  const all = await scanAll(db, dek, accountId);
  return all.find((one) => one.id === id) ?? null;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Turn tool arguments into the blob the browser would have written.
 *
 * The defaults are the app's own: an hour long when no end was given, and the
 * end clamped forward if it arrived before the start. `source` says 'text'
 * because that is what actually happened - somebody's words became an event -
 * and it is the value every existing card already knows how to render.
 */
export function buildStoredEvent(
  input: McpEventInput,
  identity: { id: string; created: Date },
): Record<string, unknown> {
  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) throw new Error('bad_start');

  const requestedEnd = input.end ? new Date(input.end) : null;
  const end =
    requestedEnd && !Number.isNaN(requestedEnd.getTime()) && requestedEnd > start
      ? requestedEnd
      : new Date(start.getTime() + (input.allDay ? 24 * HOUR_MS : HOUR_MS));

  return {
    id: identity.id,
    title: input.title,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    allDay: input.allDay === true,
    created: identity.created.toISOString(),
    source: 'text',
    ...(input.timezone ? { timezone: input.timezone } : {}),
    ...(input.location ? { location: input.location } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.url ? { url: input.url } : {}),
  };
}

export async function writeEvents(
  db: D1Like,
  dek: CryptoKey,
  accountId: string,
  events: readonly Record<string, unknown>[],
): Promise<string> {
  return pushEvents(
    db,
    dek,
    accountId,
    events.map((event) => ({ id: String(event.id), event })),
  );
}

/**
 * A tombstone, not a DELETE. A phone that has been offline for a week needs to
 * learn that a row it still holds was removed by an assistant.
 */
export async function removeEvent(
  db: D1Like,
  dek: CryptoKey,
  accountId: string,
  id: string,
): Promise<void> {
  await pushEvents(db, dek, accountId, [{ id, deleted: true }]);
}
