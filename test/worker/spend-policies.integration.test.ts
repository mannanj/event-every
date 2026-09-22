import { describe, expect, it } from 'vitest';
// @ts-expect-error cloudflare:test is injected by the Workers Vitest pool only.
import { env } from 'cloudflare:test';
import {
  ADMIN_POLICY_VERSION,
  OWNER_POLICY_VERSION,
  ownerBudgetLedgerName,
  spendLimitFor,
} from '../../src/platform/provider/policy';

/**
 * Two tiers, two ledgers, and the one property that makes it worth doing:
 * neither can exhaust the other.
 *
 * The tier is carried on `policy_version`, which the request row already
 * stored. No new column, so no schema migration on a Durable Object that
 * asserts its schema rather than versioning it - see tasks/task-245.md for why
 * the column design could never have finished rolling out.
 */

type BudgetStub = ReturnType<(typeof env)['OWNER_BUDGET_AUTHORITY']['get']>;

const authorityDay = '2026-09-22';

function ledger(policyVersion: string, label: string): BudgetStub {
  // A fresh instance per test, named the way production names it.
  const id = env.OWNER_BUDGET_AUTHORITY.idFromName(
    `${ownerBudgetLedgerName(authorityDay, policyVersion as never)}:${label}-${crypto.randomUUID()}`,
  );
  return env.OWNER_BUDGET_AUTHORITY.get(id);
}

function binding(policyVersion: string, overrides: Record<string, unknown> = {}) {
  return {
    executionId: crypto.randomUUID(),
    requestAuthorityName: crypto.randomUUID().replaceAll('-', '').padEnd(64, 'a'),
    authorityDay,
    route: 'scan' as const,
    variant: 'scan-image' as const,
    policyVersion,
    reservationNanodollars: 50_000_000,
    ...overrides,
  };
}

describe('the ledger name', () => {
  it('is unchanged for the owner, byte for byte', () => {
    // The whole migration story rests on this. A request that reserved before
    // this change settles after it by recomputing the name from its stored row.
    expect(ownerBudgetLedgerName(authorityDay)).toBe('owner-v1:1000000000:2026-09-22');
    expect(ownerBudgetLedgerName(authorityDay, OWNER_POLICY_VERSION)).toBe(
      'owner-v1:1000000000:2026-09-22',
    );
  });

  it('differs for the admin tier', () => {
    expect(ownerBudgetLedgerName(authorityDay, ADMIN_POLICY_VERSION)).toBe(
      'admin-v1:1000000000:2026-09-22',
    );
    expect(ownerBudgetLedgerName(authorityDay, ADMIN_POLICY_VERSION)).not.toBe(
      ownerBudgetLedgerName(authorityDay),
    );
  });
});

describe('a day opened under a policy', () => {
  it('accepts reservations under that policy', async () => {
    const stub = ledger(ADMIN_POLICY_VERSION, 'admin-open');
    await expect(stub.reserve(binding(ADMIN_POLICY_VERSION))).resolves.toMatchObject({
      status: 'reserved',
    });
  });

  it('refuses a different policy against the same instance', async () => {
    // The two never share an instance in production, because the name differs.
    // This is the belt: if something ever did point both at one ledger, the day
    // it was opened under wins and the other is refused rather than silently
    // spending from it.
    const stub = ledger(ADMIN_POLICY_VERSION, 'admin-mixed');
    await expect(stub.reserve(binding(ADMIN_POLICY_VERSION))).resolves.toMatchObject({
      status: 'reserved',
    });
    await expect(stub.reserve(binding(OWNER_POLICY_VERSION))).resolves.toEqual({
      status: 'conflict',
    });
  });

  it('records the policy it was actually opened with', async () => {
    // The latent bug this replaced: the row was INSERTed with the constant and
    // compared against the input on the next line. Equal while there was one
    // policy; permanent conflict the moment there were two.
    const stub = ledger(ADMIN_POLICY_VERSION, 'admin-recorded');
    await expect(stub.reserve(binding(ADMIN_POLICY_VERSION))).resolves.toMatchObject({
      status: 'reserved',
    });
    // A second reserve under the same policy must still be admitted - it would
    // not be if the row had been stamped `owner-v1`.
    await expect(stub.reserve(binding(ADMIN_POLICY_VERSION))).resolves.toMatchObject({
      status: 'reserved',
    });
  });
});

describe('isolation', () => {
  it('exhausting one tier leaves the other untouched', async () => {
    // The reason the feature exists.
    const admin = ledger(ADMIN_POLICY_VERSION, 'admin-full');
    const owner = ledger(OWNER_POLICY_VERSION, 'owner-spare');

    const slots = spendLimitFor(ADMIN_POLICY_VERSION) / 50_000_000;
    for (let index = 0; index < slots; index += 1) {
      await expect(admin.reserve(binding(ADMIN_POLICY_VERSION))).resolves.toMatchObject({
        status: 'reserved',
      });
    }
    await expect(admin.reserve(binding(ADMIN_POLICY_VERSION))).resolves.toMatchObject({
      status: 'exhausted',
    });

    // The owner's day has not been touched by any of that.
    await expect(owner.reserve(binding(OWNER_POLICY_VERSION))).resolves.toMatchObject({
      status: 'reserved',
    });
  });

  it('and the same the other way round', async () => {
    const admin = ledger(ADMIN_POLICY_VERSION, 'admin-spare');
    const owner = ledger(OWNER_POLICY_VERSION, 'owner-full');

    const slots = spendLimitFor(OWNER_POLICY_VERSION) / 50_000_000;
    for (let index = 0; index < slots; index += 1) {
      await expect(owner.reserve(binding(OWNER_POLICY_VERSION))).resolves.toMatchObject({
        status: 'reserved',
      });
    }
    await expect(owner.reserve(binding(OWNER_POLICY_VERSION))).resolves.toMatchObject({
      status: 'exhausted',
    });

    await expect(admin.reserve(binding(ADMIN_POLICY_VERSION))).resolves.toMatchObject({
      status: 'reserved',
    });
  });
});

describe('an unknown policy', () => {
  it('is refused rather than opening a ledger of its own', async () => {
    // Otherwise any string would mint a fresh budget, which is an unlimited
    // spend surface reachable by typo.
    const stub = ledger(OWNER_POLICY_VERSION, 'unknown');
    await expect(stub.reserve(binding('owner-v99'))).resolves.toEqual({ status: 'conflict' });
    await expect(stub.reserve(binding(''))).resolves.toEqual({ status: 'conflict' });
  });
});
