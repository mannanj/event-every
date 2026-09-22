import { defineConfig, devices } from '@playwright/test';

const isOffline = process.env.E1_OFFLINE === '1';

const isProd = !isOffline && process.env.E2E_TARGET === 'prod';
// eventevery.com, which is where wrangler.jsonc actually routes this Worker.
// It pointed at www.summonit.app long after that stopped being the deployment,
// so `E2E_TARGET=prod` was aiming at a domain nobody deploys to - on top of
// matching no spec file at all. See e2e/prod.spec.ts.
const PROD_URL = process.env.E2E_PROD_URL || 'https://eventevery.com';
const localUrl = 'http://localhost:3777';
const offlinePreload = process.env.E1_OFFLINE_PRELOAD;
if (isOffline && !offlinePreload) throw new Error('E1_OFFLINE_PRELOAD is required for offline Playwright');
const devCommand = isOffline
  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
  : 'bun run dev';

export default defineConfig({
  testDir: './e2e',
  testMatch: isProd ? /prod\.spec\.ts/ : undefined,
  testIgnore: isProd
    ? /c1-a-runtime-admission\.spec\.ts/
    : [/prod\.spec\.ts/, /c1-a-runtime-admission\.spec\.ts/, /private-provider-state\.spec\.ts/],
  fullyParallel: !isProd,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: isOffline || isProd ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: isProd ? PROD_URL : localUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...(isOffline ? { proxy: { server: 'http://127.0.0.1:9', bypass: 'localhost,127.0.0.1,::1' } } : {}),
  },
  // One browser against production, both locally.
  //
  // The prod smoke test is mostly API assertions, where a second engine proves
  // nothing and doubles the request rate against a live origin. Running both
  // fired fourteen requests in eight seconds and tripped Cloudflare's rate
  // limiting, which then failed three tests for reasons that had nothing to do
  // with the deployment - a smoke test that reports a false alarm is only
  // marginally better than one that reports a false all-clear.
  projects: isProd
    ? [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
    : [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
        {
          name: 'webkit',
          use: { ...devices['Desktop Safari'] },
        },
      ],
  webServer: isProd
    ? undefined
    : {
        command: devCommand,
        url: localUrl,
        reuseExistingServer: !isOffline && !process.env.CI,
        timeout: 120000,
      },
});
