import { beforeEach, describe, expect, test } from 'bun:test';

import { setBackupEnabled } from '@/server/accounts/attachments';
import { upsertAccount } from '@/server/accounts/auth';
import type { AccountsEnv } from '@/server/accounts/env';
import { accountDek } from '@/server/accounts/store';
import {
  kekBase64,
  memoryBucket,
  migratedDatabase,
  type TestDatabase,
} from '@/server/accounts/__tests__/sqlite-d1';
import { keepOriginal, resolveBackup } from '@/server/mcp/original';

/**
 * The three states of `backupOriginal`, which is the whole design.
 *
 *   undefined   follow the account's own setting
 *   true        keep it, even when the account setting is off
 *   false       skip it, even when the account setting is on
 *
 * An override applies to ONE call and never writes back to the account. The
 * switch in the account menu answers "what should normally happen"; a single
 * request can have a reason that setting cannot know, in either direction.
 */

let db: TestDatabase;
let bucket: ReturnType<typeof memoryBucket>;
let kek: string;

/** A deployment with a bucket and a key, which is what `configured` means. */
function env(): AccountsEnv {
  return {
    ACCOUNTS_DB: db,
    ACCOUNT_DATA_KEK: kek,
    ATTACHMENTS: bucket,
  } as unknown as AccountsEnv;
}

async function account(email: string) {
  const row = await upsertAccount(db, email);
  return { ...row, dek: await accountDek(db, kek, row.id) };
}

beforeEach(() => {
  db = migratedDatabase();
  bucket = memoryBucket();
  kek = kekBase64();
});

describe('following the account', () => {
  test('nothing is kept when the account says no', async () => {
    const ada = await account('ada@example.com');
    expect(await resolveBackup(db, env(), ada.id, undefined)).toBe(false);
  });

  test('it is kept when the account says yes', async () => {
    const ada = await account('ada@example.com');
    await setBackupEnabled(db, ada.id, true);
    expect(await resolveBackup(db, env(), ada.id, undefined)).toBe(true);
  });
});

describe('overriding the account, one call at a time', () => {
  test('true keeps it even though the account says no', async () => {
    const ada = await account('ada@example.com');
    expect(await resolveBackup(db, env(), ada.id, true)).toBe(true);
  });

  test('false skips it even though the account says yes', async () => {
    const ada = await account('ada@example.com');
    await setBackupEnabled(db, ada.id, true);
    expect(await resolveBackup(db, env(), ada.id, false)).toBe(false);
  });

  test('an override does not change the account setting', async () => {
    // The property that makes an override safe to use. An assistant keeping one
    // transcription must not quietly enrol somebody in backing up everything.
    const ada = await account('ada@example.com');
    await resolveBackup(db, env(), ada.id, true);
    expect(await resolveBackup(db, env(), ada.id, undefined)).toBe(false);

    await setBackupEnabled(db, ada.id, true);
    await resolveBackup(db, env(), ada.id, false);
    expect(await resolveBackup(db, env(), ada.id, undefined)).toBe(true);
  });
});

describe('what an override cannot do', () => {
  test('it cannot conjure a bucket', async () => {
    // A deployment with no R2 binding stores nothing, whatever anyone passes.
    const ada = await account('ada@example.com');
    const without = { ACCOUNTS_DB: db, ACCOUNT_DATA_KEK: kek } as unknown as AccountsEnv;
    expect(await resolveBackup(db, without, ada.id, true)).toBe(false);
  });
});

describe('keeping the original', () => {
  test('an image is stored as an image', async () => {
    const ada = await account('ada@example.com');
    const result = await keepOriginal(db, bucket, ada.dek, ada.id, {
      entryId: 'entry-1',
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
      name: 'poster.jpg',
      mimeType: 'image/jpeg',
    });
    expect(result.backedUp).toBe(true);

    const row = db.raw.query('SELECT id FROM attachment WHERE account_id = ?').get(ada.id) as {
      id: string;
    };
    expect(row.id).toBe('entry-1-original');
  });

  test('text is stored too, under the same entry', async () => {
    const ada = await account('ada@example.com');
    const result = await keepOriginal(db, bucket, ada.dek, ada.id, {
      entryId: 'entry-1',
      bytes: new TextEncoder().encode('Dinner on the 3rd at 7'),
      name: 'original.txt',
      mimeType: 'text/plain',
    });
    expect(result.backedUp).toBe(true);
  });

  test('nothing at all is not stored', async () => {
    const ada = await account('ada@example.com');
    const result = await keepOriginal(db, bucket, ada.dek, ada.id, {
      entryId: 'entry-1',
      bytes: new Uint8Array(0),
      name: 'empty.txt',
      mimeType: 'text/plain',
    });
    expect(result.backedUp).toBe(false);
  });

  test('a novel is not provenance', async () => {
    const ada = await account('ada@example.com');
    const result = await keepOriginal(db, bucket, ada.dek, ada.id, {
      entryId: 'entry-1',
      bytes: new Uint8Array(2 * 1024 * 1024),
      name: 'huge.txt',
      mimeType: 'text/plain',
    });
    expect(result.backedUp).toBe(false);
  });

  test('a failure is reported, not thrown', async () => {
    // The events are already saved by the time this runs. Losing the
    // provenance copy is a smaller harm than turning a successful save into an
    // error, so this reports honestly and does not raise.
    const ada = await account('ada@example.com');
    const broken = {
      put: () => Promise.reject(new Error('bucket is unwell')),
      get: () => Promise.resolve(null),
      delete: () => Promise.resolve(),
    };
    const result = await keepOriginal(db, broken, ada.dek, ada.id, {
      entryId: 'entry-1',
      bytes: new Uint8Array([1, 2, 3]),
      name: 'poster.jpg',
      mimeType: 'image/jpeg',
    });
    expect(result.backedUp).toBe(false);
  });
});
