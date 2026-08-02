import path from 'node:path';
import { CREDENTIAL_NAME, assertNoWranglerLocalFiles, collectNextProductionDotenvNames, createCloudflareChildEnvironment, type C1AEnvironment } from './run-c1-a-cloudflare';

export const TASK_1_OFFLINE_COMMANDS = [
  ['bun', 'test', 'scripts/assert-c1-a-config.test.ts', 'scripts/assert-c1-a-paths.test.ts', 'scripts/install-c1-a-dependencies.test.ts', 'scripts/c1-a-offline-preload.test.ts', 'scripts/run-c1-a-offline.test.ts', 'scripts/run-c1-a-cloudflare.test.ts', 'scripts/run-with-open-next.test.ts', '--isolate'],
  ['bun', 'scripts/assert-c1-a-config.ts'], ['bun', 'scripts/assert-e1-protected.ts'], ['git', 'diff', '--check'],
] as const;
type SpawnResult = Readonly<{ exitCode: number | null | undefined; stdout: Uint8Array; stderr: Uint8Array }>;
type Spawn = (argv: readonly string[], options: { cwd: string; env: C1AEnvironment; stdout: 'pipe'; stderr: 'pipe'; shell: false }) => SpawnResult;
function defaultSpawn(argv: readonly string[], options: Parameters<Spawn>[1]): SpawnResult { return Bun.spawnSync([...argv], { cwd: options.cwd, env: options.env, stdout: options.stdout, stderr: options.stderr }); }
function safeOutput(bytes: Uint8Array, ...sources: C1AEnvironment[]): string { let output = new TextDecoder().decode(bytes).slice(0, 65_536); for (const env of sources) for (const [name, value] of Object.entries(env)) if (CREDENTIAL_NAME.test(name)) { output = output.replaceAll(name, '[redacted]'); if (value) output = output.replaceAll(value, '[redacted]'); } return output; }

export function createC1AOfflineEnvironment(sourceEnv: C1AEnvironment = process.env, root = path.resolve(import.meta.dir, '..')): C1AEnvironment {
  const env = createCloudflareChildEnvironment(sourceEnv, root);
  for (const name of new Set([...Object.keys(sourceEnv), ...collectNextProductionDotenvNames(root)])) if (CREDENTIAL_NAME.test(name)) env[name] = '';
  env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'; env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false'; env.BUN_CONFIG_NO_LOAD_DOTENV = '1';
  return env;
}
export function runTask1Offline(root: string, sourceEnv: C1AEnvironment, spawn: Spawn = defaultSpawn): void {
  assertNoWranglerLocalFiles(root);
  const env = createC1AOfflineEnvironment(sourceEnv, root);
  for (const [index, command] of TASK_1_OFFLINE_COMMANDS.entries()) {
    const result = spawn(command, { cwd: root, env, stdout: 'pipe', stderr: 'pipe', shell: false });
    const stdout = safeOutput(result.stdout, sourceEnv, env); const stderr = safeOutput(result.stderr, sourceEnv, env);
    if (result.exitCode !== 0) throw new Error(`c1-a offline step ${index + 1} failed (${result.exitCode ?? 1}): ${stdout}${stderr}`);
  }
}
if (import.meta.main) runTask1Offline(path.resolve(import.meta.dir, '..'), process.env);
