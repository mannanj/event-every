// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore OpenNext creates this module between Next's check and the owned tsc gate.
import handler from '../.open-next/worker.js';
import { admitEdgeRequest } from '../src/platform/admission';
import { cloudflareTrustedEdgeAddress } from '../src/platform/identity';

export { DailyCounter } from '../src/platform/cloudflare/daily-counter';
export { IdentityDayPolicy } from '../src/platform/cloudflare/identity-day-policy';
export { ResolverRequestAuthority } from '../src/platform/cloudflare/resolver-request-authority';

type ExportedHandler<Env> = Readonly<{
  fetch(request: Request, env: Env, ctx: unknown): Response | Promise<Response>;
}>;

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: unknown) {
    const admitted = await admitEdgeRequest(request, env, ctx, cloudflareTrustedEdgeAddress);
    if (admitted.status === 'failure') return admitted.response;
    return handler.fetch(admitted.request, env, ctx);
  },
} satisfies ExportedHandler<CloudflareEnv>;
