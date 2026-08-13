import { describe, expect, it } from 'vitest';
// @ts-expect-error cloudflare:test is injected by the Workers Vitest pool only.
import { env, evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import type { ProviderRequestAuthority } from '../../src/platform/cloudflare/provider-request-authority';
import type { DurableObjectStateLike } from '../../src/platform/contracts';
import {
  OWNER_POLICY_VERSION,
  OWNER_VARIANT_POLICY,
  PRE_PERMIT_LEASE_MS,
  REPLAY_RETENTION_MS,
} from '../../src/platform/provider/policy';

type RequestStub = ReturnType<(typeof env)['PROVIDER_REQUEST_AUTHORITY']['get']>;
type RequestState =
  | 'prepared'
  | 'reserved'
  | 'budget_committed'
  | 'provider_inflight'
  | 'completed'
  | 'failed'
  | 'unknown'
  | 'expired';
type BindingCandidate = Readonly<{ version: string; digest: string }>;
type BeginInput = Readonly<{
  requestDigest: string;
  route: 'scan' | 'resolve-timezone' | 'summarize';
  variant: 'scan-text' | 'scan-image' | 'resolve-timezone' | 'summarize';
  bindingCandidates: readonly BindingCandidate[];
  proposedAuthorityDay: string;
  policyVersion: string;
  reservationNanodollars: number;
}>;
type RequestRow = Readonly<{
  request_digest: string;
  execution_id: string;
  route: string;
  variant: string;
  shape_digest: string;
  shape_key_version: string;
  authority_day: string;
  policy_version: string;
  reservation_nanodollars: number;
  state: RequestState;
  settlement_state: 'settlement_pending' | 'settlement_complete' | null;
  created_at_ms: number;
  phase_deadline_ms: number;
  transport_deadline_ms: number | null;
  committed_until_ms: number | null;
  permit_verifier: string | null;
  replay_json: string | null;
  error_code: string | null;
  http_status: number | null;
  cost_kind: string | null;
  cost_nanodollars: number | null;
  terminal_class: 'completed' | 'failed' | 'unknown' | null;
  terminal_at_ms: number | null;
  replay_expires_at_ms: number | null;
}>;
type OutboxRow = Readonly<{
  execution_id: string;
  operation: 'release' | 'settle';
  cost_kind: 'exact' | 'missing' | 'malformed' | 'positive-overflow';
  cost_nanodollars: number | null;
  retry_count: number;
  next_attempt_ms: number;
}>;
type TableColumn = Readonly<{
  cid: number;
  name: string;
  type: string;
  notnull: 0 | 1;
  dflt_value: string | null;
  pk: 0 | 1;
}>;

const DEFAULT_DAY = '2026-08-12';
const SUMMARY_REPLAY = Object.freeze({ summary: 'Planning Session' });

function authority(label: string): RequestStub {
  const namespace = env.PROVIDER_REQUEST_AUTHORITY;
  const id = namespace.idFromName(`${label}-${crypto.randomUUID()}`);
  return namespace.get(id);
}

function digest(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

function beginInput(overrides: Partial<BeginInput> = {}): BeginInput {
  return {
    requestDigest: digest('a'),
    route: 'summarize',
    variant: 'summarize',
    bindingCandidates: [{ version: 'shape-v1', digest: digest('b') }],
    proposedAuthorityDay: DEFAULT_DAY,
    policyVersion: OWNER_POLICY_VERSION,
    reservationNanodollars: 500_000,
    ...overrides,
  };
}

async function requestRows(stub: RequestStub): Promise<RequestRow[]> {
  return runInDurableObject(stub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) =>
    state.storage.sql.exec<RequestRow>('SELECT * FROM provider_request').toArray());
}

async function outboxRows(stub: RequestStub): Promise<OutboxRow[]> {
  return runInDurableObject(stub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) =>
    state.storage.sql.exec<OutboxRow>('SELECT * FROM provider_request_outbox').toArray());
}

async function tombstoneRows(stub: RequestStub) {
  return runInDurableObject(stub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) =>
    state.storage.sql.exec<{
      requestDigest: string;
      executionId: string;
      terminalClass: string;
      state: string;
    }>(`SELECT request_digest AS requestDigest, execution_id AS executionId,
      terminal_class AS terminalClass, state FROM provider_request_tombstone`).toArray());
}

async function beginPrepared(stub: RequestStub, input = beginInput()) {
  const result = await stub.begin(input);
  expect(result).toMatchObject({ status: 'pending', phase: 'prepared' });
  if (result.status !== 'pending') throw new Error('expected prepared request');
  return result;
}

async function recordReserved(stub: RequestStub, input = beginInput()) {
  const prepared = await beginPrepared(stub, input);
  const payload = {
    executionId: prepared.executionId,
    authorityDay: prepared.authorityDay,
    reservationNanodollars: input.reservationNanodollars,
  };
  await expect(stub.recordReservation(payload)).resolves.toEqual({ status: 'recorded', phase: 'reserved' });
  return { input, prepared, payload };
}

async function recordCommitted(stub: RequestStub, input = beginInput()) {
  const reserved = await recordReserved(stub, input);
  const transportDeadlineMs = Date.now() + 10 * 60_000;
  const committedUntilMs = transportDeadlineMs + 60_000;
  const payload = {
    executionId: reserved.prepared.executionId,
    transportDeadlineMs,
    committedUntilMs,
  };
  await expect(stub.recordBudgetCommitted(payload)).resolves.toEqual({
    status: 'recorded',
    phase: 'budget_committed',
    transportDeadlineMs,
    committedUntilMs,
  });
  return { ...reserved, payload, transportDeadlineMs, committedUntilMs };
}

async function claim(stub: RequestStub, input = beginInput()) {
  const committed = await recordCommitted(stub, input);
  const claimPayload = { executionId: committed.prepared.executionId };
  const permit = await stub.claimTransport(claimPayload);
  expect(permit).toMatchObject({ status: 'permit', transportDeadlineMs: committed.transportDeadlineMs });
  if (permit.status !== 'permit') throw new Error('expected provider permit');
  return { ...committed, claimPayload, permit };
}

async function claimWithBudget(stub: RequestStub, input: BeginInput) {
  const prepared = await beginPrepared(stub, input);
  const budget = env.OWNER_BUDGET_AUTHORITY.get(env.OWNER_BUDGET_AUTHORITY.idFromName(input.proposedAuthorityDay));
  const budgetBinding = {
    executionId: prepared.executionId,
    requestAuthorityName: input.requestDigest,
    authorityDay: input.proposedAuthorityDay,
    route: input.route,
    variant: input.variant,
    policyVersion: input.policyVersion,
    reservationNanodollars: input.reservationNanodollars,
  };
  await expect(budget.reserve(budgetBinding)).resolves.toMatchObject({ status: 'reserved' });
  await expect(stub.recordReservation({
    executionId: prepared.executionId,
    authorityDay: input.proposedAuthorityDay,
    reservationNanodollars: input.reservationNanodollars,
  })).resolves.toMatchObject({ status: 'recorded', phase: 'reserved' });
  const committed = await budget.commit(budgetBinding);
  expect(committed.status).toBe('committed');
  if (committed.status !== 'committed') throw new Error('expected committed budget');
  await expect(stub.recordBudgetCommitted({
    executionId: prepared.executionId,
    transportDeadlineMs: committed.transportDeadlineMs,
    committedUntilMs: committed.committedUntilMs,
  })).resolves.toMatchObject({ status: 'recorded', phase: 'budget_committed' });
  const permit = await stub.claimTransport({ executionId: prepared.executionId });
  expect(permit.status).toBe('permit');
  if (permit.status !== 'permit') throw new Error('expected permit');
  return { prepared, budget, budgetBinding, committed, permit };
}

async function forceReplayExpiry(stub: RequestStub): Promise<void> {
  await runInDurableObject(stub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
    const replayExpiresAtMs = Date.now() - 1;
    const terminalAtMs = replayExpiresAtMs - REPLAY_RETENTION_MS;
    state.storage.sql.exec(
      "UPDATE provider_request SET created_at_ms = ?, terminal_at_ms = ?, replay_expires_at_ms = ?, phase_deadline_ms = ? WHERE state IN ('completed','failed')",
      terminalAtMs,
      terminalAtMs,
      replayExpiresAtMs,
      replayExpiresAtMs,
    );
    return state.storage.setAlarm(Date.now() + 10_000);
  });
}

describe('ProviderRequestAuthority SQLite Durable Object', () => {
  it('creates the exact accepted schemas and survives eviction before and after every durable phase', { timeout: 30_000 }, async () => {
    const stub = authority('schema-phases');
    const input = beginInput();

    await runInDurableObject(stub, () => undefined);
    await evictDurableObject(stub);
    const prepared = await beginPrepared(stub, input);
    expect(prepared.authorityDay).toBe(input.proposedAuthorityDay);
    expect(prepared.shapeKeyVersion).toBe('shape-v1');
    expect(prepared.reservedUntilMs).toBeGreaterThan(Date.now());
    expect(prepared.reservedUntilMs).toBeLessThanOrEqual(Date.now() + PRE_PERMIT_LEASE_MS);
    await evictDurableObject(stub);
    await expect(stub.begin(input)).resolves.toEqual(prepared);

    const reservation = {
      executionId: prepared.executionId,
      authorityDay: prepared.authorityDay,
      reservationNanodollars: input.reservationNanodollars,
    };
    await evictDurableObject(stub);
    const reserved = await stub.recordReservation(reservation);
    expect(reserved).toEqual({ status: 'recorded', phase: 'reserved' });
    await evictDurableObject(stub);
    await expect(stub.recordReservation(reservation)).resolves.toEqual(reserved);

    const transportDeadlineMs = Date.now() + 10 * 60_000;
    const committedUntilMs = transportDeadlineMs + 60_000;
    const budgetCommit = { executionId: prepared.executionId, transportDeadlineMs, committedUntilMs };
    await evictDurableObject(stub);
    const committed = await stub.recordBudgetCommitted(budgetCommit);
    expect(committed).toEqual({ status: 'recorded', phase: 'budget_committed', transportDeadlineMs, committedUntilMs });
    await evictDurableObject(stub);
    await expect(stub.recordBudgetCommitted(budgetCommit)).resolves.toEqual(committed);

    await evictDurableObject(stub);
    const permit = await stub.claimTransport({ executionId: prepared.executionId });
    expect(permit).toMatchObject({ status: 'permit', transportDeadlineMs });
    if (permit.status !== 'permit') return;
    await evictDurableObject(stub);
    await expect(stub.claimTransport({ executionId: prepared.executionId })).resolves.toEqual({
      status: 'pending',
      phase: 'provider_inflight',
      executionId: prepared.executionId,
      authorityDay: input.proposedAuthorityDay,
      shapeKeyVersion: 'shape-v1',
      transportDeadlineMs,
    });

    const completePayload = {
      executionId: prepared.executionId,
      nonce: permit.nonce,
      replay: SUMMARY_REPLAY,
      costOutcome: { kind: 'exact' as const, nanodollars: 1 },
    };
    await evictDurableObject(stub);
    const completed = await stub.completeKnown(completePayload);
    expect(completed).toMatchObject({ status: 'stored', outcome: { status: 'completed', replay: SUMMARY_REPLAY } });
    await evictDurableObject(stub);
    await expect(stub.completeKnown(completePayload)).resolves.toEqual({ status: 'rejected' });
    expect((await requestRows(stub))[0]).toMatchObject({ state: 'completed', terminal_class: 'completed' });

    await runInDurableObject(stub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      const applicationTables = state.storage.sql.exec<{ name: string }>(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
      ).toArray().map(({ name }) => name);
      const requestColumns = state.storage.sql.exec<TableColumn>('PRAGMA table_info(provider_request)').toArray();
      const outboxColumns = state.storage.sql.exec<TableColumn>('PRAGMA table_info(provider_request_outbox)').toArray();
      const tombstoneColumns = state.storage.sql.exec<TableColumn>('PRAGMA table_info(provider_request_tombstone)').toArray();
      const requestSql = state.storage.sql.exec<{ sql: string }>(
        "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'provider_request'",
      ).one().sql;
      expect(applicationTables).toEqual(['provider_request', 'provider_request_outbox', 'provider_request_tombstone']);
      expect(requestColumns.map(({ name, type }) => ({ name, type }))).toEqual([
        { name: 'request_digest', type: 'TEXT' },
        { name: 'execution_id', type: 'TEXT' },
        { name: 'route', type: 'TEXT' },
        { name: 'variant', type: 'TEXT' },
        { name: 'shape_digest', type: 'TEXT' },
        { name: 'shape_key_version', type: 'TEXT' },
        { name: 'authority_day', type: 'TEXT' },
        { name: 'policy_version', type: 'TEXT' },
        { name: 'reservation_nanodollars', type: 'INTEGER' },
        { name: 'state', type: 'TEXT' },
        { name: 'settlement_state', type: 'TEXT' },
        { name: 'created_at_ms', type: 'INTEGER' },
        { name: 'phase_deadline_ms', type: 'INTEGER' },
        { name: 'transport_deadline_ms', type: 'INTEGER' },
        { name: 'committed_until_ms', type: 'INTEGER' },
        { name: 'permit_verifier', type: 'TEXT' },
        { name: 'replay_json', type: 'TEXT' },
        { name: 'error_code', type: 'TEXT' },
        { name: 'http_status', type: 'INTEGER' },
        { name: 'cost_kind', type: 'TEXT' },
        { name: 'cost_nanodollars', type: 'INTEGER' },
        { name: 'terminal_class', type: 'TEXT' },
        { name: 'terminal_at_ms', type: 'INTEGER' },
        { name: 'replay_expires_at_ms', type: 'INTEGER' },
      ]);
      expect(outboxColumns.map(({ name, type }) => ({ name, type }))).toEqual([
        { name: 'execution_id', type: 'TEXT' },
        { name: 'operation', type: 'TEXT' },
        { name: 'cost_kind', type: 'TEXT' },
        { name: 'cost_nanodollars', type: 'INTEGER' },
        { name: 'retry_count', type: 'INTEGER' },
        { name: 'next_attempt_ms', type: 'INTEGER' },
      ]);
      expect(tombstoneColumns.map(({ name, type }) => ({ name, type }))).toEqual([
        { name: 'request_digest', type: 'TEXT' },
        { name: 'execution_id', type: 'TEXT' },
        { name: 'terminal_class', type: 'TEXT' },
        { name: 'state', type: 'TEXT' },
      ]);
      expect(requestSql).toMatch(/state\s+IN\s*\(\s*'prepared'\s*,\s*'reserved'\s*,\s*'budget_committed'\s*,\s*'provider_inflight'\s*,\s*'completed'\s*,\s*'failed'\s*,\s*'unknown'\s*,\s*'expired'\s*\)/i);
      expect(requestSql).toMatch(/settlement_state\s+IN\s*\(\s*'settlement_pending'\s*,\s*'settlement_complete'\s*\)/i);
    });

    await forceReplayExpiry(stub);
    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await evictDurableObject(stub);
    await expect(stub.status({})).resolves.toEqual({
      status: 'expired',
      executionId: prepared.executionId,
      terminalClass: 'completed',
    });
  });

  it('freezes the original day and matching key version across midnight and accepts a previous-key retry', async () => {
    const stub = authority('key-day-freeze');
    const original = beginInput({
      proposedAuthorityDay: '2026-08-12',
      bindingCandidates: [{ version: 'shape-v1', digest: digest('c') }],
    });
    const first = await beginPrepared(stub, original);
    await evictDurableObject(stub);
    const retry = await stub.begin({
      ...original,
      proposedAuthorityDay: '2026-08-13',
      bindingCandidates: [
        { version: 'shape-v2', digest: digest('d') },
        { version: 'shape-v1', digest: digest('c') },
      ],
    });
    expect(retry).toEqual(first);
    expect(retry).toMatchObject({ authorityDay: '2026-08-12', shapeKeyVersion: 'shape-v1' });

    for (const changed of [
      { requestDigest: digest('e') },
      { route: 'scan' as const, variant: 'scan-text' as const, reservationNanodollars: 20_000_000 },
      { bindingCandidates: [{ version: 'shape-v1', digest: digest('f') }] },
      { policyVersion: 'owner-v2' },
      { reservationNanodollars: 500_001 },
    ]) {
      await expect(stub.begin({ ...original, ...changed })).resolves.toEqual({ status: 'conflict' });
    }
    expect(await requestRows(stub)).toHaveLength(1);
  });

  it('never persists or reissues the raw nonce and verifies a valid nonce after eviction', async () => {
    const stub = authority('permit-verifier');
    const inflight = await claim(stub);
    expect(inflight.permit.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = (await requestRows(stub))[0];
    expect(stored.state).toBe('provider_inflight');
    expect(stored.permit_verifier).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(inflight.permit.nonce);

    await evictDurableObject(stub);
    const secondClaim = await stub.claimTransport(inflight.claimPayload);
    expect(secondClaim).toMatchObject({ status: 'pending', phase: 'provider_inflight' });
    expect(secondClaim).not.toHaveProperty('nonce');

    const wrongNonce = 'A'.repeat(43);
    await expect(stub.completeKnown({
      executionId: inflight.prepared.executionId,
      nonce: wrongNonce,
      replay: SUMMARY_REPLAY,
      costOutcome: { kind: 'exact', nanodollars: 1 },
    })).resolves.toEqual({ status: 'rejected' });
    expect((await requestRows(stub))[0].state).toBe('provider_inflight');

    await evictDurableObject(stub);
    await expect(stub.completeKnown({
      executionId: inflight.prepared.executionId,
      nonce: inflight.permit.nonce,
      replay: SUMMARY_REPLAY,
      costOutcome: { kind: 'exact', nanodollars: 1 },
    })).resolves.toMatchObject({ status: 'stored', outcome: { status: 'completed' } });
  });

  it('uses the stored absolute deadline and makes an exact-boundary completion late and unknown', async () => {
    const stub = authority('absolute-deadline');
    const inflight = await claim(stub);
    await evictDurableObject(stub);
    await runInDurableObject(stub, async (instance: ProviderRequestAuthority) => {
      const originalNow = Date.now;
      Date.now = () => inflight.transportDeadlineMs;
      try {
        await expect(instance.completeKnown({
          executionId: inflight.prepared.executionId,
          nonce: inflight.permit.nonce,
          replay: SUMMARY_REPLAY,
          costOutcome: { kind: 'exact', nanodollars: 1 },
        })).resolves.toEqual({ status: 'late', outcome: { status: 'unknown', code: 'provider_outcome_unknown', httpStatus: 502, settlement: 'settlement_pending' } });
      } finally {
        Date.now = originalNow;
      }
    });
    expect((await requestRows(stub))[0]).toMatchObject({
      state: 'unknown',
      error_code: 'provider_outcome_unknown',
      cost_kind: 'missing',
      terminal_class: 'unknown',
    });
    expect(await outboxRows(stub)).toEqual([expect.objectContaining({ operation: 'settle', cost_kind: 'missing' })]);
    await evictDurableObject(stub);
    await expect(stub.claimTransport(inflight.claimPayload)).resolves.toMatchObject({ status: 'unknown' });
  });

  it.each([
    ['completed', 'completeKnown', { replay: SUMMARY_REPLAY, costOutcome: { kind: 'exact', nanodollars: 1 } }],
    ['failed', 'completeFailed', { code: 'provider_timeout', httpStatus: 504, costOutcome: { kind: 'missing' } }],
    ['unknown', 'completeUnknown', { code: 'provider_outcome_unknown' }],
  ] as const)('review finding 3: stores fixed %s observations while rejecting terminal completion RPCs after eviction', async (phase, method, detail) => {
    const stub = authority(`terminal-${phase}`);
    const inflight = await claim(stub);
    const payload = { executionId: inflight.prepared.executionId, nonce: inflight.permit.nonce, ...detail };
    await evictDurableObject(stub);
    const first = await stub[method](payload as never);
    expect(first).toMatchObject({ status: 'stored', outcome: { status: phase } });
    await evictDurableObject(stub);
    await expect(stub[method](payload as never)).resolves.toEqual({ status: 'rejected' });
    const status = await stub.status({});
    expect(status).toEqual(first.outcome);
    const laterClaim = await stub.claimTransport(inflight.claimPayload);
    expect(laterClaim).toEqual(first.outcome);
    expect(laterClaim).not.toHaveProperty('nonce');
    expect((await requestRows(stub))[0]).toMatchObject({ state: phase, terminal_class: phase, permit_verifier: null });
  });

  it('review finding 4: rejects invalid failure/accounting combinations and routes outcome-unknown only through its dedicated RPC', async () => {
    const stub = authority('failure-table-rejections');
    const inflight = await claim(stub);
    const invalid = [
      { code: 'provider_outcome_unknown', httpStatus: 502, costOutcome: { kind: 'missing' } },
      { code: 'accounting_policy_breach', httpStatus: 502, costOutcome: { kind: 'missing' } },
      { code: 'accounting_cost_overflow', httpStatus: 502, costOutcome: { kind: 'positive-overflow' } },
      { code: 'provider_timeout', httpStatus: 504, costOutcome: { kind: 'exact', nanodollars: 1 } },
    ] as const;
    for (const detail of invalid) {
      await expect(stub.completeFailed({
        executionId: inflight.prepared.executionId,
        nonce: inflight.permit.nonce,
        ...detail,
      })).resolves.toEqual({ status: 'rejected' });
      expect((await requestRows(stub))[0]).toMatchObject({ state: 'provider_inflight' });
      expect(await outboxRows(stub)).toHaveLength(0);
    }
    await expect(stub.completeUnknown({
      executionId: inflight.prepared.executionId,
      nonce: inflight.permit.nonce,
      code: 'provider_outcome_unknown',
    })).resolves.toMatchObject({ status: 'stored', outcome: { status: 'unknown' } });
  });

  it('review finding 4: settles provider failures at the full reservation and freezes only budget-derived accounting breaches', async () => {
    const failureDay = '2026-09-23';
    const failureStub = authority('failure-full-settlement');
    const failureInput = beginInput({ proposedAuthorityDay: failureDay, requestDigest: digest('6') });
    const failed = await claimWithBudget(failureStub, failureInput);
    await expect(failureStub.completeFailed({
      executionId: failed.prepared.executionId,
      nonce: failed.permit.nonce,
      code: 'provider_timeout',
      httpStatus: 504,
      costOutcome: { kind: 'missing' },
    })).resolves.toEqual({
      status: 'stored',
      outcome: { status: 'failed', code: 'provider_timeout', httpStatus: 504, settlement: 'settlement_complete' },
    });
    await expect(failed.budget.status({ authorityDay: failureDay })).resolves.toMatchObject({
      spentNanodollars: failureInput.reservationNanodollars,
      reservedNanodollars: 0,
      frozen: false,
    });

    for (const [suffix, costOutcome, code] of [
      ['breach', { kind: 'exact' as const, nanodollars: 500_001 }, 'accounting_policy_breach'],
      ['overflow', { kind: 'positive-overflow' as const }, 'accounting_cost_overflow'],
    ] as const) {
      const day = suffix === 'breach' ? '2026-09-24' : '2026-09-25';
      const stub = authority(`accounting-${suffix}`);
      const input = beginInput({ proposedAuthorityDay: day, requestDigest: digest(suffix === 'breach' ? '5' : '4') });
      const accounting = await claimWithBudget(stub, input);
      const stored = await stub.completeKnown({
        executionId: accounting.prepared.executionId,
        nonce: accounting.permit.nonce,
        replay: SUMMARY_REPLAY,
        costOutcome,
      });
      expect(stored).toEqual({
        status: 'stored',
        outcome: { status: 'failed', code, httpStatus: 502, settlement: 'settlement_complete' },
      });
      await expect(accounting.budget.status({ authorityDay: day })).resolves.toMatchObject({ frozen: true });
      await evictDurableObject(stub);
      await expect(stub.status({})).resolves.toEqual(stored.outcome);
      await expect(stub.completeKnown({
        executionId: accounting.prepared.executionId,
        nonce: accounting.permit.nonce,
        replay: SUMMARY_REPLAY,
        costOutcome,
      })).resolves.toEqual({ status: 'rejected' });
    }
  });

  it('creates and drains the settlement outbox through the frozen-day budget authority', async () => {
    const day = '2026-09-21';
    const stub = authority('settlement-outbox');
    const input = beginInput({ proposedAuthorityDay: day });
    const prepared = await beginPrepared(stub, input);
    const budgetId = env.OWNER_BUDGET_AUTHORITY.idFromName(day);
    const budget = env.OWNER_BUDGET_AUTHORITY.get(budgetId);
    const budgetBinding = {
      executionId: prepared.executionId,
      requestAuthorityName: input.requestDigest,
      authorityDay: day,
      route: input.route,
      variant: input.variant,
      policyVersion: input.policyVersion,
      reservationNanodollars: input.reservationNanodollars,
    };
    await expect(budget.reserve(budgetBinding)).resolves.toMatchObject({ status: 'reserved' });
    await expect(stub.recordReservation({
      executionId: prepared.executionId,
      authorityDay: day,
      reservationNanodollars: input.reservationNanodollars,
    })).resolves.toMatchObject({ status: 'recorded' });
    const committed = await budget.commit(budgetBinding);
    expect(committed.status).toBe('committed');
    if (committed.status !== 'committed') return;
    await stub.recordBudgetCommitted({
      executionId: prepared.executionId,
      transportDeadlineMs: committed.transportDeadlineMs,
      committedUntilMs: committed.committedUntilMs,
    });
    const permit = await stub.claimTransport({ executionId: prepared.executionId });
    expect(permit.status).toBe('permit');
    if (permit.status !== 'permit') return;

    const stored = await stub.completeKnown({
      executionId: prepared.executionId,
      nonce: permit.nonce,
      replay: SUMMARY_REPLAY,
      costOutcome: { kind: 'exact', nanodollars: 1 },
    });
    expect(stored).toEqual({
      status: 'stored',
      outcome: { status: 'completed', replay: SUMMARY_REPLAY, settlement: 'settlement_complete' },
    });
    expect(await outboxRows(stub)).toHaveLength(0);
    expect((await requestRows(stub))[0].settlement_state).toBe('settlement_complete');
    await expect(budget.status({ authorityDay: day })).resolves.toMatchObject({
      spentNanodollars: 1,
      reservedNanodollars: 0,
    });
  });

  it('review finding 1: arms outbox-only alarms before settlement awaits and recovers after an eviction at the SQLite boundary', async () => {
    const day = '2026-09-22';
    const stub = authority('outbox-alarm-eviction');
    const input = beginInput({ proposedAuthorityDay: day, requestDigest: digest('7') });
    const prepared = await beginPrepared(stub, input);
    const budget = env.OWNER_BUDGET_AUTHORITY.get(env.OWNER_BUDGET_AUTHORITY.idFromName(day));
    const budgetBinding = {
      executionId: prepared.executionId,
      requestAuthorityName: input.requestDigest,
      authorityDay: day,
      route: input.route,
      variant: input.variant,
      policyVersion: input.policyVersion,
      reservationNanodollars: input.reservationNanodollars,
    };
    await expect(budget.reserve(budgetBinding)).resolves.toMatchObject({ status: 'reserved' });
    await stub.recordReservation({
      executionId: prepared.executionId,
      authorityDay: day,
      reservationNanodollars: input.reservationNanodollars,
    });
    const committed = await budget.commit(budgetBinding);
    expect(committed.status).toBe('committed');
    if (committed.status !== 'committed') throw new Error('expected committed budget');
    await stub.recordBudgetCommitted({
      executionId: prepared.executionId,
      transportDeadlineMs: committed.transportDeadlineMs,
      committedUntilMs: committed.committedUntilMs,
    });
    const permit = await stub.claimTransport({ executionId: prepared.executionId });
    expect(permit.status).toBe('permit');
    if (permit.status !== 'permit') throw new Error('expected permit');

    await runInDurableObject(stub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      const internals = instance as unknown as { requestEnv: unknown };
      const realEnv = internals.requestEnv;
      let alarmObservedDuringAwait: number | null = null;
      internals.requestEnv = {
        OWNER_BUDGET_AUTHORITY: {
          idFromName: () => 'test-budget-id',
          get: () => ({
            release: async () => ({ status: 'conflict' as const }),
            settle: async () => {
              alarmObservedDuringAwait = await state.storage.getAlarm();
              return { status: 'conflict' as const };
            },
          }),
        },
      };
      await instance.completeKnown({
        executionId: prepared.executionId,
        nonce: permit.nonce,
        replay: SUMMARY_REPLAY,
        costOutcome: { kind: 'exact', nanodollars: 1 },
      });
      state.storage.sql.exec('UPDATE provider_request_outbox SET next_attempt_ms = ?', Date.now());
      await state.storage.deleteAlarm();
      alarmObservedDuringAwait = null;
      await instance.alarm();
      expect(alarmObservedDuringAwait).not.toBeNull();

      internals.requestEnv = realEnv;
      state.storage.sql.exec('UPDATE provider_request_outbox SET next_attempt_ms = ?', Date.now());
      await state.storage.deleteAlarm();
      state.storage.sql.exec(`CREATE TRIGGER crash_outbox_finish
        BEFORE DELETE ON provider_request_outbox
        BEGIN SELECT RAISE(ABORT, 'synthetic post-settlement eviction'); END`);
      await expect(instance.alarm()).resolves.toBeUndefined();
      expect(await state.storage.getAlarm()).not.toBeNull();
      expect(state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM provider_request_outbox').one().count).toBe(1);
      state.storage.sql.exec('DROP TRIGGER crash_outbox_finish');
      state.storage.sql.exec('UPDATE provider_request_outbox SET next_attempt_ms = ?', Date.now());
    });

    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await outboxRows(stub)).toHaveLength(0);
    expect((await requestRows(stub))[0]).toMatchObject({ state: 'completed', settlement_state: 'settlement_complete' });
  });

  it('review finding 1: never moves an already-durable alarm later from a completion RPC', async () => {
    const stub = authority('rpc-alarm-monotonic');
    const inflight = await claim(stub);
    await runInDurableObject(stub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      const existingAlarm = Date.now() + 60_000;
      await state.storage.setAlarm(existingAlarm);
      const storage = state.storage as DurableObjectStateLike['storage'] & { setAlarm(timestamp: number): Promise<void> };
      const originalSetAlarm = storage.setAlarm;
      const originalNow = Date.now;
      const writes: number[] = [];
      storage.setAlarm = async (timestamp: number) => {
        writes.push(timestamp);
        await originalSetAlarm.call(storage, timestamp);
      };
      Date.now = () => existingAlarm;
      try {
        await instance.completeKnown({
          executionId: inflight.prepared.executionId,
          nonce: inflight.permit.nonce,
          replay: SUMMARY_REPLAY,
          costOutcome: { kind: 'exact', nanodollars: 1 },
        });
      } finally {
        storage.setAlarm = originalSetAlarm;
        Date.now = originalNow;
      }
      expect(writes.every((timestamp) => timestamp <= existingAlarm)).toBe(true);
      expect(await state.storage.getAlarm()).toBeLessThanOrEqual(existingAlarm);
    });
  });

  it('keeps the pre-work alarm recovery write no later than an already-durable alarm', async () => {
    const stub = authority('alarm-handler-monotonic-recovery');
    await beginPrepared(stub);
    await runInDurableObject(stub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      const originalNow = Date.now;
      const existingAlarm = originalNow() + 10_000;
      await state.storage.setAlarm(existingAlarm);
      const storage = state.storage as DurableObjectStateLike['storage'] & { setAlarm(timestamp: number): Promise<void> };
      const originalSetAlarm = storage.setAlarm;
      const writes: number[] = [];
      storage.setAlarm = async (timestamp: number) => {
        writes.push(timestamp);
        await originalSetAlarm.call(storage, timestamp);
      };
      Date.now = () => existingAlarm + 100;
      try {
        await instance.alarm();
      } finally {
        storage.setAlarm = originalSetAlarm;
        Date.now = originalNow;
      }
      expect(writes.length).toBeGreaterThan(0);
      expect(writes[0]).toBeLessThanOrEqual(existingAlarm);
    });
  });

  it('review finding 2: re-reads time after alarm awaits for exact claim boundaries and full terminal retention', async () => {
    const claimStub = authority('claim-await-boundary');
    const committed = await recordCommitted(claimStub);
    await runInDurableObject(claimStub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      await state.storage.deleteAlarm();
      const storage = state.storage as DurableObjectStateLike['storage'] & { getAlarm(): Promise<number | null> };
      const originalGetAlarm = storage.getAlarm;
      const originalNow = Date.now;
      let clock = committed.transportDeadlineMs - 1;
      let reads = 0;
      storage.getAlarm = async () => {
        const alarm = await originalGetAlarm.call(storage);
        reads += 1;
        if (reads === 2) clock = committed.transportDeadlineMs;
        return alarm;
      };
      Date.now = () => clock;
      try {
        await expect(instance.claimTransport({ executionId: committed.prepared.executionId })).resolves.toMatchObject({
          status: 'unknown',
          code: 'provider_outcome_unknown',
        });
      } finally {
        storage.getAlarm = originalGetAlarm;
        Date.now = originalNow;
      }
    });
    expect((await requestRows(claimStub))[0]).toMatchObject({ state: 'unknown', permit_verifier: null });

    const completionStub = authority('completion-retention-await');
    const inflight = await claim(completionStub);
    await runInDurableObject(completionStub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      await state.storage.deleteAlarm();
      const storage = state.storage as DurableObjectStateLike['storage'] & { getAlarm(): Promise<number | null> };
      const originalGetAlarm = storage.getAlarm;
      const originalNow = Date.now;
      const beforeAwait = inflight.transportDeadlineMs - 10_000;
      const afterAwait = beforeAwait + 123;
      let reads = 0;
      let clock = beforeAwait;
      storage.getAlarm = async () => {
        const alarm = await originalGetAlarm.call(storage);
        reads += 1;
        if (reads === 2) clock = afterAwait;
        return alarm;
      };
      Date.now = () => clock;
      try {
        await expect(instance.completeKnown({
          executionId: inflight.prepared.executionId,
          nonce: inflight.permit.nonce,
          replay: SUMMARY_REPLAY,
          costOutcome: { kind: 'exact', nanodollars: 1 },
        })).resolves.toMatchObject({ status: 'stored' });
      } finally {
        storage.getAlarm = originalGetAlarm;
        Date.now = originalNow;
      }
      const row = state.storage.sql.exec<RequestRow>('SELECT * FROM provider_request').one();
      expect(row.terminal_at_ms).toBe(afterAwait);
      expect(row.replay_expires_at_ms).toBe(afterAwait + REPLAY_RETENTION_MS);
    });
  });

  it('important finding 1: durably arms no later than a terminal outbox row and recovers after commit by alarm only', async () => {
    const day = '2026-10-01';
    const stub = authority('terminal-outbox-immediate-alarm');
    const input = beginInput({ proposedAuthorityDay: day, requestDigest: digest('1') });
    const inflight = await claimWithBudget(stub, input);

    await runInDurableObject(stub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      const internals = instance as unknown as {
        drainDueOutbox(nowMs: number): Promise<void>;
      };
      const originalDrain = internals.drainDueOutbox;
      internals.drainDueOutbox = async () => {
        throw new Error('synthetic eviction after terminal commit');
      };
      try {
        await expect(instance.completeKnown({
          executionId: inflight.prepared.executionId,
          nonce: inflight.permit.nonce,
          replay: SUMMARY_REPLAY,
          costOutcome: { kind: 'exact', nanodollars: 1 },
        })).rejects.toThrow('synthetic eviction after terminal commit');
      } finally {
        internals.drainDueOutbox = originalDrain;
      }

      const outbox = state.storage.sql.exec<OutboxRow>('SELECT * FROM provider_request_outbox').one();
      const alarmAtMs = await state.storage.getAlarm();
      expect(alarmAtMs).not.toBeNull();
      expect(alarmAtMs!).toBeLessThanOrEqual(outbox.next_attempt_ms);
      expect(state.storage.sql.exec<RequestRow>('SELECT * FROM provider_request').one()).toMatchObject({
        state: 'completed',
        settlement_state: 'settlement_pending',
      });
    });

    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await outboxRows(stub)).toHaveLength(0);
    expect((await requestRows(stub))[0]).toMatchObject({
      state: 'completed',
      settlement_state: 'settlement_complete',
    });
    await expect(inflight.budget.status({ authorityDay: day })).resolves.toMatchObject({
      spentNanodollars: 1,
      reservedNanodollars: 0,
    });
    await expect(stub.claimTransport({ executionId: inflight.prepared.executionId })).resolves.not.toHaveProperty('nonce');
  });

  it('important finding 2: decides deadlines and anchors retention inside the deciding SQLite transaction', async () => {
    const claimStub = authority('transaction-local-claim-boundary');
    const committed = await recordCommitted(claimStub);
    await runInDurableObject(claimStub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      const storage = state.storage as unknown as {
        transactionSync: DurableObjectStateLike['storage']['transactionSync'];
      };
      const originalTransactionSync = storage.transactionSync;
      const originalNow = Date.now;
      let transactionCount = 0;
      let clock = committed.transportDeadlineMs - 1;
      storage.transactionSync = ((callback: () => unknown) => {
        transactionCount += 1;
        if (transactionCount === 2) clock = committed.transportDeadlineMs;
        return originalTransactionSync.call(state.storage, callback);
      }) as DurableObjectStateLike['storage']['transactionSync'];
      Date.now = () => clock;
      try {
        await expect(instance.claimTransport({ executionId: committed.prepared.executionId })).resolves.toMatchObject({
          status: 'unknown',
          code: 'provider_outcome_unknown',
        });
      } finally {
        storage.transactionSync = originalTransactionSync;
        Date.now = originalNow;
      }
    });
    expect((await requestRows(claimStub))[0]).toMatchObject({ state: 'unknown', permit_verifier: null });

    const lateStub = authority('transaction-local-completion-boundary');
    const late = await claim(lateStub);
    await runInDurableObject(lateStub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      const storage = state.storage as unknown as {
        transactionSync: DurableObjectStateLike['storage']['transactionSync'];
      };
      const originalTransactionSync = storage.transactionSync;
      const originalNow = Date.now;
      let transactionCount = 0;
      let clock = late.transportDeadlineMs - 1;
      storage.transactionSync = ((callback: () => unknown) => {
        transactionCount += 1;
        if (transactionCount === 2) clock = late.transportDeadlineMs;
        return originalTransactionSync.call(state.storage, callback);
      }) as DurableObjectStateLike['storage']['transactionSync'];
      Date.now = () => clock;
      try {
        await expect(instance.completeKnown({
          executionId: late.prepared.executionId,
          nonce: late.permit.nonce,
          replay: SUMMARY_REPLAY,
          costOutcome: { kind: 'exact', nanodollars: 1 },
        })).resolves.toMatchObject({ status: 'late', outcome: { status: 'unknown' } });
      } finally {
        storage.transactionSync = originalTransactionSync;
        Date.now = originalNow;
      }
    });
    expect((await requestRows(lateStub))[0]).toMatchObject({ state: 'unknown', permit_verifier: null });

    const retentionStub = authority('transaction-local-retention-anchor');
    const retention = await claim(retentionStub);
    await runInDurableObject(retentionStub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      const storage = state.storage as unknown as {
        transactionSync: DurableObjectStateLike['storage']['transactionSync'];
      };
      const originalTransactionSync = storage.transactionSync;
      const originalNow = Date.now;
      let transactionCount = 0;
      const beforeTransaction = retention.transportDeadlineMs - 10_000;
      const insideTransaction = beforeTransaction + 321;
      let clock = beforeTransaction;
      storage.transactionSync = ((callback: () => unknown) => {
        transactionCount += 1;
        if (transactionCount === 2) clock = insideTransaction;
        return originalTransactionSync.call(state.storage, callback);
      }) as DurableObjectStateLike['storage']['transactionSync'];
      Date.now = () => clock;
      try {
        await expect(instance.completeKnown({
          executionId: retention.prepared.executionId,
          nonce: retention.permit.nonce,
          replay: SUMMARY_REPLAY,
          costOutcome: { kind: 'exact', nanodollars: 1 },
        })).resolves.toMatchObject({ status: 'stored' });
      } finally {
        storage.transactionSync = originalTransactionSync;
        Date.now = originalNow;
      }
      const row = state.storage.sql.exec<RequestRow>('SELECT * FROM provider_request').one();
      expect(row.terminal_at_ms).toBe(insideTransaction);
      expect(row.replay_expires_at_ms).toBe(insideTransaction + REPLAY_RETENTION_MS);
    });
  });

  it('important finding 3: enforces the complete provider-failure and accounting-outcome matrix', { timeout: 60_000 }, async () => {
    const providerFailures = [
      ['provider_rejected', 502],
      ['provider_unavailable', 502],
      ['provider_timeout', 504],
      ['provider_rate_limited', 503],
      ['owner_provider_credit_unavailable', 503],
      ['privacy_endpoint_unavailable', 503],
      ['provider_invalid_response', 502],
    ] as const;
    const accountingOnlyFailures = [
      ['provider_outcome_unknown', 502],
      ['accounting_policy_breach', 502],
      ['accounting_cost_overflow', 502],
    ] as const;
    const costs = [
      ['missing', { kind: 'missing' as const }],
      ['malformed', { kind: 'malformed' as const }],
      ['exact-within', { kind: 'exact' as const, nanodollars: 1 }],
      ['exact-above', { kind: 'exact' as const, nanodollars: 500_001 }],
      ['positive-overflow', { kind: 'positive-overflow' as const }],
    ] as const;

    for (const [code, httpStatus] of providerFailures) {
      for (const [costName, costOutcome] of costs) {
        const stub = authority(`failure-matrix-${code}-${costName}`);
        const inflight = await claim(stub);
        const accepted = code === 'provider_invalid_response'
          || costOutcome.kind === 'missing'
          || costOutcome.kind === 'malformed';
        const result = await stub.completeFailed({
          executionId: inflight.prepared.executionId,
          nonce: inflight.permit.nonce,
          code,
          httpStatus,
          costOutcome,
        });
        if (!accepted) {
          expect(result, `${code}/${costName}`).toEqual({ status: 'rejected' });
          expect((await requestRows(stub))[0], `${code}/${costName}`).toMatchObject({ state: 'provider_inflight' });
          continue;
        }
        const expectedCode = code === 'provider_invalid_response' && costOutcome.kind === 'positive-overflow'
          ? 'accounting_cost_overflow'
          : code === 'provider_invalid_response' && costOutcome.kind === 'exact' && costOutcome.nanodollars > 500_000
            ? 'accounting_policy_breach'
            : code;
        expect(result, `${code}/${costName}`).toMatchObject({
          status: 'stored',
          outcome: { status: 'failed', code: expectedCode, httpStatus: expectedCode === 'provider_timeout' ? 504 : httpStatus },
        });
        const row = (await requestRows(stub))[0];
        expect(row.error_code, `${code}/${costName}`).toBe(expectedCode);
        if (code === 'provider_invalid_response' && costOutcome.kind === 'exact' && costOutcome.nanodollars <= 500_000) {
          expect(row, `${code}/${costName}`).toMatchObject({ cost_kind: 'missing', cost_nanodollars: null });
        }
      }
    }

    for (const [code, httpStatus] of accountingOnlyFailures) {
      for (const [costName, costOutcome] of costs) {
        const stub = authority(`accounting-code-rejection-${code}-${costName}`);
        const inflight = await claim(stub);
        await expect(stub.completeFailed({
          executionId: inflight.prepared.executionId,
          nonce: inflight.permit.nonce,
          code,
          httpStatus,
          costOutcome,
        }), `${code}/${costName}`).resolves.toEqual({ status: 'rejected' });
        expect((await requestRows(stub))[0], `${code}/${costName}`).toMatchObject({ state: 'provider_inflight' });
      }
    }

    for (const [seed, day, costOutcome, expectedCode, expectedSpent, expectedFrozen] of [
      ['2', '2026-10-02', { kind: 'exact' as const, nanodollars: 1 }, 'provider_invalid_response', 500_000, false],
      ['3', '2026-10-03', { kind: 'exact' as const, nanodollars: 500_001 }, 'accounting_policy_breach', 500_001, true],
      ['4', '2026-10-04', { kind: 'positive-overflow' as const }, 'accounting_cost_overflow', 500_000, true],
    ] as const) {
      const stub = authority(`invalid-response-budget-${seed}`);
      const input = beginInput({ requestDigest: digest(seed), proposedAuthorityDay: day });
      const inflight = await claimWithBudget(stub, input);
      await expect(stub.completeKnown({
        executionId: inflight.prepared.executionId,
        nonce: inflight.permit.nonce,
        replay: { summary: 42 },
        costOutcome,
      })).resolves.toEqual({ status: 'rejected' });
      await expect(stub.completeFailed({
        executionId: inflight.prepared.executionId,
        nonce: inflight.permit.nonce,
        code: 'provider_invalid_response',
        httpStatus: 502,
        costOutcome,
      })).resolves.toEqual({
        status: 'stored',
        outcome: { status: 'failed', code: expectedCode, httpStatus: 502, settlement: 'settlement_complete' },
      });
      await expect(inflight.budget.status({ authorityDay: day })).resolves.toMatchObject({
        spentNanodollars: expectedSpent,
        reservedNanodollars: 0,
        frozen: expectedFrozen,
      });
    }
  });

  it('important finding 4: rejects completed and failed rows at or after the exact transport deadline', async () => {
    for (const terminal of ['completed', 'failed'] as const) {
      for (const offsetMs of [0, 1] as const) {
        const stub = authority(`late-terminal-corruption-${terminal}-${offsetMs}`);
        const inflight = await claim(stub);
        if (terminal === 'completed') {
          await stub.completeKnown({
            executionId: inflight.prepared.executionId,
            nonce: inflight.permit.nonce,
            replay: SUMMARY_REPLAY,
            costOutcome: { kind: 'exact', nanodollars: 1 },
          });
        } else {
          await stub.completeFailed({
            executionId: inflight.prepared.executionId,
            nonce: inflight.permit.nonce,
            code: 'provider_timeout',
            httpStatus: 504,
            costOutcome: { kind: 'missing' },
          });
        }
        await runInDurableObject(stub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
          await state.storage.deleteAlarm();
          const terminalAtMs = inflight.transportDeadlineMs + offsetMs;
          const replayExpiresAtMs = terminalAtMs + REPLAY_RETENTION_MS;
          state.storage.sql.exec(
            'UPDATE provider_request SET terminal_at_ms = ?, replay_expires_at_ms = ?, phase_deadline_ms = ?',
            terminalAtMs,
            replayExpiresAtMs,
            replayExpiresAtMs,
          );
          await expect(instance.status({}), `${terminal}/${offsetMs}`).rejects.toThrow('provider request schema unavailable');
        });
      }
    }
  });

  it('important finding 5: reconciles every post-commit crash boundary by alarm before any later RPC', { timeout: 60_000 }, async () => {
    const targets = ['prepared', 'reserved', 'budget_committed', 'provider_inflight', 'completed', 'failed', 'unknown', 'expired'] as const;
    for (const target of targets) {
      const stub = authority(`post-commit-alarm-only-${target}`);
      const input = beginInput({
        proposedAuthorityDay: `2026-10-${String(10 + targets.indexOf(target)).padStart(2, '0')}`,
        requestDigest: digest(String((5 + targets.indexOf(target)) % 10)),
      });
      let executionId: string | undefined;
      let budget: ReturnType<(typeof env)['OWNER_BUDGET_AUTHORITY']['get']> | undefined;
      let action: (instance: ProviderRequestAuthority) => Promise<unknown>;
      let crashingTransaction = 2;

      if (target === 'prepared') {
        action = (instance) => instance.begin(input);
      } else if (target === 'reserved') {
        const prepared = await beginPrepared(stub, input);
        executionId = prepared.executionId;
        action = (instance) => instance.recordReservation({
          executionId: prepared.executionId,
          authorityDay: prepared.authorityDay,
          reservationNanodollars: input.reservationNanodollars,
        });
      } else if (target === 'budget_committed') {
        const reserved = await recordReserved(stub, input);
        executionId = reserved.prepared.executionId;
        const transportDeadlineMs = Date.now() + 10 * 60_000;
        action = (instance) => instance.recordBudgetCommitted({
          executionId: reserved.prepared.executionId,
          transportDeadlineMs,
          committedUntilMs: transportDeadlineMs + 60_000,
        });
      } else if (target === 'provider_inflight') {
        const committed = await recordCommitted(stub, input);
        executionId = committed.prepared.executionId;
        action = (instance) => instance.claimTransport({ executionId: committed.prepared.executionId });
      } else if (target === 'completed' || target === 'failed' || target === 'unknown') {
        const inflight = await claimWithBudget(stub, input);
        executionId = inflight.prepared.executionId;
        budget = inflight.budget;
        action = target === 'completed'
          ? (instance) => instance.completeKnown({
            executionId: inflight.prepared.executionId,
            nonce: inflight.permit.nonce,
            replay: SUMMARY_REPLAY,
            costOutcome: { kind: 'exact', nanodollars: 1 },
          })
          : target === 'failed'
            ? (instance) => instance.completeFailed({
              executionId: inflight.prepared.executionId,
              nonce: inflight.permit.nonce,
              code: 'provider_timeout',
              httpStatus: 504,
              costOutcome: { kind: 'missing' },
            })
            : (instance) => instance.completeUnknown({
              executionId: inflight.prepared.executionId,
              nonce: inflight.permit.nonce,
              code: 'provider_outcome_unknown',
            });
      } else {
        const inflight = await claimWithBudget(stub, input);
        executionId = inflight.prepared.executionId;
        budget = inflight.budget;
        await stub.completeKnown({
          executionId: inflight.prepared.executionId,
          nonce: inflight.permit.nonce,
          replay: SUMMARY_REPLAY,
          costOutcome: { kind: 'exact', nanodollars: 1 },
        });
        await forceReplayExpiry(stub);
        crashingTransaction = 1;
        action = (instance) => instance.alarm();
      }

      await runInDurableObject(stub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
        const storage = state.storage as unknown as {
          transactionSync: DurableObjectStateLike['storage']['transactionSync'];
        };
        const originalTransactionSync = storage.transactionSync;
        let transactionCount = 0;
        storage.transactionSync = ((callback: () => unknown) => {
          transactionCount += 1;
          const result = originalTransactionSync.call(state.storage, callback);
          if (transactionCount === crashingTransaction) throw new Error(`synthetic post-commit crash ${target}`);
          return result;
        }) as DurableObjectStateLike['storage']['transactionSync'];
        try {
          await expect(action(instance), target).rejects.toThrow(`synthetic post-commit crash ${target}`);
        } finally {
          storage.transactionSync = originalTransactionSync;
        }
        const alarmAtMs = await state.storage.getAlarm();
        expect(alarmAtMs, target).not.toBeNull();
        const outbox = state.storage.sql.exec<OutboxRow>('SELECT * FROM provider_request_outbox').toArray();
        if (outbox.length > 0) expect(alarmAtMs!, target).toBeLessThanOrEqual(outbox[0].next_attempt_ms);
      });

      await evictDurableObject(stub);
      expect(await runDurableObjectAlarm(stub), target).toBe(target !== 'expired');
      if (target === 'expired') {
        expect(await requestRows(stub), target).toHaveLength(0);
        expect(await outboxRows(stub), target).toHaveLength(0);
        expect(await tombstoneRows(stub), target).toEqual([expect.objectContaining({ state: 'expired' })]);
        continue;
      }
      const row = (await requestRows(stub))[0];
      expect(row.state, target).toBe(target);
      if (executionId && target !== 'prepared' && target !== 'reserved' && target !== 'budget_committed') {
        await expect(stub.claimTransport({ executionId }), target).resolves.not.toHaveProperty('nonce');
      }
      if (target === 'completed' || target === 'failed' || target === 'unknown') {
        expect(row.settlement_state, target).toBe('settlement_complete');
        expect(await outboxRows(stub), target).toHaveLength(0);
        await expect(budget!.status({ authorityDay: input.proposedAuthorityDay }), target).resolves.toMatchObject({
          spentNanodollars: target === 'completed' ? 1 : input.reservationNanodollars,
          reservedNanodollars: 0,
        });
      }
    }
  });

  it('atomically stores terminal replay and outbox, then erases to the permanent exact four-value tombstone at 48 hours', async () => {
    const stub = authority('atomic-terminal-erasure');
    const input = beginInput({ requestDigest: digest('9') });
    const inflight = await claim(stub, input);
    const payload = {
      executionId: inflight.prepared.executionId,
      nonce: inflight.permit.nonce,
      replay: SUMMARY_REPLAY,
      costOutcome: { kind: 'exact' as const, nanodollars: 1 },
    };
    await runInDurableObject(stub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      state.storage.sql.exec(`CREATE TRIGGER crash_request_outbox_insert
        BEFORE INSERT ON provider_request_outbox BEGIN SELECT RAISE(ABORT, 'synthetic outbox crash'); END`);
      await expect(instance.completeKnown(payload)).rejects.toThrow('synthetic outbox crash');
      expect(state.storage.sql.exec<{ state: string }>('SELECT state FROM provider_request').one().state).toBe('provider_inflight');
      expect(state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM provider_request_outbox').one().count).toBe(0);
      state.storage.sql.exec('DROP TRIGGER crash_request_outbox_insert');
    });
    await expect(stub.completeKnown(payload)).resolves.toMatchObject({ status: 'stored' });
    const terminal = (await requestRows(stub))[0];
    expect(terminal.replay_expires_at_ms).toBe(terminal.terminal_at_ms! + REPLAY_RETENTION_MS);
    expect(terminal.settlement_state).toBe('settlement_pending');
    expect(await outboxRows(stub)).toHaveLength(1);

    const boundaryNow = terminal.replay_expires_at_ms!;
    await runInDurableObject(stub, async (instance: ProviderRequestAuthority) => {
      const originalNow = Date.now;
      Date.now = () => boundaryNow - 1;
      try { await instance.alarm(); } finally { Date.now = originalNow; }
    });
    expect((await requestRows(stub))[0].state).toBe('completed');

    await runInDurableObject(stub, async (instance: ProviderRequestAuthority) => {
      const originalNow = Date.now;
      Date.now = () => boundaryNow;
      try { await instance.alarm(); } finally { Date.now = originalNow; }
    });
    expect(await requestRows(stub)).toHaveLength(0);
    expect(await outboxRows(stub)).toHaveLength(0);
    expect(await tombstoneRows(stub)).toEqual([{
      requestDigest: input.requestDigest,
      executionId: inflight.prepared.executionId,
      terminalClass: 'completed',
      state: 'expired',
    }]);

    const allLogicalValues = await runInDurableObject(stub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => ({
      request: state.storage.sql.exec('SELECT * FROM provider_request').toArray(),
      outbox: state.storage.sql.exec('SELECT * FROM provider_request_outbox').toArray(),
      tombstone: state.storage.sql.exec('SELECT * FROM provider_request_tombstone').toArray(),
    }));
    const serialized = JSON.stringify(allLogicalValues);
    for (const erased of [
      input.bindingCandidates[0].digest,
      input.bindingCandidates[0].version,
      input.route,
      input.variant,
      input.proposedAuthorityDay,
      terminal.permit_verifier!,
      JSON.stringify(SUMMARY_REPLAY),
      'settlement_pending',
    ]) expect(serialized).not.toContain(erased);

    await evictDurableObject(stub);
    await expect(stub.begin({
      ...input,
      proposedAuthorityDay: '2026-08-13',
      bindingCandidates: [{ version: 'shape-v9', digest: digest('8') }],
    })).resolves.toEqual({
      status: 'expired',
      executionId: inflight.prepared.executionId,
      terminalClass: 'completed',
    });
  });

  it('makes status read-only except deterministic expiry housekeeping and validates every public envelope before mutation', async () => {
    const empty = authority('status-empty');
    await expect(empty.status({})).resolves.toEqual({ status: 'not-found' });
    expect(await requestRows(empty)).toHaveLength(0);
    expect(await tombstoneRows(empty)).toHaveLength(0);
    await runInDurableObject(empty, async (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      expect(await state.storage.getAlarm()).toBeNull();
    });

    const stub = authority('strict-envelopes');
    const unsafe = stub as unknown as Record<string, (input: unknown) => Promise<unknown>>;
    const input = beginInput();
    for (const payload of [null, undefined, 1, 'invalid', {}, { ...input, extra: true }, { ...input, bindingCandidates: null }]) {
      await expect(unsafe.begin(payload)).resolves.toEqual({ status: 'conflict' });
      expect(await requestRows(stub)).toHaveLength(0);
    }
    const prepared = await beginPrepared(stub, input);
    const before = await requestRows(stub);
    const malformed: readonly [string, unknown, unknown][] = [
      ['recordReservation', null, { status: 'conflict' }],
      ['recordReservation', { executionId: prepared.executionId }, { status: 'conflict' }],
      ['recordBudgetCommitted', { executionId: prepared.executionId, transportDeadlineMs: 1, committedUntilMs: 2, extra: true }, { status: 'conflict' }],
      ['claimTransport', { executionId: prepared.executionId, extra: true }, { status: 'conflict' }],
      ['completeKnown', { executionId: prepared.executionId }, { status: 'rejected' }],
      ['completeFailed', null, { status: 'rejected' }],
      ['completeUnknown', { executionId: prepared.executionId, nonce: 'x', code: 'native stack' }, { status: 'rejected' }],
      ['status', { extra: true }, { status: 'unavailable' }],
    ];
    for (const [method, payload, expected] of malformed) {
      await expect(unsafe[method](payload), method).resolves.toEqual(expected);
      expect(await requestRows(stub), method).toEqual(before);
    }
    const firstStatus = await stub.status({});
    const firstRows = await requestRows(stub);
    const firstAlarm = await runInDurableObject(stub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => state.storage.getAlarm());
    await expect(stub.status({})).resolves.toEqual(firstStatus);
    expect(await requestRows(stub)).toEqual(firstRows);
    const secondAlarm = await runInDurableObject(stub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => state.storage.getAlarm());
    expect(secondAlarm).toBe(firstAlarm);
  });

  it('fails closed when an incompatible same-column SQLite schema is present at an RPC boundary', async () => {
    const stub = authority('schema-corruption');
    await beginPrepared(stub);
    await runInDurableObject(stub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      state.storage.sql.exec('ALTER TABLE provider_request RENAME TO provider_request_valid');
      state.storage.sql.exec(`CREATE TABLE provider_request AS SELECT * FROM provider_request_valid`);
      state.storage.sql.exec('DROP TABLE provider_request_valid');
      await expect(instance.status({})).rejects.toThrow('provider request schema unavailable');
    });
  });

  it('accepts only the exact Miniflare name metadata table beyond the application schema', async () => {
    const stub = authority('miniflare-metadata');
    await beginPrepared(stub);
    const expected = await stub.status({});
    await runInDurableObject(stub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      state.storage.sql.exec('CREATE TABLE __miniflare_do_name (name TEXT)');
      await expect(instance.status({})).resolves.toEqual(expected);
      state.storage.sql.exec('CREATE TABLE unexpected_application_table (value TEXT)');
      await expect(instance.status({})).rejects.toThrow('provider request schema unavailable');
    });
  });

  it('review finding 5: fails closed on exact-schema, duplicate-row, cross-table, integer, and state-residue corruption', { timeout: 30_000 }, async () => {
    const corruptions: readonly Readonly<{
      name: string;
      apply(state: DurableObjectStateLike): void;
    }>[] = [
      {
        name: 'missing execution-id uniqueness',
        apply(state) {
          const originalSql = state.storage.sql.exec<{ sql: string }>(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'provider_request'",
          ).one().sql;
          state.storage.sql.exec('ALTER TABLE provider_request RENAME TO provider_request_original');
          state.storage.sql.exec(originalSql.replace('execution_id TEXT NOT NULL UNIQUE', 'execution_id TEXT NOT NULL'));
          state.storage.sql.exec('INSERT INTO provider_request SELECT * FROM provider_request_original');
          state.storage.sql.exec('DROP TABLE provider_request_original');
        },
      },
      {
        name: 'missing tombstone checks',
        apply(state) {
          const originalSql = state.storage.sql.exec<{ sql: string }>(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'provider_request_tombstone'",
          ).one().sql;
          const weakenedSql = originalSql
            .replace(" CHECK(terminal_class IN ('completed','failed','unknown','expired'))", '')
            .replace(" CHECK(state = 'expired')", '');
          state.storage.sql.exec('ALTER TABLE provider_request_tombstone RENAME TO provider_request_tombstone_original');
          state.storage.sql.exec(weakenedSql);
          state.storage.sql.exec('DROP TABLE provider_request_tombstone_original');
        },
      },
      {
        name: 'multiple request rows',
        apply(state) {
          state.storage.sql.exec(`INSERT INTO provider_request
            SELECT ?, ?, route, variant, shape_digest, shape_key_version, authority_day, policy_version,
              reservation_nanodollars, state, settlement_state, created_at_ms, phase_deadline_ms,
              transport_deadline_ms, committed_until_ms, permit_verifier, replay_json, error_code,
              http_status, cost_kind, cost_nanodollars, terminal_class, terminal_at_ms, replay_expires_at_ms
            FROM provider_request`, digest('3'), crypto.randomUUID());
        },
      },
      {
        name: 'request and tombstone together',
        apply(state) {
          const row = state.storage.sql.exec<{ request_digest: string; execution_id: string }>(
            'SELECT request_digest, execution_id FROM provider_request',
          ).one();
          state.storage.sql.exec(
            "INSERT INTO provider_request_tombstone VALUES (?, ?, 'expired', 'expired')",
            row.request_digest,
            row.execution_id,
          );
        },
      },
      {
        name: 'non-integer timestamp',
        apply(state) {
          state.storage.sql.exec("UPDATE provider_request SET created_at_ms = 'not-an-integer'");
        },
      },
      {
        name: 'prepared-state replay residue',
        apply(state) {
          state.storage.sql.exec("UPDATE provider_request SET replay_json = '{\"summary\":\"residue\"}'");
        },
      },
    ];

    for (const corruption of corruptions) {
      const stub = authority(`corruption-${corruption.name}`);
      await beginPrepared(stub);
      await runInDurableObject(stub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
        corruption.apply(state);
        await expect(instance.status({}), corruption.name).rejects.toThrow('provider request schema unavailable');
      });
    }
  });

  it('review finding 5: rejects invalid stored replay JSON and terminal integer corruption', async () => {
    for (const [name, mutation] of [
      ['invalid JSON', "replay_json = '{'"],
      ['unsafe integer', 'terminal_at_ms = 9007199254740992'],
    ] as const) {
      const stub = authority(`terminal-corruption-${name}`);
      const inflight = await claim(stub);
      await stub.completeKnown({
        executionId: inflight.prepared.executionId,
        nonce: inflight.permit.nonce,
        replay: SUMMARY_REPLAY,
        costOutcome: { kind: 'exact', nanodollars: 1 },
      });
      await runInDurableObject(stub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
        await state.storage.deleteAlarm();
        state.storage.sql.exec(`UPDATE provider_request SET ${mutation}`);
        await expect(instance.status({}), name).rejects.toThrow('provider request schema unavailable');
      });
    }
  });

  it('review finding 6: validates route replay and real IANA timezones before expiry housekeeping can mutate', async () => {
    const expiredStub = authority('invalid-replay-before-expiry');
    const expired = await claim(expiredStub);
    await runInDurableObject(expiredStub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      const deadline = Date.now() - 1;
      state.storage.sql.exec(`UPDATE provider_request SET created_at_ms = ?, phase_deadline_ms = ?,
        transport_deadline_ms = ?, committed_until_ms = ?`, deadline - 1_000, deadline, deadline, deadline + 60_000);
      await expect(instance.completeKnown({
        executionId: expired.prepared.executionId,
        nonce: expired.permit.nonce,
        replay: { summary: 42 },
        costOutcome: { kind: 'exact', nanodollars: 1 },
      })).resolves.toEqual({ status: 'rejected' });
      expect(state.storage.sql.exec<RequestRow>('SELECT * FROM provider_request').one()).toMatchObject({
        state: 'provider_inflight',
        permit_verifier: expect.any(String),
      });
      expect(state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM provider_request_outbox').one().count).toBe(0);
    });

    const scanStub = authority('scan-replay-envelope');
    const scanInput = beginInput({
      requestDigest: digest('2'),
      route: 'scan',
      variant: 'scan-text',
      reservationNanodollars: 20_000_000,
    });
    const scan = await claim(scanStub, scanInput);
    await expect(scanStub.completeKnown({
      executionId: scan.prepared.executionId,
      nonce: scan.permit.nonce,
      replay: SUMMARY_REPLAY,
      costOutcome: { kind: 'exact', nanodollars: 1 },
    })).resolves.toEqual({ status: 'rejected' });
    expect((await requestRows(scanStub))[0].state).toBe('provider_inflight');

    const timezoneStub = authority('timezone-replay-envelope');
    const timezoneInput = beginInput({
      requestDigest: digest('1'),
      route: 'resolve-timezone',
      variant: 'resolve-timezone',
      reservationNanodollars: OWNER_VARIANT_POLICY['resolve-timezone'].reservationNanodollars,
    });
    const timezone = await claim(timezoneStub, timezoneInput);
    await expect(timezoneStub.completeKnown({
      executionId: timezone.prepared.executionId,
      nonce: timezone.permit.nonce,
      replay: { timezone: 'Mars/Olympus_Mons', confidence: 0.95 },
      costOutcome: { kind: 'exact', nanodollars: 1 },
    })).resolves.toEqual({ status: 'rejected' });
    expect((await requestRows(timezoneStub))[0].state).toBe('provider_inflight');
  });

  it('review finding 7: resolves concurrent identical completions to one stored result and one fixed rejection', async () => {
    const stub = authority('concurrent-completion');
    const inflight = await claim(stub);
    const payload = {
      executionId: inflight.prepared.executionId,
      nonce: inflight.permit.nonce,
      replay: SUMMARY_REPLAY,
      costOutcome: { kind: 'exact' as const, nanodollars: 1 },
    };
    const settled: PromiseSettledResult<Awaited<ReturnType<ProviderRequestAuthority['completeKnown']>>>[] = await runInDurableObject(stub, (instance: ProviderRequestAuthority) => Promise.allSettled([
      instance.completeKnown(payload),
      instance.completeKnown(payload),
    ]));
    expect(settled.every(({ status }) => status === 'fulfilled')).toBe(true);
    const results = settled.map((entry) => entry.status === 'fulfilled' ? entry.value : null);
    expect(results.filter((result) => result?.status === 'stored')).toHaveLength(1);
    expect(results.filter((result) => result?.status === 'rejected')).toHaveLength(1);
    expect((await requestRows(stub))[0]).toMatchObject({ state: 'completed', permit_verifier: null });
    expect(await outboxRows(stub)).toHaveLength(1);
  });

  it('review finding 8: independently verifies the domain-separated permit digest and freezes the current of two new candidates', async () => {
    const stub = authority('two-candidate-digest');
    const input = beginInput({
      bindingCandidates: [
        { version: 'shape-current', digest: digest('c') },
        { version: 'shape-previous', digest: digest('d') },
      ],
    });
    const inflight = await claim(stub, input);
    const expectedBytes = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`event-every/provider-permit/v1\0${inflight.permit.nonce}`),
    );
    const expectedVerifier = Array.from(new Uint8Array(expectedBytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
    expect((await requestRows(stub))[0]).toMatchObject({
      shape_digest: input.bindingCandidates[0].digest,
      shape_key_version: input.bindingCandidates[0].version,
      permit_verifier: expectedVerifier,
    });
  });

  it('review finding 8: repairs absent and stale-late alarms on constructor eviction', async () => {
    const stub = authority('constructor-alarm-repair');
    await beginPrepared(stub);
    const deadline = (await requestRows(stub))[0].phase_deadline_ms;

    await runInDurableObject(stub, async (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      await state.storage.deleteAlarm();
    });
    await evictDurableObject(stub);
    const repairedAbsent = await runInDurableObject(stub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => state.storage.getAlarm());
    expect(repairedAbsent).not.toBeNull();
    expect(repairedAbsent!).toBeLessThanOrEqual(deadline);

    await runInDurableObject(stub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => state.storage.setAlarm(deadline + 60_000));
    await evictDurableObject(stub);
    const repairedStale = await runInDurableObject(stub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => state.storage.getAlarm());
    expect(repairedStale).not.toBeNull();
    expect(repairedStale!).toBeLessThanOrEqual(deadline);
  });

  it('review finding 8: releases an expired reservation but fully settles an expired committed budget using alarms only', async () => {
    const reservedDay = '2026-09-26';
    const reservedStub = authority('reserved-expiry-release');
    const reservedInput = beginInput({ proposedAuthorityDay: reservedDay, requestDigest: digest('e') });
    const reservedPrepared = await beginPrepared(reservedStub, reservedInput);
    const reservedBudget = env.OWNER_BUDGET_AUTHORITY.get(env.OWNER_BUDGET_AUTHORITY.idFromName(reservedDay));
    const reservedBinding = {
      executionId: reservedPrepared.executionId,
      requestAuthorityName: reservedInput.requestDigest,
      authorityDay: reservedDay,
      route: reservedInput.route,
      variant: reservedInput.variant,
      policyVersion: reservedInput.policyVersion,
      reservationNanodollars: reservedInput.reservationNanodollars,
    };
    await reservedBudget.reserve(reservedBinding);
    await reservedStub.recordReservation({
      executionId: reservedPrepared.executionId,
      authorityDay: reservedDay,
      reservationNanodollars: reservedInput.reservationNanodollars,
    });
    await runInDurableObject(reservedStub, async (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      const deadline = Date.now() - 1;
      state.storage.sql.exec('UPDATE provider_request SET created_at_ms = ?, phase_deadline_ms = ?', deadline - 1_000, deadline);
      await state.storage.setAlarm(deadline);
    });
    await evictDurableObject(reservedStub);
    expect(await runDurableObjectAlarm(reservedStub)).toBe(true);
    expect(await requestRows(reservedStub)).toHaveLength(0);
    expect(await outboxRows(reservedStub)).toHaveLength(0);
    expect(await tombstoneRows(reservedStub)).toEqual([expect.objectContaining({ terminalClass: 'expired', state: 'expired' })]);
    await expect(reservedBudget.status({ authorityDay: reservedDay })).resolves.toMatchObject({ spentNanodollars: 0, reservedNanodollars: 0 });

    const committedDay = '2026-09-27';
    const committedStub = authority('committed-expiry-full');
    const committedInput = beginInput({ proposedAuthorityDay: committedDay, requestDigest: digest('f') });
    const prepared = await beginPrepared(committedStub, committedInput);
    const committedBudget = env.OWNER_BUDGET_AUTHORITY.get(env.OWNER_BUDGET_AUTHORITY.idFromName(committedDay));
    const binding = {
      executionId: prepared.executionId,
      requestAuthorityName: committedInput.requestDigest,
      authorityDay: committedDay,
      route: committedInput.route,
      variant: committedInput.variant,
      policyVersion: committedInput.policyVersion,
      reservationNanodollars: committedInput.reservationNanodollars,
    };
    await committedBudget.reserve(binding);
    await committedStub.recordReservation({ executionId: prepared.executionId, authorityDay: committedDay, reservationNanodollars: committedInput.reservationNanodollars });
    const committed = await committedBudget.commit(binding);
    expect(committed.status).toBe('committed');
    if (committed.status !== 'committed') throw new Error('expected committed budget');
    await committedStub.recordBudgetCommitted({
      executionId: prepared.executionId,
      transportDeadlineMs: committed.transportDeadlineMs,
      committedUntilMs: committed.committedUntilMs,
    });
    await runInDurableObject(committedStub, async (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      const deadline = Date.now() - 1;
      state.storage.sql.exec(`UPDATE provider_request SET created_at_ms = ?, phase_deadline_ms = ?,
        transport_deadline_ms = ?, committed_until_ms = ?`, deadline - 1_000, deadline, deadline, deadline + 60_000);
      await state.storage.setAlarm(deadline);
    });
    await evictDurableObject(committedStub);
    expect(await runDurableObjectAlarm(committedStub)).toBe(true);
    expect((await requestRows(committedStub))[0]).toMatchObject({
      state: 'unknown',
      settlement_state: 'settlement_complete',
      cost_kind: 'missing',
    });
    expect(await outboxRows(committedStub)).toHaveLength(0);
    await expect(committedBudget.status({ authorityDay: committedDay })).resolves.toMatchObject({
      spentNanodollars: committedInput.reservationNanodollars,
      reservedNanodollars: 0,
    });
  });

  it('review finding 8: erases a failed result at the exact 48-hour boundary and accepts a valid IANA replay', async () => {
    const failedStub = authority('failed-erasure');
    const failedInput = beginInput({ requestDigest: digest('0') });
    const inflight = await claim(failedStub, failedInput);
    await failedStub.completeFailed({
      executionId: inflight.prepared.executionId,
      nonce: inflight.permit.nonce,
      code: 'provider_timeout',
      httpStatus: 504,
      costOutcome: { kind: 'missing' },
    });
    await forceReplayExpiry(failedStub);
    await evictDurableObject(failedStub);
    expect(await runDurableObjectAlarm(failedStub)).toBe(true);
    expect(await requestRows(failedStub)).toHaveLength(0);
    expect(await outboxRows(failedStub)).toHaveLength(0);
    expect(await tombstoneRows(failedStub)).toEqual([{
      requestDigest: failedInput.requestDigest,
      executionId: inflight.prepared.executionId,
      terminalClass: 'failed',
      state: 'expired',
    }]);

    const timezoneStub = authority('valid-iana-replay');
    const timezoneInput = beginInput({
      requestDigest: digest('a'),
      route: 'resolve-timezone',
      variant: 'resolve-timezone',
      reservationNanodollars: OWNER_VARIANT_POLICY['resolve-timezone'].reservationNanodollars,
    });
    const timezone = await claim(timezoneStub, timezoneInput);
    await expect(timezoneStub.completeKnown({
      executionId: timezone.prepared.executionId,
      nonce: timezone.permit.nonce,
      replay: { timezone: 'America/New_York', confidence: 0.95 },
      costOutcome: { kind: 'exact', nanodollars: 1 },
    })).resolves.toMatchObject({
      status: 'stored',
      outcome: { status: 'completed', replay: { timezone: 'America/New_York', confidence: 0.95 } },
    });
  });

  it('arms before every phase-changing SQL transaction and leaves the prior phase when alarm persistence fails', { timeout: 30_000 }, async () => {
    const targets = ['prepared', 'reserved', 'budget_committed', 'provider_inflight', 'completed', 'failed', 'unknown', 'expired'] as const;
    for (const target of targets) {
      const stub = authority(`alarm-failure-${target}`);
      const input = beginInput();
      let expectedPrior: RequestState | 'missing' = 'missing';
      let action: (instance: ProviderRequestAuthority) => Promise<unknown>;
      let executionId: string | undefined;
      if (target === 'prepared') {
        action = (instance) => instance.begin(input);
      } else {
        const prepared = await beginPrepared(stub, input);
        executionId = prepared.executionId;
        if (target === 'reserved') {
          expectedPrior = 'prepared';
          action = (instance) => instance.recordReservation({ executionId: prepared.executionId, authorityDay: prepared.authorityDay, reservationNanodollars: input.reservationNanodollars });
        } else {
          await stub.recordReservation({ executionId: prepared.executionId, authorityDay: prepared.authorityDay, reservationNanodollars: input.reservationNanodollars });
          const transportDeadlineMs = Date.now() + 10 * 60_000;
          const committedUntilMs = transportDeadlineMs + 60_000;
          if (target === 'budget_committed') {
            expectedPrior = 'reserved';
            action = (instance) => instance.recordBudgetCommitted({ executionId: prepared.executionId, transportDeadlineMs, committedUntilMs });
          } else {
            await stub.recordBudgetCommitted({ executionId: prepared.executionId, transportDeadlineMs, committedUntilMs });
            if (target === 'provider_inflight') {
              expectedPrior = 'budget_committed';
              action = (instance) => instance.claimTransport({ executionId: prepared.executionId });
            } else {
              const permit = await stub.claimTransport({ executionId: prepared.executionId });
              expect(permit.status).toBe('permit');
              if (permit.status !== 'permit') throw new Error('expected permit');
              if (target === 'completed') {
                expectedPrior = 'provider_inflight';
                action = (instance) => instance.completeKnown({ executionId: prepared.executionId, nonce: permit.nonce, replay: SUMMARY_REPLAY, costOutcome: { kind: 'exact', nanodollars: 1 } });
              } else if (target === 'failed') {
                expectedPrior = 'provider_inflight';
                action = (instance) => instance.completeFailed({ executionId: prepared.executionId, nonce: permit.nonce, code: 'provider_timeout', httpStatus: 504, costOutcome: { kind: 'missing' } });
              } else if (target === 'unknown') {
                expectedPrior = 'provider_inflight';
                action = (instance) => instance.completeUnknown({ executionId: prepared.executionId, nonce: permit.nonce, code: 'provider_outcome_unknown' });
              } else {
                await stub.completeKnown({ executionId: prepared.executionId, nonce: permit.nonce, replay: SUMMARY_REPLAY, costOutcome: { kind: 'exact', nanodollars: 1 } });
                await forceReplayExpiry(stub);
                expectedPrior = 'completed';
                action = (instance) => instance.alarm();
              }
            }
          }
        }
      }

      await runInDurableObject(stub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
        await state.storage.deleteAlarm();
        const storage = state.storage as DurableObjectStateLike['storage'] & { setAlarm(timestamp: number): Promise<void> };
        const originalSetAlarm = storage.setAlarm;
        storage.setAlarm = async () => { throw new Error(`synthetic alarm failure ${target}`); };
        try {
          await expect(action(instance), target).rejects.toThrow(`synthetic alarm failure ${target}`);
        } finally {
          storage.setAlarm = originalSetAlarm;
        }
        const phases = state.storage.sql.exec<{ state: RequestState }>('SELECT state FROM provider_request').toArray();
        expect(phases.map(({ state: phase }) => phase), target).toEqual(expectedPrior === 'missing' ? [] : [expectedPrior]);
        if (target === 'expired') {
          const terminalAtMs = Date.now();
          const future = terminalAtMs + REPLAY_RETENTION_MS;
          state.storage.sql.exec('UPDATE provider_request SET terminal_at_ms = ?, replay_expires_at_ms = ?, phase_deadline_ms = ?', terminalAtMs, future, future);
        }
      });
      await evictDurableObject(stub);
      expect(await runDurableObjectAlarm(stub), target).toBe(expectedPrior !== 'missing');
      expect((await requestRows(stub)).map(({ state }) => state), target).toEqual(expectedPrior === 'missing' ? [] : [expectedPrior]);
      if (executionId && (expectedPrior === 'provider_inflight' || expectedPrior === 'completed')) {
        const replayedClaim = await stub.claimTransport({ executionId });
        expect(replayedClaim, target).not.toHaveProperty('nonce');
      }
    }
  });

  it('keeps an already-durable alarm when every phase-changing SQLite transaction crashes', { timeout: 30_000 }, async () => {
    const targets = ['prepared', 'reserved', 'budget_committed', 'provider_inflight', 'completed', 'failed', 'unknown', 'expired'] as const;
    for (const target of targets) {
      const stub = authority(`sql-failure-${target}`);
      const input = beginInput();
      let expectedPrior: RequestState | 'missing' = 'missing';
      let action: (instance: ProviderRequestAuthority) => Promise<unknown>;
      let trigger: string;
      let executionId: string | undefined;
      if (target === 'prepared') {
        trigger = "BEFORE INSERT ON provider_request";
        action = (instance) => instance.begin(input);
      } else {
        const prepared = await beginPrepared(stub, input);
        executionId = prepared.executionId;
        if (target === 'reserved') {
          expectedPrior = 'prepared';
          trigger = "BEFORE UPDATE ON provider_request WHEN NEW.state = 'reserved'";
          action = (instance) => instance.recordReservation({ executionId: prepared.executionId, authorityDay: prepared.authorityDay, reservationNanodollars: input.reservationNanodollars });
        } else {
          await stub.recordReservation({ executionId: prepared.executionId, authorityDay: prepared.authorityDay, reservationNanodollars: input.reservationNanodollars });
          const transportDeadlineMs = Date.now() + 10 * 60_000;
          const committedUntilMs = transportDeadlineMs + 60_000;
          if (target === 'budget_committed') {
            expectedPrior = 'reserved';
            trigger = "BEFORE UPDATE ON provider_request WHEN NEW.state = 'budget_committed'";
            action = (instance) => instance.recordBudgetCommitted({ executionId: prepared.executionId, transportDeadlineMs, committedUntilMs });
          } else {
            await stub.recordBudgetCommitted({ executionId: prepared.executionId, transportDeadlineMs, committedUntilMs });
            if (target === 'provider_inflight') {
              expectedPrior = 'budget_committed';
              trigger = "BEFORE UPDATE ON provider_request WHEN NEW.state = 'provider_inflight'";
              action = (instance) => instance.claimTransport({ executionId: prepared.executionId });
            } else {
              const permit = await stub.claimTransport({ executionId: prepared.executionId });
              expect(permit.status).toBe('permit');
              if (permit.status !== 'permit') throw new Error('expected permit');
              if (target === 'completed') {
                expectedPrior = 'provider_inflight';
                trigger = "BEFORE UPDATE ON provider_request WHEN NEW.state = 'completed'";
                action = (instance) => instance.completeKnown({ executionId: prepared.executionId, nonce: permit.nonce, replay: SUMMARY_REPLAY, costOutcome: { kind: 'exact', nanodollars: 1 } });
              } else if (target === 'failed') {
                expectedPrior = 'provider_inflight';
                trigger = "BEFORE UPDATE ON provider_request WHEN NEW.state = 'failed'";
                action = (instance) => instance.completeFailed({ executionId: prepared.executionId, nonce: permit.nonce, code: 'provider_timeout', httpStatus: 504, costOutcome: { kind: 'missing' } });
              } else if (target === 'unknown') {
                expectedPrior = 'provider_inflight';
                trigger = "BEFORE UPDATE ON provider_request WHEN NEW.state = 'unknown'";
                action = (instance) => instance.completeUnknown({ executionId: prepared.executionId, nonce: permit.nonce, code: 'provider_outcome_unknown' });
              } else {
                await stub.completeKnown({ executionId: prepared.executionId, nonce: permit.nonce, replay: SUMMARY_REPLAY, costOutcome: { kind: 'exact', nanodollars: 1 } });
                await forceReplayExpiry(stub);
                expectedPrior = 'completed';
                trigger = 'BEFORE INSERT ON provider_request_tombstone';
                action = (instance) => instance.alarm();
              }
            }
          }
        }
      }

      await runInDurableObject(stub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
        state.storage.sql.exec(`CREATE TRIGGER crash_request_transition BEFORE_TRIGGER_PLACEHOLDER BEGIN SELECT RAISE(ABORT, 'synthetic SQL failure ${target}'); END`.replace('BEFORE_TRIGGER_PLACEHOLDER', trigger));
        await expect(action(instance), target).rejects.toThrow(`synthetic SQL failure ${target}`);
        const phases = state.storage.sql.exec<{ state: RequestState }>('SELECT state FROM provider_request').toArray();
        expect(phases.map(({ state: phase }) => phase), target).toEqual(expectedPrior === 'missing' ? [] : [expectedPrior]);
        expect(await state.storage.getAlarm(), target).not.toBeNull();
        state.storage.sql.exec('DROP TRIGGER crash_request_transition');
        if (target === 'expired') {
          const terminalAtMs = Date.now();
          const future = terminalAtMs + REPLAY_RETENTION_MS;
          state.storage.sql.exec('UPDATE provider_request SET terminal_at_ms = ?, replay_expires_at_ms = ?, phase_deadline_ms = ?', terminalAtMs, future, future);
        }
      });
      await evictDurableObject(stub);
      expect(await runDurableObjectAlarm(stub), target).toBe(true);
      expect((await requestRows(stub)).map(({ state }) => state), target).toEqual(expectedPrior === 'missing' ? [] : [expectedPrior]);
      if (executionId && (expectedPrior === 'provider_inflight' || expectedPrior === 'completed')) {
        const replayedClaim = await stub.claimTransport({ executionId });
        expect(replayedClaim, target).not.toHaveProperty('nonce');
      }
    }
  });

  it('recovers from an alarm-before-terminal SQL crash using only the durable alarm after eviction', async () => {
    const stub = authority('alarm-only-recovery');
    const inflight = await claim(stub);
    await runInDurableObject(stub, async (instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
      state.storage.sql.exec(`CREATE TRIGGER crash_known_completion
        BEFORE UPDATE ON provider_request WHEN NEW.state = 'completed'
        BEGIN SELECT RAISE(ABORT, 'synthetic completion crash'); END`);
      await expect(instance.completeKnown({
        executionId: inflight.prepared.executionId,
        nonce: inflight.permit.nonce,
        replay: SUMMARY_REPLAY,
        costOutcome: { kind: 'exact', nanodollars: 1 },
      })).rejects.toThrow('synthetic completion crash');
      state.storage.sql.exec('DROP TRIGGER crash_known_completion');
      const deadline = Date.now() - 1;
      state.storage.sql.exec(`UPDATE provider_request SET created_at_ms = ?, transport_deadline_ms = ?,
        phase_deadline_ms = ?, committed_until_ms = ?`, deadline - 1_000, deadline, deadline, deadline + 60_000);
    });
    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await requestRows(stub))[0]).toMatchObject({ state: 'unknown', error_code: 'provider_outcome_unknown' });
    expect(await outboxRows(stub)).toEqual([expect.objectContaining({ operation: 'settle', cost_kind: 'missing' })]);
  });
});
