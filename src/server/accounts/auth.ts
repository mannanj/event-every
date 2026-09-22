/**
 * Sign-in: an emailed link, a row, a cookie.
 *
 * Ported from ~/Documents/skeletons/signup-cloudflare. No passwords, no
 * profile, nothing to reset — the address is the identity. Three tables carry
 * it and each earns its place:
 *
 *   account      who exists
 *   login_token  a single-use, time-limited link, stored hashed
 *   session      a cookie's worth of "still signed in"
 *
 * `login_token.mcp_state` is the one field that is not about signing in. It
 * remembers that this sign-in began because an assistant asked to connect, so
 * that clicking the emailed link returns to that flow rather than to the home
 * page. It rides on the token because the mailbox round trip is the only thing
 * the state has to survive, and the token is the only thing that makes it.
 */
import type { D1Like } from './d1';
import { newId, randomToken } from './tokens';

export const SESSION_COOKIE = 'ee_session';
const LOGIN_TOKEN_TTL_MINUTES = 20;
const SESSION_TTL_DAYS = 30;

export interface Account {
  id: string;
  email: string;
}

/**
 * What spending a sign-in link yields: the account, plus where the person was
 * going before the link interrupted them.
 */
export interface SpentLoginToken extends Account {
  /** The MCP authorization state this sign-in began from, or null. */
  mcpState: string | null;
}

/**
 * Tokens are stored hashed: a leaked database row must not be replayable as a
 * login. The token itself exists only in the email.
 */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Mint a single-use sign-in link token.
 *
 * `mcpState` is the MCP Worker's opaque authorization state, present only when
 * this sign-in began at /api/mcp/authorize. It is stored, never shown, and
 * comes back out when the link is spent.
 */
export async function createLoginToken(
  db: D1Like,
  email: string,
  mcpState: string | null = null,
): Promise<string> {
  // Two draws rather than one long one: randomToken caps at a byte per
  // character, and 24 characters of this alphabet is ~120 bits.
  const token = `${randomToken(12)}${randomToken(12)}`;
  const hash = await hashToken(token);
  const expires = iso(LOGIN_TOKEN_TTL_MINUTES * 60_000);

  try {
    await db
      .prepare(
        `INSERT INTO login_token (token_hash, email, created_at, expires_at, mcp_state)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(hash, normaliseEmail(email), iso(0), expires, mcpState)
      .run();
    return token;
  } catch (error) {
    // THE COLUMN MIGHT NOT BE THERE YET, and if it is not, this is the only
    // thing standing between a deploy and nobody being able to sign in at all.
    //
    // `mcp_state` arrives in migration 0002 of the accounts database. Code and
    // schema deploy separately, so there is a window - however short, however
    // carefully sequenced - where this Worker is new and the database is not.
    // Without this fallback that window is a total sign-in outage for everyone,
    // caused by a column that only matters to a feature most people never use.
    //
    // So: try the write that remembers, and if the database has never heard of
    // the column, do the write that does not. The cost is that somebody who
    // started at an assistant's "connect" button lands on the home page instead
    // of back in the flow. That is a bad minute, not a bad day.
    //
    // NARROWED. This caught every error, so a transient D1 failure became a
    // silent retry of a slightly different INSERT - which would succeed, and
    // hide the fault. Only a complaint about the column itself is worth a
    // second attempt.
    //
    // 0002 is applied in production, so this is now belt for a deploy that has
    // not happened yet. Delete it once nothing can be older than 0002.
    const missingColumn = /no column named mcp_state|no such column/i.test(
      error instanceof Error ? error.message : String(error),
    );
    if (!missingColumn || mcpState !== null) throw error;
    await db
      .prepare(
        `INSERT INTO login_token (token_hash, email, created_at, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(hash, normaliseEmail(email), iso(0), expires)
      .run();
    return token;
  }
}

/**
 * Spend a sign-in link. Single use and time limited; the account is created on
 * first sign-in, so there is no separate registration step to build or explain.
 */
export async function consumeLoginToken(
  db: D1Like,
  token: string,
): Promise<SpentLoginToken | null> {
  const hash = await hashToken(token);

  // Same reasoning as `createLoginToken`, and this half matters more: a link
  // already in somebody's inbox has to keep working across the window where the
  // Worker knows about `mcp_state` and the database does not. Failing here
  // strands people who did everything right.
  type Row = {
    email: string;
    expires_at: string;
    used_at: string | null;
    mcp_state?: string | null;
  };
  let row: Row | null;
  try {
    row = await db
      .prepare('SELECT email, expires_at, used_at, mcp_state FROM login_token WHERE token_hash = ?')
      .bind(hash)
      .first<Row>();
  } catch (error) {
    // Narrowed for the same reason as the insert: a blanket catch turns a
    // database fault into a second query that works, and hides it.
    if (!/no such column/i.test(error instanceof Error ? error.message : String(error))) throw error;
    row = await db
      .prepare('SELECT email, expires_at, used_at FROM login_token WHERE token_hash = ?')
      .bind(hash)
      .first<Row>();
  }
  if (!row || row.used_at || row.expires_at <= iso(0)) return null;

  // Burn it first: a replay must lose even if what follows is slow. The
  // `AND used_at IS NULL` makes the burn the race, so two simultaneous clicks
  // cannot both win it.
  const burn = await db
    .prepare('UPDATE login_token SET used_at = ? WHERE token_hash = ? AND used_at IS NULL')
    .bind(iso(0), hash)
    .run();
  if (!burn.meta.changes) return null;

  const account = await upsertAccount(db, row.email);
  return { ...account, mcpState: row.mcp_state ?? null };
}

export async function upsertAccount(db: D1Like, email: string): Promise<Account> {
  const address = normaliseEmail(email);
  const existing = await db
    .prepare('SELECT id, email FROM account WHERE email = ?')
    .bind(address)
    .first<Account>();
  if (existing) return existing;

  const account: Account = { id: newId(), email: address };
  await db
    .prepare('INSERT INTO account (id, email, created_at) VALUES (?, ?, ?)')
    .bind(account.id, account.email, iso(0))
    .run();
  return account;
}

export async function createSession(db: D1Like, accountId: string): Promise<string> {
  const id = `${randomToken(12)}${randomToken(12)}`;
  await db
    .prepare('INSERT INTO session (id, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(id, accountId, iso(0), iso(SESSION_TTL_DAYS * 86_400_000))
    .run();
  return id;
}

/** The account behind a request's cookie, or null. */
export async function readSession(
  db: D1Like,
  cookieHeader: string | null,
): Promise<Account | null> {
  const id = readCookie(cookieHeader, SESSION_COOKIE);
  if (!id) return null;
  const row = await db
    .prepare(
      `SELECT a.id AS id, a.email AS email, s.expires_at AS expires_at
         FROM session s JOIN account a ON a.id = s.account_id
        WHERE s.id = ?`,
    )
    .bind(id)
    .first<{ id: string; email: string; expires_at: string }>();
  if (!row || row.expires_at <= iso(0)) return null;
  return { id: row.id, email: row.email };
}

/** Forget a session. The cookie is cleared by the route that calls this. */
export async function clearSession(db: D1Like, id: string): Promise<void> {
  await db.prepare('DELETE FROM session WHERE id = ?').bind(id).run();
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/**
 * Host-only on purpose: no Domain attribute, so no present or future subdomain
 * can read it. Widening it to the whole domain would expose every session to
 * every subdomain ever deployed under eventevery.com. Do not.
 */
export function sessionCookie(id: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${id}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_DAYS * 86_400}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Clearing header for the same cookie, so the two never drift apart. */
export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
