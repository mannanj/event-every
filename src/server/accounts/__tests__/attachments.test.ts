import { beforeEach, describe, expect, test } from 'bun:test';

import {
  backupEnabled,
  getAttachment,
  listAttachments,
  objectKey,
  putAttachment,
  removeAttachments,
  setBackupEnabled,
} from '@/server/accounts/attachments';
import { upsertAccount } from '@/server/accounts/auth';
import { accountDek } from '@/server/accounts/store';

import { kekBase64, memoryBucket, migratedDatabase, type TestDatabase } from './sqlite-d1';

const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);

let db: TestDatabase;
let bucket: ReturnType<typeof memoryBucket>;
let kek: string;

async function account(email: string) {
  const row = await upsertAccount(db, email);
  return { ...row, dek: await accountDek(db, kek, row.id) };
}

function file(id: string, bytes = PHOTO) {
  return {
    id,
    entryId: 'entry-1',
    bytes,
    name: 'poster.jpg',
    mimeType: 'image/jpeg',
    kind: 'image' as const,
  };
}

beforeEach(() => {
  db = migratedDatabase();
  bucket = memoryBucket();
  kek = kekBase64();
});

describe('the account setting', () => {
  test('is off until somebody turns it on', async () => {
    const ada = await account('ada@example.com');
    expect(await backupEnabled(db, ada.id)).toBe(false);
  });

  test('turns on and off again', async () => {
    const ada = await account('ada@example.com');
    await setBackupEnabled(db, ada.id, true);
    expect(await backupEnabled(db, ada.id)).toBe(true);
    await setBackupEnabled(db, ada.id, false);
    expect(await backupEnabled(db, ada.id)).toBe(false);
  });

  test('is per account, not global', async () => {
    const ada = await account('ada@example.com');
    const bo = await account('bo@example.com');
    await setBackupEnabled(db, ada.id, true);
    expect(await backupEnabled(db, bo.id)).toBe(false);
  });
});

describe('storing a file', () => {
  test('round-trips the bytes and the metadata', async () => {
    const ada = await account('ada@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('file-1'));

    const got = await getAttachment(db, bucket, ada.dek, ada.id, 'file-1');
    expect(got).not.toBeNull();
    expect(Array.from(got!.bytes)).toEqual(Array.from(PHOTO));
    expect(got!.name).toBe('poster.jpg');
    expect(got!.mimeType).toBe('image/jpeg');
    expect(got!.entryId).toBe('entry-1');
    expect(got!.size).toBe(PHOTO.byteLength);
  });

  test('what lands in the bucket is not the file', async () => {
    // The assertion the whole design rests on. If this ever passes by
    // containing the plaintext, the encryption is decorative.
    const ada = await account('ada@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('file-1'));

    const stored = bucket.objects.get(objectKey(ada.id, 'file-1'))!;
    expect(stored).toBeDefined();
    expect(Array.from(stored)).not.toEqual(Array.from(PHOTO));
    // AES-GCM adds a 16-byte tag, so ciphertext is longer than plaintext.
    expect(stored.byteLength).toBe(PHOTO.byteLength + 16);
  });

  test('the filename is not in the clear either', async () => {
    const ada = await account('ada@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, {
      ...file('file-1'),
      name: 'termination-letter.pdf',
    });

    const row = db.raw
      .query('SELECT * FROM attachment WHERE account_id = ?')
      .get(ada.id) as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toContain('termination-letter');
  });

  test('re-uploading the same id updates rather than duplicates', async () => {
    const ada = await account('ada@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('file-1'));
    const replacement = new Uint8Array([9, 9, 9]);
    await putAttachment(db, bucket, ada.dek, ada.id, {
      ...file('file-1', replacement),
      name: 'redone.jpg',
    });

    const rows = await listAttachments(db, ada.dek, ada.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('redone.jpg');

    const got = await getAttachment(db, bucket, ada.dek, ada.id, 'file-1');
    expect(Array.from(got!.bytes)).toEqual([9, 9, 9]);
    expect(got!.size).toBe(3);
  });

  test('the same file id on two accounts is two different files', async () => {
    const ada = await account('ada@example.com');
    const bo = await account('bo@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('shared-id'));
    await putAttachment(db, bucket, bo.dek, bo.id, {
      ...file('shared-id', new Uint8Array([7, 7])),
      name: 'bo.jpg',
    });

    const hers = await getAttachment(db, bucket, ada.dek, ada.id, 'shared-id');
    const his = await getAttachment(db, bucket, bo.dek, bo.id, 'shared-id');
    expect(Array.from(hers!.bytes)).toEqual(Array.from(PHOTO));
    expect(Array.from(his!.bytes)).toEqual([7, 7]);
  });
});

describe('what one account cannot reach', () => {
  test('another account’s file is simply not there', async () => {
    const ada = await account('ada@example.com');
    const bo = await account('bo@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('file-1'));

    expect(await getAttachment(db, bucket, bo.dek, bo.id, 'file-1')).toBeNull();
    expect(await listAttachments(db, bo.dek, bo.id)).toEqual([]);
  });

  test('even holding the other account’s ciphertext, the wrong key will not open it', async () => {
    // The row lookup is scoped by account_id, so the check above could pass
    // purely on the WHERE clause. This bypasses it and goes at the envelope.
    const ada = await account('ada@example.com');
    const bo = await account('bo@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('file-1'));

    db.raw
      .query(
        `INSERT INTO attachment (id, account_id, entry_id, nonce, meta_nonce, meta, byte_size, key_version, created_at, updated_at, deleted)
         SELECT id, ?, entry_id, nonce, meta_nonce, meta, byte_size, key_version, created_at, updated_at, 0
           FROM attachment WHERE account_id = ?`,
      )
      .run(bo.id, ada.id);
    await bucket.put(objectKey(bo.id, 'file-1'), bucket.objects.get(objectKey(ada.id, 'file-1'))!);

    // Bo now has the row and the bytes. The AAD binds them to Ada's account and
    // Bo's key is different, so this still opens nothing.
    expect(await getAttachment(db, bucket, bo.dek, bo.id, 'file-1')).toBeNull();
  });

  test('one account cannot remove another’s file by naming its id', async () => {
    // Removal touches no ciphertext, so the envelope cannot save this one. The
    // only thing standing between Bo and Ada's photo is that both the object
    // key and the UPDATE are built from the CALLER's account id, never from
    // the id passed in.
    const ada = await account('ada@example.com');
    const bo = await account('bo@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('file-1'));

    await removeAttachments(db, bucket, bo.id, ['file-1']);

    expect(bucket.objects.has(objectKey(ada.id, 'file-1'))).toBe(true);
    const still = await getAttachment(db, bucket, ada.dek, ada.id, 'file-1');
    expect(Array.from(still!.bytes)).toEqual(Array.from(PHOTO));
  });
});

describe('listing', () => {
  test('narrows to one input-history entry', async () => {
    const ada = await account('ada@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, { ...file('a'), entryId: 'entry-1' });
    await putAttachment(db, bucket, ada.dek, ada.id, { ...file('b'), entryId: 'entry-2' });

    const first = await listAttachments(db, ada.dek, ada.id, { entryId: 'entry-1' });
    expect(first.map((one) => one.id)).toEqual(['a']);
    expect(await listAttachments(db, ada.dek, ada.id)).toHaveLength(2);
  });

  test('a row whose metadata will not open is skipped, not thrown', async () => {
    const ada = await account('ada@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('good'));
    await putAttachment(db, bucket, ada.dek, ada.id, { ...file('bad'), entryId: 'entry-1' });
    db.raw.query("UPDATE attachment SET meta = 'not-ciphertext' WHERE id = 'bad'").run();

    const rows = await listAttachments(db, ada.dek, ada.id);
    expect(rows.map((one) => one.id)).toEqual(['good']);
  });
});

describe('removing', () => {
  test('takes the object and tombstones the row', async () => {
    const ada = await account('ada@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('file-1'));

    expect(await removeAttachments(db, bucket, ada.id, ['file-1'])).toBe(1);
    expect(bucket.objects.has(objectKey(ada.id, 'file-1'))).toBe(false);
    expect(await getAttachment(db, bucket, ada.dek, ada.id, 'file-1')).toBeNull();
    expect(await listAttachments(db, ada.dek, ada.id)).toEqual([]);

    // Tombstoned, not deleted: a phone that has been offline needs to learn the
    // file went away rather than silently keeping it forever.
    const row = db.raw
      .query('SELECT deleted, meta FROM attachment WHERE id = ?')
      .get('file-1') as { deleted: number; meta: string };
    expect(row.deleted).toBe(1);
    expect(row.meta).toBe('');
  });

  test('with no ids, removes everything on the account and nothing else', async () => {
    const ada = await account('ada@example.com');
    const bo = await account('bo@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('a'));
    await putAttachment(db, bucket, ada.dek, ada.id, { ...file('b'), entryId: 'entry-2' });
    await putAttachment(db, bucket, bo.dek, bo.id, file('c'));

    expect(await removeAttachments(db, bucket, ada.id, null)).toBe(2);
    expect(await listAttachments(db, ada.dek, ada.id)).toEqual([]);
    expect(await listAttachments(db, bo.dek, bo.id)).toHaveLength(1);
    expect(bucket.objects.has(objectKey(bo.id, 'c'))).toBe(true);
  });

  test('removing nothing is not an error', async () => {
    const ada = await account('ada@example.com');
    expect(await removeAttachments(db, bucket, ada.id, null)).toBe(0);
  });

  test('a file can be backed up again after being removed', async () => {
    const ada = await account('ada@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('file-1'));
    await removeAttachments(db, bucket, ada.id, ['file-1']);
    await putAttachment(db, bucket, ada.dek, ada.id, file('file-1'));

    const got = await getAttachment(db, bucket, ada.dek, ada.id, 'file-1');
    expect(Array.from(got!.bytes)).toEqual(Array.from(PHOTO));
  });
});

describe('a missing object', () => {
  test('reads as absent rather than as an empty file', async () => {
    // R2 and D1 are two systems and can disagree. Whatever the reason, a row
    // pointing at nothing must not decrypt to zero bytes and look like a file.
    const ada = await account('ada@example.com');
    await putAttachment(db, bucket, ada.dek, ada.id, file('file-1'));
    bucket.objects.delete(objectKey(ada.id, 'file-1'));

    expect(await getAttachment(db, bucket, ada.dek, ada.id, 'file-1')).toBeNull();
  });
});
