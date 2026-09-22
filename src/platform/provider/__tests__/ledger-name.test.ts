import { describe, expect, test } from 'bun:test';

import {
  OWNER_DAILY_LIMIT_NANODOLLARS,
  OWNER_POLICY_VERSION,
  ownerBudgetLedgerName,
} from '@/platform/provider/policy';

/**
 * The ledger name, pinned as a LITERAL STRING.
 *
 * This exists to be run before task-245 changes the function, and to fail loudly
 * if that change alters the default name by so much as a character.
 *
 * WHY A LITERAL AND NOT THE FUNCTION. The obvious test - call it on both sides
 * and compare - passes no matter what the function returns, including after a
 * change that renames every ledger. And renaming the default ledger is not a
 * cosmetic event: a request reserved before the deploy stores its day and its
 * policy, and settles afterwards by recomputing the name. If the name moved,
 * settlement addresses a ledger that never held the reservation, `settle`
 * answers `conflict`, the outbox retries until the OLD ledger's lease sweep
 * bills the full reservation, and task-201's 285x overcharge lands on a request
 * that actually succeeded.
 *
 * So the name is written out by hand. If it changes, somebody has to change it
 * here too, deliberately.
 */
describe('the default ledger name', () => {
  test('is exactly this string', () => {
    expect(ownerBudgetLedgerName('2026-09-21')).toBe('owner-v1:1000000000:2026-09-21');
  });

  test('and is built from the policy and the limit, in that order', () => {
    // Stated separately so that if the constants move, the failure says which
    // half moved rather than just "the string is different".
    expect(OWNER_POLICY_VERSION).toBe('owner-v1');
    expect(OWNER_DAILY_LIMIT_NANODOLLARS).toBe(1_000_000_000);
    expect(ownerBudgetLedgerName('2026-09-21')).toBe(
      `${OWNER_POLICY_VERSION}:${OWNER_DAILY_LIMIT_NANODOLLARS}:2026-09-21`,
    );
  });

  test('varies only by the day', () => {
    expect(ownerBudgetLedgerName('2026-01-01')).toBe('owner-v1:1000000000:2026-01-01');
    expect(ownerBudgetLedgerName('2027-12-31')).toBe('owner-v1:1000000000:2027-12-31');
  });

  test('a day it has never seen still produces a name rather than throwing', () => {
    // It is a pure string builder and must stay one. Validation of the day
    // belongs to the budget authority, which refuses a bad one there.
    expect(ownerBudgetLedgerName('')).toBe('owner-v1:1000000000:');
  });
});
