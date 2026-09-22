/**
 * Fixed-window rate limiting, in D1.
 *
 * WHY THIS EXISTS, given that Turnstile is already on the form.
 *
 * They answer different questions. Turnstile asks "is this a browser driven by
 * a person" and charges an attacker a little for each submission. A rate limit
 * asks "has this already happened too many times", and is the only one of the
 * two that stops a slow, patient, perfectly human-looking drip — or a farm of
 * solved tokens, which is a commodity service.
 *
 * The resource being protected is not CPU. It is *your domain's ability to send
 * email*. Without a limit, anyone can make this app mail an address they chose,
 * as often as they like. The victim gets the mailbomb; you get the spam
 * reports, and the sending reputation damage lands on every legitimate magic
 * link you send afterwards.
 *
 * HOW IT COUNTS. A fixed window: the clock is chopped into equal blocks and
 * each bucket gets an allowance per block. One row per bucket per window, and
 * one UPSERT to both increment and read. The alternative — a row per attempt,
 * counted over a trailing range — is more precise and costs a table that grows
 * with your traffic and a COUNT on the hot path.
 *
 * The imprecision is real and worth stating: someone can spend a full
 * allowance at the end of one window and another at the start of the next,
 * briefly achieving twice the nominal rate. For "how many emails may this
 * address cause", that is an acceptable seam.
 */

import type { D1Like } from './d1';

export interface Limit {
  /** How many are allowed per window. */
  max: number;
  /** How long a window lasts, in seconds. */
  windowSeconds: number;
}

export interface LimitVerdict {
  allowed: boolean;
  /** How many remain in this window. Zero when refused. */
  remaining: number;
  /** Seconds until the window rolls over, for a Retry-After header. */
  retryAfter: number;
}

/**
 * Count one attempt against a bucket, and say whether it is allowed.
 *
 * The increment and the read are one statement. Doing them separately is a
 * race: two requests both read 2, both decide 2 < 3, and both proceed — which
 * is exactly the situation a limit exists to prevent, and exactly the bug that
 * only appears under the load you wrote the limit for.
 */
/**
 * The stored bucket key, keyed-hashed.
 *
 * A rate_limit table keyed on a literal `email:someone@example.com` is a log of
 * who tried to sign in and when - including people who never completed sign-up -
 * and it lands in every D1 export, backup and Time Travel snapshot. Hashing it
 * keeps the counting behaviour identical and stops the table being that log.
 *
 * HMAC rather than a plain digest, because a plain digest of this input is
 * reversible in practice: the whole IPv4 space is four billion SHA-256s, and
 * addresses fall to a wordlist. A keyed hash is only reversible by someone who
 * also holds the key, which is not in the database.
 *
 * The kind stays in the clear so two kinds cannot collide and a bucket is still
 * legible as an address or an IP when debugging.
 */
export async function bucketKey(
  kind: 'email' | 'ip' | 'scan',
  value: string,
  secret: string | undefined,
): Promise<string> {
  if (!secret) {
    // Refuse rather than fall back to a plain key: a missing secret would
    // quietly turn this table back into a log of people.
    throw new Error('RATE_LIMIT_HASH_SECRET is not set; refusing to key buckets in the clear.');
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${kind}:${value}`));
  // Base64url keeps the row short. The full 256 bits are retained: a truncated
  // digest would start colliding buckets across unrelated people.
  let binary = '';
  for (const byte of new Uint8Array(mac)) binary += String.fromCharCode(byte);
  return `${kind}:${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export async function spend(
  db: D1Like,
  bucket: string,
  limit: Limit
): Promise<LimitVerdict> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSeconds / limit.windowSeconds) * limit.windowSeconds;
  const windowEnd = windowStart + limit.windowSeconds;
  const expiresAt = new Date(windowEnd * 1000).toISOString();

  const row = await db
    .prepare(
      `INSERT INTO rate_limit (bucket, window_start, count, expires_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT (bucket, window_start)
       DO UPDATE SET count = count + 1
       RETURNING count`
    )
    .bind(bucket, windowStart, expiresAt)
    .first<{ count: number }>();

  const used = row?.count ?? 1;
  return {
    allowed: used <= limit.max,
    remaining: Math.max(0, limit.max - used),
    retryAfter: Math.max(1, windowEnd - nowSeconds),
  };
}

/**
 * The limits on asking for a sign-in link.
 *
 * Two buckets, because they catch different things. The address limit stops
 * someone being mailbombed through your app — it is the one that protects a
 * third party. The IP limit stops one source working through a list of
 * addresses, which the address limit cannot see.
 *
 * Deliberately generous. Someone who mistypes their address, then mistypes it
 * again, then gets it right, must not be locked out; three in a quarter hour
 * leaves room for that and still makes a mailbomb useless.
 *
 * The second bucket is an order of magnitude looser, and stays that way: it
 * exists only to catch one source working through a list of addresses, which is
 * a burst, not a trickle. Sixty an hour is one a minute sustained - no person
 * approaches it, a script hits it inside a minute. Standardised across the
 * account (skeleton, Meet Time, Green Light, mannan.is) so the number means the
 * same thing everywhere.
 *
 * Note that here the second bucket keys on the admission identity rather than a
 * raw IP, so the usual "a whole office behind one NAT address locks itself out"
 * argument is weaker in this repo than in the others. The value is for
 * consistency, not because that risk is load-bearing here.
 */
export const SIGN_IN_LIMITS = {
  perEmail: { max: 3, windowSeconds: 15 * 60 },
  perIp: { max: 60, windowSeconds: 60 * 60 },
} as const;

/**
 * How much of a day one person may take.
 *
 * WHY A PER-USER CAP EXISTS BENEATH THE PLATFORM CEILING. The owner ledger is
 * $1 a day shared by everybody who is not an admin. Without a second limit
 * underneath it, the first visitor to scan forty posters ends the day for
 * everyone else - and task-201 measured the worse version of that, where a
 * handful of FAILED calls burned 97% of a day at the full reservation.
 *
 * The platform ceiling answers "has this app spent too much". This answers "has
 * one person taken too much of it". They are different questions and a single
 * number cannot answer both, which is the argument Green Light's design makes
 * and the gap Event Every had.
 *
 * TWENTY A DAY, and the arithmetic is deliberate. An image scan reserves
 * 50,000,000 nanodollars, so the day holds twenty of them; a text scan reserves
 * 20,000,000, so the day holds fifty. Twenty is therefore "a whole day of
 * images, or under half a day of text" for one person - generous for real use,
 * and it still leaves the day survivable when somebody loops. It is a fairness
 * rule, not a spending limit: the ledger is still what says no about money.
 *
 * Keyed per UTC day so it lines up with the budget it sits under, and hashed
 * like every other bucket so the table is not a log of who scanned what.
 */
export const SCAN_LIMITS = {
  perIdentity: { max: 20, windowSeconds: 24 * 60 * 60 },
} as const;

/**
 * Delete windows that have passed.
 *
 * Not called on the hot path — a cron trigger is the right place. Left here so
 * that when the table is noticed growing, the answer is already written.
 */
export async function sweepRateLimits(db: D1Like): Promise<number> {
  const result = await db
    .prepare('DELETE FROM rate_limit WHERE expires_at < ?')
    .bind(new Date().toISOString())
    .run();
  return result.meta.changes ?? 0;
}
