import { defineConfig, devices } from '@playwright/test';
import { E2E_ORIGIN, E2E_PORT, E2E_WRANGLER, writeE2eWranglerConfig } from './e2e/utils/linked-apps-env';

/**
 * "Add other MCPs" against a local fake of Calendar's OAuth server.
 *
 * Its own config and port: the dev server needs accounts switched on
 * (ACCOUNT_DATA_KEK), an origin that is this server, and Calendar's MCP URL
 * pointed at the fake - none of which the main E2E suite wants. So it runs
 * against a generated wrangler config with its own local D1 state (see
 * e2e/utils/linked-apps-env.ts and next.config.js).
 *
 *   bunx playwright test --config playwright.linked-apps.config.ts
 */
const PORT = E2E_PORT;
const origin = E2E_ORIGIN;
writeE2eWranglerConfig();

export default defineConfig({
  testDir: './e2e',
  testMatch: /linked-apps\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: origin, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bunx next dev -p ${PORT}`,
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { EE_E2E_WRANGLER_CONFIG: E2E_WRANGLER },
  },
});
