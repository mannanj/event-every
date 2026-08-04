import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const { cloudflareTest } = await import('@cloudflare/vitest-pool-workers');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './cloudflare/legacy-keepalive-wrangler.jsonc' },
        miniflare: {
          bindings: {
            KV_REST_API_URL: 'http://127.0.0.1:8799',
            KV_REST_API_TOKEN: 'synthetic-c1-a-token',
          },
        },
      }),
    ],
    test: {
      include: [
        'test/worker/legacy-keepalive.integration.test.ts',
        'test/worker/deny-egress.integration.test.ts',
      ],
      setupFiles: ['./test/worker/deny-egress.setup.ts'],
    },
  };
});
