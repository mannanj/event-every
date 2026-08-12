import path from 'node:path';
import { lstatSync, rmSync } from 'node:fs';
import {
  CREDENTIAL_NAME,
  assertNoWranglerLocalFiles,
  collectNextProductionDotenvNames,
  createCloudflareChildEnvironment,
  type C1AEnvironment,
} from './run-c1-a-cloudflare';

export const C1_A_FULL_COMMANDS = [
  ['bun', 'test', 'scripts/assert-c1-a-config.test.ts', 'scripts/assert-c1-a-e2e-inventory.test.ts', 'scripts/install-c1-a-dependencies.test.ts', 'scripts/c1-a-offline-preload.test.ts', 'scripts/run-c1-a-cloudflare.test.ts', 'scripts/run-c1-a-offline.test.ts', 'scripts/run-c1-a-worker-e2e.test.ts', 'scripts/run-e1-focused.test.ts', 'scripts/run-with-open-next.test.ts', '--isolate'],
  ['bun', 'scripts/run-e1-offline.ts'],
  ['bun', 'scripts/run-with-open-next.ts', '--', 'node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.workers.ts', 'test/worker/app-worker.test.ts', 'test/worker/admission.integration.test.ts', 'test/worker/resolver.integration.test.ts', 'test/worker/deny-egress.integration.test.ts'],
  ['bun', 'scripts/run-c1-a-cloudflare.ts', 'keepalive-tests'],
  ['bun', 'scripts/assert-c1-a-e2e-inventory.ts', '58'],
  ['bun', 'scripts/run-c1-a-worker-e2e.ts'],
  ['bun', 'scripts/assert-e1-protected.ts'],
  ['bun', 'scripts/assert-c1-a-config.ts'],
  ['git', 'diff', '--check'],
] as const;

const RETAINED_IDS = ['C1A-M01', 'C1A-M02', 'C1A-M03', 'C1A-M06', 'C1A-M08', 'C1A-M09', 'C1A-M16', 'C1A-M19', 'C1A-M21', 'C1A-M30'] as const;
type RetainedId = typeof RETAINED_IDS[number];
const RETAINED_ID_SET = new Set<string>(RETAINED_IDS);

const FOCUS_SUITES = {
  A: ['src/platform/__tests__/identity.test.ts', 'src/platform/__tests__/admission.test.ts', 'src/app/api/scan/__tests__/route.test.ts'],
  B: ['src/server/scanner/__tests__/image.test.ts'],
  C: ['src/platform/legacy/__tests__/dispatch.test.ts', 'src/server/scanner/__tests__/transport.test.ts', 'src/app/api/scan/__tests__/route.test.ts'],
  D: ['src/lib/__tests__/llm.test.ts'],
  I: ['src/platform/resolver/__tests__/url-policy.test.ts', 'src/app/api/scrape-url/__tests__/route.test.ts'],
  J: ['src/lib/__tests__/llm.test.ts', 'src/lib/__tests__/limits.test.ts'],
  L: ['src/services/__tests__/reviewStorage.test.ts'],
  Q: ['src/platform/__tests__/runtime.test.ts'],
} as const;

const FOCUS_BY_ID: Readonly<Record<RetainedId, keyof typeof FOCUS_SUITES>> = {
  'C1A-M01': 'A', 'C1A-M02': 'A', 'C1A-M03': 'A', 'C1A-M06': 'B', 'C1A-M08': 'C',
  'C1A-M09': 'D', 'C1A-M16': 'I', 'C1A-M19': 'J', 'C1A-M21': 'L', 'C1A-M30': 'Q',
};

type SpawnResult = Readonly<{ exitCode: number | null | undefined; stdout: Uint8Array; stderr: Uint8Array }>;
type Spawn = (argv: readonly string[], options: { cwd: string; env: C1AEnvironment; stdout: 'pipe'; stderr: 'pipe'; shell: false }) => SpawnResult;

function defaultSpawn(argv: readonly string[], options: Parameters<Spawn>[1]): SpawnResult {
  return Bun.spawnSync([...argv], { cwd: options.cwd, env: options.env, stdout: options.stdout, stderr: options.stderr });
}

function safeOutput(bytes: Uint8Array, ...sources: C1AEnvironment[]): string {
  let output = new TextDecoder().decode(bytes).slice(0, 65_536);
  for (const env of sources) {
    for (const [name, value] of Object.entries(env)) {
      if (!CREDENTIAL_NAME.test(name)) continue;
      output = output.replaceAll(name, '[redacted]');
      if (value) output = output.replaceAll(value, '[redacted]');
    }
  }
  return output;
}

function pathEntryExists(target: string): boolean {
  try {
    lstatSync(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function assertE1WranglerOutputAbsent(root: string): void {
  if (pathEntryExists(path.join(root, '.wrangler'))) throw new Error('c1-a offline: .wrangler already exists');
}

function removeE1WranglerOutput(root: string): void {
  const output = path.join(root, '.wrangler');
  if (!pathEntryExists(output)) return;
  const metadata = lstatSync(output);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error('c1-a offline: E1-created .wrangler is not a plain directory');
  }
  rmSync(output, { recursive: true });
  if (pathEntryExists(output)) throw new Error('c1-a offline: E1-created .wrangler cleanup failed');
}

export function createC1AOfflineEnvironment(
  sourceEnv: C1AEnvironment = process.env,
  root = path.resolve(import.meta.dir, '..'),
): C1AEnvironment {
  const env = createCloudflareChildEnvironment(sourceEnv, root);
  for (const name of new Set([...Object.keys(sourceEnv), ...collectNextProductionDotenvNames(root)])) {
    if (CREDENTIAL_NAME.test(name)) env[name] = '';
  }
  env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
  env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false';
  env.BUN_CONFIG_NO_LOAD_DOTENV = '1';
  return env;
}

export function parseC1AOfflineArguments(argv: readonly string[]): Readonly<{ kind: 'full' } | { kind: 'focus'; id: RetainedId }> {
  if (argv.length === 0) return { kind: 'full' };
  if (argv.length === 2 && argv[0] === '--focus' && RETAINED_ID_SET.has(argv[1]!)) {
    return { kind: 'focus', id: argv[1] as RetainedId };
  }
  throw new Error('c1-a offline: expected no arguments or --focus <retained-id>');
}

export function createC1AFocusCommand(root: string, id: string): readonly string[] {
  if (!RETAINED_ID_SET.has(id)) throw new Error('c1-a offline: expected no arguments or --focus <retained-id>');
  const suite = FOCUS_SUITES[FOCUS_BY_ID[id as RetainedId]];
  return ['bun', `--preload=${path.join(root, 'scripts', 'c1-a-offline-preload.cjs')}`, 'test', ...suite, '--isolate'];
}

export function runC1AOffline(
  root: string,
  sourceEnv: C1AEnvironment,
  argv: readonly string[] = [],
  spawn: Spawn = defaultSpawn,
): void {
  assertNoWranglerLocalFiles(root);
  const parsed = parseC1AOfflineArguments(argv);
  if (parsed.kind === 'full') assertE1WranglerOutputAbsent(root);
  const commands: readonly (readonly string[])[] = parsed.kind === 'full'
    ? C1_A_FULL_COMMANDS
    : [createC1AFocusCommand(root, parsed.id)];
  const env = createC1AOfflineEnvironment(sourceEnv, root);

  for (const [index, command] of commands.entries()) {
    const commandEnv = parsed.kind === 'full' && index === 0 ? { ...env } : env;
    if (commandEnv !== env) delete commandEnv.NODE_OPTIONS;
    const dispatch = () => spawn(command, { cwd: root, env: commandEnv, stdout: 'pipe', stderr: 'pipe', shell: false });
    const result = parsed.kind === 'full' && index === 1
      ? (() => { try { return dispatch(); } finally { removeE1WranglerOutput(root); } })()
      : dispatch();
    if (result.exitCode === 0) continue;
    const stdout = safeOutput(result.stdout, sourceEnv, env);
    const stderr = safeOutput(result.stderr, sourceEnv, env);
    const label = parsed.kind === 'full' ? `step ${index + 1}` : `focus ${parsed.id}`;
    throw new Error(`c1-a offline ${label} failed (${result.exitCode ?? 1}): ${stdout}${stderr}`);
  }
}

if (import.meta.main) runC1AOffline(path.resolve(import.meta.dir, '..'), process.env, process.argv.slice(2));
