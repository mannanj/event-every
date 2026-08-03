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
