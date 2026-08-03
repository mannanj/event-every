import type {
  LegacyChargeResult,
  LegacyDispatchStart,
  LegacyProviderResult,
} from '../contracts';
import { recordClosedEvent } from '../logger';

function invokeCharge(
  charge: () => Promise<LegacyChargeResult> | LegacyChargeResult,
): Promise<LegacyChargeResult> {
  try {
    return Promise.resolve(charge()).catch<LegacyChargeResult>(() => ({
      status: 'unavailable',
      code: 'legacy_charge_rejected',
    }));
  } catch {
    return Promise.resolve<LegacyChargeResult>({
      status: 'unavailable',
      code: 'legacy_charge_rejected',
    });
  }
}

function invokeProvider<T>(
  provider: (signal: AbortSignal) => Promise<LegacyProviderResult<T>> | LegacyProviderResult<T>,
  signal: AbortSignal,
): Promise<LegacyProviderResult<T>> {
  try {
    return Promise.resolve(provider(signal)).catch<LegacyProviderResult<T>>(() => ({
      status: 'failed',
      code: signal.aborted ? 'outcome_unknown' : 'upstream_unavailable',
    }));
  } catch {
    return Promise.resolve<LegacyProviderResult<T>>({
      status: 'failed',
      code: 'upstream_unavailable',
    });
  }
}

export function startLegacyDispatch<T>(input: {
  signal: AbortSignal;
  charge(): Promise<LegacyChargeResult> | LegacyChargeResult;
  provider(signal: AbortSignal): Promise<LegacyProviderResult<T>> | LegacyProviderResult<T>;
}): LegacyDispatchStart<T> {
  if (input.signal.aborted) return { status: 'aborted-before-dispatch' };
  const charge = invokeCharge(input.charge);
  const provider = invokeProvider(input.provider, input.signal);
  return { status: 'started', charge, provider };
}

const LEGACY_CHARGE_OBSERVE_MS = 1_000;

function observeLegacyCharge(
  charge: Promise<LegacyChargeResult>,
  defer: (work: Promise<void>) => void,
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<LegacyChargeResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ status: 'unavailable', code: 'legacy_charge_rejected' }),
      LEGACY_CHARGE_OBSERVE_MS,
    );
  });
  defer(
    Promise.race([charge, timeout]).then((result) => {
      if (timer !== undefined) clearTimeout(timer);
      if (result.status !== 'charged') recordClosedEvent('legacy_charge_unavailable');
    }),
  );
}

export async function settleLegacyDispatch<T>(
  start: Extract<LegacyDispatchStart<T>, { status: 'started' }>,
  signal: AbortSignal,
  defer: (work: Promise<void>) => void,
): Promise<LegacyProviderResult<T>> {
  let abortedAfterStart = signal.aborted;
  let resolveAbort!: () => void;
  const abort = new Promise<{ kind: 'aborted' }>((resolve) => {
    resolveAbort = () => resolve({ kind: 'aborted' });
  });
  const markAborted = () => {
    abortedAfterStart = true;
    resolveAbort();
  };
  signal.addEventListener('abort', markAborted, { once: true });
  if (signal.aborted) markAborted();
  observeLegacyCharge(start.charge, defer);
  const settled = await Promise.race([
    start.provider.then((provider) => ({ kind: 'provider' as const, provider })),
    abort,
  ]);
  signal.removeEventListener('abort', markAborted);
  if (abortedAfterStart || settled.kind === 'aborted') {
    return { status: 'failed', code: 'outcome_unknown' };
  }
  return settled.provider;
}
