import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const { cloudflareTest } = await import('@cloudflare/vitest-pool-workers');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            IDENTITY_HMAC_CURRENT: 'synthetic-c1-a-identity-key',
            RESOLVER_CAPABILITY_HMAC: 'synthetic-c1-a-capability-key',
            OPENROUTER_OWNER_KEY: 'deliberately-invalid-synthetic-owner-key',
            PROVIDER_REQUEST_HMAC_CURRENT: 'synthetic-c1-b-request-shape-key',
          },
        },
      }),
    ],
    test: {
      include: [
        'test/worker/app-worker.test.ts',
        'test/worker/admission.integration.test.ts',
        'test/worker/resolver.integration.test.ts',
        'test/worker/deny-egress.integration.test.ts',
        'test/worker/owner-budget-authority.integration.test.ts',
        'test/worker/provider-request-authority.integration.test.ts',
      ],
      setupFiles: ['./test/worker/deny-egress.setup.ts'],
    },
  };
});
