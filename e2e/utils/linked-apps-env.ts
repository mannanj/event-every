import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * A wrangler config for the linked-apps E2E: the real one, with the vars the
 * test needs and (via next.config.js) its own isolated local D1 state.
 * Generated, not committed: wrangler.e2e.jsonc is gitignored.
 */
export const E2E_WRANGLER = 'wrangler.e2e.jsonc';
export const E2E_STATE = '.wrangler/e2e-state';
export const E2E_PORT = 3779;
export const E2E_ORIGIN = `http://localhost:${E2E_PORT}`;
export const FAKE_CALENDAR_MCP = 'http://localhost:8978/mcp';

export function writeE2eWranglerConfig(): void {
  const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', readFileSync('wrangler.jsonc', 'utf8'));
  if (parsed.error) throw new Error('could not parse wrangler.jsonc');
  const config = parsed.config as { vars: Record<string, string> };
  config.vars = {
    ...config.vars,
    APP_ORIGIN: E2E_ORIGIN,
    ACCOUNT_DATA_KEK: Buffer.alloc(32, 7).toString('base64'),
    MCP_GRANT_SECRET: 'e2e-grant-secret',
    CALENDAR_MCP_URL: FAKE_CALENDAR_MCP,
  };
  writeFileSync(E2E_WRANGLER, JSON.stringify(config, null, 2));
}
