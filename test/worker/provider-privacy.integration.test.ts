import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error cloudflare:test is injected by the Workers Vitest pool only.
import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import type { DurableObjectStateLike } from '../../src/platform/contracts';
import type { ProviderRequestAuthority } from '../../src/platform/cloudflare/provider-request-authority';
import type { OwnerBudgetAuthority } from '../../src/platform/cloudflare/owner-budget-authority';
import type { ProviderOperationDependencies } from '../../src/platform/cloudflare/provider-operation';
import { runCoordinatedScanJob } from '../../src/server/scanner/job';
import { providerRequestName } from '../../src/platform/provider/request-binding';
import { REPLAY_RETENTION_MS } from '../../src/platform/provider/policy';

const RAW = 'raw-only-marker-2f84d1';
const PROVIDER = 'provider-envelope-marker-91cb30';
const SECRET = 'private-secret-marker-7e13f0';
const RESULT = 'Documented Result';
const NOW = Date.UTC(2026, 7, 13, 12);
const DAY = '2026-08-13';
const claim = <T>(value: T) => ({ value, confidence: null, evidence: [] });
const providerValue = {
  choices: [{ finish_reason: 'stop', refusal: null, message: { content: JSON.stringify({
    candidates: [{ sourceUid: null, title: claim(RESULT), description: claim(null), location: claim(null), url: claim(null), temporal: claim({ start: null, end: null, duration: null, allDay: 'unknown' }), recurrence: claim(null), issues: [] }],
    issues: [],
  }) } }],
  usage: { cost: 0.000000001 },
  provider_debug: PROVIDER,
};

function serialized(value: unknown): string { return JSON.stringify(value); }
function assertPrivate(value: unknown, allowResult = false): void {
  const text = serialized(value);
  for (const marker of [RAW, PROVIDER, SECRET]) expect(text).not.toContain(marker);
  if (!allowResult) expect(text).not.toContain(RESULT);
}
function resultPaths(value: unknown, path = '$'): string[] {
  if (typeof value === 'string') return value.includes(RESULT) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => resultPaths(entry, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) => resultPaths(entry, `${path}.${key}`));
}

describe('provider privacy canary', () => {
  it('keeps raw input, provider envelope, and owner secret out of responses, logs, SQL, outboxes, and caches', async () => {
    const requestId = crypto.randomUUID(); const sourceId = crypto.randomUUID(); const contentHandle = crypto.randomUUID();
    const requestName = await providerRequestName(requestId); let providerCalls = 0;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cacheStorage = caches as unknown as CacheStorage & { default: Cache };
    const cacheOpen = vi.spyOn(cacheStorage, 'open');
    const defaultCachePut = vi.spyOn(cacheStorage.default, 'put');
    try {
      const job = {
        requestId,
        request: { kind: 'text', text: `meeting notes ${RAW}` },
        source: { sourceId, kind: 'text', contentHandle },
        bindingCandidates: [{ version: 'c1-b-current-v1', digest: 'e'.repeat(64) }],
        signal: new AbortController().signal,
        candidateIdFactory: () => crypto.randomUUID(),
      } as const;
      const operationDependencies: ProviderOperationDependencies = {
        requestAuthority: env.PROVIDER_REQUEST_AUTHORITY,
        ownerBudgetAuthority: env.OWNER_BUDGET_AUTHORITY,
        ownerKey: SECRET,
        callProvider: async (input) => {
          providerCalls += 1; expect(input.apiKey).toBe(SECRET);
          expect(serialized(input.providerBody)).toContain(RAW);
          return { status: 'success', value: providerValue, costOutcome: { kind: 'exact', nanodollars: 1 } };
        },
        now: () => NOW,
        deadlineSignal: () => new AbortController().signal,
      };
      const response = await runCoordinatedScanJob(job, { operationDependencies });
      expect(response).toMatchObject({ status: 'completed', value: { candidates: [{ title: { value: RESULT, evidence: [] } }] } });
      expect(providerCalls).toBe(1);
      assertPrivate(response, true);
      expect(resultPaths(response)).toEqual(['$.value.candidates[0].title.value']);

      const replay = await runCoordinatedScanJob({ ...job, request: { kind: 'text', text: `changed retry ${RAW}` } }, { operationDependencies });
      expect(replay).toEqual(response); expect(providerCalls).toBe(1); assertPrivate(replay, true);
      expect(resultPaths(replay)).toEqual(['$.value.candidates[0].title.value']);

      const requestStub = env.PROVIDER_REQUEST_AUTHORITY.get(env.PROVIDER_REQUEST_AUTHORITY.idFromName(requestName));
      const requestRows = await runInDurableObject(requestStub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => ({
        request: state.storage.sql.exec<Record<string, unknown>>('SELECT * FROM provider_request').toArray(),
        outbox: state.storage.sql.exec<Record<string, unknown>>('SELECT * FROM provider_request_outbox').toArray(),
        tombstone: state.storage.sql.exec<Record<string, unknown>>('SELECT * FROM provider_request_tombstone').toArray(),
      }));
      const budgetStub = env.OWNER_BUDGET_AUTHORITY.get(env.OWNER_BUDGET_AUTHORITY.idFromName(DAY));
      const budgetRows = await runInDurableObject(budgetStub, (_instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => ({
        policy: state.storage.sql.exec<Record<string, unknown>>('SELECT * FROM owner_budget_policy').toArray(),
        operations: state.storage.sql.exec<Record<string, unknown>>('SELECT * FROM owner_budget_operation').toArray(),
      }));
      assertPrivate(requestRows.request, true); assertPrivate(requestRows.outbox); assertPrivate(requestRows.tombstone); assertPrivate(budgetRows);
      expect(requestRows.request).toHaveLength(1);
      for (const [column, value] of Object.entries(requestRows.request[0]!)) {
        if (column === 'replay_json') expect(serialized(value)).toContain(RESULT);
        else expect(serialized(value)).not.toContain(RESULT);
      }
      await runInDurableObject(requestStub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
        const expiry = Date.now() - 1;
        const terminal = expiry - REPLAY_RETENTION_MS;
        state.storage.sql.exec(
          'UPDATE provider_request SET created_at_ms = ?, transport_deadline_ms = ?, committed_until_ms = ?, terminal_at_ms = ?, replay_expires_at_ms = ?, phase_deadline_ms = ?',
          terminal - 1, terminal + 1, terminal + 60_001, terminal, expiry, expiry,
        );
        return state.storage.setAlarm(Date.now() + 10_000);
      });
      expect(await runDurableObjectAlarm(requestStub)).toBe(true);
      const afterExpiry = await runInDurableObject(requestStub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => ({
        request: state.storage.sql.exec<Record<string, unknown>>('SELECT * FROM provider_request').toArray(),
        outbox: state.storage.sql.exec<Record<string, unknown>>('SELECT * FROM provider_request_outbox').toArray(),
        tombstone: state.storage.sql.exec<Record<string, unknown>>('SELECT * FROM provider_request_tombstone').toArray(),
      }));
      expect(afterExpiry.request).toEqual([]); assertPrivate(afterExpiry); expect(serialized(afterExpiry)).not.toContain(RESULT);
      assertPrivate([log.mock.calls, warn.mock.calls, error.mock.calls]);
      expect(cacheOpen).not.toHaveBeenCalled(); expect(defaultCachePut).not.toHaveBeenCalled();
    } finally {
      log.mockRestore(); warn.mockRestore(); error.mockRestore(); cacheOpen.mockRestore(); defaultCachePut.mockRestore();
    }
  });

  it('keeps image bytes and fixed provider errors out of durable and client projections', async () => {
    const requestId = crypto.randomUUID(); const requestName = await providerRequestName(requestId);
    const dataUrl = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cacheStorage = caches as unknown as CacheStorage & { default: Cache };
    const cacheOpen = vi.spyOn(cacheStorage, 'open');
    const defaultCachePut = vi.spyOn(cacheStorage.default, 'put');
    try {
      const response = await runCoordinatedScanJob({
        requestId, request: { kind: 'image', dataUrl },
        source: { sourceId: crypto.randomUUID(), kind: 'image', contentHandle: crypto.randomUUID() },
        bindingCandidates: [{ version: 'c1-b-current-v1', digest: 'f'.repeat(64) }],
        signal: new AbortController().signal, candidateIdFactory: () => crypto.randomUUID(),
      }, { operationDependencies: {
        requestAuthority: env.PROVIDER_REQUEST_AUTHORITY, ownerBudgetAuthority: env.OWNER_BUDGET_AUTHORITY, ownerKey: SECRET,
        callProvider: async () => ({ status: 'failed', failure: { code: 'provider_rejected', httpStatus: 502 }, costOutcome: { kind: 'missing' }, providerStatus: 400 }),
        now: () => NOW, deadlineSignal: () => new AbortController().signal,
      } });
      expect(response).toMatchObject({ status: 'failed', code: 'provider_rejected', httpStatus: 502 }); assertPrivate(response);
      const stub = env.PROVIDER_REQUEST_AUTHORITY.get(env.PROVIDER_REQUEST_AUTHORITY.idFromName(requestName));
      const rows = await runInDurableObject(stub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => state.storage.sql.exec<Record<string, unknown>>('SELECT * FROM provider_request').toArray());
      expect(serialized(rows)).not.toContain(dataUrl); assertPrivate(rows);
      const calls = [log.mock.calls, warn.mock.calls, error.mock.calls];
      expect(serialized(calls)).not.toContain(dataUrl); assertPrivate(calls);
      expect(cacheOpen).not.toHaveBeenCalled(); expect(defaultCachePut).not.toHaveBeenCalled();
    } finally {
      log.mockRestore(); warn.mockRestore(); error.mockRestore(); cacheOpen.mockRestore(); defaultCachePut.mockRestore();
    }
  });
});
