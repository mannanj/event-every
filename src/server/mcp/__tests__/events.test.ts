import { beforeEach, describe, expect, test } from 'bun:test';

import { upsertAccount } from '@/server/accounts/auth';
import { accountDek } from '@/server/accounts/store';
import { kekBase64, migratedDatabase, type TestDatabase } from '@/server/accounts/__tests__/sqlite-d1';
import {
  buildStoredEvent,
  hasFilter,
  readEvent,
  readEvents,
  readEventsByIds,
  removeEvent,
  writeEvents,
} from '@/server/mcp/events';

/**
 * What an assistant can and cannot reach.
 *
 * The isolation tests here are the ones task-202 names as required proof. They
 * matter more than the rest of the file: every other property is about being
 * useful, and these are about one account never seeing another's calendar.
 */

let db: TestDatabase;
let kek: string;

async function account(email: string) {
  const row = await upsertAccount(db, email);
  return { ...row, dek: await accountDek(db, kek, row.id) };
}

function event(title: string, start: string, extra: Record<string, unknown> = {}) {
  return buildStoredEvent(
    { title, start, ...extra },
    { id: crypto.randomUUID(), created: new Date('2026-09-21T00:00:00.000Z') },
  );
}

beforeEach(() => {
  db = migratedDatabase();
  kek = kekBase64();
});

describe('one account cannot reach another', () => {
  test('a list read returns only the caller’s events', async () => {
    const ada = await account('ada@example.com');
    const bo = await account('bo@example.com');
    await writeEvents(db, ada.dek, ada.id, [event('Ada dentist', '2026-10-01T10:00:00Z')]);
    await writeEvents(db, bo.dek, bo.id, [event('Bo haircut', '2026-10-01T11:00:00Z')]);

    const hers = await readEvents(db, ada.dek, ada.id, { from: '2026-01-01' });
    expect(hers.events.map((one) => one.title)).toEqual(['Ada dentist']);

    const his = await readEvents(db, bo.dek, bo.id, { from: '2026-01-01' });
    expect(his.events.map((one) => one.title)).toEqual(['Bo haircut']);
  });

  test('knowing another account’s event id does not help', async () => {
    // The required proof. The id is not a secret - it is reported by every list
    // read and appears in tool output - so it must not be a capability.
    const ada = await account('ada@example.com');
    const bo = await account('bo@example.com');
    const stored = event('Ada therapy', '2026-10-01T10:00:00Z');
    await writeEvents(db, ada.dek, ada.id, [stored]);

    const id = String(stored.id);
    expect(await readEvent(db, ada.dek, ada.id, id)).not.toBeNull();
    expect(await readEvent(db, bo.dek, bo.id, id)).toBeNull();
    expect(await readEventsByIds(db, bo.dek, bo.id, new Set([id]))).toEqual([]);
  });

  test('removing by another account’s id removes nothing', async () => {
    const ada = await account('ada@example.com');
    const bo = await account('bo@example.com');
    const stored = event('Ada therapy', '2026-10-01T10:00:00Z');
    await writeEvents(db, ada.dek, ada.id, [stored]);

    await removeEvent(db, bo.dek, bo.id, String(stored.id));

    const hers = await readEvents(db, ada.dek, ada.id, { from: '2026-01-01' });
    expect(hers.events.map((one) => one.title)).toEqual(['Ada therapy']);
  });

  test('the wrong key opens nothing even holding the row', async () => {
    // The WHERE clause is scoped by account, so the checks above could pass on
    // SQL alone. This copies the ciphertext across and goes at the envelope.
    const ada = await account('ada@example.com');
    const bo = await account('bo@example.com');
    const stored = event('Ada therapy', '2026-10-01T10:00:00Z');
    await writeEvents(db, ada.dek, ada.id, [stored]);

    db.raw
      .query(
        `INSERT INTO synced_event (id, account_id, nonce, ciphertext, key_version, updated_at, deleted)
         SELECT id, ?, nonce, ciphertext, key_version, updated_at, 0
           FROM synced_event WHERE account_id = ?`,
      )
      .run(bo.id, ada.id);

    const his = await readEvents(db, bo.dek, bo.id, { from: '2026-01-01' });
    expect(his.events).toEqual([]);
  });
});

describe('asking for something', () => {
  test('a read with no filter at all is refused before it runs', () => {
    expect(hasFilter({})).toBe(false);
    expect(hasFilter({ limit: 50 })).toBe(false);
    expect(hasFilter({ from: '2026-01-01' })).toBe(true);
    expect(hasFilter({ query: 'dentist' })).toBe(true);
    expect(hasFilter({ source: 'image' })).toBe(true);
  });

  test('text is matched across title, location and description', async () => {
    const ada = await account('ada@example.com');
    await writeEvents(db, ada.dek, ada.id, [
      event('Dentist', '2026-10-01T10:00:00Z'),
      event('Lunch', '2026-10-02T10:00:00Z', { location: 'Dentist Road' }),
      event('Call', '2026-10-03T10:00:00Z', { description: 'about the dentist' }),
      event('Unrelated', '2026-10-04T10:00:00Z'),
    ]);

    const found = await readEvents(db, ada.dek, ada.id, { query: 'dentist' });
    expect(found.events.map((one) => one.title).sort()).toEqual(['Call', 'Dentist', 'Lunch']);
    expect(found.searched).toEqual(['title', 'location', 'description']);
  });

  test('matching ignores case', async () => {
    const ada = await account('ada@example.com');
    await writeEvents(db, ada.dek, ada.id, [event('DENTIST', '2026-10-01T10:00:00Z')]);
    const found = await readEvents(db, ada.dek, ada.id, { query: 'dentist' });
    expect(found.events).toHaveLength(1);
  });

  test('a date range excludes what falls outside it', async () => {
    const ada = await account('ada@example.com');
    await writeEvents(db, ada.dek, ada.id, [
      event('Before', '2026-09-01T10:00:00Z'),
      event('During', '2026-10-15T10:00:00Z'),
      event('After', '2026-11-20T10:00:00Z'),
    ]);

    const found = await readEvents(db, ada.dek, ada.id, {
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(found.events.map((one) => one.title)).toEqual(['During']);
  });

  test('a read that searched nothing reports no searched fields', async () => {
    const ada = await account('ada@example.com');
    await writeEvents(db, ada.dek, ada.id, [event('Dentist', '2026-10-01T10:00:00Z')]);
    const found = await readEvents(db, ada.dek, ada.id, { from: '2026-01-01' });
    expect(found.searched).toEqual([]);
  });

  test('the return ceiling is 50 however much is asked for', async () => {
    const ada = await account('ada@example.com');
    await writeEvents(
      db,
      ada.dek,
      ada.id,
      Array.from({ length: 60 }, (_, at) =>
        event(`Event ${at}`, `2026-10-${String((at % 28) + 1).padStart(2, '0')}T10:00:00Z`),
      ),
    );

    const found = await readEvents(db, ada.dek, ada.id, { from: '2026-01-01', limit: 500 });
    expect(found.events).toHaveLength(50);
    // Cut short by the limit is as incomplete as cut short by the ceiling, and
    // a caller deciding whether to narrow needs to know either way.
    expect(found.complete).toBe(false);
  });

  test('a page that fits reports itself complete', async () => {
    const ada = await account('ada@example.com');
    await writeEvents(db, ada.dek, ada.id, [event('Only one', '2026-10-01T10:00:00Z')]);
    const found = await readEvents(db, ada.dek, ada.id, { from: '2026-01-01' });
    expect(found.complete).toBe(true);
    expect(found.scanned).toBe(1);
  });
});

describe('what gets stored', () => {
  test('an event with no end runs an hour', () => {
    const stored = event('Dentist', '2026-10-01T10:00:00Z');
    expect(stored.endDate).toBe('2026-10-01T11:00:00.000Z');
  });

  test('an all-day event with no end runs a day', () => {
    const stored = event('Holiday', '2026-10-01T00:00:00Z', { allDay: true });
    expect(stored.endDate).toBe('2026-10-02T00:00:00.000Z');
  });

  test('an end before the start is pushed past it rather than kept', () => {
    // Backwards is not a range. Storing it would put an event on a calendar
    // that no client can render and export would refuse.
    const stored = event('Muddle', '2026-10-01T10:00:00Z', { end: '2026-10-01T09:00:00Z' });
    expect(String(stored.endDate) > String(stored.startDate)).toBe(true);
  });

  test('an unreadable start is refused rather than guessed', () => {
    expect(() => event('Nonsense', 'not a date')).toThrow();
  });

  test('a removed event is a tombstone, so other devices learn of it', async () => {
    const ada = await account('ada@example.com');
    const stored = event('Dentist', '2026-10-01T10:00:00Z');
    await writeEvents(db, ada.dek, ada.id, [stored]);
    await removeEvent(db, ada.dek, ada.id, String(stored.id));

    const row = db.raw
      .query('SELECT deleted FROM synced_event WHERE id = ?')
      .get(String(stored.id)) as { deleted: number };
    expect(row.deleted).toBe(1);

    const found = await readEvents(db, ada.dek, ada.id, { from: '2026-01-01' });
    expect(found.events).toEqual([]);
  });

  test('a row with no title or no start is left out rather than invented', async () => {
    const ada = await account('ada@example.com');
    await writeEvents(db, ada.dek, ada.id, [
      { id: crypto.randomUUID(), title: '', startDate: '2026-10-01T10:00:00Z' },
      { id: crypto.randomUUID(), title: 'No start', startDate: 'nonsense' },
      event('Fine', '2026-10-01T10:00:00Z'),
    ]);

    const found = await readEvents(db, ada.dek, ada.id, { from: '2026-01-01' });
    expect(found.events.map((one) => one.title)).toEqual(['Fine']);
  });
});
