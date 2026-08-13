import type { CostOutcome, ProviderVariant } from './provider/contracts';

export type EdgeIdentity = Readonly<{ kind: 'known' | 'unknown'; keyVersion: string; hmac: string }>;
export type ProviderRoute = 'scan' | 'resolve-timezone' | 'summarize';
export type StateAuthorityMode = 'legacy' | 'shadow' | 'cloudflare';
export type AdmissionResult =
  | Readonly<{ status: 'success'; request: Request; identity: EdgeIdentity }>
  | Readonly<{ status: 'failure'; response: Response }>;
export type LegacyChargeResult = { status: 'charged' } | { status: 'rejected' | 'unavailable'; code: 'legacy_charge_rejected' };
export type LegacyProviderResult<T> = { status: 'success'; value: T } | { status: 'failed'; code: 'community_limit' | 'upstream_timeout' | 'upstream_unavailable' | 'outcome_unknown' };
export type LegacyDispatchStart<T> = { status: 'aborted-before-dispatch' } | { status: 'started'; charge: Promise<LegacyChargeResult>; provider: Promise<LegacyProviderResult<T>> };
export type LegacyProviderInput<T> = Readonly<{ route: ProviderRoute; requestId: string; identity: EdgeIdentity; signal: AbortSignal; charge(): Promise<LegacyChargeResult> | LegacyChargeResult; provider(signal: AbortSignal): Promise<LegacyProviderResult<T>> | LegacyProviderResult<T> }>;
export type RawFreeUsageResult = { status: 'available'; value: { isAdmin: boolean; exhausted: boolean; resetAt: string; limitUsd: number; spentUsd: number; remainingUsd: number; allowed: boolean; reason: 'community-budget' | 'ip-rate' | null; budget: { limitUsd: number; spentUsd: number; remainingUsd: number; exhausted: boolean; resetAt: string } | null; ipRate: { limit: number; remaining: number; exhausted: boolean; resetAt: string } } } | { status: 'unavailable'; code: 'legacy_usage_unavailable' };
export type AdmittedWaitlistInput = Readonly<{ identity: EdgeIdentity; email: string; honeypot: string; userAgent: string | null }>;
export type WaitlistResult = { status: 'accepted'; alreadyJoined: boolean; emailSent: boolean } | { status: 'invalid'; code: 'invalid_email' } | { status: 'rate-limited'; code: 'waitlist_rate_limited' } | { status: 'unavailable'; code: 'legacy_waitlist_unavailable' };
export interface LegacyProviderPort { dispatch<T>(input: LegacyProviderInput<T>): LegacyDispatchStart<T>; }
export interface LegacyUsagePort { read(input: { identity: EdgeIdentity }): Promise<RawFreeUsageResult>; }
export interface LegacyWaitlistPort { submit(input: AdmittedWaitlistInput): Promise<WaitlistResult>; }
export type NotReady = Readonly<{ status: 'not-ready'; code: 'c1_state_not_ready' }>;
export const RESOLVER_DAILY_LIMIT = 50;
export const RESOLVER_MAX_CONCURRENT = 2;
export const RESOLVER_LEASE_MS = 10_000;
export const RESOLVER_TOMBSTONE_MS = 172_800_000;
export const RESOLVER_BLACKOUT_MS = 15_000;
export const RESOLVER_URL_MAX_BYTES = 2_048;
export const REQUEST_NAME_DOMAIN = 'event-every/resolver-request/v1\0';
export const URL_HMAC_DOMAIN = 'event-every/resolver-url/v1\0';
export type SqlCursorLike<Row> = Readonly<{ toArray(): Row[]; one(): Row }>;
export type SqlStorageLike = Readonly<{ exec<Row = Record<string, unknown>>(query: string, ...bindings: (string | number | null)[]): SqlCursorLike<Row> }>;
export type DurableStorageLike = Readonly<{
  sql: SqlStorageLike;
  transactionSync<Value>(callback: () => Value): Value;
  getAlarm(): Promise<number | null>;
  setAlarm(timestamp: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}>;
export type DurableObjectStateLike = Readonly<{
  storage: DurableStorageLike;
  blockConcurrencyWhile(callback: () => Promise<void>): Promise<void>;
}>;

export type OwnerBudgetBinding = Readonly<{
  executionId: string;
  requestAuthorityName: string;
  authorityDay: string;
  route: ProviderRoute;
  variant: ProviderVariant;
  policyVersion: string;
  reservationNanodollars: number;
}>;
export type OwnerBudgetReserveResult =
  | Readonly<{ status: 'reserved'; reservedUntilMs: number }>
  | Readonly<{ status: 'exhausted'; resetAt: string }>
  | Readonly<{ status: 'released' | 'settled' | 'settled_full' | 'conflict' | 'day-mismatch' }>;
export type OwnerBudgetCommitResult =
  | Readonly<{ status: 'committed'; transportDeadlineMs: number; committedUntilMs: number }>
  | Readonly<{ status: 'released' | 'settled' | 'settled_full' | 'conflict' | 'day-mismatch' }>;
export type OwnerBudgetReleaseResult = Readonly<{
  status: 'released' | 'committed' | 'settled' | 'settled_full' | 'conflict' | 'day-mismatch';
}>;
export type OwnerBudgetBreachClass = 'primary_breach' | 'primary_overflow' | 'secondary_breach';
export type OwnerBudgetFrozenCode = 'accounting_policy_breach' | 'accounting_cost_overflow';
export type OwnerBudgetSettleResult =
  | Readonly<{
    status: 'settled' | 'settled_full';
    breachClass?: OwnerBudgetBreachClass;
    frozenCode?: OwnerBudgetFrozenCode;
  }>
  | Readonly<{ status: 'conflict' | 'day-mismatch' }>;
export type OwnerBudgetSettlementInput = OwnerBudgetBinding & Readonly<{ costOutcome: CostOutcome }>;
export type OwnerBudgetStatusResult =
  | Readonly<{
    status: 'available';
    policyVersion: string;
    authorityDay: string;
    limitNanodollars: number;
    spentNanodollars: number;
    reservedNanodollars: number;
    remainingNanodollars: number;
    exhausted: boolean;
    frozen: boolean;
    resetAt: string;
  }>
  | Readonly<{ status: 'day-mismatch' }>;

export type ProviderRequestPhase =
  | 'prepared'
  | 'reserved'
  | 'budget_committed'
  | 'provider_inflight'
  | 'completed'
  | 'failed'
  | 'unknown'
  | 'expired';
export type ProviderRequestSettlementState = 'settlement_pending' | 'settlement_complete';
export type ProviderBindingCandidate = Readonly<{ version: string; digest: string }>;
export type ProviderRequestBeginInput = Readonly<{
  requestDigest: string;
  route: ProviderRoute;
  variant: ProviderVariant;
  bindingCandidates: readonly ProviderBindingCandidate[];
  proposedAuthorityDay: string;
  policyVersion: string;
  reservationNanodollars: number;
}>;
export type ProviderRequestPendingResult = Readonly<{
  status: 'pending';
  phase: 'prepared' | 'reserved' | 'budget_committed' | 'provider_inflight';
  executionId: string;
  authorityDay: string;
  shapeKeyVersion: string;
  reservedUntilMs?: number;
  transportDeadlineMs?: number;
}>;
export type ProviderRequestCompletedResult = Readonly<{
  status: 'completed';
  replay: unknown;
  settlement: ProviderRequestSettlementState;
}>;
export type ProviderRequestFailedResult = Readonly<{
  status: 'failed';
  code: import('./provider/contracts').StoredProviderFailure['code'];
  httpStatus: 502 | 503 | 504;
  settlement: ProviderRequestSettlementState;
}>;
export type ProviderRequestUnknownResult = Readonly<{
  status: 'unknown';
  code: 'provider_outcome_unknown';
  httpStatus: 502;
  settlement: ProviderRequestSettlementState;
}>;
export type ProviderRequestExpiredResult = Readonly<{
  status: 'expired';
  executionId: string;
  terminalClass: 'completed' | 'failed' | 'unknown' | 'expired';
}>;
export type ProviderRequestObservedResult =
  | ProviderRequestPendingResult
  | ProviderRequestCompletedResult
  | ProviderRequestFailedResult
  | ProviderRequestUnknownResult
  | ProviderRequestExpiredResult;
export type ProviderRequestBeginResult = ProviderRequestObservedResult | Readonly<{ status: 'conflict' }>;
export type ProviderRequestRecordResult =
  | Readonly<{
    status: 'recorded';
    phase: 'reserved' | 'budget_committed';
    transportDeadlineMs?: number;
    committedUntilMs?: number;
  }>
  | Readonly<{ status: 'conflict' }>;
export type ProviderRequestClaimResult =
  | Readonly<{ status: 'permit'; nonce: string; transportDeadlineMs: number }>
  | ProviderRequestObservedResult
  | Readonly<{ status: 'conflict' }>;
export type ProviderRequestCompletionResult =
  | Readonly<{ status: 'stored'; outcome: ProviderRequestCompletedResult | ProviderRequestFailedResult | ProviderRequestUnknownResult }>
  | Readonly<{ status: 'late'; outcome: ProviderRequestUnknownResult }>
  | Readonly<{ status: 'rejected' }>;
export type ProviderRequestStatusResult = ProviderRequestObservedResult | Readonly<{ status: 'not-found' | 'unavailable' }>;
