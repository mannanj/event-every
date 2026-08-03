import { describe, expect, it } from 'vitest';
// @ts-expect-error cloudflare:test is injected by the Workers Vitest pool only.
import { env, runInDurableObject } from 'cloudflare:test';
import type { DurableObjectStateLike } from '../../src/platform/contracts';
import type { IdentityDayPolicy } from '../../src/platform/cloudflare/identity-day-policy';
import type { ResolverRequestAuthority } from '../../src/platform/cloudflare/resolver-request-authority';
import type { DailyCounter } from '../../src/platform/cloudflare/daily-counter';

const dayStart = Date.UTC(2026, 7, 3);
const day = '2026-08-03';

describe('C1-A resolver Durable Objects', () => {
  it('identity schedule freezes once', async () => {
    const id = env.IDENTITY_DAY_POLICY.idFromName(`day-${crypto.randomUUID()}`);
    await runInDurableObject(env.IDENTITY_DAY_POLICY.get(id), async (instance: IdentityDayPolicy, state: DurableObjectStateLike) => {
      await expect(instance.freeze({ scheduleDigest: 'digest-v1', proposedVersion: 'v1', nowMs: dayStart + 1_000 })).resolves.toEqual({ status: 'frozen', version: 'v1' });
      await expect(instance.freeze({ scheduleDigest: 'digest-v1', proposedVersion: 'v1', nowMs: dayStart + 2_000 })).resolves.toEqual({ status: 'frozen', version: 'v1' });
      await expect(instance.freeze({ scheduleDigest: 'digest-v2', proposedVersion: 'v2', nowMs: dayStart + 3_000 })).resolves.toEqual({ status: 'conflict' });
      expect(state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM identity_day_policy').one().count).toBe(1);
    });
  });

  it('begin rejects day mismatch before mutation and claim rejects stored pre-midnight authority day', async () => {
    const id = env.RESOLVER_REQUEST_AUTHORITY.idFromName(`request-${crypto.randomUUID()}`);
    await runInDurableObject(env.RESOLVER_REQUEST_AUTHORITY.get(id), async (instance: ResolverRequestAuthority, state: DurableObjectStateLike) => {
      const base = { requestId: crypto.randomUUID(), identityVersion: 'v1', identityHmac: 'a'.repeat(64), canonicalUrlHmac: 'b'.repeat(64), capabilityDigest: 'c'.repeat(64), permitDeadlineMs: dayStart + 60_000 };
      await expect(instance.begin({ ...base, authorityDay: '2026-08-02', nowMs: dayStart + 1_000 })).resolves.toEqual({ status: 'day-mismatch' });
      expect(state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM resolver_request').one().count).toBe(0);
      const begun = await instance.begin({ ...base, authorityDay: day, nowMs: dayStart + 1_000 });
      expect(begun.status).toBe('begun');
      if (begun.status !== 'begun') return;
      await expect(instance.claim({ executionId: begun.executionId, nowMs: dayStart + 2_000, currentUtcDay: '2026-08-02' })).resolves.toEqual({ status: 'day-mismatch' });
      expect(state.storage.sql.exec<{ state: string; nonce: string | null }>('SELECT state, nonce FROM resolver_request').one()).toEqual({ state: 'begun', nonce: null });
      await expect(instance.claim({ executionId: begun.executionId, nowMs: dayStart + 86_400_000 + 1, currentUtcDay: '2026-08-04' })).resolves.toEqual({ status: 'day-mismatch' });
      const row = state.storage.sql.exec<{ state: string; nonce: string | null }>('SELECT state, nonce FROM resolver_request').one();
      expect(row).toEqual({ state: 'begun', nonce: null });
    });
  });

  it('claim in blackout tombstones without nonce and non-permit result exposes no nonce', async () => {
    const id = env.RESOLVER_REQUEST_AUTHORITY.idFromName(`expiry-${crypto.randomUUID()}`);
    await runInDurableObject(env.RESOLVER_REQUEST_AUTHORITY.get(id), async (instance: ResolverRequestAuthority, state: DurableObjectStateLike) => {
      const begun = await instance.begin({ requestId: crypto.randomUUID(), authorityDay: day, identityVersion: 'v1', identityHmac: 'a'.repeat(64), canonicalUrlHmac: 'b'.repeat(64), capabilityDigest: 'c'.repeat(64), permitDeadlineMs: dayStart + 2_000, nowMs: dayStart + 1_000 });
      expect(begun.status).toBe('begun');
      if (begun.status !== 'begun') return;
      await expect(instance.claim({ executionId: begun.executionId, nowMs: dayStart + 2_000, currentUtcDay: day })).resolves.toEqual({ status: 'expired' });
      expect(state.storage.sql.exec<{ state: string; nonce: string | null }>('SELECT state, nonce FROM resolver_request').one()).toEqual({ state: 'unknown', nonce: null });
      await expect(instance.claim({ executionId: begun.executionId, nowMs: dayStart + 2_001, currentUtcDay: day })).resolves.toEqual({ status: 'unknown' });
    });
  });

  it('busy admission does not increment and expired lease is durable before deletion', async () => {
    const id = env.RESOLVER_DAILY_COUNTER.idFromName(`counter-${crypto.randomUUID()}`);
    await runInDurableObject(env.RESOLVER_DAILY_COUNTER.get(id), async (instance: DailyCounter, state: DurableObjectStateLike) => {
      const base = { requestAuthorityName: 'd'.repeat(64), identityHmac: 'a'.repeat(64), authorityDay: day, currentUtcDay: day };
      await expect(instance.admitResolver({ ...base, currentUtcDay: '2026-08-02', executionId: 'stale', nowMs: dayStart + 500 })).resolves.toEqual({ status: 'day-mismatch' });
      await expect(instance.admitResolver({ ...base, executionId: 'post-midnight', nowMs: dayStart + 86_400_000 + 1 })).resolves.toEqual({ status: 'day-mismatch' });
      expect(state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM resolver_daily_count').one().count).toBe(0);
      const first = await instance.admitResolver({ ...base, executionId: 'one', nowMs: dayStart + 1_000 });
      const second = await instance.admitResolver({ ...base, executionId: 'two', nowMs: dayStart + 1_001 });
      expect(first.status).toBe('admitted');
      expect(second.status).toBe('admitted');
      await expect(instance.admitResolver({ ...base, executionId: 'three', nowMs: dayStart + 1_002 })).resolves.toMatchObject({ status: 'busy' });
      expect(state.storage.sql.exec<{ consumed: number }>('SELECT consumed FROM resolver_daily_count').one().consumed).toBe(2);
      const reconciled = await instance.admitResolver({ ...base, executionId: 'three', nowMs: dayStart + 11_002 });
      expect(reconciled.status).toBe('admitted');
      expect(state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM resolver_reconcile_outbox').one().count).toBe(2);
      expect(state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM resolver_lease').one().count).toBe(1);
    });
  });
});
