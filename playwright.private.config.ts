import { defineConfig, devices } from '@playwright/test';

const suffix = process.env.PRIVATE_OUTPUT_SUFFIX;
if (!suffix || !/^[a-f0-9]{12}$/.test(suffix)) throw new Error('PRIVATE_OUTPUT_SUFFIX must be 12 lowercase hex characters');

export default defineConfig({
  testDir: './e2e',
  testMatch: /private-provider-state\.spec\.ts/,
  outputDir: `test-results-private-${suffix}`,
  reporter: [['html', { outputFolder: `playwright-report-private-${suffix}`, open: 'never' }]],
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:8789', serviceWorkers: 'block' },
  webServer: undefined,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
