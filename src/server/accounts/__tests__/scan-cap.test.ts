import { describe, expect, test } from 'bun:test';

import { SCAN_LIMITS, bucketKey, spend } from '@/server/accounts/rate-limit';
import { OWNER_DAILY_LIMIT_NANODOLLARS, OWNER_VARIANT_POLICY } from '@/platform/provider/policy';

import { migratedDatabase } from './sqlite-d1';

const SECRET = 'test-rate-limit-secret-not-used-anywhere-real';

/**
 * The per-person cap that sits beneath the platform ceiling.
 *
 * The ledger answers "has this app spent too much". This answers "has one
 * person taken too much of it". Task 201 recorded what the gap costs: a
 * handful of failed calls burned 97% of a day and left the site view-only,
 * and nothing stopped one source doing it.
 */

describe('the number', () => {
  test('is a fraction of a day, not a whole one', async () => {
    // Twenty is deliberate arithmetic, not a round figure. An image scan
    // reserves 50,000,000 nanodollars, so the day holds exactly twenty - one
    // person's whole allowance is at most one day of images.
    const images = OWNER_DAILY_LIMIT_NANODOLLARS / OWNER_VARIANT_POLICY['scan-image'].reservationNanodollars;
    expect(SCAN_LIMITS.perIdentity.max).toBe(20);
    expect(SCAN_LIMITS.perIdentity.max).toBeLessThanOrEqual(images);
  });

  test('and text is cheaper, so the cap bites sooner there', async () => {
    // 50 text scans fit in a day, so twenty is under half of it: several
    // people can still use the app on the same day.
    const texts = OWNER_DAILY_LIMIT_NANODOLLARS / OWNER_VARIANT_POLICY['scan-text'].reservationNanodollars;
    expect(SCAN_LIMITS.perIdentity.max).toBeLessThan(texts);
  });

  test('resets on a daily window, matching the budget it sits under', () => {
    expect(SCAN_LIMITS.perIdentity.windowSeconds).toBe(24 * 60 * 60);
  });
});

describe('counting', () => {
  test('allows up to the limit and then refuses', async () => {
    const db = migratedDatabase();
    const key = await bucketKey('scan', 'identity-a', SECRET);

    for (let index = 0; index < SCAN_LIMITS.perIdentity.max; index += 1) {
      const verdict = await spend(db, key, SCAN_LIMITS.perIdentity);
      expect(verdict.allowed).toBe(true);
    }

    const refused = await spend(db, key, SCAN_LIMITS.perIdentity);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfter).toBeGreaterThan(0);
  });

  test('one person running out does not stop another', async () => {
    // The entire point of a per-person cap.
    const db = migratedDatabase();
    const mine = await bucketKey('scan', 'identity-a', SECRET);
    const theirs = await bucketKey('scan', 'identity-b', SECRET);

    for (let index = 0; index < SCAN_LIMITS.perIdentity.max + 1; index += 1) {
      await spend(db, mine, SCAN_LIMITS.perIdentity);
    }
    expect((await spend(db, mine, SCAN_LIMITS.perIdentity)).allowed).toBe(false);
    expect((await spend(db, theirs, SCAN_LIMITS.perIdentity)).allowed).toBe(true);
  });

  test('the bucket is not a list of who scanned', async () => {
    // Same stance as the sign-in limiter: a dump of this table must not be a
    // record of people.
    const db = migratedDatabase();
    const key = await bucketKey('scan', 'known:abc:deadbeef', SECRET);
    await spend(db, key, SCAN_LIMITS.perIdentity);

    const row = db.raw.query('SELECT bucket FROM rate_limit').get() as { bucket: string };
    expect(row.bucket).not.toContain('deadbeef');
    expect(row.bucket).not.toContain('known:');
  });

  test('a different secret produces a different bucket', async () => {
    const a = await bucketKey('scan', 'identity-a', SECRET);
    const b = await bucketKey('scan', 'identity-a', 'a-different-secret');
    expect(a).not.toBe(b);
  });

  test('scan buckets do not collide with sign-in buckets', async () => {
    // Same value, different kind: sharing a bucket would let signing in eat
    // somebody's scans, or the reverse.
    const scan = await bucketKey('scan', 'ada@example.com', SECRET);
    const email = await bucketKey('email', 'ada@example.com', SECRET);
    expect(scan).not.toBe(email);
  });
});
