// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore OpenNext creates this module between Next's check and the owned tsc gate.
import handler from '../.open-next/worker.js';
import { admitEdgeRequest } from '../src/platform/admission';
import { cloudflareTrustedEdgeAddress } from '../src/platform/identity';

export { DailyCounter } from '../src/platform/cloudflare/daily-counter';
export { IdentityDayPolicy } from '../src/platform/cloudflare/identity-day-policy';
export { ResolverRequestAuthority } from '../src/platform/cloudflare/resolver-request-authority';
export { OwnerBudgetAuthority } from '../src/platform/cloudflare/owner-budget-authority';
export { ProviderRequestAuthority } from '../src/platform/cloudflare/provider-request-authority';

const PRIVATE_PROVIDER_PATHS = new Set([
  '/api/scan',
  '/api/resolve-timezone',
  '/api/summarize',
  '/api/provider-status',
]);

type PrivateCloudflareEnv = CloudflareEnv & Readonly<{
  STATE_AUTHORITY_MODE?: string;
  PROVIDER_POLICY_VERSION?: string;
  PROVIDER_REQUEST_HMAC_CURRENT_VERSION?: string;
  PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION?: string;
  OPENROUTER_OWNER_KEY?: string;
  PROVIDER_REQUEST_HMAC_CURRENT?: string;
  PROVIDER_REQUEST_HMAC_PREVIOUS?: string;
  OWNER_BUDGET_AUTHORITY?: unknown;
  PROVIDER_REQUEST_AUTHORITY?: unknown;
}>;

type ExportedHandler<Env> = Readonly<{
  fetch(request: Request, env: Env, ctx: unknown): Response | Promise<Response>;
}>;

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function privateProviderConfigurationAvailable(env: PrivateCloudflareEnv): boolean {
  const hasPreviousKey = nonempty(env.PROVIDER_REQUEST_HMAC_PREVIOUS);
  const hasPreviousVersion = nonempty(env.PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION);
  return env.STATE_AUTHORITY_MODE === 'cloudflare'
    && env.PROVIDER_POLICY_VERSION === 'owner-v1'
    && env.PROVIDER_REQUEST_HMAC_CURRENT_VERSION === 'c1-b-current-v1'
    && nonempty(env.OPENROUTER_OWNER_KEY)
    && nonempty(env.PROVIDER_REQUEST_HMAC_CURRENT)
    && Boolean(env.OWNER_BUDGET_AUTHORITY)
    && Boolean(env.PROVIDER_REQUEST_AUTHORITY)
    && hasPreviousKey === hasPreviousVersion;
}

function providerStateUnavailable(): Response {
  return Response.json(
    { error: 'Provider state unavailable.', code: 'provider_state_unavailable' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

export default {
  async fetch(request: Request, env: PrivateCloudflareEnv, ctx: unknown) {
    const admitted = await admitEdgeRequest(request, env, ctx, cloudflareTrustedEdgeAddress);
    if (admitted.status === 'failure') return admitted.response;
    if (PRIVATE_PROVIDER_PATHS.has(new URL(admitted.request.url).pathname)
      && !privateProviderConfigurationAvailable(env)) return providerStateUnavailable();
    return handler.fetch(admitted.request, env, ctx);
  },
} satisfies ExportedHandler<PrivateCloudflareEnv>;
