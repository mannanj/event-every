import { describe, expect, it } from 'vitest';
// @ts-expect-error cloudflare:test is injected by the Workers Vitest pool only.
import { env, runInDurableObject } from 'cloudflare:test';
import type { DurableObjectStateLike } from '../../src/platform/contracts';
import type { IdentityDayPolicy } from '../../src/platform/cloudflare/identity-day-policy';
import type { ResolverRequestAuthority } from '../../src/platform/cloudflare/resolver-request-authority';
import type { DailyCounter } from '../../src/platform/cloudflare/daily-counter';
import { fetchWithResolverPolicy } from '../../src/platform/resolver/url-policy';
// @ts-expect-error Vite supplies the authored Wrangler file as a raw test module.
import wranglerSource from '../../wrangler.jsonc?raw';

const dayStart = Date.UTC(2026, 7, 3);
const day = '2026-08-03';

describe('C1-A resolver Durable Objects', () => {
  it('the Worker runtime rejects a DNS-rebinding/private-address fetch without following it', async () => {
    let calls = 0;
    const rebindingFetch = async () => {
      calls++;
      throw new TypeError('Network connection lost because the destination became private');
    };
    await expect(fetchWithResolverPolicy(
      'https://public.example.test/event',
      new AbortController().signal,
      rebindingFetch as unknown as typeof fetch,
    )).rejects.toThrow('destination became private');
    expect(calls).toBe(1);
  });

  it('the Workerd fixture causally pins global_fetch_strictly_public for the rebinding simulation', () => {
    expect(wranglerSource.match(/"global_fetch_strictly_public"/g)).toHaveLength(1);
    expect(wranglerSource).toContain('"compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"]');
  });

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

  it('an identical pre-claim failure reopens for busy retry while post-claim failure stays terminal', async () => {
    const id = env.RESOLVER_REQUEST_AUTHORITY.idFromName(`busy-replay-${crypto.randomUUID()}`);
    await runInDurableObject(env.RESOLVER_REQUEST_AUTHORITY.get(id), async (instance: ResolverRequestAuthority) => {
      const input = { requestId: crypto.randomUUID(), authorityDay: day, identityVersion: 'v1', identityHmac: 'a'.repeat(64), canonicalUrlHmac: 'b'.repeat(64), capabilityDigest: 'c'.repeat(64), permitDeadlineMs: dayStart + 60_000, nowMs: dayStart + 1_000 };
      const first = await instance.begin(input);
      expect(first.status).toBe('begun');
      if (first.status !== 'begun') return;
      await expect(instance.complete({ executionId: first.executionId, outcome: 'failed', nowMs: dayStart + 2_000 })).resolves.toEqual({ status: 'stored' });
      for (const changed of [
        { identityVersion: 'v2' },
        { identityHmac: 'd'.repeat(64) },
        { canonicalUrlHmac: 'e'.repeat(64) },
        { capabilityDigest: 'f'.repeat(64) },
        { permitDeadlineMs: dayStart + 59_000 },
      ]) {
        await expect(instance.begin({ ...input, ...changed, nowMs: dayStart + 2_500 })).resolves.toEqual({ status: 'conflict' });
      }
      await expect(instance.begin({ ...input, authorityDay: '2026-08-02', nowMs: dayStart + 2_500 })).resolves.toEqual({ status: 'day-mismatch' });
      await expect(instance.begin({ ...input, nowMs: input.permitDeadlineMs })).resolves.toEqual({ status: 'expired' });
      await expect(instance.begin({ ...input, nowMs: dayStart + 3_000 })).resolves.toEqual({ status: 'begun', executionId: first.executionId });
      await expect(instance.claim({ executionId: first.executionId, nowMs: dayStart + 4_000, currentUtcDay: day })).resolves.toMatchObject({ status: 'permit' });
      await expect(instance.complete({ executionId: first.executionId, outcome: 'failed', nowMs: dayStart + 5_000 })).resolves.toEqual({ status: 'stored' });
      await expect(instance.begin({ ...input, nowMs: dayStart + 6_000 })).resolves.toEqual({ status: 'conflict' });
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
