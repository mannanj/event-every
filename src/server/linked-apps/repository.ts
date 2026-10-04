/**
 * Sister-app sign-ins - the only module that touches `linked_app`.
 *
 * Scoped by account id like every other table here. It stores and returns the
 * SEALED token string; sealing is the service's job, so nothing in this file
 * ever holds a usable credential.
 */
import type { D1Like } from '@/server/accounts/d1';
import type { LinkedAppId } from '@/lib/linked-apps';

export interface LinkedAppRow {
  account_id: string;
  app_id: LinkedAppId;
  tokens_sealed: string | null;
  connected_at: number | null;
  signed_out_at: number | null;
  updated_at: number;
}

export const linkedAppRepo = {
  async listSignedIn(db: D1Like, accountId: string): Promise<LinkedAppRow[]> {
    const { results } = await db
      .prepare(
        'SELECT * FROM linked_app WHERE account_id = ? AND tokens_sealed IS NOT NULL ORDER BY connected_at ASC',
      )
      .bind(accountId)
      .all<LinkedAppRow>();
    return results ?? [];
  },

  async get(db: D1Like, accountId: string, appId: LinkedAppId): Promise<LinkedAppRow | null> {
    return db
      .prepare('SELECT * FROM linked_app WHERE account_id = ? AND app_id = ?')
      .bind(accountId, appId)
      .first<LinkedAppRow>();
  },

  /** A fresh sign-in: new tokens and a new connected date; a second sign-in reuses the row. */
  async signIn(db: D1Like, accountId: string, appId: LinkedAppId, sealed: string, now = Date.now()): Promise<void> {
    await db
      .prepare(
        `INSERT INTO linked_app (account_id, app_id, tokens_sealed, connected_at, signed_out_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?)
         ON CONFLICT (account_id, app_id) DO UPDATE SET
           tokens_sealed = excluded.tokens_sealed,
           connected_at = excluded.connected_at,
           signed_out_at = NULL,
           updated_at = excluded.updated_at`,
      )
      .bind(accountId, appId, sealed, now, now)
      .run();
  },

  async signOut(db: D1Like, accountId: string, appId: LinkedAppId, now = Date.now()): Promise<void> {
    await db
      .prepare(
        `UPDATE linked_app SET tokens_sealed = NULL, signed_out_at = ?, updated_at = ?
         WHERE account_id = ? AND app_id = ? AND tokens_sealed IS NOT NULL`,
      )
      .bind(now, now, accountId, appId)
      .run();
  },
};
