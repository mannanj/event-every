import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { assertNoWranglerLocalFiles, createCloudflareChildEnvironment, CREDENTIAL_NAME, type C1AEnvironment } from './run-c1-a-cloudflare';

const OUTPUT_LIMIT = 64 * 1024;
const TERMINATE_TIMEOUT_MS = 2_000;
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
type ManagedSignal = typeof SIGNALS[number];

type Child = Readonly<{
  exited: Promise<number>;
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  kill(signal: 'SIGTERM' | 'SIGKILL'): unknown;
}>;
type Spawn = (
  argv: readonly string[],
  options: { cwd: string; env: C1AEnvironment; stdout: 'pipe'; stderr: 'pipe'; shell: false },
) => Child;
type SignalSource = Readonly<{
  on(signal: ManagedSignal, listener: () => void): unknown;
  off(signal: ManagedSignal, listener: () => void): unknown;
}>;
type RunOptions = Readonly<{
  spawn?: Spawn;
  signals?: SignalSource;
  remove?: (target: string) => void;
  terminateTimeoutMs?: number;
}>;

function fail(message: string): never {
  throw new Error(`c1-a OpenNext owner: ${message}`);
}

function errorValue(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function hash(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function safeOutput(bytes: Uint8Array, ...sources: C1AEnvironment[]): string {
  let value = new TextDecoder().decode(bytes);
  for (const env of sources) {
    for (const [name, secret] of Object.entries(env)) {
      if (!CREDENTIAL_NAME.test(name)) continue;
      value = value.replaceAll(name, '[redacted]');
      if (secret) value = value.replaceAll(secret, '[redacted]');
    }
  }
  return value.slice(0, OUTPUT_LIMIT);
}

async function capture(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length >= OUTPUT_LIMIT) continue;
      const retained = value.slice(0, OUTPUT_LIMIT - length);
      chunks.push(retained); length += retained.byteLength;
    }
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function defaultSpawn(argv: readonly string[], options: Parameters<Spawn>[1]): Child {
  return Bun.spawn([...argv], { cwd: options.cwd, env: options.env, stdout: options.stdout, stderr: options.stderr }) as unknown as Child;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

export function parseOpenNextChild(argv: readonly string[]): readonly string[] {
  if (argv.length < 2 || argv[0] !== '--' || argv.slice(1).some((part) => !part)) {
    fail('expected -- followed by one child argv');
  }
  const child = argv.slice(1);
  const text = child.join(' ');
  if (/\b(?:deploy|upload|publish|preview)\b/i.test(text) || child.includes('scripts/run-with-open-next.ts')) {
    fail('forbidden child');
  }
  return child;
}

export function assertOpenNextOutputsAbsent(root: string): void {
  for (const name of ['.open-next', '.wrangler']) {
    if (existsSync(path.join(root, name))) fail(`${name} already exists`);
  }
}

function authoredHashes(root: string): ReadonlyArray<readonly [string, string]> {
  const files = [path.join(root, 'scripts', 'run-with-open-next.ts'), path.join(root, 'open-next.config.ts')];
  for (const [index, file] of files.entries()) {
    try {
      if (!lstatSync(file).isFile()) fail(index === 0 ? 'authored wrapper missing' : 'authored config missing');
    } catch {
      fail(index === 0 ? 'authored wrapper missing' : 'authored config missing');
    }
  }
  return files.map((file) => [file, hash(file)] as const);
}

export async function runWithOpenNext(
  root: string,
  childArgv: readonly string[],
  sourceEnv: C1AEnvironment,
  options: RunOptions = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  assertOpenNextOutputsAbsent(root);
  assertNoWranglerLocalFiles(root);
  const authored = authoredHashes(root);
  const env = createCloudflareChildEnvironment(sourceEnv, root);
  const spawn = options.spawn ?? defaultSpawn;
  const signalSource = options.signals ?? process;
  const remove = options.remove ?? ((target: string) => rmSync(target, { recursive: true, force: true }));
  const terminateTimeoutMs = options.terminateTimeoutMs ?? TERMINATE_TIMEOUT_MS;
  let interrupted = false;
  let resolveInterrupt!: () => void;
  const interrupt = new Promise<void>((resolveSignal) => { resolveInterrupt = resolveSignal; });
  const signalHandlers = new Map<ManagedSignal, () => void>();
  for (const signal of SIGNALS) {
    const handler = () => { if (!interrupted) { interrupted = true; resolveInterrupt(); } };
    signalHandlers.set(signal, handler); signalSource.on(signal, handler);
  }
  const lifecycleErrors: Error[] = [];
  let primary: Error | undefined;
  let output = { exitCode: 1, stdout: '', stderr: '' };

  const runChild = async (argv: readonly string[], label: 'build' | 'child'): Promise<{ exitCode: number; stdout: Uint8Array; stderr: Uint8Array }> => {
    if (interrupted) fail('interrupted');
    let processChild: Child;
    try {
      processChild = spawn(argv, { cwd: root, env, stdout: 'pipe', stderr: 'pipe', shell: false });
    } catch {
      fail(`${label} start failed`);
    }
    const stdout = capture(processChild.stdout);
    const stderr = capture(processChild.stderr);
    let settled = false;
    const exited = Promise.resolve(processChild.exited).then(
      (exitCode) => { settled = true; return { kind: 'exit' as const, exitCode }; },
      () => { settled = true; return { kind: 'error' as const, exitCode: 1 }; },
    );
    const outcome = await Promise.race([exited, interrupt.then(() => ({ kind: 'signal' as const, exitCode: 1 }))]);
    if (outcome.kind === 'signal') {
      if (!settled) {
        try { processChild.kill('SIGTERM'); } catch { lifecycleErrors.push(new Error('c1-a OpenNext owner: TERM failed')); }
        await Promise.race([exited.then(() => undefined), delay(terminateTimeoutMs)]);
      }
      if (!settled) {
        try { processChild.kill('SIGKILL'); } catch { lifecycleErrors.push(new Error('c1-a OpenNext owner: KILL failed')); }
        await Promise.race([exited.then(() => undefined), delay(terminateTimeoutMs)]);
      }
      if (!settled) lifecycleErrors.push(new Error('c1-a OpenNext owner: child did not terminate'));
      fail('interrupted');
    }
    const [stdoutBytes, stderrBytes] = await Promise.all([stdout, stderr]);
    if (outcome.kind === 'error') fail(`${label} process failed`);
    return { exitCode: outcome.exitCode, stdout: stdoutBytes, stderr: stderrBytes };
  };

  try {
    const build = await runChild(['node', 'node_modules/@opennextjs/cloudflare/dist/cli/index.js', 'build'], 'build');
    if (build.exitCode !== 0) fail(`build failed (${build.exitCode || 1})`);
    if (!existsSync(path.join(root, '.open-next', 'worker.js'))) fail('missing .open-next/worker.js');
    const child = await runChild(childArgv, 'child');
    output = {
      exitCode: child.exitCode,
      stdout: safeOutput(child.stdout, sourceEnv, env),
      stderr: safeOutput(child.stderr, sourceEnv, env),
    };
    if (output.exitCode !== 0) fail(`child failed (${output.exitCode})`);
  } catch (error) {
    primary = errorValue(error);
  } finally {
    for (const [signal, handler] of signalHandlers) signalSource.off(signal, handler);
    for (const name of ['.open-next', '.wrangler']) {
      try { remove(path.join(root, name)); } catch { lifecycleErrors.push(new Error(`c1-a OpenNext owner: cleanup failed for ${name}`)); }
    }
    for (const [file, digest] of authored) {
      try {
        if (hash(file) !== digest) throw new Error();
      } catch { lifecycleErrors.push(new Error(`c1-a OpenNext owner: authored input changed: ${path.basename(file)}`)); }
    }
  }
  if (primary && lifecycleErrors.length) throw new AggregateError([primary, ...lifecycleErrors], 'c1-a OpenNext owner: failed');
  if (primary) throw primary;
  if (lifecycleErrors.length) throw new AggregateError(lifecycleErrors, 'c1-a OpenNext owner: cleanup failed');
  return output;
}

if (import.meta.main) {
  try {
    const root = path.resolve(import.meta.dir, '..');
    const result = await runWithOpenNext(root, parseOpenNextChild(process.argv.slice(2)), process.env);
    process.stdout.write(result.stdout); process.stderr.write(result.stderr);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'c1-a OpenNext owner: failed'}\n`);
    process.exitCode = 1;
  }
}
