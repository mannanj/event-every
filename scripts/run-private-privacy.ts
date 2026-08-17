import { createHash, randomBytes } from 'node:crypto';
import { spawn as spawnNode, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
// @ts-expect-error Node strip-types requires explicit local TypeScript extensions.
import { createPrivateOfflineEnvironment, type PrivateOfflineEnvironment } from './run-private-offline.ts';

export const PRIVATE_MARKERS = Object.freeze({
  raw: 'raw-only-marker-2f84d1',
  provider: 'provider-envelope-marker-91cb30',
  secret: 'private-secret-marker-7e13f0',
  result: 'Documented Result',
});

export const PRIVATE_PRIVACY_COMMANDS = [
  ['bun', 'test', 'scripts/assert-private-worker.test.ts', 'scripts/run-private-offline.test.ts', 'scripts/run-private-privacy.test.ts', 'scripts/run-private-worker-e2e.test.ts', '--isolate'],
  ['bun', 'scripts/run-with-open-next.ts', '--', 'node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.private-workers.ts'],
  ['bun', 'scripts/assert-private-worker.ts'],
  ['bun', 'scripts/run-private-worker-e2e.ts'],
] as const;

export const PRIVATE_PRIVACY_STATES = [
  'preflight', 'inputs-hashed', 'unit', 'workerd', 'artifact', 'browser',
  'outputs-scanned', 'inputs-verified', 'outputs-removed', 'post-cleanup-scanned',
] as const;
export type PrivatePrivacyState = typeof PRIVATE_PRIVACY_STATES[number];
type SignalName = 'SIGINT' | 'SIGTERM' | 'SIGHUP';
type SpawnResult = Readonly<{ exitCode: number; stdout: string; stderr: string }>;
type SpawnOptions = Readonly<{ cwd: string; env: PrivateOfflineEnvironment; signal: AbortSignal }>;

const OUTPUT_LIMIT = 65_536;
const STAGE_TIMEOUT_MS = 300_000;
const AUTHORED_INPUTS = [
  'package.json', 'scripts/assert-private-worker.ts', 'scripts/assert-private-worker.test.ts',
  'scripts/c1-a-offline-preload.cjs', 'scripts/private-offline-preload.cjs', 'scripts/run-private-offline.test.ts',
  'scripts/run-private-privacy.ts', 'scripts/run-private-privacy.test.ts',
  'scripts/run-private-worker-e2e.ts', 'scripts/run-private-worker-e2e.test.ts',
  'vitest.config.private-workers.ts', 'test/worker/private-provider.integration.test.ts',
  'test/worker/provider-privacy.integration.test.ts', 'playwright.private.config.ts',
  'e2e/private-provider-state.spec.ts',
] as const;

export type PrivatePrivacySeams = Readonly<{
  suffix(): string;
  exists(file: string): boolean;
  hash(file: string): string;
  spawn(argv: readonly string[], options: SpawnOptions): Promise<SpawnResult>;
  deadline(): Promise<void>;
  prepareTemp(path: string): void;
  scanOutputs(paths: readonly string[]): void;
  removeOwned(paths: readonly string[]): void;
  subscribeSignals(listener: (signal: SignalName) => void): () => void;
}>;

const fail = (message: string): never => { throw new Error(`private privacy: ${message}`); };
const hash = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');
const exists = (file: string): boolean => { try { lstatSync(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } };
const forbidden = [PRIVATE_MARKERS.raw, PRIVATE_MARKERS.provider, PRIVATE_MARKERS.secret, PRIVATE_MARKERS.result];

function assertSafeText(value: string): void {
  if (forbidden.some((marker) => value.includes(marker))) fail('marker leak');
}

async function readOutput(stream: ReadableStream<Uint8Array> | number | undefined): Promise<string> {
  if (!stream || typeof stream === 'number') return '';
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let captured = ''; let carry = '';
  const longest = Math.max(...forbidden.map((value) => value.length));
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      const text = decoder.decode(next.value, { stream: true });
      const inspect = carry + text;
      assertSafeText(inspect);
      carry = inspect.slice(Math.max(0, inspect.length - longest + 1));
      if (captured.length < OUTPUT_LIMIT) captured += text.slice(0, OUTPUT_LIMIT - captured.length);
    }
    const tail = decoder.decode();
    assertSafeText(carry + tail);
    return (captured + tail.slice(0, Math.max(0, OUTPUT_LIMIT - captured.length))).slice(0, OUTPUT_LIMIT);
  } finally { reader.releaseLock(); }
}

export async function terminatePrivatePrivacyProcessGroup(
  signalGroup: (signal: 'SIGTERM' | 'SIGKILL') => void,
  grace: () => Promise<void> = () => new Promise((resolve) => { setTimeout(resolve, 1_000); }),
): Promise<void> {
  signalGroup('SIGTERM');
  await grace();
  signalGroup('SIGKILL');
}

async function defaultSpawn(argv: readonly string[], options: SpawnOptions): Promise<SpawnResult> {
  const [command, ...args] = argv;
  if (!command) return { exitCode: 1, stdout: '', stderr: '' };
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawnNode(command, args, {
      cwd: options.cwd,
      env: options.env as NodeJS.ProcessEnv,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.end();
  }
  catch { return { exitCode: 1, stdout: '', stderr: '' }; }
  let exited = false;
  const exit = new Promise<number>((resolve) => {
    const finish = (code: number | null) => { if (exited) return; exited = true; resolve(code ?? 1); };
    child.once('exit', finish); child.once('error', () => finish(1));
  });
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch { try { child.kill(signal); } catch { /* already exited */ } }
  };
  let termination: Promise<void> | undefined;
  const abort = () => {
    termination ??= terminatePrivatePrivacyProcessGroup(signalGroup);
  };
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) abort();
  const stdout = readOutput(Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>);
  const stderr = readOutput(Readable.toWeb(child.stderr) as unknown as ReadableStream<Uint8Array>);
  try {
    const [exitCode, stdoutValue, stderrValue] = await Promise.all([exit, stdout, stderr]);
    if (termination) await termination;
    return { exitCode, stdout: stdoutValue, stderr: stderrValue };
  } catch (error) {
    abort();
    await exit;
    await Promise.allSettled([stdout, stderr, termination]);
    throw error;
  } finally {
    options.signal.removeEventListener('abort', abort);
  }
}

function inside(parent: string, target: string): boolean {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function scanPath(target: string, ownedRoot: string, visited: Set<string>): void {
  if (!exists(target)) return;
  const metadata = lstatSync(target);
  if (metadata.isSymbolicLink()) {
    let resolved: string;
    try { resolved = realpathSync(target); } catch { return fail('generated output type'); }
    if (!inside(ownedRoot, resolved)) fail('generated output type');
    scanPath(resolved, ownedRoot, visited);
    return;
  }
  const identity = realpathSync(target);
  if (visited.has(identity)) return;
  visited.add(identity);
  if (metadata.isDirectory()) {
    for (const name of readdirSync(target)) scanPath(path.join(target, name), ownedRoot, visited);
    return;
  }
  if (!metadata.isFile()) fail('generated output type');
  if (metadata.size > 8 * 1024 * 1024) fail('generated output too large');
  assertSafeText(readFileSync(target, 'utf8'));
}

export function scanPrivateOutputs(paths: readonly string[]): void {
  for (const target of paths) {
    if (!exists(target)) continue;
    const metadata = lstatSync(target);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail('generated output type');
    scanPath(target, realpathSync(target), new Set());
  }
}

function removeOwned(paths: readonly string[]): void {
  for (const target of paths) {
    if (!exists(target)) continue;
    const metadata = lstatSync(target);
    if (metadata.isSymbolicLink()) fail('generated output type');
    rmSync(target, { recursive: metadata.isDirectory(), force: false });
    if (exists(target)) fail('output cleanup failed');
  }
}

function subscribeSignals(listener: (signal: SignalName) => void): () => void {
  const entries = (['SIGINT', 'SIGTERM', 'SIGHUP'] as const).map((signal) => {
    const handler = () => listener(signal);
    process.once(signal, handler);
    return [signal, handler] as const;
  });
  return () => entries.forEach(([signal, handler]) => process.removeListener(signal, handler));
}

const delay = (): Promise<void> => new Promise((resolve) => {
  const timer = setTimeout(resolve, STAGE_TIMEOUT_MS);
  timer.unref?.();
});

const DEFAULT_SEAMS: PrivatePrivacySeams = {
  suffix: () => randomBytes(6).toString('hex'), exists, hash, spawn: defaultSpawn,
  deadline: delay, prepareTemp: (target) => mkdirSync(target),
  scanOutputs: scanPrivateOutputs, removeOwned, subscribeSignals,
};

function ownedPaths(root: string, suffix: string): readonly string[] {
  return [
    path.join(root, '.open-next'), path.join(root, '.wrangler'),
    path.join(root, `test-results-private-${suffix}`), path.join(root, `playwright-report-private-${suffix}`),
    path.join(root, `.private-privacy-${suffix}`),
  ];
}

export function createPrivatePrivacyEnvironment(
  source: PrivateOfflineEnvironment,
  root: string,
  suffix: string,
): PrivateOfflineEnvironment {
  const env = createPrivateOfflineEnvironment(source, root);
  const temp = path.join(root, `.private-privacy-${suffix}`);
  return {
    ...env,
    OPENROUTER_OWNER_KEY: PRIVATE_MARKERS.secret,
    PROVIDER_REQUEST_HMAC_CURRENT: 'synthetic-private-request-hmac',
    PROVIDER_REQUEST_HMAC_CURRENT_VERSION: 'c1-b-current-v1',
    PROVIDER_POLICY_VERSION: 'owner-v1',
    STATE_AUTHORITY_MODE: 'cloudflare',
    IDENTITY_HMAC_CURRENT: 'synthetic-private-identity-hmac',
    RESOLVER_CAPABILITY_HMAC: 'synthetic-private-resolver-hmac',
    PRIVATE_OUTPUT_SUFFIX: suffix,
    PRIVATE_PRIVACY_CANARY: '1',
    TMPDIR: temp,
    TMP: temp,
    TEMP: temp,
  };
}

export async function runPrivatePrivacy(
  root: string,
  source: PrivateOfflineEnvironment = process.env,
  seams: PrivatePrivacySeams = DEFAULT_SEAMS,
): Promise<readonly PrivatePrivacyState[]> {
  const suffix = seams.suffix();
  if (!/^[a-f0-9]{12}$/.test(suffix)) fail('invalid suffix');
  const outputs = ownedPaths(root, suffix);
  if (outputs.some(seams.exists)) fail('owned output collision');
  const files = AUTHORED_INPUTS.map((file) => path.join(root, file));
  const hashes = new Map(files.map((file) => [file, seams.hash(file)]));
  const states: PrivatePrivacyState[] = ['preflight', 'inputs-hashed'];
  seams.prepareTemp(outputs[4]!);
  const env = createPrivatePrivacyEnvironment(source, root, suffix);
  const controller = new AbortController();
  let cancellation: Error | undefined;
  let rejectCancellation!: (error: Error) => void;
  const cancelled = new Promise<never>((_resolve, reject) => { rejectCancellation = reject; });
  void cancelled.catch(() => undefined);
  const cancel = (error: Error) => { if (!cancellation) { cancellation = error; controller.abort(); rejectCancellation(error); } };
  const unsubscribe = seams.subscribeSignals((signal) => cancel(new Error(`private privacy: aborted (${signal})`)));
  let primary: Error | undefined;
  let activeStage: Promise<SpawnResult> | undefined;
  try {
    for (const [index, command] of PRIVATE_PRIVACY_COMMANDS.entries()) {
      const stage = (['unit', 'workerd', 'artifact', 'browser'] as const)[index]!;
      let stageFinished = false;
      const deadline = seams.deadline().then(() => { if (!stageFinished) cancel(new Error('private privacy: timeout')); });
      void deadline.catch(() => undefined);
      activeStage = seams.spawn(command, { cwd: root, env, signal: controller.signal });
      const result = await Promise.race([activeStage, cancelled]); stageFinished = true; activeStage = undefined;
      assertSafeText(result.stdout); assertSafeText(result.stderr);
      if (result.exitCode !== 0) fail(`${stage} stage failed`);
      states.push(stage);
    }
    seams.scanOutputs(outputs);
    states.push('outputs-scanned');
  } catch (error) {
    primary = error instanceof Error && error.message.startsWith('private privacy:') ? error : new Error('private privacy: stage failed');
  } finally {
    const cleanup: Error[] = [];
    if (activeStage) {
      const settled = await Promise.allSettled([activeStage]);
      if (settled[0]?.status === 'rejected' && !primary) cleanup.push(new Error('private privacy: child cleanup failed'));
      activeStage = undefined;
    }
    let authoredChanged = false;
    for (const file of files) {
      try { if (seams.hash(file) !== hashes.get(file)) authoredChanged = true; }
      catch { authoredChanged = true; }
    }
    if (authoredChanged) cleanup.push(new Error('private privacy: authored input changed'));
    if (!cleanup.length) states.push('inputs-verified');
    try { seams.removeOwned(outputs); states.push('outputs-removed'); } catch { cleanup.push(new Error('private privacy: output cleanup failed')); }
    try { seams.scanOutputs(outputs); states.push('post-cleanup-scanned'); } catch { cleanup.push(new Error('private privacy: post-cleanup scan failed')); }
    unsubscribe();
    if (primary && cleanup.length) throw new AggregateError([primary, ...cleanup], 'private privacy: failed');
    if (primary) throw primary;
    if (cleanup.length === 1) throw cleanup[0];
    if (cleanup.length) throw new AggregateError(cleanup, 'private privacy: cleanup failed');
  }
  return states;
}

if (import.meta.main) {
  try { await runPrivatePrivacy(path.resolve(import.meta.dir, '..')); }
  catch { process.stderr.write('private privacy: failed\n'); process.exitCode = 1; }
}
