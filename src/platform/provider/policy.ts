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
export function ownerBudgetLedgerName(
  authorityDay: string,
  policyVersion: SpendPolicyVersion = OWNER_POLICY_VERSION,
): string {
  return `${policyVersion}:${SPEND_POLICIES[policyVersion].limitNanodollars}:${authorityDay}`;
}

/**
 * Two policies, because there are two keys.
 *
 * THE TIER IS NOT STORED ANYWHERE NEW. `policy_version` is already a column on
 * `provider_request`, already written when a request begins and already read
 * back when it settles - and this function is already documented as naming the
 * ledger after "the policy it was opened under". A second OpenRouter key with
 * its own ceiling IS a second policy, so the carrier was there all along.
 *
 * That matters more than it sounds. The alternative was a new column on a
 * Durable Object that ASSERTS its schema rather than migrating it, where every
 * instance that has ever existed still holds the old table - tombstones are
 * written and never deleted - so there would have been no date at which
 * requiring the column was safe.
 *
 * THE OWNER NAME MUST NOT MOVE. A request that reserved before this change
 * settles after it by recomputing the name from its stored row. If the default
 * produced anything but `owner-v1:1000000000:<day>`, that settlement would
 * address a ledger which never held the reservation, `settle` would answer
 * conflict, and the old ledger's lease sweep would eventually bill the full
 * reservation for a call that succeeded. There is a literal-string test.
 */
export const ADMIN_POLICY_VERSION = 'admin-v1' as const;
export type SpendPolicyVersion = typeof OWNER_POLICY_VERSION | typeof ADMIN_POLICY_VERSION;

export type SpendPolicy = Readonly<{
  limitNanodollars: number;
  /** Which Worker secret holds the key this policy spends against. */
  keyBinding: 'OPENROUTER_OWNER_KEY' | 'OPENROUTER_ADMIN_KEY';
}>;

/**
 * Each policy's ceiling matches what ITS OWN key will honour. That invariant is
 * the reason the limit is in the ledger name at all: raise a key's limit and
 * you raise it here, or the app stops being the thing that says no and
 * OpenRouter's 402 becomes the control.
 */
export const SPEND_POLICIES: Readonly<Record<SpendPolicyVersion, SpendPolicy>> = Object.freeze({
  [OWNER_POLICY_VERSION]: Object.freeze({
    limitNanodollars: OWNER_DAILY_LIMIT_NANODOLLARS,
    keyBinding: 'OPENROUTER_OWNER_KEY' as const,
  }),
  [ADMIN_POLICY_VERSION]: Object.freeze({
    limitNanodollars: OWNER_DAILY_LIMIT_NANODOLLARS,
    keyBinding: 'OPENROUTER_ADMIN_KEY' as const,
  }),
});

export function isSpendPolicyVersion(value: unknown): value is SpendPolicyVersion {
  return value === OWNER_POLICY_VERSION || value === ADMIN_POLICY_VERSION;
}

export function spendLimitFor(policyVersion: SpendPolicyVersion): number {
  return SPEND_POLICIES[policyVersion].limitNanodollars;
}
export const PRE_PERMIT_LEASE_MS = 2 * 60_000;
export const TRANSPORT_LEASE_MS = 14 * 60_000;
export const COMMITTED_LEASE_MS = 15 * 60_000;
export const REPLAY_RETENTION_MS = 48 * 60 * 60_000;
export const ACCOUNTING_RETENTION_MS = 72 * 60 * 60_000;
// Measured 2026-09-15 on scripts/scan-eval-cases.ts (28 text cases, one run
// each, same transport as production): mistral-small-2603 27/28 correct in
// ~4s per call; deepseek-v4-flash 15/27, mostly date-only points with the
// stated time dropped, at 13-80s per call. The same Mistral model already
// serves images, so one model now handles both scan variants.
export const OWNER_MODELS = Object.freeze({
  'scan-text': 'mistralai/mistral-small-2603',
  'scan-image': 'mistralai/mistral-small-2603',
  'resolve-timezone': 'deepseek/deepseek-v4.1-flash',
  summarize: 'deepseek/deepseek-v4.1-flash',
} satisfies Record<ProviderVariant, string>);

/**
 * The ordered model chain sent as OpenRouter's `models` array.
 *
 * A single pinned model makes one upstream outage a total outage: on 2026-09-18
 * `mistral-small-2603` rate-limited upstream on OpenRouter's shared pool
 * (`limit_source: upstream_provider_shared_pool`) and every scan failed, text
 * and image alike, because Task 208 pointed both variants at it. OpenRouter
 * retries the next entry on any error from the one before, so the chain is what
 * keeps a throttled primary from taking the feature down.
 *
 * Each chain leads with OWNER_MODELS[variant]: the head is the measured model
 * and the rest are only ever reached after it has already failed, so the
 * accuracy the primary was chosen on is unchanged.
 *
 * Backups were picked by running scripts/measure-scan-reliability.ts on every
 * non-US model OpenRouter serves under this app's own request body, at or near
 * the primary's price. Measured 2026-09-18, one run each, correct/schema:
 *
 *   model                            text        image       price
 *   mistral-small-3.2-24b-instruct   89% / 100%  74% / 100%  0.63x
 *   bytedance-seed/seed-2.0-mini     86% /  96%  52% /  85%  0.67x
 *   qwen3-vl-235b-a22b-instruct      75% /  89%  81% /  96%  1.4x
 *   deepseek-v4.1-flash              75% /  82%  44% /  52%  1.0x
 *   glm-5.3-flash                    71% /  75%  -           0.9x
 *   qwen3-vl-30b-a3b-instruct        39% /  50%  -           1.3x
 *   mistral-medium-3-5               75% / 100%  59% /  96%  11.5x
 *
 * mistral-small-3.2 is second on both variants: it leads on text, never
 * returned malformed output in 55 calls, and costs less than the primary. The
 * third slot differs because the variants reward different things - qwen reads
 * posters best of anything at this price, while seed-2.0-mini is strong on text
 * and collapses on images. mistral-medium-3-5 measured well on text schema but
 * is 11.5x the primary and drops the stated hour, which would spend the $1 day
 * cap ten times faster to return worse events. deepseek-v4.1-flash serves the
 * two non-scan variants, where it is text-only work, but its vision is not
 * reliable enough to scan with.
 */
export const OWNER_MODEL_CHAINS = Object.freeze({
  'scan-text': Object.freeze([
    OWNER_MODELS['scan-text'],
    'mistralai/mistral-small-3.2-24b-instruct',
    'bytedance-seed/seed-2.0-mini',
  ]),
  'scan-image': Object.freeze([
    OWNER_MODELS['scan-image'],
    'mistralai/mistral-small-3.2-24b-instruct',
    'qwen/qwen3-vl-235b-a22b-instruct',
  ]),
  'resolve-timezone': Object.freeze([
    OWNER_MODELS['resolve-timezone'],
    'deepseek/deepseek-v4-flash',
  ]),
  summarize: Object.freeze([
    OWNER_MODELS.summarize,
    'deepseek/deepseek-v4-flash',
  ]),
} satisfies Record<ProviderVariant, readonly string[]>);

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
