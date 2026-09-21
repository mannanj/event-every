import { normaliseEmail } from './auth';
import type { D1Like } from './d1';

/**
 * Who is not subject to the daily cap.
 *
 * Ported from ~/Documents/greenlights/web/lib/adminAccess.ts, whose design is
 * followed here rather than reinvented.
 *
 * TWO WAYS TO BE UNCAPPED, AND THEY ARE NOT THE SAME THING:
 *
 *   admin      the owner list. Unbounded, and carries every other
 *              administrative power with it.
 *
 *   unlimited  a column on one account. Lifts the daily cap and NOTHING
 *              else: no admin surface, no ability to grant it to anyone.
 *
 * Collapsing these into one flag is the mistake the shape exists to avoid.
 * "May bypass the spend cap" and "may do administrative things" are different
 * questions, and answering both with one bit means that the day somebody needs
 * uncapped spend, they get everything else too.
 *
 * THE BACKSTOP GREEN LIGHT HAS AND THIS DOES NOT. There, both tiers still sit
 * under a monthly budget governor - a platform ceiling rather than a per-user
 * fairness rule. Event Every has only the daily authority, so an uncapped
 * account here is uncapped full stop. That is a real difference from the design
 * being copied, and it is stated rather than papered over. See tasks/task-244.md.
 */

export const DEFAULT_ADMIN_EMAILS = ['hello@mannan.is'] as const;

type AdminEnv = Record<string, string | undefined>;

function splitAdminEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * The compiled-in list plus anything the environment adds. Additive on purpose:
 * an env var that could REMOVE the owner would be a way to lock him out of his
 * own deployment with a typo.
 */
export function adminEmails(env: AdminEnv = {}): ReadonlySet<string> {
  const emails = new Set<string>();
  for (const email of DEFAULT_ADMIN_EMAILS) {
    const normalised = normaliseEmail(email);
    if (normalised) emails.add(normalised);
  }
  for (const email of splitAdminEmails(env.EVENT_EVERY_ADMIN_EMAILS)) {
    const normalised = normaliseEmail(email);
    if (normalised) emails.add(normalised);
  }
  return emails;
}

export function isAdminEmail(email: string | null | undefined, env: AdminEnv = {}): boolean {
  if (!email) return false;
  const normalised = normaliseEmail(email);
  return normalised ? adminEmails(env).has(normalised) : false;
}

export interface CapSubject {
  email: string;
  unlimited?: boolean;
}

/**
 * Whether the daily cap applies to this person.
 *
 * NULL MEANS YES. A signed-out visitor is capped, and that is the answer that
 * must never drift: an exemption that defaults to "exempt" is not a role, it is
 * a hole.
 */
export function shouldEnforceDailyCaps(
  subject: CapSubject | null | undefined,
  env: AdminEnv = {},
): boolean {
  if (!subject) return true;
  if (subject.unlimited) return false;
  return !isAdminEmail(subject.email, env);
}

/**
 * Read the account's own flag.
 *
 * Re-derived per call rather than baked into a session or an OAuth token, so
 * revoking it takes effect immediately instead of whenever the token happens to
 * expire. The same reasoning the MCP README gives for role membership.
 */
export async function readCapSubject(
  db: D1Like,
  accountId: string,
): Promise<CapSubject | null> {
  const row = await db
    .prepare('SELECT email, unlimited FROM account WHERE id = ?')
    .bind(accountId)
    .first<{ email: string; unlimited: number }>();
  if (!row) return null;
  return { email: row.email, unlimited: row.unlimited === 1 };
}

export async function setUnlimited(
  db: D1Like,
  accountId: string,
  unlimited: boolean,
): Promise<void> {
  await db
    .prepare('UPDATE account SET unlimited = ? WHERE id = ?')
    .bind(unlimited ? 1 : 0, accountId)
    .run();
}
