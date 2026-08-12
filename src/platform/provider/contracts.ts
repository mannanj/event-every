export type ProviderRoute = 'scan' | 'resolve-timezone' | 'summarize';
export type ProviderVariant = 'scan-text' | 'scan-image' | 'resolve-timezone' | 'summarize';
export type CostOutcome =
  | Readonly<{ kind: 'exact'; nanodollars: number }>
  | Readonly<{ kind: 'missing' | 'malformed' }>
  | Readonly<{ kind: 'positive-overflow' }>;
export type StoredProviderFailure = Readonly<{
  code: 'provider_rejected' | 'provider_unavailable' | 'provider_timeout' |
    'provider_rate_limited' | 'owner_provider_credit_unavailable' |
    'privacy_endpoint_unavailable' | 'provider_invalid_response' |
    'provider_outcome_unknown' | 'accounting_policy_breach' |
    'accounting_cost_overflow';
  httpStatus: 502 | 503 | 504;
}>;
