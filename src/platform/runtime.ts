import { getCloudflareContext } from '@opennextjs/cloudflare';
import type {
  OwnerBudgetStatusResult,
  ProviderRequestStatusResult,
} from '@/platform/contracts';
import {
  runProviderOperation,
  type ProviderOperationInput,
  type ProviderOperationResult,
} from '@/platform/cloudflare/provider-operation';
import { getProviderRequestShapeKeys } from '@/platform/cloudflare-context';
import { providerRequestName, type ShapeKey } from '@/platform/provider/request-binding';

type StatusNamespace<Stub> = Readonly<{
  idFromName(name: string): unknown;
  get(id: unknown): Stub;
}>;

type ProviderStatusStub = Readonly<{
  status(input: Readonly<Record<string, never>>): Promise<ProviderRequestStatusResult>;
}>;

type BudgetStatusStub = Readonly<{
  status(input: Readonly<{ authorityDay: string }>): Promise<OwnerBudgetStatusResult>;
}>;

type RuntimeEnv = Readonly<{
  PROVIDER_REQUEST_AUTHORITY?: StatusNamespace<ProviderStatusStub>;
  OWNER_BUDGET_AUTHORITY?: StatusNamespace<BudgetStatusStub>;
}>;

export type PlatformRuntime = Readonly<{
  runProviderOperation(input: ProviderOperationInput): Promise<ProviderOperationResult>;
  providerRequestStatus(requestId: string): Promise<ProviderRequestStatusResult>;
  ownerBudgetStatus(authorityDay: string): Promise<OwnerBudgetStatusResult>;
  shapeKeys(): Readonly<{ current: ShapeKey; previous?: ShapeKey }>;
}>;

export type FixedProviderHttp = Readonly<{
  status: 402 | 404 | 409 | 502 | 503 | 504;
  body: Readonly<Record<string, unknown>>;
}>;

let injected: PlatformRuntime | undefined;

export function setPlatformRuntimeForTests(value: PlatformRuntime | undefined): void {
  injected = value;
}

function env(): RuntimeEnv {
  return getCloudflareContext().env as CloudflareEnv & RuntimeEnv;
}

async function providerRequestStatus(requestId: string): Promise<ProviderRequestStatusResult> {
  try {
    const namespace = env().PROVIDER_REQUEST_AUTHORITY;
    if (!namespace) return { status: 'unavailable' };
    const name = await providerRequestName(requestId);
    return await namespace.get(namespace.idFromName(name)).status({});
  } catch {
    return { status: 'unavailable' };
  }
}

async function ownerBudgetStatus(authorityDay: string): Promise<OwnerBudgetStatusResult> {
  try {
    const namespace = env().OWNER_BUDGET_AUTHORITY;
    if (!namespace) return { status: 'day-mismatch' };
    return await namespace.get(namespace.idFromName(authorityDay)).status({ authorityDay });
  } catch {
    return { status: 'day-mismatch' };
  }
}

const productionRuntime: PlatformRuntime = Object.freeze({
  runProviderOperation: (input) => runProviderOperation(input),
  providerRequestStatus,
  ownerBudgetStatus,
  shapeKeys: getProviderRequestShapeKeys,
});

export function getPlatformRuntime(): PlatformRuntime {
  return injected ?? productionRuntime;
}

function failureStatus(code: string): 502 | 503 | 504 {
  if (code === 'provider_timeout') return 504;
  if (
    code === 'provider_rate_limited'
    || code === 'owner_provider_credit_unavailable'
    || code === 'privacy_endpoint_unavailable'
  ) return 503;
  return 502;
}

export function fixedProviderHttp(
  result: Exclude<ProviderOperationResult | ProviderRequestStatusResult, { status: 'completed' }>,
): FixedProviderHttp {
  if (result.status === 'pending') {
    return {
      status: 409,
      body: {
        status: 'pending',
        code: 'provider_request_pending',
        phase: result.phase,
        ...(result.transportDeadlineMs === undefined ? {} : { transportDeadlineMs: result.transportDeadlineMs }),
      },
    };
  }
  if (result.status === 'failed') {
    return { status: failureStatus(result.code), body: { error: 'Provider request failed.', code: result.code } };
  }
  if (result.status === 'unknown') {
    return { status: 502, body: { error: 'Provider request outcome is unknown.', code: 'provider_outcome_unknown' } };
  }
  if (result.status === 'expired') {
    return { status: 409, body: { error: 'Provider request expired.', code: 'provider_request_expired' } };
  }
  if (result.status === 'conflict') {
    return { status: 409, body: { error: 'Provider request conflicts with an existing request.', code: 'provider_request_conflict' } };
  }
  if (result.status === 'budget-exhausted') {
    return { status: 402, body: { error: 'Owner budget exhausted.', code: 'owner_budget_exhausted', resetAt: result.resetAt } };
  }
  if (result.status === 'not-found') {
    return { status: 404, body: { error: 'Provider request not found.', code: 'provider_request_not_found' } };
  }
  return { status: 503, body: { error: 'Provider state unavailable.', code: 'provider_state_unavailable' } };
}
