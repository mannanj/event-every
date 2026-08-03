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
  setAlarm(timestamp: number): Promise<void>;
}>;
export type DurableObjectStateLike = Readonly<{
  storage: DurableStorageLike;
  blockConcurrencyWhile(callback: () => Promise<void>): Promise<void>;
}>;
