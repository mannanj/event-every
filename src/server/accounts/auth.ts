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
 * The MCP state field the skeleton carries on `login_token` is deliberately
 * absent: Event Every has no MCP Worker yet. See tasks/task-202.md, which adds
 * it back rather than leaving a column nothing writes.
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

/** Mint a single-use sign-in link token. */
export async function createLoginToken(db: D1Like, email: string): Promise<string> {
  // Two draws rather than one long one: randomToken caps at a byte per
  // character, and 24 characters of this alphabet is ~120 bits.
  const token = `${randomToken(12)}${randomToken(12)}`;
  await db
    .prepare(
      `INSERT INTO login_token (token_hash, email, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(
      await hashToken(token),
      normaliseEmail(email),
      iso(0),
      iso(LOGIN_TOKEN_TTL_MINUTES * 60_000),
    )
    .run();
  return token;
}

/**
 * Spend a sign-in link. Single use and time limited; the account is created on
 * first sign-in, so there is no separate registration step to build or explain.
 */
export async function consumeLoginToken(
  db: D1Like,
  token: string,
): Promise<Account | null> {
  const hash = await hashToken(token);
  const row = await db
    .prepare('SELECT email, expires_at, used_at FROM login_token WHERE token_hash = ?')
    .bind(hash)
    .first<{ email: string; expires_at: string; used_at: string | null }>();
  if (!row || row.used_at || row.expires_at <= iso(0)) return null;

  // Burn it first: a replay must lose even if what follows is slow. The
  // `AND used_at IS NULL` makes the burn the race, so two simultaneous clicks
  // cannot both win it.
  const burn = await db
    .prepare('UPDATE login_token SET used_at = ? WHERE token_hash = ? AND used_at IS NULL')
    .bind(iso(0), hash)
    .run();
  if (!burn.meta.changes) return null;

  return upsertAccount(db, row.email);
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
