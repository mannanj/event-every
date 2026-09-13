import type { ProviderRoute, ProviderVariant } from './contracts';

export const OWNER_POLICY_VERSION = 'owner-v1' as const;
// $1/day, matched to the ceiling the OpenRouter key itself carries. The app
// must not plan to spend past what the key will actually allow, or the budget
// stops being the thing that says no and OpenRouter's 402 becomes the control.
// A day's policy row stores the limit it was opened under, so a change here
// conflicts with an already-open day and takes effect at the next UTC rollover.
export const OWNER_DAILY_LIMIT_NANODOLLARS = 1_000_000_000 as const;
export const OWNER_PROVIDER_URL = 'https://openrouter.ai/api/v1/chat/completions' as const;

/**
 * The name of a day's budget ledger.
 *
 * Keyed by the policy it was opened under, not by the day alone. A day's policy
 * row stores the version and limit it began with, and `reserve` refuses any
 * request whose current policy disagrees with it - so changing the limit used to
 * wedge the rest of the open day into permanent conflict. Including the policy
 * in the name means a change opens a fresh ledger instead, and the old one is
 * simply no longer consulted.
 *
 * Both the reserve and the settle paths must derive the name here. If they ever
 * disagree, a request settles against a ledger it never reserved from.
 */
export function ownerBudgetLedgerName(authorityDay: string): string {
  return `${OWNER_POLICY_VERSION}:${OWNER_DAILY_LIMIT_NANODOLLARS}:${authorityDay}`;
}
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
