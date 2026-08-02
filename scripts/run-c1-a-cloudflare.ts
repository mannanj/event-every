import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const CREDENTIAL_NAME = /(OPENROUTER|ANTHROPIC|API_KEY|TOKEN|SECRET|CLOUDFLARE|RESEND|KV_REST|D1|R2|AUTH_PATTERN)/i;
export const NEXT_PRODUCTION_DOTENV_FILES = ['.env.production.local', '.env.local', '.env.production', '.env'] as const;
export const NEXT_DOTENV_KEY = /^\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*|:\s+)/;
export type C1AEnvironment = Record<string, string | undefined>;
const CHILD_INJECTION_CONTROLS = [
  'NODE_OPTIONS', 'BUN_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE',
  'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
] as const;

function injectionControl(name: string): boolean {
  return CHILD_INJECTION_CONTROLS.some((control) => control.toLowerCase() === name.toLowerCase());
}

export function collectNextProductionDotenvNames(root: string): string[] {
  const names = new Set<string>();
  for (const name of NEXT_PRODUCTION_DOTENV_FILES) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').replaceAll('\r\n', '\n').split('\n')) {
      const key = line.match(NEXT_DOTENV_KEY)?.[1];
      if (key && CREDENTIAL_NAME.test(key)) names.add(key);
    }
  }
  return [...names];
}

export function assertNoWranglerLocalFiles(root: string): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.dev.vars' || entry.name.startsWith('.dev.vars.')) {
      throw new Error('c1-a Cloudflare boundary: local vars file present');
    }
  }
}

function scrub(sourceEnv: C1AEnvironment, root: string): C1AEnvironment {
  const names = new Set([...Object.keys(sourceEnv), ...collectNextProductionDotenvNames(root)]);
  const env = { ...sourceEnv };
  for (const name of names) if (CREDENTIAL_NAME.test(name)) env[name] = '';
  for (const name of Object.keys(env)) if (injectionControl(name)) delete env[name];
  for (const name of CHILD_INJECTION_CONTROLS) { delete env[name]; delete env[name.toLowerCase()]; }
  env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
  env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false';
  env.BUN_CONFIG_NO_LOAD_DOTENV = '1';
  return env;
}

export function createCloudflareChildEnvironment(sourceEnv: C1AEnvironment, root: string): C1AEnvironment {
  const env = scrub(sourceEnv, root);
  const preload = path.join(root, 'scripts', 'c1-a-offline-preload.cjs');
  env.NODE_OPTIONS = `--require=${preload}`;
  return env;
}

export function installCloudflareProcessBoundary(root: string): void {
  const clean = scrub(process.env, root);
  for (const name of Object.keys(process.env)) if (injectionControl(name)) delete process.env[name];
  for (const name of CHILD_INJECTION_CONTROLS) { delete process.env[name]; delete process.env[name.toLowerCase()]; }
  for (const [name, value] of Object.entries(clean)) {
    if (CREDENTIAL_NAME.test(name) || name === 'CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV' || name === 'CLOUDFLARE_INCLUDE_PROCESS_ENV' || name === 'BUN_CONFIG_NO_LOAD_DOTENV') process.env[name] = value;
  }
}

export type CloudflareMode = 'app-types' | 'keepalive-types' | 'keepalive-tests';
export function cloudflareInvocation(mode: CloudflareMode): readonly string[] {
  if (mode === 'app-types') return ['node', 'node_modules/wrangler/bin/wrangler.js', 'types', '--env-interface', 'CloudflareEnv'];
  if (mode === 'keepalive-types') return ['node', 'node_modules/wrangler/bin/wrangler.js', 'types', 'cloudflare/legacy-keepalive-configuration.d.ts', '--config', 'cloudflare/legacy-keepalive-wrangler.jsonc', '--env-interface', 'LegacyKeepAliveEnv'];
  if (mode === 'keepalive-tests') return ['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.keepalive-workers.ts', 'test/worker/legacy-keepalive.integration.test.ts', 'test/worker/deny-egress.integration.test.ts'];
  throw new Error('c1-a Cloudflare boundary: expected app-types|keepalive-types|keepalive-tests');
}

type SpawnResult = Readonly<{ exitCode: number | null | undefined; stdout: Uint8Array; stderr: Uint8Array }>;
type Spawn = (argv: readonly string[], options: { cwd: string; env: C1AEnvironment; stdout: 'pipe'; stderr: 'pipe'; shell: false }) => SpawnResult;
function defaultSpawn(argv: readonly string[], options: Parameters<Spawn>[1]): SpawnResult { return Bun.spawnSync([...argv], { cwd: options.cwd, env: options.env, stdout: options.stdout, stderr: options.stderr }); }
function safeOutput(bytes: Uint8Array, ...sources: C1AEnvironment[]): string { let output = new TextDecoder().decode(bytes).slice(0, 65_536); for (const env of sources) for (const [name, value] of Object.entries(env)) if (CREDENTIAL_NAME.test(name)) { output = output.replaceAll(name, '[redacted]'); if (value) output = output.replaceAll(value, '[redacted]'); } return output; }
export function runCloudflareMode(mode: CloudflareMode, root: string, spawn: Spawn = defaultSpawn): { exitCode: number; stdout: string; stderr: string } {
  assertNoWranglerLocalFiles(root);
  const source = { ...process.env };
  installCloudflareProcessBoundary(root);
  const env = createCloudflareChildEnvironment(process.env, root);
  const result = spawn(cloudflareInvocation(mode), { cwd: root, env, stdout: 'pipe', stderr: 'pipe', shell: false });
  return { exitCode: result.exitCode ?? 1, stdout: safeOutput(result.stdout, source, env), stderr: safeOutput(result.stderr, source, env) };
}

if (import.meta.main) {
  const [mode, ...extra] = process.argv.slice(2);
  if (extra.length > 0 || !['app-types', 'keepalive-types', 'keepalive-tests'].includes(mode)) throw new Error('c1-a Cloudflare boundary: expected app-types|keepalive-types|keepalive-tests');
  const root = path.resolve(import.meta.dir, '..');
  const result = runCloudflareMode(mode as CloudflareMode, root);
  process.stdout.write(result.stdout); process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
