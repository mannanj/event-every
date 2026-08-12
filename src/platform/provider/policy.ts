import type { ProviderRoute, ProviderVariant } from './contracts';

export const OWNER_POLICY_VERSION = 'owner-v1' as const;
export const OWNER_DAILY_LIMIT_NANODOLLARS = 5_000_000_000 as const;
export const OWNER_PROVIDER_URL = 'https://openrouter.ai/api/v1/chat/completions' as const;
export const PRE_PERMIT_LEASE_MS = 2 * 60_000;
export const TRANSPORT_LEASE_MS = 14 * 60_000;
export const COMMITTED_LEASE_MS = 15 * 60_000;
export const REPLAY_RETENTION_MS = 48 * 60 * 60_000;
export const ACCOUNTING_RETENTION_MS = 72 * 60 * 60_000;
export const OWNER_MODELS = Object.freeze({
  'scan-text': 'deepseek/deepseek-v4-flash',
  'scan-image': 'mistralai/mistral-small-2603',
  'resolve-timezone': 'deepseek/deepseek-v4-flash',
  summarize: 'deepseek/deepseek-v4-flash',
} satisfies Record<ProviderVariant, string>);

export type OwnerVariantPolicy = Readonly<{ route: ProviderRoute; model: string; reservationNanodollars: number }>;
export const OWNER_VARIANT_POLICY: Readonly<Record<ProviderVariant, OwnerVariantPolicy>> = Object.freeze({
  'scan-text': Object.freeze({ route: 'scan', model: OWNER_MODELS['scan-text'], reservationNanodollars: 20_000_000 }),
  'scan-image': Object.freeze({ route: 'scan', model: OWNER_MODELS['scan-image'], reservationNanodollars: 50_000_000 }),
  'resolve-timezone': Object.freeze({ route: 'resolve-timezone', model: OWNER_MODELS['resolve-timezone'], reservationNanodollars: 1_000_000 }),
  summarize: Object.freeze({ route: 'summarize', model: OWNER_MODELS.summarize, reservationNanodollars: 500_000 }),
});
export function ownerPolicyForVariant(variant: ProviderVariant): OwnerVariantPolicy { return OWNER_VARIANT_POLICY[variant]; }
type RoutePolicy = Readonly<{ variants: readonly ProviderVariant[] }>;
export const OWNER_ROUTE_POLICY: Readonly<Record<ProviderRoute, RoutePolicy>> = Object.freeze({
  scan: Object.freeze({ variants: Object.freeze(['scan-text', 'scan-image'] as const) }),
  'resolve-timezone': Object.freeze({ variants: Object.freeze(['resolve-timezone'] as const) }),
  summarize: Object.freeze({ variants: Object.freeze(['summarize'] as const) }),
});
