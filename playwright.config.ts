import { defineConfig, devices } from '@playwright/test';

const isOffline = process.env.E1_OFFLINE === '1';

const isProd = !isOffline && process.env.E2E_TARGET === 'prod';
const PROD_URL = process.env.E2E_PROD_URL || 'https://www.summonit.app';
const localUrl = 'http://localhost:3777';
const offlinePreload = process.env.E1_OFFLINE_PRELOAD;
if (isOffline && !offlinePreload) throw new Error('E1_OFFLINE_PRELOAD is required for offline Playwright');
const devCommand = isOffline
  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
  : 'bun run dev';

export default defineConfig({
  testDir: './e2e',
  testMatch: isProd ? /prod\.spec\.ts/ : undefined,
  testIgnore: isProd ? /c1-a-runtime-admission\.spec\.ts/ : [/prod\.spec\.ts/, /c1-a-runtime-admission\.spec\.ts/],
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
  projects: [
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
