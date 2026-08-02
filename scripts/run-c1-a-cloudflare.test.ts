import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertNoWranglerLocalFiles, cloudflareInvocation, collectNextProductionDotenvNames, createCloudflareChildEnvironment, installCloudflareProcessBoundary, runCloudflareMode } from './run-c1-a-cloudflare';

function root(): string { return mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-cf-')); }
function bytes(value: string): Uint8Array { return new TextEncoder().encode(value); }

describe('C1-A Cloudflare process boundary', () => {
  test('collects only the exact Next grammar across all four production dotenv candidates', () => {
    const directory = root();
    try {
      const names = ['.env.production.local', '.env.local', '.env.production', '.env'];
      for (const [index, file] of names.entries()) writeFileSync(path.join(directory, file), ` export OPENROUTER_TOKEN_${index}=quoted # comment\r\nAPI_KEY_${index}: value\n OPENROUTER-TOKEN-${index} = value\nCLOUDFLARE.SECRET-${index} = value\n# TOKEN=no\nKEY:value\nTOKEN_ONLY\n`);
      expect(collectNextProductionDotenvNames(directory)).toEqual(names.flatMap((_, index) => [`OPENROUTER_TOKEN_${index}`, `API_KEY_${index}`, `OPENROUTER-TOKEN-${index}`, `CLOUDFLARE.SECRET-${index}`]));
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test('scrubs inherited and dotenv names, overrides inherited Cloudflare controls, and adds a local preload', () => {
    const directory = root();
    try {
      writeFileSync(path.join(directory, '.env.local'), 'RESEND_TOKEN=value\n');
      const env = createCloudflareChildEnvironment({ ANTHROPIC_TOKEN: 'parent', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true', NODE_OPTIONS: '--require=/tmp/foreign', BUN_OPTIONS: '--preload=/tmp/foreign', NODE_PATH: '/tmp/foreign', HTTPS_PROXY: 'http://proxy.invalid', SAFE: 'yes' }, directory);
      expect(env).toMatchObject({ ANTHROPIC_TOKEN: '', RESEND_TOKEN: '', SAFE: 'yes', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false', BUN_CONFIG_NO_LOAD_DOTENV: '1' });
      expect(env.NODE_OPTIONS).toBe(`--require=${path.join(directory, 'scripts', 'c1-a-offline-preload.cjs')}`);
      expect(env.BUN_OPTIONS).toBeUndefined(); expect(env.NODE_PATH).toBeUndefined(); expect(env.HTTPS_PROXY).toBeUndefined();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test('removes current-process injection/proxy controls before later dynamic imports', () => {
    const directory = root();
    try {
      process.env.BUN_OPTIONS = '--preload=/tmp/foreign';
      process.env.NODE_PATH = '/tmp/foreign';
      process.env.HTTPS_PROXY = 'http://proxy.invalid';
      installCloudflareProcessBoundary(directory);
      expect(process.env.BUN_OPTIONS).toBeUndefined();
      expect(process.env.NODE_PATH).toBeUndefined();
      expect(process.env.HTTPS_PROXY).toBeUndefined();
    } finally { delete process.env.BUN_OPTIONS; delete process.env.NODE_PATH; delete process.env.HTTPS_PROXY; rmSync(directory, { recursive: true, force: true }); }
  });

  test('uses exact argv for every closed mode and returns bounded child output', () => {
    expect(cloudflareInvocation('app-types')).toEqual(['node', 'node_modules/wrangler/bin/wrangler.js', 'types', '--env-interface', 'CloudflareEnv']);
    expect(cloudflareInvocation('keepalive-types')).toEqual(['node', 'node_modules/wrangler/bin/wrangler.js', 'types', 'cloudflare/legacy-keepalive-configuration.d.ts', '--config', 'cloudflare/legacy-keepalive-wrangler.jsonc', '--env-interface', 'LegacyKeepAliveEnv']);
    const directory = root();
    try {
      process.env.C1_A_TEST_TOKEN = 'synthetic-output-canary';
      const seen: unknown[] = [];
      const result = runCloudflareMode('keepalive-tests', directory, (argv, options) => { seen.push([argv, options]); return { exitCode: 7, stdout: bytes(`C1_A_TEST_TOKEN synthetic-output-canary ${'a'.repeat(70_000)}`), stderr: bytes('b'.repeat(70_000)) }; });
      expect(seen).toHaveLength(1); expect(result.exitCode).toBe(7); expect(result.stdout.length).toBeLessThanOrEqual(65_536); expect(result.stderr.length).toBe(65_536);
      expect(result.stdout).not.toContain('C1_A_TEST_TOKEN'); expect(result.stdout).not.toContain('synthetic-output-canary');
      const childEnv = (seen[0] as [unknown, { env: NodeJS.ProcessEnv }])[1].env;
      expect(childEnv.C1_A_TEST_TOKEN).toBe('');
    } finally { delete process.env.C1_A_TEST_TOKEN; rmSync(directory, { recursive: true, force: true }); }
    expect(() => cloudflareInvocation('unknown' as never)).toThrow('c1-a Cloudflare boundary: expected');
  });

  test('rejects local vars by root entry without reading the file', () => {
    const directory = root();
    try { writeFileSync(path.join(directory, '.dev.vars.test'), 'unread-canary'); expect(() => assertNoWranglerLocalFiles(directory)).toThrow('c1-a Cloudflare boundary: local vars file present'); } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
