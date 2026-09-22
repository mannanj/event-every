import type { D1Like } from '@/server/accounts/d1';
import { signActor, verifyActor } from '@/server/mcp/grant';

/**
 * A one-time link for handing a file from a phone to an assistant.
 *
 * WHY THIS EXISTS WHEN IMAGES ALREADY WORK. `read_image_into_events` takes a
 * public URL or raw bytes, and between them they cover a photo on the web and a
 * client that can read a file off disk. Neither covers the commonest case of
 * all: a photo on somebody's phone, in a chat client that cannot reach the
 * camera roll and a model that cannot type a megabyte of base64.
 *
 * So the assistant does not fetch the file. It hands over a link, the person
 * opens it, and the upload lands on their own account.
 *
 * THE LINK IS A CAPABILITY, so it is built like one:
 *
 *   - Signed with the same secret and purpose-separated from the grant and the
 *     actor token, so a handoff link is not a bearer token for anything else.
 *   - Fifteen minutes. Long enough to find the photo, short enough that a link
 *     left in a chat log is not a standing invitation.
 *   - Bound to ONE account, the one the assistant is connected to. It cannot be
 *     redirected to somebody else's events by editing it.
 *   - Single-purpose: it permits an upload and nothing else. It is not a
 *     session, and opening it does not sign anybody in.
 */

const HANDOFF_PURPOSE = 'ee.mcp.handoff.v1';
export const HANDOFF_TTL_SECONDS = 15 * 60;

export interface HandoffPayload {
  sub: string;
  email: string;
  exp: number;
  nonce: string;
  aud: typeof HANDOFF_PURPOSE;
}

/**
 * Reuses the actor token's signing, with its own purpose string.
 *
 * `signActor` mixes a purpose into the signed message, so passing a different
 * one yields a token that cannot verify as an actor token and vice versa. That
 * is the same separation the grant and the actor already have, extended rather
 * than reinvented - one implementation of "sign a short-lived assertion", not
 * three.
 */
export async function signHandoff(
  identity: { sub: string; email: string },
  secret: string,
): Promise<string> {
  return signActor(identity, secret, {
    purpose: HANDOFF_PURPOSE,
    ttlSeconds: HANDOFF_TTL_SECONDS,
  });
}

export async function verifyHandoff(
  token: string,
  secret: string,
): Promise<{ sub: string; email: string } | null> {
  const payload = await verifyActor(token, secret, { purpose: HANDOFF_PURPOSE });
  return payload ? { sub: payload.sub, email: payload.email } : null;
}

/**
 * Spend the link, once.
 *
 * A VALID SIGNATURE IS NOT ENOUGH. The link lives in an assistant's chat
 * transcript for its whole fifteen minutes, and every redeem runs a paid image
 * scan and writes events into the account - so a link that verifies twenty
 * times exhausts the day's budget and fills somebody's calendar. Signed,
 * short-lived and bound to one account are all true and none of them is "used
 * once".
 *
 * Stored HASHED, like `login_token`, so a dump of the table cannot be replayed
 * as an upload. The INSERT is the race: two simultaneous uploads of the same
 * link both try to claim it and exactly one wins, because the second violates
 * the primary key.
 *
 * Returns false when the link has already been spent.
 */
export async function burnHandoff(
  db: D1Like,
  token: string,
  accountId: string,
): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const now = new Date();
  const expires = new Date(now.getTime() + HANDOFF_TTL_SECONDS * 1000);

  try {
    const claimed = await db
      .prepare(
        `INSERT INTO handoff_token (token_hash, account_id, created_at, expires_at, used_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (token_hash) DO NOTHING`,
      )
      .bind(hash, accountId, now.toISOString(), expires.toISOString(), now.toISOString())
      .run();
    return (claimed.meta.changes ?? 0) > 0;
  } catch (error) {
    // A missing table means migration 0005 has not run yet. Refusing is the
    // only safe answer: allowing the upload would restore the reusable link,
    // and that is the thing this exists to stop.
    console.error('handoff burn failed', error instanceof Error ? error.message : 'unknown');
    return false;
  }
}
