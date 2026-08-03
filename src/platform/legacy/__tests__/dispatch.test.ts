import { describe, expect, mock, test } from 'bun:test';
import type { LegacyChargeResult, LegacyProviderResult } from '@/platform/contracts';
import { settleLegacyDispatch, startLegacyDispatch } from '../dispatch';

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function requireStarted<Value>(start: ReturnType<typeof startLegacyDispatch<Value>>) {
  if (start.status !== 'started') throw new Error('expected started dispatch');
  return start;
}

describe('legacy dispatch transition', () => {
  test('abort before dispatch starts zero charge and zero provider effects', () => {
    const controller = new AbortController();
    controller.abort();
    const charge = mock((): LegacyChargeResult => ({ status: 'charged' }));
    const provider = mock((_signal: AbortSignal): LegacyProviderResult<string> => ({ status: 'success', value: 'ok' }));

    expect(startLegacyDispatch({ signal: controller.signal, charge, provider })).toEqual({
      status: 'aborted-before-dispatch',
    });
    expect(charge).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  test('charge settlement cannot delay provider invocation and the exact signal is passed once', () => {
    const timeline: string[] = [];
    const controller = new AbortController();
    const pendingCharge = deferred<LegacyChargeResult>();
    const charge = mock(() => {
      timeline.push('charge');
      return pendingCharge.promise;
    });
    const provider = mock((signal: AbortSignal): LegacyProviderResult<string> => {
      timeline.push('provider');
      expect(signal).toBe(controller.signal);
      return { status: 'success', value: 'ok' };
    });

    const start = startLegacyDispatch({ signal: controller.signal, charge, provider });

    expect(start.status).toBe('started');
    expect(timeline).toEqual(['charge', 'provider']);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  test('synchronous effect throws are normalized independently and cannot suppress the other start', async () => {
    const timeline: string[] = [];
    const start = requireStarted(startLegacyDispatch<string>({
      signal: new AbortController().signal,
      charge() {
        timeline.push('charge');
        throw new Error('private charge failure');
      },
      provider() {
        timeline.push('provider');
        throw new Error('private provider failure');
      },
    }));

    expect(timeline).toEqual(['charge', 'provider']);
    await expect(start.charge).resolves.toEqual({ status: 'unavailable', code: 'legacy_charge_rejected' });
    await expect(start.provider).resolves.toEqual({ status: 'failed', code: 'upstream_unavailable' });
  });

  test('asynchronous effect rejections are normalized into fixed non-rejecting results', async () => {
    const start = requireStarted(startLegacyDispatch<string>({
      signal: new AbortController().signal,
      charge: async () => { throw new Error('private charge rejection'); },
      provider: async () => { throw new Error('private provider rejection'); },
    }));

    await expect(start.charge).resolves.toEqual({ status: 'unavailable', code: 'legacy_charge_rejected' });
    await expect(start.provider).resolves.toEqual({ status: 'failed', code: 'upstream_unavailable' });
  });

  test('provider success returns without awaiting a failed or never-settling charge', async () => {
    const deferredWork: Promise<void>[] = [];
    const neverCharge = new Promise<LegacyChargeResult>(() => {});
    const start = requireStarted(startLegacyDispatch({
      signal: new AbortController().signal,
      charge: () => neverCharge,
      provider: (): LegacyProviderResult<string> => ({ status: 'success', value: 'ok' }),
    }));

    await expect(settleLegacyDispatch(start, new AbortController().signal, (work) => deferredWork.push(work)))
      .resolves.toEqual({ status: 'success', value: 'ok' });
    expect(deferredWork).toHaveLength(1);

    const failedChargeStart = requireStarted(startLegacyDispatch({
      signal: new AbortController().signal,
      charge: (): LegacyChargeResult => ({ status: 'rejected', code: 'legacy_charge_rejected' }),
      provider: (): LegacyProviderResult<string> => ({ status: 'success', value: 'still-ok' }),
    }));
    await expect(settleLegacyDispatch(failedChargeStart, new AbortController().signal, () => {}))
      .resolves.toEqual({ status: 'success', value: 'still-ok' });
  });

  test('abort during a never-settling provider wait returns outcome_unknown without retry', async () => {
    const controller = new AbortController();
    const provider = mock(() => new Promise<LegacyProviderResult<string>>(() => {}));
    const start = requireStarted(startLegacyDispatch({
      signal: controller.signal,
      charge: (): LegacyChargeResult => ({ status: 'charged' }),
      provider,
    }));
    const result = settleLegacyDispatch(start, controller.signal, () => {});

    controller.abort();

    await expect(result).resolves.toEqual({ status: 'failed', code: 'outcome_unknown' });
    expect(provider).toHaveBeenCalledTimes(1);
  });

  test('late provider success after abort is unknown and never retries', async () => {
    const controller = new AbortController();
    const providerResult = deferred<LegacyProviderResult<string>>();
    const provider = mock(() => providerResult.promise);
    const start = requireStarted(startLegacyDispatch({
      signal: controller.signal,
      charge: (): LegacyChargeResult => ({ status: 'charged' }),
      provider,
    }));
    const result = settleLegacyDispatch(start, controller.signal, () => {});

    providerResult.resolve({ status: 'success', value: 'too-late' });
    controller.abort();

    await expect(result).resolves.toEqual({ status: 'failed', code: 'outcome_unknown' });
    expect(provider).toHaveBeenCalledTimes(1);
  });

  test('late provider success after abort is unknown when provider wins the race', async () => {
    const controller = new AbortController();
    let providerSettlements = 0;
    const provider = {
      then(onFulfilled: (value: LegacyProviderResult<string>) => unknown) {
        providerSettlements++;
        const mapped = onFulfilled({ status: 'success', value: 'too-late' });
        return {
          then(resolve: (value: unknown) => void) {
            resolve(mapped);
            controller.abort();
          },
        };
      },
    } as unknown as Promise<LegacyProviderResult<string>>;
    const start = {
      status: 'started' as const,
      charge: Promise.resolve<LegacyChargeResult>({ status: 'charged' }),
      provider,
    };

    await expect(settleLegacyDispatch(start, controller.signal, () => {}))
      .resolves.toEqual({ status: 'failed', code: 'outcome_unknown' });
    expect(providerSettlements).toBe(1);
  });

  test('a provider rejection observed after abort is fixed outcome_unknown', async () => {
    const controller = new AbortController();
    const providerResult = deferred<LegacyProviderResult<string>>();
    const start = requireStarted(startLegacyDispatch({
      signal: controller.signal,
      charge: (): LegacyChargeResult => ({ status: 'charged' }),
      provider: () => providerResult.promise,
    }));

    controller.abort();
    providerResult.reject(new Error('private late rejection'));

    await expect(settleLegacyDispatch(start, controller.signal, () => {}))
      .resolves.toEqual({ status: 'failed', code: 'outcome_unknown' });
  });
});
