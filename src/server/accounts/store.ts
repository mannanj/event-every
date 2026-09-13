/**
 * Reading and writing the encrypted event rows.
 *
 * Everything that touches ciphertext lives here, so there is exactly one place
 * that knows how a row is sealed and one place to audit. Routes deal in
 * plaintext events and never see a nonce.
 */
import type { D1Like } from './d1';
import { createWrappedDek, importKek, openEvent, sealEvent, unwrapDek } from './crypto';

export interface SyncedEvent {
  id: string;
  event: unknown;
  updatedAt: string;
  deleted: boolean;
}

function iso(): string {
  return new Date().toISOString();
}

/**
 * The account's data key, created on first use.
 *
 * Created lazily rather than at sign-up so an account that never syncs never
 * gets a key. The INSERT tolerates a concurrent creation: two devices syncing
 * at once must not end up with two different keys, or whichever loses the race
 * writes rows the other cannot read.
 */
export async function accountDek(
  db: D1Like,
  kekBase64: string,
  accountId: string,
): Promise<CryptoKey> {
  const kek = await importKek(kekBase64);
  const existing = await db
    .prepare('SELECT wrapped_dek, wrap_nonce FROM account_key WHERE account_id = ?')
    .bind(accountId)
    .first<{ wrapped_dek: string; wrap_nonce: string }>();
  if (existing) {
    return unwrapDek(kek, accountId, {
      nonce: existing.wrap_nonce,
      ciphertext: existing.wrapped_dek,
    });
  }

  const wrapped = await createWrappedDek(kek, accountId);
  await db
    .prepare(
      `INSERT INTO account_key (account_id, wrapped_dek, wrap_nonce, key_version, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (account_id) DO NOTHING`,
    )
    .bind(accountId, wrapped.ciphertext, wrapped.nonce, wrapped.keyVersion, iso())
    .run();

  // Re-read rather than trusting the insert: if a concurrent request won the
  // conflict, the stored key is theirs and this one must be discarded.
  const stored = await db
    .prepare('SELECT wrapped_dek, wrap_nonce FROM account_key WHERE account_id = ?')
    .bind(accountId)
    .first<{ wrapped_dek: string; wrap_nonce: string }>();
  if (!stored) throw new Error('account_key_missing');
  return unwrapDek(kek, accountId, { nonce: stored.wrap_nonce, ciphertext: stored.wrapped_dek });
}

/**
 * Everything changed since a cursor, as plaintext.
 *
 * `since` is an ISO timestamp the client last saw. Rows that will not decrypt
 * are skipped rather than failing the pull: one bad row must not lock someone
 * out of every other event they own.
 */
export async function pullEvents(
  db: D1Like,
  dek: CryptoKey,
  accountId: string,
  since: string | null,
  limit: number,
): Promise<readonly SyncedEvent[]> {
  const rows = await db
    .prepare(
      `SELECT id, nonce, ciphertext, updated_at, deleted
         FROM synced_event
        WHERE account_id = ? AND updated_at > ?
        ORDER BY updated_at ASC
        LIMIT ?`,
    )
    .bind(accountId, since ?? '', limit)
    .all<{
      id: string;
      nonce: string;
      ciphertext: string;
      updated_at: string;
      deleted: number;
    }>();

  const out: SyncedEvent[] = [];
  for (const row of rows.results ?? []) {
    // A tombstone carries no readable payload; the client only needs the id.
    if (row.deleted) {
      out.push({ id: row.id, event: null, updatedAt: row.updated_at, deleted: true });
      continue;
    }
    const event = await openEvent(dek, accountId, row.id, {
      nonce: row.nonce,
      ciphertext: row.ciphertext,
    });
    if (event === null) continue;
    out.push({ id: row.id, event, updatedAt: row.updated_at, deleted: false });
  }
  return out;
}

export interface PushInput {
  id: string;
  event?: unknown;
  deleted?: boolean;
}

/**
 * Write a batch of events, sealed.
 *
 * Last-write-wins on `updated_at`, which is the server's clock rather than the
 * client's: a device with a skewed clock would otherwise be able to pin a stale
 * copy permanently by claiming a future timestamp.
 */
export async function pushEvents(
  db: D1Like,
  dek: CryptoKey,
  accountId: string,
  items: readonly PushInput[],
): Promise<string> {
  const now = iso();
  const statements = [];
  for (const item of items) {
    if (item.deleted) {
      statements.push(
        db
          .prepare(
            `INSERT INTO synced_event (id, account_id, nonce, ciphertext, key_version, updated_at, deleted)
             VALUES (?, ?, '', '', 1, ?, 1)
             ON CONFLICT (account_id, id)
             DO UPDATE SET nonce = '', ciphertext = '', updated_at = ?, deleted = 1`,
          )
          .bind(item.id, accountId, now, now),
      );
      continue;
    }
    const sealed = await sealEvent(dek, accountId, item.id, item.event);
    statements.push(
      db
        .prepare(
          `INSERT INTO synced_event (id, account_id, nonce, ciphertext, key_version, updated_at, deleted)
           VALUES (?, ?, ?, ?, ?, ?, 0)
           ON CONFLICT (account_id, id)
           DO UPDATE SET nonce = ?, ciphertext = ?, key_version = ?, updated_at = ?, deleted = 0`,
        )
        .bind(
          item.id,
          accountId,
          sealed.nonce,
          sealed.ciphertext,
          sealed.keyVersion,
          now,
          sealed.nonce,
          sealed.ciphertext,
          sealed.keyVersion,
          now,
        ),
    );
  }
  if (statements.length) await db.batch(statements);
  return now;
}

/** Every row for an account, for deletion. */
export async function deleteAllEvents(db: D1Like, accountId: string): Promise<void> {
  await db.prepare('DELETE FROM synced_event WHERE account_id = ?').bind(accountId).run();
}
