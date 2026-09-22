import { beforeEach, describe, expect, test } from 'bun:test';

import { upsertAccount } from '@/server/accounts/auth';
import { migratedDatabase, type TestDatabase } from '@/server/accounts/__tests__/sqlite-d1';
import { burnHandoff, signHandoff } from '@/server/mcp/handoff';

const SECRET = 'test-grant-secret-not-used-anywhere-real';

/**
 * An upload link is spent once.
 *
 * A valid signature was the whole check before this. The link lives in an
 * assistant's chat transcript for fifteen minutes and every redeem runs a paid
 * image scan and writes events, so a link that verified repeatedly could empty
 * the day's budget and fill somebody's calendar from one message.
 */

let db: TestDatabase;

beforeEach(() => {
  db = migratedDatabase();
});

describe('spending an upload link', () => {
  test('the first redeem wins', async () => {
    const ada = await upsertAccount(db, 'ada@example.com');
    const token = await signHandoff({ sub: ada.id, email: ada.email }, SECRET);
    expect(await burnHandoff(db, token, ada.id)).toBe(true);
  });

  test('the second does not, however valid the signature still is', async () => {
    const ada = await upsertAccount(db, 'ada@example.com');
    const token = await signHandoff({ sub: ada.id, email: ada.email }, SECRET);

    expect(await burnHandoff(db, token, ada.id)).toBe(true);
    expect(await burnHandoff(db, token, ada.id)).toBe(false);
    expect(await burnHandoff(db, token, ada.id)).toBe(false);
  });

  test('two links are independent', async () => {
    const ada = await upsertAccount(db, 'ada@example.com');
    const first = await signHandoff({ sub: ada.id, email: ada.email }, SECRET);
    const second = await signHandoff({ sub: ada.id, email: ada.email }, SECRET);

    expect(await burnHandoff(db, first, ada.id)).toBe(true);
    expect(await burnHandoff(db, second, ada.id)).toBe(true);
  });

  test('the token itself is never stored', async () => {
    // A dump of this table must not be replayable as an upload, the same
    // reasoning login_token is stored hashed for.
    const ada = await upsertAccount(db, 'ada@example.com');
    const token = await signHandoff({ sub: ada.id, email: ada.email }, SECRET);
    await burnHandoff(db, token, ada.id);

    const row = db.raw.query('SELECT * FROM handoff_token').get() as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toContain(token);
    expect(String(row.token_hash)).toHaveLength(64);
  });

  test('the row records who spent it', async () => {
    const ada = await upsertAccount(db, 'ada@example.com');
    const token = await signHandoff({ sub: ada.id, email: ada.email }, SECRET);
    await burnHandoff(db, token, ada.id);

    const row = db.raw.query('SELECT account_id, used_at FROM handoff_token').get() as {
      account_id: string;
      used_at: string | null;
    };
    expect(row.account_id).toBe(ada.id);
    expect(row.used_at).not.toBeNull();
  });

  test('a database without the table refuses rather than allowing', async () => {
    // Migration 0005 not applied yet. Failing open would restore the reusable
    // link, which is the whole thing this prevents.
    const ada = await upsertAccount(db, 'ada@example.com');
    const token = await signHandoff({ sub: ada.id, email: ada.email }, SECRET);
    db.raw.query('DROP TABLE handoff_token').run();

    expect(await burnHandoff(db, token, ada.id)).toBe(false);
  });
});
