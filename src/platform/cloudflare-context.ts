import { getCloudflareContext } from '@opennextjs/cloudflare';
import type {
  OwnerBudgetCommitResult,
  OwnerBudgetReserveResult,
  ProviderRequestBeginInput,
  ProviderRequestBeginResult,
  ProviderRequestClaimResult,
  ProviderRequestCompletionResult,
  ProviderRequestRecordResult,
} from '@/platform/contracts';
import type { CostOutcome, StoredProviderFailure } from '@/platform/provider/contracts';
import type { ShapeKey } from '@/platform/provider/request-binding';
import { recordClosedEvent } from '@/platform/logger';

export type ProviderRequestAuthorityStub = Readonly<{
  begin(input: ProviderRequestBeginInput): Promise<ProviderRequestBeginResult>;
  recordReservation(input: Readonly<{ executionId: string; authorityDay: string; reservationNanodollars: number }>): Promise<ProviderRequestRecordResult>;
  recordBudgetCommitted(input: Readonly<{ executionId: string; transportDeadlineMs: number; committedUntilMs: number }>): Promise<ProviderRequestRecordResult>;
  claimTransport(input: Readonly<{ executionId: string }>): Promise<ProviderRequestClaimResult>;
  completeKnown(input: Readonly<{ executionId: string; nonce: string; replay: unknown; costOutcome: CostOutcome }>): Promise<ProviderRequestCompletionResult>;
  completeFailed(input: Readonly<{ executionId: string; nonce: string; code: StoredProviderFailure['code']; httpStatus: 502 | 503 | 504; costOutcome: CostOutcome }>): Promise<ProviderRequestCompletionResult>;
  completeUnknown(input: Readonly<{ executionId: string; nonce: string; code: 'provider_outcome_unknown' }>): Promise<ProviderRequestCompletionResult>;
}>;

export type OwnerBudgetAuthorityStub = Readonly<{
  reserve(input: import('@/platform/contracts').OwnerBudgetBinding): Promise<OwnerBudgetReserveResult>;
  commit(input: import('@/platform/contracts').OwnerBudgetBinding): Promise<OwnerBudgetCommitResult>;
}>;

export type DurableNamespaceLike<Stub> = Readonly<{
  idFromName(name: string): unknown;
  get(id: unknown): Stub;
}>;

export type ProviderOperationContext = Readonly<{
  requestAuthority: DurableNamespaceLike<ProviderRequestAuthorityStub>;
  ownerBudgetAuthority: DurableNamespaceLike<OwnerBudgetAuthorityStub>;
  ownerKey: string;
}>;

type ProviderBindingEnv = Readonly<{
  PROVIDER_REQUEST_AUTHORITY?: DurableNamespaceLike<ProviderRequestAuthorityStub>;
  OWNER_BUDGET_AUTHORITY?: DurableNamespaceLike<OwnerBudgetAuthorityStub>;
  OPENROUTER_OWNER_KEY?: string;
  PROVIDER_REQUEST_HMAC_CURRENT?: string;
  PROVIDER_REQUEST_HMAC_CURRENT_VERSION?: string;
  PROVIDER_REQUEST_HMAC_PREVIOUS?: string;
  PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION?: string;
}>;

function providerEnv(): ProviderBindingEnv {
  return getCloudflareContext().env as CloudflareEnv & ProviderBindingEnv;
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function getProviderOperationContext(): ProviderOperationContext {
  const env = providerEnv();
  if (!env.PROVIDER_REQUEST_AUTHORITY || !env.OWNER_BUDGET_AUTHORITY || !nonempty(env.OPENROUTER_OWNER_KEY)) {
    throw new Error('provider_state_unavailable');
  }
  return {
    requestAuthority: env.PROVIDER_REQUEST_AUTHORITY,
    ownerBudgetAuthority: env.OWNER_BUDGET_AUTHORITY,
    ownerKey: env.OPENROUTER_OWNER_KEY,
  };
}

export function getProviderRequestShapeKeys(): Readonly<{ current: ShapeKey; previous?: ShapeKey }> {
  const env = providerEnv();
  if (!nonempty(env.PROVIDER_REQUEST_HMAC_CURRENT) || !nonempty(env.PROVIDER_REQUEST_HMAC_CURRENT_VERSION)) {
    throw new Error('provider_state_unavailable');
  }
  const hasPreviousKey = nonempty(env.PROVIDER_REQUEST_HMAC_PREVIOUS);
  const hasPreviousVersion = nonempty(env.PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION);
  if (hasPreviousKey !== hasPreviousVersion) throw new Error('provider_state_unavailable');
  return {
    current: { version: env.PROVIDER_REQUEST_HMAC_CURRENT_VERSION, key: env.PROVIDER_REQUEST_HMAC_CURRENT },
    ...(hasPreviousKey && hasPreviousVersion
      ? { previous: { version: env.PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION, key: env.PROVIDER_REQUEST_HMAC_PREVIOUS } }
      : {}),
  };
}

export function deferPlatformWork(work: Promise<void>): void {
  const observed = work.catch(() => { recordClosedEvent('deferred_work_failed'); });
  try { getCloudflareContext().ctx.waitUntil(observed); } catch { void observed; }
}
