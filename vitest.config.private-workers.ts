import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  const { cloudflareTest } = await import('@cloudflare/vitest-pool-workers');
  return {
    resolve: { alias: { '@': path.join(root, 'src') } },
    plugins: [cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: {
        IDENTITY_HMAC_CURRENT: 'synthetic-private-identity-hmac',
        RESOLVER_CAPABILITY_HMAC: 'synthetic-private-resolver-hmac',
        OPENROUTER_OWNER_KEY: 'private-secret-marker-7e13f0',
        PROVIDER_REQUEST_HMAC_CURRENT: 'synthetic-private-request-hmac',
      } },
    })],
    test: {
      include: [
        'test/worker/private-provider.integration.test.ts',
        'test/worker/provider-privacy.integration.test.ts',
      ],
      fileParallelism: false,
      testTimeout: 30_000,
    },
  };
});
