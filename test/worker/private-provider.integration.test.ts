import { describe, expect, it } from 'vitest';
// @ts-expect-error cloudflare:test is injected by the Workers Vitest pool only.
import { env, evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { runProviderOperation } from '../../src/platform/cloudflare/provider-operation';
import type { DurableObjectStateLike } from '../../src/platform/contracts';
import type { ProviderRequestAuthority } from '../../src/platform/cloudflare/provider-request-authority';
import { providerRequestName } from '../../src/platform/provider/request-binding';
import { toDurableSummaryReplay, toDurableTimezoneReplay } from '../../src/platform/provider/replay';
import type { ProviderTransportResult } from '../../src/platform/provider/transport';

const DAY = '2026-08-13';
const NOW = Date.UTC(2026, 7, 13, 12);
const binding = [{ version: 'c1-b-current-v1', digest: 'a'.repeat(64) }];
const success = (value: unknown): ProviderTransportResult => ({ status: 'success', value, costOutcome: { kind: 'exact', nanodollars: 1 } });

function dependencies(callProvider: () => Promise<ProviderTransportResult>, now = NOW) {
  return {
    requestAuthority: env.PROVIDER_REQUEST_AUTHORITY,
    ownerBudgetAuthority: env.OWNER_BUDGET_AUTHORITY,
    ownerKey: 'private-secret-marker-7e13f0',
    callProvider,
    now: () => now,
    deadlineSignal: () => new AbortController().signal,
  };
}

async function runVariant(
  variant: 'scan-text' | 'scan-image' | 'summarize' | 'resolve-timezone',
  replay: unknown,
  callProvider: () => Promise<ProviderTransportResult> = async () => success({ choices: [] }),
  requestId = crypto.randomUUID(),
  now = NOW,
) {
  return runProviderOperation({
    requestId, variant, bindingCandidates: binding, signal: new AbortController().signal,
    execute: async (invoke) => {
      const transport = await invoke({ messages: [] });
      if (transport.status !== 'success') throw new Error('closed provider outcome');
      return replay;
    },
  }, dependencies(callProvider, now));
}

describe('private provider Workerd recovery scenarios', () => {
  it('stores minimized text, image, summary, and timezone replays under four distinct UUIDs', async () => {
    const source = (kind: 'text' | 'image') => ({
      source: { sourceId: crypto.randomUUID(), kind, contentHandle: crypto.randomUUID() },
      candidates: [], issues: [],
    });
    const results = await Promise.all([
      runVariant('scan-text', source('text')),
      runVariant('scan-image', source('image')),
      runVariant('summarize', toDurableSummaryReplay('Documented Result')),
      runVariant('resolve-timezone', toDurableTimezoneReplay({ timezone: 'America/New_York', confidence: 0.99 })),
    ]);
    expect(results.map((value) => value.status === 'failed' ? `${value.status}:${value.code}` : value.status))
      .toEqual(['completed', 'completed', 'completed', 'completed']);
  });

  it('keeps abort and provider failure fixed, and an ambiguous retry performs one transport', async () => {
    const aborted = new AbortController(); aborted.abort();
    await expect(runProviderOperation({
      requestId: crypto.randomUUID(), variant: 'summarize', bindingCandidates: binding,
      signal: aborted.signal, execute: async () => ({ summary: 'Never Stored' }),
    }, dependencies(async () => success({})))).resolves.toEqual({ status: 'unavailable' });

    const failed = await runVariant('summarize', { summary: 'Never Stored' }, async () => ({
      status: 'failed', failure: { code: 'provider_rejected', httpStatus: 502 },
      costOutcome: { kind: 'missing' }, providerStatus: 400,
    }));
    expect(failed).toMatchObject({ status: 'failed', code: 'provider_rejected', httpStatus: 502 });

    const requestId = crypto.randomUUID(); let transports = 0;
    const first = await runVariant('summarize', { summary: 'Never Stored' }, async () => { transports += 1; throw new Error('provider crash'); }, requestId);
    const retry = await runVariant('summarize', { summary: 'Replacement Result' }, async () => { transports += 1; return success({}); }, requestId, NOW + 86_400_000);
    expect(first).toMatchObject({ status: 'unknown', code: 'provider_outcome_unknown' });
    expect(retry).toEqual(first);
    expect(transports).toBe(1);
  });

  it('freezes the original UTC day across a completed replay and read-only retry', async () => {
    const requestId = crypto.randomUUID(); let transports = 0;
    const first = await runVariant('summarize', toDurableSummaryReplay('Documented Result'), async () => { transports += 1; return success({ choices: [] }); }, requestId, NOW);
    const retry = await runVariant('summarize', toDurableSummaryReplay('Changed Result'), async () => { transports += 1; return success({ choices: [] }); }, requestId, NOW + 86_400_000);
    expect(first.status).toBe('completed'); expect(retry).toEqual(first); expect(transports).toBe(1);
    const name = await providerRequestName(requestId); const stub = env.PROVIDER_REQUEST_AUTHORITY.get(env.PROVIDER_REQUEST_AUTHORITY.idFromName(name));
    const row = await runInDurableObject(stub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => state.storage.sql.exec<{ authority_day: string }>('SELECT authority_day FROM provider_request').one());
    expect(row.authority_day).toBe(DAY);
  });

  it('keeps a failed settlement in a privacy-safe outbox and recovers by alarm without another transport', async () => {
    const requestId = crypto.randomUUID(); const requestName = await providerRequestName(requestId);
    const stub = env.PROVIDER_REQUEST_AUTHORITY.get(env.PROVIDER_REQUEST_AUTHORITY.idFromName(requestName));
    let transports = 0; let realRequestEnv: unknown;
    const first = await runProviderOperation({
      requestId, variant: 'summarize', bindingCandidates: binding, signal: new AbortController().signal,
      execute: async (invoke) => {
        const transport = await invoke({ messages: [] });
        if (transport.status !== 'success') throw new Error('closed provider outcome');
        await runInDurableObject(stub, (instance: ProviderRequestAuthority) => {
          const internals = instance as unknown as { requestEnv: unknown };
          realRequestEnv = internals.requestEnv;
          internals.requestEnv = { OWNER_BUDGET_AUTHORITY: {
            idFromName: () => 'synthetic-settlement-failure',
            get: () => ({ release: async () => ({ status: 'conflict' as const }), settle: async () => { throw new Error('synthetic settlement failure'); } }),
          } };
        });
        return toDurableSummaryReplay('Documented Result');
      },
    }, dependencies(async () => { transports += 1; return success({ choices: [] }); }));
    expect(first).toMatchObject({ status: 'completed', settlement: 'settlement_pending' });

    const retry = await runVariant('summarize', toDurableSummaryReplay('Changed Result'), async () => { transports += 1; return success({}); }, requestId);
    expect(retry).toEqual(first); expect(transports).toBe(1);
    await runInDurableObject(stub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      (instance as unknown as { requestEnv: unknown }).requestEnv = realRequestEnv;
      const outbox = state.storage.sql.exec<Record<string, unknown>>('SELECT * FROM provider_request_outbox').toArray();
      const text = JSON.stringify(outbox);
      for (const marker of ['raw-only-marker-2f84d1', 'provider-envelope-marker-91cb30', 'private-secret-marker-7e13f0', 'Documented Result']) expect(text).not.toContain(marker);
      expect(outbox).toHaveLength(1);
      state.storage.sql.exec('UPDATE provider_request_outbox SET next_attempt_ms = ?', Date.now());
      await state.storage.deleteAlarm();
    });
    await evictDurableObject(stub); expect(await runDurableObjectAlarm(stub)).toBe(true);
    const recovered = await runInDurableObject(stub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => ({
      request: state.storage.sql.exec<Record<string, unknown>>('SELECT settlement_state FROM provider_request').one(),
      outbox: state.storage.sql.exec<Record<string, unknown>>('SELECT * FROM provider_request_outbox').toArray(),
    }));
    expect(recovered).toEqual({ request: { settlement_state: 'settlement_complete' }, outbox: [] });
    expect(transports).toBe(1);
  });

  it('serializes the final owner-budget slot so only one concurrent reservation wins', async () => {
    const budget = env.OWNER_BUDGET_AUTHORITY.get(env.OWNER_BUDGET_AUTHORITY.idFromName(`${DAY}-final-${crypto.randomUUID()}`));
    const base = (executionId: string, requestAuthorityName: string) => ({
      executionId, requestAuthorityName, authorityDay: DAY, route: 'scan' as const, variant: 'scan-image' as const,
      policyVersion: 'owner-v1' as const, reservationNanodollars: 50_000_000,
    });
    const seeded = await Promise.all(Array.from({ length: 99 }, (_value, index) => budget.reserve(base(
      crypto.randomUUID(),
      `${'b'.repeat(56)}${index.toString(16).padStart(8, '0')}`,
    ))));
    expect(seeded.every((value: { status: string }) => value.status === 'reserved')).toBe(true);
    const racers = await Promise.all([
      budget.reserve(base(crypto.randomUUID(), 'c'.repeat(64))),
      budget.reserve(base(crypto.randomUUID(), 'd'.repeat(64))),
    ]);
    expect(racers.map((value: { status: string }) => value.status).sort()).toEqual(['exhausted', 'reserved']);
  });
});
