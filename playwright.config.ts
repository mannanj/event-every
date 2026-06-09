import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load .env.local so secrets like TEST_AUTH_PATTERN reach the prod suite.
dotenv.config({ path: '.env.local' });

const isProd = process.env.E2E_TARGET === 'prod';
const PROD_URL = process.env.E2E_PROD_URL || 'https://www.summonit.app';

export default defineConfig({
  testDir: './e2e',
  testMatch: isProd ? /prod\.spec\.ts/ : undefined,
  testIgnore: isProd ? undefined : /prod\.spec\.ts/,
  fullyParallel: !isProd,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: isProd ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: isProd ? PROD_URL : 'http://localhost:3777',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: isProd
    ? undefined
    : {
        command: 'bun run dev',
        url: 'http://localhost:3777',
        reuseExistingServer: true,
        timeout: 120000,
      },
});
