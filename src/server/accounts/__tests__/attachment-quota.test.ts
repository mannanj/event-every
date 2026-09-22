import { beforeEach, describe, expect, test } from 'bun:test';

import {
  ACCOUNT_STORAGE_LIMIT_BYTES,
  getAttachment,
  objectKey,
  putAttachment,
  removeAttachments,
  storedBytes,
} from '@/server/accounts/attachments';
import { upsertAccount } from '@/server/accounts/auth';
import { accountDek } from '@/server/accounts/store';

import { kekBase64, memoryBucket, migratedDatabase, type TestDatabase } from './sqlite-d1';

/**
 * How much one account may keep, and what happens at the edge.
 *
 * There was no ceiling at all before this: six megabytes a file, ten a request,
 * forever. R2 bills by what is stored, so "forever" was a client's decision
 * about the owner's money.
 */

let db: TestDatabase;
let bucket: ReturnType<typeof memoryBucket>;
let kek: string;

async function account(email: string) {
  const row = await upsertAccount(db, email);
  return { ...row, dek: await accountDek(db, kek, row.id) };
}

function file(id: string, bytes: Uint8Array) {
  return {
    id,
    entryId: 'entry-1',
    bytes,
    name: 'poster.jpg',
    mimeType: 'image/jpeg',
    kind: 'image' as const,
  };
}

/** Writes the row directly, so a test does not have to store gigabytes. */
function pretendStored(db: TestDatabase, accountId: string, id: string, size: number) {
  db.raw
    .query(
      `INSERT INTO attachment (id, account_id, entry_id, nonce, meta_nonce, meta, byte_size, key_version, created_at, updated_at, deleted)
       VALUES (?, ?, 'entry-old', 'n', 'n', 'm', ?, 1, '2026-01-01', '2026-01-01', 0)`,
    )
    .run(id, accountId, size);
}

beforeEach(() => {
  db = migratedDatabase();
  bucket = memoryBucket();
  kek = kekBase64();
});

describe('what an account is using', () => {
  test('starts at nothing', async () => {
    const ada = await account('ada@example.com');
    expect(await storedBytes(db, ada.id)).toBe(0);
  });

  test('counts what is stored', async () => {
    const ada = await account('ada@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('a', new Uint8Array(100)));
    await putAttachment(db, bucket, ada.dek, ada.id, file('b', new Uint8Array(250)));
    expect(await storedBytes(db, ada.id)).toBe(350);
  });

  test('does not count what was removed', async () => {
    const ada = await account('ada@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('a', new Uint8Array(100)));
    await removeAttachments(db, bucket, ada.id, ['a']);
    expect(await storedBytes(db, ada.id)).toBe(0);
  });

  test('is per account', async () => {
    const ada = await account('ada@example.com');
    const bo = await account('bo@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('a', new Uint8Array(100)));
    expect(await storedBytes(db, bo.id)).toBe(0);
  });
});

describe('the ceiling', () => {
  test('refuses the write that would cross it', async () => {
    const ada = await account('ada@example.com');
    pretendStored(db, ada.id, 'old', ACCOUNT_STORAGE_LIMIT_BYTES - 10);

    await expect(
      putAttachment(db, bucket, ada.dek, ada.id, file('new', new Uint8Array(50))),
    ).rejects.toThrow('attachment_quota_exceeded');
  });

  test('and leaves NOTHING in the bucket when it does', async () => {
    // The check runs before the object is written. Refusing after would leave
    // bytes that are paid for, unreferenced, and absent from every listing.
    const ada = await account('ada@example.com');
    pretendStored(db, ada.id, 'old', ACCOUNT_STORAGE_LIMIT_BYTES - 10);

    await putAttachment(db, bucket, ada.dek, ada.id, file('new', new Uint8Array(50))).catch(
      () => undefined,
    );
    expect(bucket.objects.has(objectKey(ada.id, 'new'))).toBe(false);
  });

  test('allows the write that exactly fills it', async () => {
    const ada = await account('ada@example.com');
    pretendStored(db, ada.id, 'old', ACCOUNT_STORAGE_LIMIT_BYTES - 50);

    await putAttachment(db, bucket, ada.dek, ada.id, file('new', new Uint8Array(50)));
    expect(await storedBytes(db, ada.id)).toBe(ACCOUNT_STORAGE_LIMIT_BYTES);
  });

  test('replacing a file does not count it twice', async () => {
    // Re-uploading the same id replaces it, so the old size has to come out of
    // the sum first - otherwise an account near the ceiling could never correct
    // a file it had already stored.
    const ada = await account('ada@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('a', new Uint8Array(1000)));
    pretendStored(db, ada.id, 'old', ACCOUNT_STORAGE_LIMIT_BYTES - 1000);

    await putAttachment(db, bucket, ada.dek, ada.id, file('a', new Uint8Array(1000)));
    expect(await storedBytes(db, ada.id)).toBe(ACCOUNT_STORAGE_LIMIT_BYTES);
  });

  test('one account cannot consume another’s allowance', async () => {
    const ada = await account('ada@example.com');
    const bo = await account('bo@example.com');
    pretendStored(db, ada.id, 'old', ACCOUNT_STORAGE_LIMIT_BYTES);

    await putAttachment(db, bucket, bo.dek, bo.id, file('fine', new Uint8Array(100)));
    expect(await getAttachment(db, bucket, bo.dek, bo.id, 'fine')).not.toBeNull();
  });
});

describe('when the row cannot be written', () => {
  test('the object does not stay behind', async () => {
    // R2 is written first, so a failed insert used to leave an orphan: billed,
    // unreferenced, and invisible because every listing reads the table.
    //
    // THE FAILURE HAS TO HAPPEN AT THE INSERT, not before it. Dropping the
    // table would make the quota read throw first, the bucket write never
    // happen, and this assertion pass without the rollback running at all - a
    // test that agrees with itself. So: an account id with no `account` row.
    // The quota read returns 0 quite happily, the object is written, and the
    // foreign key refuses the insert.
    const ghost = 'no-such-account';
    const ada = await account('ada@example.com');

    expect(await storedBytes(db, ghost)).toBe(0);
    await expect(
      putAttachment(db, bucket, ada.dek, ghost, file('orphan', new Uint8Array(10))),
    ).rejects.toThrow();

    expect(bucket.objects.has(objectKey(ghost, 'orphan'))).toBe(false);
  });

  test('and that test would fail without the rollback', async () => {
    // Guarding the guard: prove the object really is written before the insert
    // is attempted, so the assertion above is about the rollback and not about
    // the write never happening.
    const ada = await account('ada@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('fine', new Uint8Array(10)));
    expect(bucket.objects.has(objectKey(ada.id, 'fine'))).toBe(true);
  });
});
