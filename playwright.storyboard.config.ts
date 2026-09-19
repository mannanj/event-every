import { defineConfig, devices } from '@playwright/test';

/**
 * Drives the storyboard capture. Kept out of ./e2e so `bunx playwright test`
 * never picks it up: this writes a document, it does not assert a guarantee.
 */
export default defineConfig({
  testDir: './storyboard',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  timeout: 180_000,
  use: {
    baseURL: 'http://localhost:3777',
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:3777',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
