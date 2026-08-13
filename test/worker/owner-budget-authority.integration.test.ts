import { describe, expect, it } from 'vitest';
// @ts-expect-error cloudflare:test is injected by the Workers Vitest pool only.
import { env, evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import type { DurableObjectStateLike } from '../../src/platform/contracts';
import type { OwnerBudgetAuthority } from '../../src/platform/cloudflare/owner-budget-authority';
import {
  ACCOUNTING_RETENTION_MS,
  COMMITTED_LEASE_MS,
  OWNER_DAILY_LIMIT_NANODOLLARS,
  OWNER_POLICY_VERSION,
  PRE_PERMIT_LEASE_MS,
  TRANSPORT_LEASE_MS,
} from '../../src/platform/provider/policy';
import type { CostOutcome, ProviderRoute, ProviderVariant } from '../../src/platform/provider/contracts';

type BudgetBinding = Readonly<{
  executionId: string;
  requestAuthorityName: string;
  authorityDay: string;
  route: ProviderRoute;
  variant: ProviderVariant;
  policyVersion: typeof OWNER_POLICY_VERSION;
  reservationNanodollars: number;
}>;

type BudgetRow = Readonly<{
  execution_id: string;
  request_authority_name: string;
  route: string;
  variant: string;
  reservation_nanodollars: number;
  settled_nanodollars: number | null;
  phase: 'reserved' | 'committed' | 'released' | 'settled' | 'settled_full';
  breach_class: 'primary_breach' | 'primary_overflow' | 'secondary_breach' | null;
  reserved_until_ms: number;
  transport_deadline_ms: number | null;
  committed_until_ms: number | null;
  terminal_at_ms: number | null;
}>;

type TableColumn = Readonly<{
  cid: number;
  name: string;
  type: string;
  notnull: 0 | 1;
  dflt_value: string | null;
  pk: 0 | 1;
}>;

type BudgetStub = ReturnType<(typeof env)['OWNER_BUDGET_AUTHORITY']['get']>;
type UnsafeBudgetStub = Readonly<{
  reserve(input: unknown): Promise<unknown>;
  commit(input: unknown): Promise<unknown>;
  release(input: unknown): Promise<unknown>;
  settle(input: unknown): Promise<unknown>;
  status(input: unknown): Promise<unknown>;
}>;

const authorityDay = '2026-08-12';

function authority(label: string): BudgetStub {
  const id = env.OWNER_BUDGET_AUTHORITY.idFromName(`${label}-${crypto.randomUUID()}`);
  return env.OWNER_BUDGET_AUTHORITY.get(id);
}

function binding(overrides: Partial<BudgetBinding> = {}): BudgetBinding {
  return {
    executionId: crypto.randomUUID(),
    requestAuthorityName: crypto.randomUUID().replaceAll('-', '').padEnd(64, 'a'),
    authorityDay,
    route: 'scan',
    variant: 'scan-text',
    policyVersion: OWNER_POLICY_VERSION,
    reservationNanodollars: 20_000_000,
    ...overrides,
  };
}

function imageBinding(overrides: Partial<BudgetBinding> = {}): BudgetBinding {
  return binding({
    route: 'scan',
    variant: 'scan-image',
    reservationNanodollars: 50_000_000,
    ...overrides,
  });
}

async function rows(stub: BudgetStub): Promise<BudgetRow[]> {
  return runInDurableObject(stub, (_instance: OwnerBudgetAuthority, state: DurableObjectStateLike) =>
    state.storage.sql.exec<BudgetRow>('SELECT * FROM owner_budget_operation ORDER BY execution_id').toArray());
}

async function policy(stub: BudgetStub) {
  return runInDurableObject(stub, (_instance: OwnerBudgetAuthority, state: DurableObjectStateLike) =>
    state.storage.sql.exec<{
      authority_day: string;
      policy_version: string;
      limit_nanodollars: number;
      frozen_code: 'accounting_policy_breach' | 'accounting_cost_overflow' | null;
      created_at_ms: number;
    }>('SELECT * FROM owner_budget_policy').toArray()[0]);
}

async function commit(stub: BudgetStub, input: BudgetBinding) {
  await expect(stub.reserve(input)).resolves.toMatchObject({ status: 'reserved' });
  const result = await stub.commit(input);
  expect(result.status).toBe('committed');
  return result;
}

async function settle(stub: BudgetStub, input: BudgetBinding, costOutcome: CostOutcome) {
  await commit(stub, input);
  return stub.settle({ ...input, costOutcome });
}

async function expireCommittedWithAlarm(stub: BudgetStub): Promise<void> {
  await runInDurableObject(stub, (_instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => {
    state.storage.sql.exec('UPDATE owner_budget_operation SET committed_until_ms = ?', Date.now() - 1);
    return state.storage.setAlarm(Date.now() + 10_000);
  });
  await evictDurableObject(stub);
  expect(await runDurableObjectAlarm(stub)).toBe(true);
}

describe('OwnerBudgetAuthority SQLite Durable Object', () => {
  it('creates exactly the accepted SQLite schemas and replays an identical reservation after eviction', async () => {
    const stub = authority('schema-replay');
    const input = binding();
    const first = await stub.reserve(input);
    expect(first).toMatchObject({ status: 'reserved' });
    if (first.status !== 'reserved') return;
    expect(first.reservedUntilMs).toBeGreaterThan(Date.now());
    expect(first.reservedUntilMs).toBeLessThanOrEqual(Date.now() + PRE_PERMIT_LEASE_MS);

    await evictDurableObject(stub);
    await expect(stub.reserve(input)).resolves.toEqual(first);
    await runInDurableObject(stub, (_instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => {
      const applicationTables = state.storage.sql.exec<{ name: string }>(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
      ).toArray().map(({ name }) => name);
      const policyColumns = state.storage.sql.exec<TableColumn>('PRAGMA table_info(owner_budget_policy)').toArray();
      const operationColumns = state.storage.sql.exec<TableColumn>('PRAGMA table_info(owner_budget_operation)').toArray();
      const schemas = state.storage.sql.exec<{ name: string; sql: string }>(
        "SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name",
      ).toArray();
      expect(applicationTables).toEqual(['owner_budget_operation', 'owner_budget_policy']);
      expect(policyColumns).toEqual([
        { cid: 0, name: 'authority_day', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 },
        { cid: 1, name: 'policy_version', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
        { cid: 2, name: 'limit_nanodollars', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
        { cid: 3, name: 'frozen_code', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
        { cid: 4, name: 'created_at_ms', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
      ]);
      expect(operationColumns).toEqual([
        { cid: 0, name: 'execution_id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 },
        { cid: 1, name: 'request_authority_name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
        { cid: 2, name: 'route', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
        { cid: 3, name: 'variant', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
        { cid: 4, name: 'reservation_nanodollars', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
        { cid: 5, name: 'settled_nanodollars', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
        { cid: 6, name: 'phase', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
        { cid: 7, name: 'breach_class', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
        { cid: 8, name: 'reserved_until_ms', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
        { cid: 9, name: 'transport_deadline_ms', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
        { cid: 10, name: 'committed_until_ms', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
        { cid: 11, name: 'terminal_at_ms', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
      ]);
      expect(schemas.find(({ name }) => name === 'owner_budget_operation')?.sql).toMatch(
        /CHECK\s*\(\s*phase\s+IN\s*\(\s*'reserved'\s*,\s*'committed'\s*,\s*'released'\s*,\s*'settled'\s*,\s*'settled_full'\s*\)\s*\)/i,
      );
      expect(schemas.find(({ name }) => name === 'owner_budget_operation')?.sql).toMatch(
        /CHECK\s*\(\s*breach_class\s+IN\s*\(\s*'primary_breach'\s*,\s*'primary_overflow'\s*,\s*'secondary_breach'\s*\)\s*\)/i,
      );
    });
    expect(await policy(stub)).toMatchObject({
      authority_day: authorityDay,
      policy_version: OWNER_POLICY_VERSION,
      limit_nanodollars: OWNER_DAILY_LIMIT_NANODOLLARS,
      frozen_code: null,
    });
    expect(await rows(stub)).toHaveLength(1);
  });

  it('fails closed when an incompatible same-column schema already exists at an RPC boundary', async () => {
    const stub = authority('schema-incompatible');
    await runInDurableObject(stub, async (instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => {
      state.storage.sql.exec('DROP TABLE owner_budget_operation');
      state.storage.sql.exec(`CREATE TABLE owner_budget_operation (
        execution_id TEXT PRIMARY KEY,
        request_authority_name TEXT NOT NULL,
        route TEXT NOT NULL,
        variant TEXT NOT NULL,
        reservation_nanodollars TEXT NOT NULL,
        settled_nanodollars INTEGER,
        phase TEXT NOT NULL,
        breach_class TEXT,
        reserved_until_ms INTEGER NOT NULL,
        transport_deadline_ms INTEGER,
        committed_until_ms INTEGER,
        terminal_at_ms INTEGER
      )`);
      await expect(instance.status({ authorityDay })).rejects.toThrow('owner budget schema unavailable');
    });
  });

  it('accepts only the exact Miniflare name metadata table beyond the application schema', async () => {
    const stub = authority('miniflare-metadata');
    await stub.reserve(binding());
    const expected = await stub.status({ authorityDay });
    await runInDurableObject(stub, async (instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => {
      state.storage.sql.exec('CREATE TABLE __miniflare_do_name (name TEXT)');
      await expect(instance.status({ authorityDay })).resolves.toEqual(expected);
      state.storage.sql.exec('CREATE TABLE unexpected_application_table (value TEXT)');
      await expect(instance.status({ authorityDay })).rejects.toThrow('owner budget schema unavailable');
    });
  });

  it('rejects every changed immutable reservation binding without changing the original row', async () => {
    const stub = authority('binding-conflict');
    const input = binding();
    await expect(stub.reserve(input)).resolves.toMatchObject({ status: 'reserved' });
    for (const changed of [
      { requestAuthorityName: 'b'.repeat(64) },
      { route: 'summarize' as const },
      { variant: 'summarize' as const },
      { policyVersion: 'owner-v2' },
      { reservationNanodollars: 20_000_001 },
    ]) {
      await expect(stub.reserve({ ...input, ...changed })).resolves.toEqual({ status: 'conflict' });
    }
    await expect(stub.reserve({ ...input, authorityDay: '2026-08-13' })).resolves.toEqual({ status: 'day-mismatch' });
    expect(await rows(stub)).toHaveLength(1);
  });

  it('serializes two real concurrent requests racing for the final daily slot', async () => {
    const stub = authority('final-slot');
    for (let index = 0; index < 99; index++) {
      await expect(stub.reserve(imageBinding())).resolves.toMatchObject({ status: 'reserved' });
    }
    const results = await Promise.all([
      stub.reserve(imageBinding()),
      stub.reserve(imageBinding()),
    ]);
    expect(results.map((value: { status: string }) => value.status).sort()).toEqual(['exhausted', 'reserved']);
    const status = await stub.status({ authorityDay });
    expect(status).toMatchObject({
      status: 'available',
      spentNanodollars: 0,
      reservedNanodollars: OWNER_DAILY_LIMIT_NANODOLLARS,
      remainingNanodollars: 0,
      exhausted: true,
    });
  });

  it('counts committed holds in admission and never moves an RPC alarm later', async () => {
    const stub = authority('committed-hold');
    const first = binding();
    await expect(stub.reserve(first)).resolves.toMatchObject({ status: 'reserved' });
    const alarmAfterReserve = await runInDurableObject(stub, (_instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => state.storage.getAlarm());
    const beforeCommit = Date.now();
    const committed = await stub.commit(first);
    expect(committed).toMatchObject({ status: 'committed' });
    if (committed.status !== 'committed') return;
    expect(committed.transportDeadlineMs).toBeGreaterThanOrEqual(beforeCommit + TRANSPORT_LEASE_MS);
    expect(committed.committedUntilMs).toBeGreaterThanOrEqual(beforeCommit + COMMITTED_LEASE_MS);
    expect(committed.committedUntilMs - committed.transportDeadlineMs).toBe(60_000);
    const alarmAfterCommit = await runInDurableObject(stub, (_instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => state.storage.getAlarm());
    expect(alarmAfterReserve).not.toBeNull();
    expect(alarmAfterCommit).not.toBeNull();
    expect(alarmAfterCommit!).toBeLessThanOrEqual(alarmAfterReserve!);

    await evictDurableObject(stub);
    await expect(stub.commit(first)).resolves.toEqual(committed);
    for (let index = 0; index < 99; index++) {
      await expect(stub.reserve(imageBinding())).resolves.toMatchObject({ status: 'reserved' });
    }
    await expect(stub.reserve(binding())).resolves.toMatchObject({ status: 'reserved' });
    for (let index = 0; index < 10; index++) {
      await expect(stub.reserve(binding({
        route: 'resolve-timezone',
        variant: 'resolve-timezone',
        reservationNanodollars: 1_000_000,
      }))).resolves.toMatchObject({ status: 'reserved' });
    }
    await expect(stub.reserve(binding())).resolves.toMatchObject({ status: 'exhausted' });
    const status = await stub.status({ authorityDay });
    expect(status).toMatchObject({ reservedNanodollars: OWNER_DAILY_LIMIT_NANODOLLARS });
  });

  it('releases only before commit and persists released/committed outcomes across eviction', async () => {
    const stub = authority('release');
    const before = binding();
    await expect(stub.reserve(before)).resolves.toMatchObject({ status: 'reserved' });
    await expect(stub.release(before)).resolves.toEqual({ status: 'released' });
    await evictDurableObject(stub);
    await expect(stub.release(before)).resolves.toEqual({ status: 'released' });
    await expect(stub.commit(before)).resolves.toEqual({ status: 'released' });

    const after = binding();
    await commit(stub, after);
    await expect(stub.release(after)).resolves.toEqual({ status: 'committed' });
    await evictDurableObject(stub);
    await expect(stub.release(after)).resolves.toEqual({ status: 'committed' });
    expect((await rows(stub)).find(({ execution_id }) => execution_id === after.executionId)?.phase).toBe('committed');
  });

  it.each<readonly [string, CostOutcome, number, 'settled' | 'settled_full']>([
    ['an exact cost below its reservation', { kind: 'exact', nanodollars: 1 }, 1, 'settled'],
    ['an exact cost equal to its reservation', { kind: 'exact', nanodollars: 20_000_000 }, 20_000_000, 'settled'],
    ['a missing cost', { kind: 'missing' }, 20_000_000, 'settled_full'],
    ['a malformed cost', { kind: 'malformed' }, 20_000_000, 'settled_full'],
  ])('persists %s with the exact durable phase after eviction', async (_label, costOutcome, amount, phase) => {
    const stub = authority(`settlement-${phase}`);
    const input = binding();
    await expect(settle(stub, input, costOutcome)).resolves.toMatchObject({ status: phase });
    await evictDurableObject(stub);
    await expect(stub.settle({ ...input, costOutcome })).resolves.toMatchObject({ status: phase });
    expect(await rows(stub)).toEqual([expect.objectContaining({ phase, settled_nanodollars: amount })]);
  });

  it.each([
    ['post-permit provider failure', { kind: 'missing' } as const],
    ['post-permit unknown outcome', { kind: 'malformed' } as const],
  ])('uses settled_full for a %s', async (_label, costOutcome) => {
    const stub = authority(`full-${costOutcome.kind}`);
    const input = binding();
    await expect(settle(stub, input, costOutcome)).resolves.toMatchObject({ status: 'settled_full' });
    await evictDurableObject(stub);
    expect((await rows(stub))[0]).toMatchObject({ phase: 'settled_full', settled_nanodollars: input.reservationNanodollars });
  });

  it('rejects a changed terminal settlement observation instead of suppressing a required freeze', async () => {
    const stub = authority('settlement-replay-conflict');
    const input = binding();
    await expect(settle(stub, input, { kind: 'missing' })).resolves.toEqual({ status: 'settled_full' });
    await evictDurableObject(stub);
    await expect(stub.settle({
      ...input,
      costOutcome: { kind: 'exact', nanodollars: input.reservationNanodollars + 1 },
    })).resolves.toEqual({ status: 'conflict' });
    expect((await policy(stub)).frozen_code).toBeNull();
  });

  it.each<readonly [string, number]>([
    ['below', 1],
    ['equal', 20_000_000],
  ])('acknowledges delayed exact %s-reservation accounting conservatively after committed expiry', async (_label, actual) => {
    const stub = authority(`delayed-exact-${actual}`);
    const input = binding();
    await commit(stub, input);
    await expireCommittedWithAlarm(stub);
    const before = await stub.status({ authorityDay });
    expect(before).toMatchObject({
      spentNanodollars: input.reservationNanodollars,
      reservedNanodollars: 0,
      remainingNanodollars: OWNER_DAILY_LIMIT_NANODOLLARS - input.reservationNanodollars,
    });
    const delayed = { ...input, costOutcome: { kind: 'exact' as const, nanodollars: actual } };
    await expect(stub.settle(delayed)).resolves.toEqual({ status: 'settled_full' });
    await evictDurableObject(stub);
    await expect(stub.settle(delayed)).resolves.toEqual({ status: 'settled_full' });
    expect(await rows(stub)).toEqual([expect.objectContaining({
      phase: 'settled_full',
      settled_nanodollars: input.reservationNanodollars,
      breach_class: null,
    })]);
    expect(await stub.status({ authorityDay })).toEqual(before);
  });

  it.each<readonly [string, number, CostOutcome]>([
    ['an exact-above contradiction after an exact-below acknowledgement', 1, { kind: 'exact', nanodollars: 20_000_001 }],
    ['a positive-overflow contradiction after an exact-equal acknowledgement', 20_000_000, { kind: 'positive-overflow' }],
  ])('makes %s conflict without mutating the acknowledged expired row', async (_label, acknowledgedActual, contradiction) => {
    const stub = authority(`delayed-monotonic-${acknowledgedActual}`);
    const input = binding();
    await commit(stub, input);
    await expireCommittedWithAlarm(stub);

    const acknowledged = { ...input, costOutcome: { kind: 'exact' as const, nanodollars: acknowledgedActual } };
    await expect(stub.settle(acknowledged)).resolves.toEqual({ status: 'settled_full' });
    const acknowledgedRows = await rows(stub);
    expect(acknowledgedRows).toEqual([expect.objectContaining({
      phase: 'settled_full',
      settled_nanodollars: input.reservationNanodollars,
      breach_class: null,
      transport_deadline_ms: null,
    })]);
    const acknowledgedStatus = await stub.status({ authorityDay });
    const acknowledgedPolicy = await policy(stub);

    await evictDurableObject(stub);
    await expect(stub.settle(acknowledged)).resolves.toEqual({ status: 'settled_full' });
    await expect(stub.settle({ ...input, costOutcome: { kind: 'missing' } })).resolves.toEqual({ status: 'settled_full' });
    await expect(stub.settle({ ...input, costOutcome: contradiction })).resolves.toEqual({ status: 'conflict' });

    expect(await rows(stub)).toEqual(acknowledgedRows);
    expect(await stub.status({ authorityDay })).toEqual(acknowledgedStatus);
    expect(await policy(stub)).toEqual(acknowledgedPolicy);
    expect((await policy(stub)).frozen_code).toBeNull();
  });

  it('applies a delayed exact above-reservation breach after committed expiry without reopening budget', async () => {
    const stub = authority('delayed-primary-breach');
    const input = binding();
    const actual = input.reservationNanodollars + 1;
    await commit(stub, input);
    await expireCommittedWithAlarm(stub);
    const delayed = { ...input, costOutcome: { kind: 'exact' as const, nanodollars: actual } };
    const expected = {
      status: 'settled' as const,
      breachClass: 'primary_breach' as const,
      frozenCode: 'accounting_policy_breach' as const,
    };
    await expect(stub.settle(delayed)).resolves.toEqual(expected);
    await evictDurableObject(stub);
    await expect(stub.settle(delayed)).resolves.toEqual(expected);
    expect((await rows(stub))[0]).toMatchObject({
      phase: 'settled',
      settled_nanodollars: actual,
      breach_class: 'primary_breach',
    });
    expect((await policy(stub)).frozen_code).toBe('accounting_policy_breach');
    await expect(stub.reserve(binding())).resolves.toMatchObject({ status: 'exhausted' });
  });

  it('applies delayed positive overflow after committed expiry and preserves the full hold', async () => {
    const stub = authority('delayed-primary-overflow');
    const input = binding();
    await commit(stub, input);
    await expireCommittedWithAlarm(stub);
    const delayed = { ...input, costOutcome: { kind: 'positive-overflow' as const } };
    const expected = {
      status: 'settled_full' as const,
      breachClass: 'primary_overflow' as const,
      frozenCode: 'accounting_cost_overflow' as const,
    };
    await expect(stub.settle(delayed)).resolves.toEqual(expected);
    await evictDurableObject(stub);
    await expect(stub.settle(delayed)).resolves.toEqual(expected);
    expect((await rows(stub))[0]).toMatchObject({
      phase: 'settled_full',
      settled_nanodollars: input.reservationNanodollars,
      breach_class: 'primary_overflow',
    });
    expect((await policy(stub)).frozen_code).toBe('accounting_cost_overflow');
    await expect(stub.reserve(binding())).resolves.toMatchObject({ status: 'exhausted' });
  });

  it.each([
    null,
    1,
    {},
    { kind: 'unknown' },
    { kind: 'missing', extra: true },
    { kind: 'exact' },
    { kind: 'exact', nanodollars: '1' },
    { kind: 'exact', nanodollars: -1 },
    { kind: 'exact', nanodollars: Number.NaN },
    { kind: 'exact', nanodollars: Number.POSITIVE_INFINITY },
    { kind: 'exact', nanodollars: Number.MAX_SAFE_INTEGER },
  ])('rejects malformed serialized settlement cost outcome %# without throwing', async (costOutcome) => {
    const stub = authority('malformed-settlement');
    const input = binding();
    await commit(stub, input);
    await expect(stub.settle({ ...input, costOutcome } as never)).resolves.toEqual({ status: 'conflict' });
    expect((await rows(stub))[0]).toMatchObject({ phase: 'committed', settled_nanodollars: null });
  });

  it.each([null, {}, { authorityDay }])('rejects malformed serialized settlement input %# without throwing', async (payload) => {
    const stub = authority('malformed-settlement-input');
    await expect(stub.settle(payload as never)).resolves.toEqual({ status: 'conflict' });
    expect(await rows(stub)).toHaveLength(0);
  });

  it.each(['reserve', 'commit', 'release'] as const)('validates the exact serialized shape before %s dereferences or mutates it', async (operation) => {
    const stub = authority(`malformed-${operation}`);
    const unsafe = stub as unknown as UnsafeBudgetStub;
    const valid = binding();
    const cases: readonly Readonly<{ label: string; payload: unknown; expected: Readonly<{ status: string }> }>[] = [
      { label: 'null', payload: null, expected: { status: 'conflict' } },
      { label: 'undefined', payload: undefined, expected: { status: 'conflict' } },
      { label: 'number primitive', payload: 1, expected: { status: 'conflict' } },
      { label: 'string primitive', payload: 'invalid', expected: { status: 'conflict' } },
      { label: 'boolean primitive', payload: true, expected: { status: 'conflict' } },
      { label: 'missing fields', payload: { authorityDay }, expected: { status: 'conflict' } },
      { label: 'extra field', payload: { ...valid, extra: true }, expected: { status: 'conflict' } },
      { label: 'invalid field type', payload: { ...valid, reservationNanodollars: '20000000' }, expected: { status: 'conflict' } },
      { label: 'invalid UTC day', payload: { ...valid, authorityDay: '2026-02-30' }, expected: { status: 'day-mismatch' } },
    ];
    for (const testCase of cases) {
      await expect(unsafe[operation](testCase.payload), testCase.label).resolves.toEqual(testCase.expected);
      expect(await rows(stub), testCase.label).toHaveLength(0);
    }
  });

  it('validates the exact serialized shape before settle dereferences or mutates it', async () => {
    const stub = authority('malformed-settle-shape');
    const unsafe = stub as unknown as UnsafeBudgetStub;
    const valid = { ...binding(), costOutcome: { kind: 'missing' as const } };
    const cases: readonly Readonly<{ label: string; payload: unknown; expected: Readonly<{ status: string }> }>[] = [
      { label: 'null', payload: null, expected: { status: 'conflict' } },
      { label: 'undefined', payload: undefined, expected: { status: 'conflict' } },
      { label: 'number primitive', payload: 1, expected: { status: 'conflict' } },
      { label: 'string primitive', payload: 'invalid', expected: { status: 'conflict' } },
      { label: 'boolean primitive', payload: true, expected: { status: 'conflict' } },
      { label: 'missing fields', payload: { authorityDay, costOutcome: { kind: 'missing' } }, expected: { status: 'conflict' } },
      { label: 'extra top-level field', payload: { ...valid, extra: true }, expected: { status: 'conflict' } },
      { label: 'extra cost outcome field', payload: { ...valid, costOutcome: { kind: 'missing', extra: true } }, expected: { status: 'conflict' } },
      { label: 'invalid field type', payload: { ...valid, executionId: 1 }, expected: { status: 'conflict' } },
      { label: 'invalid UTC day', payload: { ...valid, authorityDay: '2026-02-30' }, expected: { status: 'day-mismatch' } },
    ];
    for (const testCase of cases) {
      await expect(unsafe.settle(testCase.payload), testCase.label).resolves.toEqual(testCase.expected);
      expect(await rows(stub), testCase.label).toHaveLength(0);
    }
  });

  it('returns the closed status result for malformed shapes and preserves day-mismatch for an exact invalid UTC-day shape', async () => {
    const stub = authority('malformed-status-shape');
    const unsafe = stub as unknown as UnsafeBudgetStub;
    const cases: readonly Readonly<{ label: string; payload: unknown }>[] = [
      { label: 'null', payload: null },
      { label: 'undefined', payload: undefined },
      { label: 'number primitive', payload: 1 },
      { label: 'string primitive', payload: 'invalid' },
      { label: 'boolean primitive', payload: true },
      { label: 'missing authority day', payload: {} },
      { label: 'extra field', payload: { authorityDay, extra: true } },
      { label: 'invalid field type', payload: { authorityDay: 1 } },
      { label: 'invalid UTC day', payload: { authorityDay: '2026-02-30' } },
    ];
    for (const testCase of cases) {
      await expect(unsafe.status(testCase.payload), testCase.label).resolves.toEqual({ status: 'day-mismatch' });
      expect(await rows(stub), testCase.label).toHaveLength(0);
    }
  });

  it('serializes concurrent above-reservation settlements into one primary and one secondary breach', async () => {
    const stub = authority('concurrent-breach');
    const first = binding();
    const second = binding();
    await Promise.all([commit(stub, first), commit(stub, second)]);
    const actual = Number.MAX_SAFE_INTEGER - OWNER_DAILY_LIMIT_NANODOLLARS;
    const results = await Promise.all([
      stub.settle({ ...first, costOutcome: { kind: 'exact', nanodollars: actual } }),
      stub.settle({ ...second, costOutcome: { kind: 'exact', nanodollars: actual - 1 } }),
    ]);
    expect(results.map((value: { status: string }) => value.status).sort()).toEqual(['settled', 'settled_full']);
    const stored = await rows(stub);
    expect(stored.filter(({ breach_class }) => breach_class === 'primary_breach')).toHaveLength(1);
    expect(stored.filter(({ breach_class }) => breach_class === 'secondary_breach')).toHaveLength(1);
    expect(stored.find(({ breach_class }) => breach_class === 'secondary_breach')).toMatchObject({
      phase: 'settled_full',
      settled_nanodollars: 20_000_000,
    });
    const aggregate = stored.reduce((sum, row) => sum + (row.settled_nanodollars ?? 0), 0);
    expect(Number.isSafeInteger(aggregate)).toBe(true);
    expect(aggregate).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    expect((await policy(stub)).frozen_code).toBe('accounting_policy_breach');
  });

  it('freezes on positive overflow, settles full, and rejects every later admission', async () => {
    const stub = authority('positive-overflow');
    const input = binding();
    await expect(settle(stub, input, { kind: 'positive-overflow' })).resolves.toEqual({
      status: 'settled_full',
      breachClass: 'primary_overflow',
      frozenCode: 'accounting_cost_overflow',
    });
    await evictDurableObject(stub);
    expect((await rows(stub))[0]).toMatchObject({
      phase: 'settled_full',
      settled_nanodollars: input.reservationNanodollars,
      breach_class: 'primary_overflow',
    });
    await expect(stub.reserve(binding())).resolves.toMatchObject({ status: 'exhausted' });
    expect(await stub.status({ authorityDay })).toMatchObject({ status: 'available', frozen: true, exhausted: true });
  });

  it('arms before an insert that crashes, leaving a harmless durable alarm and no partial state', async () => {
    const stub = authority('alarm-before-insert');
    const input = binding();
    await runInDurableObject(stub, async (instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => {
      state.storage.sql.exec(`CREATE TRIGGER crash_owner_budget_insert
        BEFORE INSERT ON owner_budget_operation BEGIN SELECT RAISE(ABORT, 'synthetic crash'); END`);
      await expect(instance.reserve(input)).rejects.toThrow('synthetic crash');
      expect(await state.storage.getAlarm()).not.toBeNull();
      expect(state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM owner_budget_operation').one().count).toBe(0);
      expect(state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM owner_budget_policy').one().count).toBe(0);
    });
    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await rows(stub)).toHaveLength(0);
  });

  it('does not commit SQL state when durable alarm arming fails before setAlarm resolves', async () => {
    const stub = authority('alarm-write-failure');
    const input = binding();
    await runInDurableObject(stub, async (instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => {
      const storage = state.storage as DurableObjectStateLike['storage'] & { setAlarm(timestamp: number): Promise<void> };
      const originalSetAlarm = storage.setAlarm;
      storage.setAlarm = async () => { throw new Error('synthetic alarm write failure'); };
      try {
        await expect(instance.reserve(input)).rejects.toThrow('synthetic alarm write failure');
      } finally {
        storage.setAlarm = originalSetAlarm;
      }
      expect(state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM owner_budget_operation').one().count).toBe(0);
      expect(state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM owner_budget_policy').one().count).toBe(0);
      expect(await state.storage.getAlarm()).toBeNull();
    });
    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(false);
  });

  it('keeps both the alarm and row when the process loses the response immediately after SQL commit', async () => {
    const stub = authority('crash-after-commit');
    const input = binding();
    await expect(runInDurableObject(stub, async (instance: OwnerBudgetAuthority) => {
      await instance.reserve(input);
      throw new Error('synthetic lost response');
    })).rejects.toThrow('synthetic lost response');
    await evictDurableObject(stub);
    expect(await rows(stub)).toEqual([expect.objectContaining({ execution_id: input.executionId, phase: 'reserved' })]);
    const alarm = await runInDurableObject(stub, (_instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => state.storage.getAlarm());
    expect(alarm).not.toBeNull();
  });

  it('lets the durable alarm alone release an expired reservation after eviction', async () => {
    const stub = authority('reserved-expiry');
    const input = binding();
    await expect(stub.reserve(input)).resolves.toMatchObject({ status: 'reserved' });
    await runInDurableObject(stub, (_instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => {
      state.storage.sql.exec('UPDATE owner_budget_operation SET reserved_until_ms = ?', Date.now() - 1);
      return state.storage.setAlarm(Date.now() + 10_000);
    });
    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await rows(stub)).toEqual([expect.objectContaining({ phase: 'released', settled_nanodollars: null })]);
  });

  it('lets the durable alarm alone settle an expired committed hold full after eviction', async () => {
    const stub = authority('committed-expiry');
    const input = binding();
    await commit(stub, input);
    await runInDurableObject(stub, (_instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => {
      state.storage.sql.exec('UPDATE owner_budget_operation SET committed_until_ms = ?', Date.now() - 1);
      return state.storage.setAlarm(Date.now() + 10_000);
    });
    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await rows(stub)).toEqual([expect.objectContaining({
      phase: 'settled_full',
      settled_nanodollars: input.reservationNanodollars,
    })]);
  });

  it.each(['absent', 'stale'] as const)('constructor repairs an %s committed-work alarm after eviction and the alarm alone reconciles', async (condition) => {
    const stub = authority(`constructor-repair-${condition}`);
    const input = binding();
    await commit(stub, input);
    const farFuture = Date.now() + COMMITTED_LEASE_MS * 4;
    await runInDurableObject(stub, (_instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => {
      state.storage.sql.exec('UPDATE owner_budget_operation SET committed_until_ms = ?', Date.now() + 60_000);
      return condition === 'absent' ? state.storage.deleteAlarm() : state.storage.setAlarm(farFuture);
    });
    await evictDurableObject(stub);
    await runInDurableObject(stub, async (_instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => {
      const repaired = await state.storage.getAlarm();
      expect(repaired).not.toBeNull();
      expect(repaired!).toBeLessThan(farFuture);
      expect(repaired!).toBeLessThanOrEqual(Date.now() + 30_000);
      state.storage.sql.exec('UPDATE owner_budget_operation SET committed_until_ms = ?', Date.now() - 1);
    });
    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await rows(stub))[0]).toMatchObject({ phase: 'settled_full', settled_nanodollars: input.reservationNanodollars });
  });

  it('arms before RPC-driven committed expiry and leaves committed state when alarm persistence fails', async () => {
    const stub = authority('rpc-expiry-alarm-first');
    const input = binding();
    await commit(stub, input);
    await runInDurableObject(stub, async (instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => {
      state.storage.sql.exec('UPDATE owner_budget_operation SET committed_until_ms = ?', Date.now() - 1);
      await state.storage.deleteAlarm();
      const storage = state.storage as DurableObjectStateLike['storage'] & { setAlarm(timestamp: number): Promise<void> };
      const originalSetAlarm = storage.setAlarm;
      storage.setAlarm = async () => { throw new Error('synthetic committed-expiry alarm failure'); };
      try {
        await expect(instance.status({ authorityDay })).rejects.toThrow('synthetic committed-expiry alarm failure');
      } finally {
        storage.setAlarm = originalSetAlarm;
      }
      expect(state.storage.sql.exec<{ phase: string }>('SELECT phase FROM owner_budget_operation').one().phase).toBe('committed');
    });
  });

  it('arms before RPC-driven terminal retention and leaves terminal state when alarm persistence fails', async () => {
    const stub = authority('rpc-retention-alarm-first');
    const input = binding();
    await settle(stub, input, { kind: 'missing' });
    await runInDurableObject(stub, async (instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => {
      state.storage.sql.exec('UPDATE owner_budget_operation SET terminal_at_ms = ?', Date.now() - ACCOUNTING_RETENTION_MS);
      await state.storage.deleteAlarm();
      const storage = state.storage as DurableObjectStateLike['storage'] & { setAlarm(timestamp: number): Promise<void> };
      const originalSetAlarm = storage.setAlarm;
      storage.setAlarm = async () => { throw new Error('synthetic retention alarm failure'); };
      try {
        await expect(instance.status({ authorityDay })).rejects.toThrow('synthetic retention alarm failure');
      } finally {
        storage.setAlarm = originalSetAlarm;
      }
      expect(state.storage.sql.exec<{ phase: string }>('SELECT phase FROM owner_budget_operation').one().phase).toBe('settled_full');
    });
  });

  it('never moves an earlier alarm later while RPC expiry settles committed work', async () => {
    const stub = authority('rpc-expiry-never-later');
    const input = binding();
    await commit(stub, input);
    await runInDurableObject(stub, async (instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => {
      const earlier = Date.now() + 5_000;
      state.storage.sql.exec('UPDATE owner_budget_operation SET committed_until_ms = ?', Date.now() - 1);
      await state.storage.setAlarm(earlier);
      await expect(instance.status({ authorityDay })).resolves.toMatchObject({ spentNanodollars: input.reservationNanodollars });
      expect(await state.storage.getAlarm()).toBe(earlier);
      expect(state.storage.sql.exec<{ phase: string }>('SELECT phase FROM owner_budget_operation').one().phase).toBe('settled_full');
    });
    await evictDurableObject(stub);
  });

  it('keeps all SQLite values and status aggregates nonnegative safe integers', async () => {
    const stub = authority('safe-integers');
    const first = binding();
    const second = binding();
    await Promise.all([commit(stub, first), commit(stub, second)]);
    await stub.settle({ ...first, costOutcome: { kind: 'exact', nanodollars: Number.MAX_SAFE_INTEGER - OWNER_DAILY_LIMIT_NANODOLLARS } });
    await stub.settle({ ...second, costOutcome: { kind: 'positive-overflow' } });
    const stored = await rows(stub);
    for (const row of stored) {
      for (const value of [row.reservation_nanodollars, row.settled_nanodollars, row.reserved_until_ms, row.transport_deadline_ms, row.committed_until_ms, row.terminal_at_ms]) {
        if (value !== null) expect(Number.isSafeInteger(value) && value >= 0).toBe(true);
      }
    }
    const status = await stub.status({ authorityDay });
    expect(status.status).toBe('available');
    if (status.status !== 'available') return;
    for (const value of [status.limitNanodollars, status.spentNanodollars, status.reservedNanodollars, status.remainingNanodollars]) {
      expect(Number.isSafeInteger(value) && value >= 0).toBe(true);
    }
  });

  it('retains settled and settled_full rows and their usage until exactly 72 hours', async () => {
    const stub = authority('retention');
    const exact = binding();
    const full = binding();
    await settle(stub, exact, { kind: 'exact', nanodollars: 1 });
    await settle(stub, full, { kind: 'missing' });
    await evictDurableObject(stub);
    expect((await rows(stub)).map(({ phase }) => phase).sort()).toEqual(['settled', 'settled_full']);
    expect(await stub.status({ authorityDay })).toMatchObject({
      spentNanodollars: 20_000_001,
      reservedNanodollars: 0,
    });

    const boundaryNow = Date.now() + 60_000;
    await runInDurableObject(stub, async (instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => {
      state.storage.sql.exec('UPDATE owner_budget_operation SET terminal_at_ms = ?', boundaryNow - ACCOUNTING_RETENTION_MS + 1);
      const originalNow = Date.now;
      Date.now = () => boundaryNow;
      try { await instance.alarm(); } finally { Date.now = originalNow; }
    });
    expect(await rows(stub)).toHaveLength(2);
    const beforeBoundaryStatus = await runInDurableObject(stub, async (instance: OwnerBudgetAuthority) => {
      const originalNow = Date.now;
      Date.now = () => boundaryNow;
      try { return await instance.status({ authorityDay }); } finally { Date.now = originalNow; }
    });
    expect(beforeBoundaryStatus).toMatchObject({ spentNanodollars: 20_000_001 });

    await runInDurableObject(stub, async (instance: OwnerBudgetAuthority, state: DurableObjectStateLike) => {
      state.storage.sql.exec('UPDATE owner_budget_operation SET terminal_at_ms = ?', boundaryNow - ACCOUNTING_RETENTION_MS);
      const originalNow = Date.now;
      Date.now = () => boundaryNow;
      try { await instance.alarm(); } finally { Date.now = originalNow; }
    });
    expect(await rows(stub)).toHaveLength(0);
    expect(await stub.status({ authorityDay })).toMatchObject({ spentNanodollars: 0, reservedNanodollars: 0 });
  });

  it('rejects malformed and changed UTC authority days without mutation', async () => {
    const stub = authority('day-mismatch');
    const input = binding();
    await expect(stub.reserve({ ...input, authorityDay: '2026-02-30' })).resolves.toEqual({ status: 'day-mismatch' });
    expect(await rows(stub)).toHaveLength(0);
    await expect(stub.reserve(input)).resolves.toMatchObject({ status: 'reserved' });
    for (const operation of [
      () => stub.commit({ ...input, authorityDay: '2026-08-13' }),
      () => stub.release({ ...input, authorityDay: '2026-08-13' }),
      () => stub.settle({ ...input, authorityDay: '2026-08-13', costOutcome: { kind: 'missing' } }),
    ]) {
      await expect(operation()).resolves.toEqual({ status: 'day-mismatch' });
    }
    await expect(stub.status({ authorityDay: '2026-08-13' })).resolves.toEqual({ status: 'day-mismatch' });
    expect((await rows(stub))[0].phase).toBe('reserved');
  });
});
