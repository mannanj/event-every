import { describe, expect, mock, test } from 'bun:test';
import type {
  OwnerBudgetBinding,
  OwnerBudgetReserveResult,
  OwnerBudgetSettleResult,
  ProviderRequestObservedResult,
} from '@/platform/contracts';
import type { CostOutcome, StoredProviderFailure } from '../contracts';
import { OWNER_POLICY_VERSION, OWNER_VARIANT_POLICY } from '../policy';
import { DurableSummaryReplaySchema } from '../replay';
import type { ProviderTransportInput, ProviderTransportResult } from '../transport';
import {
  runProviderOperation,
  type ProviderOperationDependencies,
  type ProviderOperationInput,
} from '@/platform/cloudflare/provider-operation';

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';
const DIGEST = 'a'.repeat(64);
const RAW_MARKER = 'raw-private-request-marker';
const AUTHORITY_DAY = '2026-08-13';
const NOW = Date.parse(`${AUTHORITY_DAY}T12:00:00.000Z`);
const TRANSPORT_DEADLINE = NOW + 14 * 60_000;
const COMMITTED_UNTIL = NOW + 15 * 60_000;

type Stage =
  | 'request.begin'
  | 'budget.reserve'
  | 'request.recordReservation'
  | 'budget.commit'
  | 'request.recordBudgetCommitted'
  | 'request.claimTransport'
  | 'request.completeKnown'
  | 'request.completeFailed'
  | 'request.completeUnknown'
  | 'budget.settle'
  | 'provider transport';

type ActivePhase = 'missing' | 'prepared' | 'reserved' | 'budget_committed' | 'provider_inflight';
type Terminal = Extract<ProviderRequestObservedResult, { status: 'completed' | 'failed' | 'unknown' }>;
type SharedBudget = {
  frozen: boolean;
  breachClasses: string[];
};

function successTransport(costOutcome: CostOutcome = { kind: 'exact', nanodollars: 1 }): ProviderTransportResult {
  return { status: 'success', value: { summary: 'Team Lunch' }, costOutcome };
}

function operationInput(overrides: Partial<ProviderOperationInput> = {}): ProviderOperationInput {
  return {
    requestId: REQUEST_ID,
    variant: 'summarize',
    bindingCandidates: [{ version: 'c1-b-current-v1', digest: DIGEST }],
    signal: new AbortController().signal,
    execute: async (invoke) => {
      const transport = await invoke({
        model: 'caller/model-must-not-be-authoritative',
        messages: [{ role: 'user', content: RAW_MARKER }],
      });
      if (transport.status !== 'success') throw new Error('provider execution stopped');
      return transport.value;
    },
    ...overrides,
  };
}

function harness(options: Readonly<{
  loseAfter?: Stage;
  transport?: ProviderTransportResult;
  now?: () => number;
  sharedBudget?: SharedBudget;
  afterStage?: (stage: Stage) => void;
}> = {}) {
  const order: Stage[] = [];
  const rpcArguments: unknown[] = [];
  const sharedBudget = options.sharedBudget ?? { frozen: false, breachClasses: [] };
  let lost = false;
  let phase: ActivePhase = 'missing';
  let terminal: Terminal | null = null;
  let budgetReserved = false;
  let budgetCommitted = false;
  let settlementPending = false;

  const maybeLose = (stage: Stage): void => {
    if (!lost && options.loseAfter === stage) {
      lost = true;
      throw new Error(`lost ${stage} response containing no caller data`);
    }
  };
  const pending = (): ProviderRequestObservedResult => ({
    status: 'pending',
    phase: phase === 'missing' ? 'prepared' : phase,
    executionId: EXECUTION_ID,
    authorityDay: AUTHORITY_DAY,
    shapeKeyVersion: 'c1-b-current-v1',
    ...(phase === 'budget_committed' || phase === 'provider_inflight'
      ? { transportDeadlineMs: TRANSPORT_DEADLINE }
      : {}),
  });
  const observed = (): ProviderRequestObservedResult => terminal ?? pending();

  const settle = async (binding: OwnerBudgetBinding & { costOutcome: CostOutcome }): Promise<OwnerBudgetSettleResult> => {
    order.push('budget.settle');
    rpcArguments.push(binding);
    let result: OwnerBudgetSettleResult = { status: binding.costOutcome.kind === 'exact' ? 'settled' : 'settled_full' };
    if (binding.costOutcome.kind === 'positive-overflow') {
      const breachClass = sharedBudget.frozen ? 'secondary_breach' : 'primary_overflow';
      sharedBudget.frozen = true;
      sharedBudget.breachClasses.push(breachClass);
      result = { status: 'settled_full', breachClass, frozenCode: 'accounting_cost_overflow' };
    } else if (binding.costOutcome.kind === 'exact'
      && binding.costOutcome.nanodollars > binding.reservationNanodollars) {
      const breachClass = sharedBudget.frozen ? 'secondary_breach' : 'primary_breach';
      sharedBudget.frozen = true;
      sharedBudget.breachClasses.push(breachClass);
      result = { status: 'settled_full', breachClass, frozenCode: 'accounting_policy_breach' };
    }
    maybeLose('budget.settle');
    return result;
  };

  const finish = async (
    stage: Extract<Stage, 'request.completeKnown' | 'request.completeFailed' | 'request.completeUnknown'>,
    input: Record<string, unknown>,
    outcome: Terminal,
    costOutcome: CostOutcome,
  ) => {
    order.push(stage);
    rpcArguments.push(input);
    terminal = outcome;
    phase = 'provider_inflight';
    settlementPending = true;
    try {
      const settled = await settle({
        executionId: EXECUTION_ID,
        requestAuthorityName: expect.anything() as unknown as string,
        authorityDay: AUTHORITY_DAY,
        route: 'summarize',
        variant: 'summarize',
        policyVersion: OWNER_POLICY_VERSION,
        reservationNanodollars: OWNER_VARIANT_POLICY.summarize.reservationNanodollars,
        costOutcome,
      });
      settlementPending = false;
      if ('frozenCode' in settled && settled.frozenCode) {
        terminal = {
          status: 'failed',
          code: settled.frozenCode,
          httpStatus: 502,
          settlement: 'settlement_complete',
        };
      } else if (terminal.status !== 'unknown') {
        terminal = { ...terminal, settlement: 'settlement_complete' };
      }
    } catch {
      // Mirrors the authority outbox: durable terminal state survives a lost settlement response.
    }
    maybeLose(stage);
    return { status: 'stored' as const, outcome: terminal! };
  };

  const requestAuthority = {
    begin: mock(async (input: unknown) => {
      order.push('request.begin');
      rpcArguments.push(input);
      if (phase === 'missing' && terminal === null) phase = 'prepared';
      options.afterStage?.('request.begin');
      maybeLose('request.begin');
      return observed();
    }),
    recordReservation: mock(async (input: unknown) => {
      order.push('request.recordReservation');
      rpcArguments.push(input);
      if (phase === 'prepared' || phase === 'reserved') phase = 'reserved';
      options.afterStage?.('request.recordReservation');
      maybeLose('request.recordReservation');
      return { status: 'recorded' as const, phase: 'reserved' as const };
    }),
    recordBudgetCommitted: mock(async (input: unknown) => {
      order.push('request.recordBudgetCommitted');
      rpcArguments.push(input);
      if (!budgetCommitted) throw new Error('request deadline recorded before budget commit');
      phase = 'budget_committed';
      options.afterStage?.('request.recordBudgetCommitted');
      maybeLose('request.recordBudgetCommitted');
      return {
        status: 'recorded' as const,
        phase: 'budget_committed' as const,
        transportDeadlineMs: TRANSPORT_DEADLINE,
        committedUntilMs: COMMITTED_UNTIL,
      };
    }),
    claimTransport: mock(async (input: unknown) => {
      order.push('request.claimTransport');
      rpcArguments.push(input);
      if (!budgetCommitted || phase !== 'budget_committed') {
        throw new Error('permit issued without both durable deadline acknowledgements');
      }
      phase = 'provider_inflight';
      options.afterStage?.('request.claimTransport');
      maybeLose('request.claimTransport');
      return { status: 'permit' as const, nonce: 'n'.repeat(43), transportDeadlineMs: TRANSPORT_DEADLINE };
    }),
    completeKnown: mock(async (input: Record<string, unknown>) => {
      if (!DurableSummaryReplaySchema.safeParse(input.replay).success) {
        order.push('request.completeKnown');
        rpcArguments.push(input);
        options.afterStage?.('request.completeKnown');
        return { status: 'rejected' as const };
      }
      const cost = input.costOutcome as CostOutcome;
      const reservation = OWNER_VARIANT_POLICY.summarize.reservationNanodollars;
      const outcome: Terminal = cost.kind === 'positive-overflow'
        ? { status: 'failed', code: 'accounting_cost_overflow', httpStatus: 502, settlement: 'settlement_pending' }
        : cost.kind === 'exact' && cost.nanodollars > reservation
          ? { status: 'failed', code: 'accounting_policy_breach', httpStatus: 502, settlement: 'settlement_pending' }
          : { status: 'completed', replay: input.replay, settlement: 'settlement_pending' };
      return finish('request.completeKnown', input, outcome, cost);
    }),
    completeFailed: mock(async (input: Record<string, unknown>) => finish(
      'request.completeFailed',
      input,
      {
        status: 'failed',
        code: input.code as StoredProviderFailure['code'],
        httpStatus: input.httpStatus as 502 | 503 | 504,
        settlement: 'settlement_pending',
      },
      input.costOutcome as CostOutcome,
    )),
    completeUnknown: mock(async (input: Record<string, unknown>) => finish(
      'request.completeUnknown',
      input,
      { status: 'unknown', code: 'provider_outcome_unknown', httpStatus: 502, settlement: 'settlement_pending' },
      { kind: 'missing' },
    )),
  };
  const budgetAuthority = {
    reserve: mock(async (input: unknown): Promise<OwnerBudgetReserveResult> => {
      order.push('budget.reserve');
      rpcArguments.push(input);
      budgetReserved = true;
      options.afterStage?.('budget.reserve');
      maybeLose('budget.reserve');
      return { status: 'reserved' as const, reservedUntilMs: NOW + 120_000 };
    }),
    commit: mock(async (input: unknown) => {
      order.push('budget.commit');
      rpcArguments.push(input);
      if (!budgetReserved) throw new Error('commit before reserve');
      budgetCommitted = true;
      options.afterStage?.('budget.commit');
      maybeLose('budget.commit');
      return { status: 'committed' as const, transportDeadlineMs: TRANSPORT_DEADLINE, committedUntilMs: COMMITTED_UNTIL };
    }),
    settle,
  };
  const requestNames: string[] = [];
  const budgetNames: string[] = [];
  const providerCall = mock(async (_input: ProviderTransportInput): Promise<ProviderTransportResult> => {
    order.push('provider transport');
    return options.transport ?? successTransport();
  });
  const deadlineSignal = new AbortController();
  const dependencies: ProviderOperationDependencies = {
    requestAuthority: {
      idFromName(name: string) { requestNames.push(name); return name; },
      get() { return requestAuthority; },
    },
    ownerBudgetAuthority: {
      idFromName(name: string) { budgetNames.push(name); return name; },
      get() { return budgetAuthority; },
    },
    ownerKey: 'synthetic-owner-key',
    callProvider: providerCall,
    now: options.now ?? (() => NOW),
    deadlineSignal: () => deadlineSignal.signal,
  };

  return {
    dependencies,
    order,
    rpcArguments,
    providerCall,
    requestAuthority,
    budgetAuthority,
    requestNames,
    budgetNames,
    deadlineSignal,
    sharedBudget,
    get settlementPending() { return settlementPending; },
  };
}

describe('provider operation coordinator', () => {
  test('runs the exact durable sequence before one transport and stores completion before return', async () => {
    const state = harness();
    let returned = false;
    state.requestAuthority.completeKnown.mockImplementationOnce(async (input) => {
      expect(returned).toBe(false);
      const result = {
        status: 'stored' as const,
        outcome: { status: 'completed' as const, replay: input.replay, settlement: 'settlement_complete' as const },
      };
      state.order.push('request.completeKnown');
      state.order.push('budget.settle');
      return result;
    });

    const result = await runProviderOperation(operationInput(), state.dependencies);
    returned = true;

    expect(result).toEqual({ status: 'completed', replay: { summary: 'Team Lunch' }, settlement: 'settlement_complete' });
    expect(state.order).toEqual([
      'request.begin',
      'budget.reserve',
      'request.recordReservation',
      'budget.commit',
      'request.recordBudgetCommitted',
      'request.claimTransport',
      'provider transport',
      'request.completeKnown',
      'budget.settle',
    ]);
    expect(state.providerCall).toHaveBeenCalledTimes(1);
    expect(state.requestNames).toHaveLength(1);
    expect(state.requestNames[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(state.budgetNames).toEqual([AUTHORITY_DAY]);
  });

  test.each([
    ['scan-text', 'scan', 20_000_000],
    ['scan-image', 'scan', 50_000_000],
    ['resolve-timezone', 'resolve-timezone', 1_000_000],
    ['summarize', 'summarize', 500_000],
  ] as const)('binds %s to its fixed route and reservation', async (variant, route, reservationNanodollars) => {
    const state = harness();
    state.budgetAuthority.reserve.mockImplementationOnce(async () => ({
      status: 'exhausted',
      resetAt: '2026-08-14T00:00:00.000Z',
    }));

    await runProviderOperation(operationInput({ variant }), state.dependencies);

    const beginCall = state.requestAuthority.begin.mock.calls[0];
    expect(beginCall).toBeDefined();
    if (!beginCall) throw new Error('expected begin call');
    expect(beginCall[0]).toMatchObject({ variant, route, reservationNanodollars });
    const reserveCall = state.budgetAuthority.reserve.mock.calls[0];
    expect(reserveCall).toBeDefined();
    if (!reserveCall) throw new Error('expected reserve call');
    expect(reserveCall[0]).toMatchObject({ variant, route, reservationNanodollars });
    expect(state.providerCall).toHaveBeenCalledTimes(0);
  });

  test.each([
    'request.begin',
    'budget.reserve',
    'request.recordReservation',
    'budget.commit',
    'request.recordBudgetCommitted',
    'request.claimTransport',
    'request.completeKnown',
    'budget.settle',
  ] satisfies Stage[])('replays the same UUID safely after a lost %s response', async (loseAfter) => {
    const state = harness({ loseAfter });
    const input = operationInput();

    const first = await runProviderOperation(input, state.dependencies);
    const second = await runProviderOperation(input, state.dependencies);

    if (loseAfter === 'request.claimTransport') {
      expect(first.status).toBe('unavailable');
      expect(second).toMatchObject({ status: 'pending', phase: 'provider_inflight' });
      expect(state.providerCall).toHaveBeenCalledTimes(0);
    } else {
      expect(first.status === 'unavailable' || first.status === 'completed').toBe(true);
      expect(second.status).toBe('completed');
      expect(state.providerCall).toHaveBeenCalledTimes(1);
    }
  });

  test('keeps a known terminal replay authoritative and performs no provider fetch on retry', async () => {
    const state = harness({ loseAfter: 'request.completeKnown' });
    const input = operationInput();
    await runProviderOperation(input, state.dependencies);
    const replay = await runProviderOperation(input, state.dependencies);

    expect(replay).toMatchObject({ status: 'completed', replay: { summary: 'Team Lunch' } });
    expect(state.providerCall).toHaveBeenCalledTimes(1);
  });

  test.each([
    [
      'request.completeFailed',
      {
        status: 'failed',
        failure: { code: 'provider_unavailable', httpStatus: 502 },
        costOutcome: { kind: 'missing' },
      },
      'failed',
    ],
    [
      'request.completeUnknown',
      { status: 'unknown', failure: { code: 'provider_outcome_unknown', httpStatus: 502 } },
      'unknown',
    ],
  ] as const)('replays a durable terminal after a lost %s response', async (loseAfter, transport, status) => {
    const state = harness({ loseAfter, transport });
    const input = operationInput();

    expect((await runProviderOperation(input, state.dependencies)).status).toBe('unavailable');
    expect((await runProviderOperation(input, state.dependencies)).status).toBe(status);
    expect(state.providerCall).toHaveBeenCalledTimes(1);
  });

  test('returns budget denial before reservation recording, commit, permit, or transport', async () => {
    const state = harness();
    state.budgetAuthority.reserve.mockImplementationOnce(async () => {
      state.order.push('budget.reserve');
      return { status: 'exhausted', resetAt: '2026-08-14T00:00:00.000Z' } as const;
    });

    const result = await runProviderOperation(operationInput(), state.dependencies);

    expect(result).toEqual({ status: 'budget-exhausted', resetAt: '2026-08-14T00:00:00.000Z' });
    expect(state.requestAuthority.recordReservation).toHaveBeenCalledTimes(0);
    expect(state.requestAuthority.claimTransport).toHaveBeenCalledTimes(0);
    expect(state.providerCall).toHaveBeenCalledTimes(0);
  });

  test.each([
    ['provider_rejected', 502],
    ['provider_unavailable', 502],
    ['provider_timeout', 504],
    ['provider_rate_limited', 503],
    ['owner_provider_credit_unavailable', 503],
    ['privacy_endpoint_unavailable', 503],
    ['provider_invalid_response', 502],
  ] as const)('durably records fixed failure %s before returning', async (code, httpStatus) => {
    const state = harness({
      transport: {
        status: 'failed',
        failure: { code, httpStatus },
        costOutcome: { kind: 'missing' },
      },
    });

    const result = await runProviderOperation(operationInput(), state.dependencies);

    expect(result).toMatchObject({ status: 'failed', code, httpStatus });
    expect(state.requestAuthority.completeFailed).toHaveBeenCalledTimes(1);
    expect(state.requestAuthority.completeFailed.mock.calls[0]?.[0]).toMatchObject({
      code,
      httpStatus,
      costOutcome: { kind: 'missing' },
    });
  });

  test('durably records ambiguous post-invocation failure as unknown', async () => {
    const state = harness({
      transport: { status: 'unknown', failure: { code: 'provider_outcome_unknown', httpStatus: 502 } },
    });

    const result = await runProviderOperation(operationInput(), state.dependencies);

    expect(result).toMatchObject({ status: 'unknown', code: 'provider_outcome_unknown' });
    expect(state.requestAuthority.completeUnknown).toHaveBeenCalledTimes(1);
    expect(state.requestAuthority.completeKnown).toHaveBeenCalledTimes(0);
  });

  test.each([
    [{ kind: 'exact', nanodollars: OWNER_VARIANT_POLICY.summarize.reservationNanodollars + 1 }, 'accounting_policy_breach'],
    [{ kind: 'positive-overflow' }, 'accounting_cost_overflow'],
  ] as const)('converts %o into a durable fixed failure with no replay', async (costOutcome, code) => {
    const state = harness({ transport: successTransport(costOutcome) });

    const result = await runProviderOperation(operationInput(), state.dependencies);

    expect(result).toMatchObject({ status: 'failed', code, httpStatus: 502 });
    expect(JSON.stringify(result)).not.toContain('durable');
  });

  test.each([
    [{ kind: 'exact', nanodollars: OWNER_VARIANT_POLICY.summarize.reservationNanodollars + 1 }, 'accounting_policy_breach'],
    [{ kind: 'positive-overflow' }, 'accounting_cost_overflow'],
  ] as const)('preserves %o when application projection also fails', async (costOutcome, code) => {
    const state = harness({ transport: successTransport(costOutcome) });
    const input = operationInput({
      execute: async (invoke) => {
        await invoke({ messages: [] });
        throw new Error('private invalid application result');
      },
    });

    const result = await runProviderOperation(input, state.dependencies);

    expect(result).toMatchObject({ status: 'failed', code, httpStatus: 502 });
    expect(JSON.stringify(result)).not.toContain('private invalid application result');
  });

  test.each([
    [{ kind: 'exact', nanodollars: OWNER_VARIANT_POLICY.summarize.reservationNanodollars + 1 }, 'accounting_policy_breach'],
    [{ kind: 'positive-overflow' }, 'accounting_cost_overflow'],
  ] as const)('falls back with %o when the real authority rejects an invalid replay', async (costOutcome, code) => {
    const state = harness({ transport: successTransport(costOutcome) });
    const input = operationInput({
      execute: async (invoke) => {
        await invoke({ messages: [] });
        return { summary: 'invalid replay shape' };
      },
    });

    const result = await runProviderOperation(input, state.dependencies);

    expect(result).toMatchObject({ status: 'failed', code, httpStatus: 502 });
    expect(state.requestAuthority.completeKnown).toHaveBeenCalledTimes(1);
    expect(state.requestAuthority.completeFailed).toHaveBeenCalledTimes(1);
    expect(state.requestAuthority.completeFailed.mock.calls[0]?.[0]).toMatchObject({
      code: 'provider_invalid_response',
      httpStatus: 502,
      costOutcome,
    });
  });

  test('serializes concurrent above-reservation settlements into one primary and one secondary breach', async () => {
    const sharedBudget: SharedBudget = { frozen: false, breachClasses: [] };
    const costOutcome = { kind: 'exact' as const, nanodollars: OWNER_VARIANT_POLICY.summarize.reservationNanodollars + 1 };
    const first = harness({ sharedBudget, transport: successTransport(costOutcome) });
    const second = harness({ sharedBudget, transport: successTransport(costOutcome) });

    const results = await Promise.all([
      runProviderOperation(operationInput({ requestId: REQUEST_ID }), first.dependencies),
      runProviderOperation(operationInput({ requestId: '33333333-3333-4333-8333-333333333333' }), second.dependencies),
    ]);

    expect(results.map((result) => result.status)).toEqual(['failed', 'failed']);
    expect(sharedBudget.breachClasses.sort()).toEqual(['primary_breach', 'secondary_breach']);
    expect(JSON.stringify(results)).not.toContain('durable');
  });

  test('never claims before both authorities hold the same absolute deadlines', async () => {
    const state = harness();
    const result = await runProviderOperation(operationInput(), state.dependencies);

    expect(result.status).toBe('completed');
    expect(state.budgetAuthority.commit).toHaveBeenCalledTimes(1);
    expect(state.requestAuthority.recordBudgetCommitted).toHaveBeenCalledWith({
      executionId: EXECUTION_ID,
      transportDeadlineMs: TRANSPORT_DEADLINE,
      committedUntilMs: COMMITTED_UNTIL,
    });
    expect(state.requestAuthority.claimTransport).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['before begin', null],
    ['after begin', 'request.begin'],
    ['after reserve', 'budget.reserve'],
    ['after reservation record', 'request.recordReservation'],
  ] as const)('stops an abort %s before committing budget or claiming transport', async (_label, abortAfter) => {
    const caller = new AbortController();
    if (abortAfter === null) caller.abort();
    const state = harness({
      afterStage(stage) {
        if (stage === abortAfter) caller.abort();
      },
    });

    const result = await runProviderOperation(operationInput({ signal: caller.signal }), state.dependencies);

    expect(result).toEqual({ status: 'unavailable' });
    expect(state.budgetAuthority.commit).toHaveBeenCalledTimes(0);
    expect(state.requestAuthority.recordBudgetCommitted).toHaveBeenCalledTimes(0);
    expect(state.requestAuthority.claimTransport).toHaveBeenCalledTimes(0);
    expect(state.providerCall).toHaveBeenCalledTimes(0);
  });

  test.each([TRANSPORT_DEADLINE, TRANSPORT_DEADLINE + 1])('turns now=%i into unknown without transport', async (boundaryNow) => {
    let reads = 0;
    const state = harness({ now: () => (++reads < 2 ? NOW : boundaryNow) });

    const result = await runProviderOperation(operationInput(), state.dependencies);

    expect(result).toMatchObject({ status: 'unknown', code: 'provider_outcome_unknown' });
    expect(state.providerCall).toHaveBeenCalledTimes(0);
    expect(state.requestAuthority.completeUnknown).toHaveBeenCalledTimes(1);
  });

  test('passes one combined caller/deadline signal through the sole provider call', async () => {
    const caller = new AbortController();
    const state = harness();
    const result = await runProviderOperation(operationInput({ signal: caller.signal }), state.dependencies);
    const call = state.providerCall.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error('expected provider call');
    const seenSignal = call[0].signal;

    expect(result.status).toBe('completed');
    expect(seenSignal).not.toBe(caller.signal);
    expect(seenSignal).not.toBe(state.deadlineSignal.signal);
    expect(seenSignal.aborted).toBe(false);
    caller.abort();
    expect(seenSignal.aborted).toBe(true);
  });

  test.each(['caller', 'deadline'] as const)('stores unknown when the %s signal aborts after transport but before projection is durable', async (source) => {
    const caller = new AbortController();
    const state = harness();
    const input = operationInput({
      signal: caller.signal,
      execute: async (invoke) => {
        const result = await invoke({ messages: [] });
        expect(result.status).toBe('success');
        if (source === 'caller') caller.abort();
        else state.deadlineSignal.abort();
        return { summary: 'Team Lunch' };
      },
    });

    const result = await runProviderOperation(input, state.dependencies);

    expect(result).toMatchObject({ status: 'unknown', code: 'provider_outcome_unknown' });
    expect(state.requestAuthority.completeUnknown).toHaveBeenCalledTimes(1);
    expect(state.requestAuthority.completeKnown).toHaveBeenCalledTimes(0);
    expect(state.requestAuthority.completeFailed).toHaveBeenCalledTimes(0);
    expect(state.order.at(-1)).toBe('budget.settle');
    expect(state.rpcArguments.at(-1)).toMatchObject({
      costOutcome: { kind: 'missing' },
    });
  });

  test('keeps the raw request only inside the in-memory transport closure', async () => {
    const state = harness();

    const result = await runProviderOperation(operationInput(), state.dependencies);

    expect(state.providerCall).toHaveBeenCalledTimes(1);
    const call = state.providerCall.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error('expected provider call');
    expect(JSON.stringify(call[0].providerBody)).toContain(RAW_MARKER);
    expect(JSON.stringify(state.rpcArguments)).not.toContain(RAW_MARKER);
    expect(JSON.stringify(result)).not.toContain(RAW_MARKER);
    expect(JSON.stringify(state.rpcArguments)).not.toContain('caller/model-must-not-be-authoritative');
  });
});
