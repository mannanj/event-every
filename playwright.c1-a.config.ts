import { defineConfig, devices } from '@playwright/test';

const suffix = process.env.C1_A_OUTPUT_SUFFIX;
if (!suffix || !/^[a-f0-9]{12}$/.test(suffix)) {
  throw new Error('C1_A_OUTPUT_SUFFIX must be 12 lowercase hex characters');
}

export default defineConfig({
  testDir: './e2e',
  testMatch: /c1-a-runtime-admission\.spec\.ts/,
  outputDir: `test-results-c1-a-${suffix}`,
  reporter: [['html', { outputFolder: `playwright-report-c1-a-${suffix}`, open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:8788' },
  webServer: undefined,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
