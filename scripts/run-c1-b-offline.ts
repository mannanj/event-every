import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import {
  createPrivateOfflineEnvironment,
  spawnPrivateOffline,
  type PrivateOfflineEnvironment,
} from './run-private-offline';

export const C1_B_OFFLINE_COMMANDS = [
  ['bun', 'run', 'type-check'],
  ['bun', 'run', 'lint'],
  ['bun', 'test', 'src', '--isolate'],
  ['bun', 'test', 'scripts/run-private-offline.test.ts', 'scripts/assert-c1-b-paths.test.ts', 'scripts/assert-c1-a-config.test.ts', 'scripts/assert-c1-a-e2e-inventory.test.ts', 'scripts/run-c1-a-offline.test.ts', 'scripts/run-c1-a-worker-e2e.test.ts', 'scripts/assert-private-worker.test.ts', 'scripts/run-private-privacy.test.ts', 'scripts/run-private-worker-e2e.test.ts', 'scripts/run-c1-b-mutations.test.ts', 'scripts/run-c1-b-offline.test.ts', '--isolate'],
  ['bun', 'run', 'test:workers'],
  ['bun', 'run', 'verify:c1:a'],
  ['bun', 'run', 'verify:private:privacy'],
  ['bun', 'scripts/run-c1-b-mutations.ts', '--verify-ledger'],
  ['bun', 'scripts/assert-private-worker.ts'],
  ['bun', 'scripts/assert-c1-b-paths.ts', 'terminal'],
  ['bun', 'run', 'assert:e1-protected'],
] as const;

export const C1_B_STAGE_NAMES = [
  'typecheck', 'lint', 'source-unit', 'runner-unit', 'workerd', 'c1-a',
  'private-privacy', 'mutations', 'artifact', 'terminal-paths', 'protected',
] as const;

export const C1_B_PROTECTED_STATUS = [
  ' M docs/testing/e1-mutation-ledger.md',
  '?? .claude/',
  '?? scripts/run-c1-a-mutations.test.ts',
  '?? scripts/run-c1-a-mutations.ts',
  '?? tasks/task-192.md',
  '?? tasks/task-193.md',
  '',
].join('\n');

export const C1_B_PROTECTED_FILE_HASHES = Object.freeze({
  'docs/testing/e1-mutation-ledger.md': '99880d600585a8dbf1c6286e028d687d517fe9ad4e2cd8b95d1ae147982353b1',
  'scripts/run-c1-a-mutations.ts': '2013de6d4dcbdddcba4e979cc6e96d20380fce8a99c8e34c1d2f4e431c3c0299',
  'scripts/run-c1-a-mutations.test.ts': 'cdc8dcb045415cee66fe9b7a4517e3e083ce35e468fd8e4063971b30d59583d1',
});

const AUTHORED_INPUTS = [
  'package.json',
  'docs/testing/c1-a-private-control-matrix.md',
  'scripts/run-c1-b-offline.ts',
  'scripts/run-c1-b-offline.test.ts',
] as const;
const OUTPUT_EXACT = new Set(['.next', '.open-next', '.wrangler']);
const OUTPUT_PREFIXES = [
  '.c1-b-offline-', '.private-privacy-', 'dist-c1-a-',
  'test-results-c1-a-', 'playwright-report-c1-a-',
  'test-results-private-', 'playwright-report-private-',
] as const;
const STAGE_TIMEOUT_MS = 15 * 60_000;
const FORBIDDEN_PROGRAMS = new Set(['curl', 'wget', 'wrangler', 'vercel', 'npm', 'pnpm', 'yarn', 'ssh', 'scp']);
const FORBIDDEN_BUN_VERBS = new Set(['add', 'install', 'i', 'publish', 'remove', 'update', 'upgrade', 'x']);
const FORBIDDEN_RUN_SCRIPTS = /(?:^|:)(?:deploy|publish|release|install)(?::|$)/i;

type SpawnResult = Readonly<{
  exitCode: number | null | undefined;
  signalCode?: string | null;
  stdout: Uint8Array;
  stderr: Uint8Array;
}>;
type SpawnOptions = Readonly<{ cwd: string; env: PrivateOfflineEnvironment }>;

export type C1BOfflineSeams = Readonly<{
  suffix(): string;
  hash(file: string): string;
  status(root: string): string;
  listOwned(root: string): readonly string[];
  prepareTemp(target: string): void;
  removeOwned(paths: readonly string[]): void;
  spawn(command: readonly string[], options: SpawnOptions, timeoutMs: number): SpawnResult | Promise<SpawnResult>;
}>;

const fail = (message: string): never => { throw new Error(`c1-b offline: ${message}`); };
const hash = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

function status(root: string): string {
  const result = Bun.spawnSync(['git', 'status', '--short'], { cwd: root, stdout: 'pipe', stderr: 'ignore' });
  if (result.exitCode !== 0) fail('protected status unavailable');
  return new TextDecoder().decode(result.stdout);
}

export function isC1BOwnedOutputName(name: string): boolean {
  return OUTPUT_EXACT.has(name) || OUTPUT_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function listOwned(root: string): readonly string[] {
  return readdirSync(root)
    .filter(isC1BOwnedOutputName)
    .map((name) => path.join(root, name))
    .sort();
}

function removeOwned(paths: readonly string[]): void {
  const failures: Error[] = [];
  for (const target of paths) {
    try {
      if (!existsSync(target)) continue;
      const metadata = lstatSync(target);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error('unsafe output type');
      rmSync(target, { recursive: true });
      if (existsSync(target)) throw new Error('output remains');
    } catch {
      failures.push(new Error('c1-b offline: output cleanup failed'));
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, 'c1-b offline: output cleanup failed');
}

const DEFAULT_SEAMS: C1BOfflineSeams = {
  suffix: () => randomBytes(6).toString('hex'),
  hash,
  status,
  listOwned,
  prepareTemp: (target) => mkdirSync(target, { mode: 0o700 }),
  removeOwned,
  spawn: (command, options, timeoutMs) => spawnPrivateOffline(command, options, timeoutMs),
};

export function parseC1BOfflineArguments(argv: readonly string[]): void {
  if (argv.length !== 0) fail('expected no arguments');
}

function isForbiddenCommand(command: readonly string[]): boolean {
  const [program, ...args] = command;
  if (!program || FORBIDDEN_PROGRAMS.has(program)) return true;
  if (program === 'git' && args[0] === 'push') return true;
  if (program === 'bun' && FORBIDDEN_BUN_VERBS.has(args[0] ?? '')) return true;
  if (program === 'bun' && args[0] === 'run' && FORBIDDEN_RUN_SCRIPTS.test(args[1] ?? '')) return true;
  return command.some((argument) => /^(?:https?|git\+ssh):\/\//i.test(argument));
}

export function validateC1BOfflineCommands(commands: readonly (readonly string[])[]): void {
  if (commands.some(isForbiddenCommand)) fail('forbidden command');
  if (JSON.stringify(commands) !== JSON.stringify(C1_B_OFFLINE_COMMANDS)) fail('exact command set changed');
}

export function createC1BOfflineEnvironment(
  source: PrivateOfflineEnvironment,
  root: string,
  ownedTemp: string,
): PrivateOfflineEnvironment {
  return {
    ...createPrivateOfflineEnvironment(source, root),
    TMPDIR: ownedTemp,
    TMP: ownedTemp,
    TEMP: ownedTemp,
  };
}

function environmentForStage(base: PrivateOfflineEnvironment, index: number): PrivateOfflineEnvironment {
  if (index !== 2) return base;
  return { ...base, BUN_OPTIONS: `${base.BUN_OPTIONS ?? ''} --parallel=2`.trim() };
}

function assertProtected(root: string, seams: C1BOfflineSeams): void {
  if (seams.status(root) !== C1_B_PROTECTED_STATUS) fail('protected status changed');
  for (const [relative, expected] of Object.entries(C1_B_PROTECTED_FILE_HASHES)) {
    let observed: string;
    try { observed = seams.hash(path.join(root, relative)); }
    catch { return fail('protected hash unavailable'); }
    if (observed !== expected) fail('protected hash changed');
  }
}

function asFailure(error: unknown): Error {
  return error instanceof Error && error.message.startsWith('c1-b offline:')
    ? error
    : new Error('c1-b offline: stage failed');
}

export async function runC1BOffline(
  root: string,
  source: PrivateOfflineEnvironment = process.env,
  argv: readonly string[] = [],
  seams: C1BOfflineSeams = DEFAULT_SEAMS,
): Promise<readonly string[]> {
  parseC1BOfflineArguments(argv);
  validateC1BOfflineCommands(C1_B_OFFLINE_COMMANDS);
  assertProtected(root, seams);
  if (seams.listOwned(root).length !== 0) fail('owned output collision');

  const suffix = seams.suffix();
  if (!/^[a-f0-9]{12}$/.test(suffix)) fail('invalid suffix');
  const temp = path.join(root, `.c1-b-offline-${suffix}`);
  const authored = AUTHORED_INPUTS.map((file) => path.join(root, file));
  const authoredHashes = new Map<string, string>();
  for (const file of authored) {
    try { authoredHashes.set(file, seams.hash(file)); }
    catch { return fail('authored input unavailable'); }
  }

  const states: string[] = [];
  let ownsOutputs = false;
  let primary: Error | undefined;
  try {
    ownsOutputs = true;
    seams.prepareTemp(temp);
    const baseEnv = createC1BOfflineEnvironment(source, root, temp);
    for (const [index, command] of C1_B_OFFLINE_COMMANDS.entries()) {
      const result = await seams.spawn(
        command,
        { cwd: root, env: environmentForStage(baseEnv, index) },
        STAGE_TIMEOUT_MS,
      );
      if (result.exitCode !== 0 || result.signalCode) fail(`${C1_B_STAGE_NAMES[index]} stage failed`);
      states.push(C1_B_STAGE_NAMES[index]!);
    }
    const outputs = seams.listOwned(root);
    const transientNext = path.join(root, '.next');
    if (!outputs.includes(temp) || outputs.some((output) => output !== temp && output !== transientNext)) {
      fail('generated output remained');
    }
  } catch (error) {
    primary = asFailure(error);
  } finally {
    const cleanup: Error[] = [];
    let authoredChanged = false;
    for (const file of authored) {
      try { if (seams.hash(file) !== authoredHashes.get(file)) authoredChanged = true; }
      catch { authoredChanged = true; }
    }
    if (authoredChanged) cleanup.push(new Error('c1-b offline: authored input changed'));
    if (ownsOutputs) {
      try { seams.removeOwned(seams.listOwned(root)); }
      catch { cleanup.push(new Error('c1-b offline: output cleanup failed')); }
      try { if (seams.listOwned(root).length !== 0) throw new Error(); }
      catch { cleanup.push(new Error('c1-b offline: post-cleanup output remained')); }
    }
    try { assertProtected(root, seams); }
    catch (error) { cleanup.push(asFailure(error)); }
    if (primary && cleanup.length) throw new AggregateError([primary, ...cleanup], 'c1-b offline: failed');
    if (primary) throw primary;
    if (cleanup.length === 1) throw cleanup[0];
    if (cleanup.length) throw new AggregateError(cleanup, 'c1-b offline: cleanup failed');
  }
  return states;
}

if (import.meta.main) {
  try { await runC1BOffline(path.resolve(import.meta.dir, '..'), process.env, process.argv.slice(2)); }
  catch { process.stderr.write('c1-b offline: failed\n'); process.exitCode = 1; }
}
