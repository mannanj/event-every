import type { D1Like } from './d1';
import { openEvent, openFile, sealEvent, sealFile } from './crypto';

/**
 * Backing up the original files an account chose to keep.
 *
 * THE LAYERING, WHICH IS THE WHOLE POINT. IndexedDB is the store of record and
 * stays first: every read in the app looks there, and a browser that already
 * holds a file never touches this. R2 is the second layer, consulted when the
 * file is missing - a new laptop, a cleared browser, a history entry that aged
 * out of one device but not another.
 *
 * WHAT IS IN THE CLEAR. The bytes are sealed under the account's data key, and
 * so is the metadata: a filename is the person's own words, and storing
 * "termination-letter.pdf" in plaintext beside an encrypted PDF would give away
 * most of what the encryption was for. Only the size and the timestamps sit in
 * the clear, because R2 knows the size anyway and the table has to be paged by
 * something.
 */

export interface AttachmentMeta {
  name: string;
  mimeType: string;
  kind: 'image' | 'calendar';
}

export interface AttachmentRecord extends AttachmentMeta {
  id: string;
  entryId: string;
  size: number;
  updatedAt: string;
}

/** The R2 bucket binding. Narrowed to what this file uses. */
export interface AttachmentBucket {
  put(key: string, value: ArrayBuffer | Uint8Array): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(keys: string | string[]): Promise<void>;
}

/**
 * Account id first, so one account's objects are one prefix. It makes "delete
 * everything for this person" a prefix listing rather than a table scan, and it
 * means a mistyped key cannot land in somebody else's space.
 */
export function objectKey(accountId: string, id: string): string {
  return `att/${accountId}/${id}`;
}

/**
 * How much one account may keep.
 *
 * There was no ceiling at all: six megabytes a file, ten a request, forever.
 * R2 is billed by what is stored, so "forever" is somebody else's decision
 * about the owner's money.
 *
 * Two gigabytes is roughly 130 photographs at the per-file limit - far more
 * than a calendar's worth of posters and tickets, and small enough that a
 * runaway client shows up on a bill rather than in it.
 */
export const ACCOUNT_STORAGE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;

/** What this account is currently using. Tombstones are already zeroed. */
export async function storedBytes(db: D1Like, accountId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(SUM(byte_size), 0) AS used FROM attachment WHERE account_id = ? AND deleted = 0')
    .bind(accountId)
    .first<{ used: number }>();
  return Number(row?.used ?? 0);
}

function iso(): string {
  return new Date().toISOString();
}

export async function backupEnabled(db: D1Like, accountId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT backup_attachments FROM account WHERE id = ?')
    .bind(accountId)
    .first<{ backup_attachments: number }>();
  return row?.backup_attachments === 1;
}

export async function setBackupEnabled(
  db: D1Like,
  accountId: string,
  enabled: boolean,
): Promise<void> {
  await db
    .prepare('UPDATE account SET backup_attachments = ? WHERE id = ?')
    .bind(enabled ? 1 : 0, accountId)
    .run();
}

/**
 * Store one file.
 *
 * The object is written BEFORE the row. If the write dies between them the
 * result is an orphaned object, which costs storage and nothing else; the other
 * order would leave a row promising a file that is not there, and every reader
 * would have to treat a present row as a maybe.
 */
export async function putAttachment(
  db: D1Like,
  bucket: AttachmentBucket,
  dek: CryptoKey,
  accountId: string,
  input: { id: string; entryId: string; bytes: Uint8Array } & AttachmentMeta,
): Promise<void> {
  // Checked BEFORE the object is written. Writing first and refusing after
  // would leave the bytes in the bucket - paid for, unreferenced, and invisible
  // to every listing.
  //
  // Re-uploading an existing id replaces it, so its current size does not count
  // against the ceiling twice.
  const [used, existing] = await Promise.all([
    storedBytes(db, accountId),
    db
      .prepare('SELECT byte_size FROM attachment WHERE account_id = ? AND id = ? AND deleted = 0')
      .bind(accountId, input.id)
      .first<{ byte_size: number }>(),
  ]);
  const after = used - Number(existing?.byte_size ?? 0) + input.bytes.byteLength;
  if (after > ACCOUNT_STORAGE_LIMIT_BYTES) throw new Error('attachment_quota_exceeded');

  const sealed = await sealFile(dek, accountId, input.id, input.bytes);
  await bucket.put(objectKey(accountId, input.id), sealed.ciphertext);

  const meta = await sealEvent(dek, accountId, `meta:${input.id}`, {
    name: input.name,
    mimeType: input.mimeType,
    kind: input.kind,
  } satisfies AttachmentMeta);

  const now = iso();
  try {
    await db
    .prepare(
      `INSERT INTO attachment
         (id, account_id, entry_id, nonce, meta_nonce, meta, byte_size, key_version, created_at, updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT (account_id, id) DO UPDATE SET
         entry_id = ?, nonce = ?, meta_nonce = ?, meta = ?, byte_size = ?,
         key_version = ?, updated_at = ?, deleted = 0`,
    )
    .bind(
      input.id,
      accountId,
      input.entryId,
      sealed.nonce,
      meta.nonce,
      meta.ciphertext,
      input.bytes.byteLength,
      sealed.keyVersion,
      now,
      now,
      input.entryId,
      sealed.nonce,
      meta.nonce,
      meta.ciphertext,
      input.bytes.byteLength,
      sealed.keyVersion,
      now,
    )
    .run();
  } catch (error) {
    // The object is already in the bucket and nothing now references it. Take
    // it back out rather than leaving storage nobody can see or delete: the
    // listing reads the table, so an orphan is invisible AND billed.
    await bucket.delete(objectKey(accountId, input.id)).catch(() => undefined);
    throw error;
  }
}

async function describe(
  dek: CryptoKey,
  accountId: string,
  row: {
    id: string;
    entry_id: string;
    meta_nonce: string;
    meta: string;
    byte_size: number;
    updated_at: string;
  },
): Promise<AttachmentRecord | null> {
  const meta = (await openEvent(dek, accountId, `meta:${row.id}`, {
    nonce: row.meta_nonce,
    ciphertext: row.meta,
  })) as AttachmentMeta | null;
  if (!meta || typeof meta.name !== 'string') return null;
  return {
    id: row.id,
    entryId: row.entry_id,
    name: meta.name,
    mimeType: meta.mimeType,
    kind: meta.kind,
    size: row.byte_size,
    updatedAt: row.updated_at,
  };
}

/** What this account has backed up. Metadata only: the bytes are one more request. */
export async function listAttachments(
  db: D1Like,
  dek: CryptoKey,
  accountId: string,
  options: { entryId?: string | null; limit?: number } = {},
): Promise<AttachmentRecord[]> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 500), 1), 1000);
  const rows = options.entryId
    ? await db
        .prepare(
          `SELECT id, entry_id, meta_nonce, meta, byte_size, updated_at
             FROM attachment
            WHERE account_id = ? AND entry_id = ? AND deleted = 0
            ORDER BY updated_at DESC LIMIT ?`,
        )
        .bind(accountId, options.entryId, limit)
        .all<{
          id: string;
          entry_id: string;
          meta_nonce: string;
          meta: string;
          byte_size: number;
          updated_at: string;
        }>()
    : await db
        .prepare(
          `SELECT id, entry_id, meta_nonce, meta, byte_size, updated_at
             FROM attachment
            WHERE account_id = ? AND deleted = 0
            ORDER BY updated_at DESC LIMIT ?`,
        )
        .bind(accountId, limit)
        .all<{
          id: string;
          entry_id: string;
          meta_nonce: string;
          meta: string;
          byte_size: number;
          updated_at: string;
        }>();

  const out: AttachmentRecord[] = [];
  for (const row of rows.results ?? []) {
    const record = await describe(dek, accountId, row);
    // A row whose metadata will not open is skipped, not thrown: one bad row
    // must not make "what do I have backed up" answer nothing.
    if (record) out.push(record);
  }
  return out;
}

export interface FetchedAttachment extends AttachmentRecord {
  bytes: Uint8Array;
}

export async function getAttachment(
  db: D1Like,
  bucket: AttachmentBucket,
  dek: CryptoKey,
  accountId: string,
  id: string,
): Promise<FetchedAttachment | null> {
  const row = await db
    .prepare(
      `SELECT id, entry_id, nonce, meta_nonce, meta, byte_size, updated_at
         FROM attachment
        WHERE account_id = ? AND id = ? AND deleted = 0`,
    )
    .bind(accountId, id)
    .first<{
      id: string;
      entry_id: string;
      nonce: string;
      meta_nonce: string;
      meta: string;
      byte_size: number;
      updated_at: string;
    }>();
  if (!row) return null;

  const record = await describe(dek, accountId, row);
  if (!record) return null;

  const object = await bucket.get(objectKey(accountId, id));
  if (!object) return null;

  const bytes = await openFile(dek, accountId, id, {
    nonce: row.nonce,
    ciphertext: new Uint8Array(await object.arrayBuffer()),
  });
  if (!bytes) return null;

  return { ...record, bytes };
}

/**
 * Remove files from the account.
 *
 * The object goes first and the row is tombstoned after, which is the opposite
 * order from writing and for the same reason: the failure that leaves storage
 * behind is cheap, and the one that leaves a row pointing at nothing is not.
 * With no ids, this removes everything - what the account menu's "delete from
 * my account" does.
 */
export async function removeAttachments(
  db: D1Like,
  bucket: AttachmentBucket,
  accountId: string,
  ids: readonly string[] | null,
): Promise<number> {
  const rows = ids
    ? { results: ids.map((id) => ({ id })) }
    : await db
        .prepare('SELECT id FROM attachment WHERE account_id = ? AND deleted = 0')
        .bind(accountId)
        .all<{ id: string }>();

  const targets = (rows.results ?? []).map((row) => row.id);
  if (targets.length === 0) return 0;

  // R2 takes up to 1000 keys per delete call.
  for (let at = 0; at < targets.length; at += 1000) {
    await bucket.delete(targets.slice(at, at + 1000).map((id) => objectKey(accountId, id)));
  }

  const now = iso();
  await db.batch(
    targets.map((id) =>
      db
        .prepare(
          `UPDATE attachment
              SET deleted = 1, nonce = '', meta_nonce = '', meta = '', byte_size = 0, updated_at = ?
            WHERE account_id = ? AND id = ?`,
        )
        .bind(now, accountId, id),
    ),
  );

  return targets.length;
}
