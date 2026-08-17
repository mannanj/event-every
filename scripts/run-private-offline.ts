import path from 'node:path';
import { spawn as spawnNode, type ChildProcessWithoutNullStreams } from 'node:child_process';

const CREDENTIAL_NAME = /(?:OPENROUTER|ANTHROPIC|API[_-]?KEY|TOKEN|SECRET|CLOUDFLARE|RESEND|KV[_-]?REST|D1|R2|AUTH[_-]?PATTERN|PASSWORD|CREDENTIAL)/i;
const OUTPUT_LIMIT = 65_536;
const TIMEOUT_MS = 120_000;
const C1_B_MUTATION_TIMEOUT_MS = 15 * 60_000;

export type PrivateOfflineEnvironment = Record<string, string | undefined>;
type SpawnResult = Readonly<{ exitCode: number | null | undefined; signalCode?: string | null; stdout: Uint8Array; stderr: Uint8Array }>;
type Spawn = (argv: readonly string[], options: Readonly<{ cwd: string; env: PrivateOfflineEnvironment }>, timeoutMs?: number) => SpawnResult | Promise<SpawnResult>;

export function parsePrivateOfflineArguments(argv: readonly string[]): readonly string[] {
  if (argv.length < 2 || argv[0] !== '--') throw new Error('private offline: expected -- <command>');
  return argv.slice(1);
}

export function privateOfflineTimeoutMs(command: readonly string[]): number {
  const isMutationLedger = command.length === 3
    && command[0] === 'bun'
    && command[1] === 'scripts/run-c1-b-mutations.ts'
    && (command[2] === '--write-ledger' || command[2] === '--verify-ledger');
  return isMutationLedger ? C1_B_MUTATION_TIMEOUT_MS : TIMEOUT_MS;
}

export function createPrivateOfflineEnvironment(source: PrivateOfflineEnvironment = process.env, root = path.resolve(import.meta.dir, '..')): PrivateOfflineEnvironment {
  const env: PrivateOfflineEnvironment = {};
  for (const name of ['PATH', 'TMPDIR', 'TMP', 'TEMP', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TERM', 'CI']) {
    if (source[name] !== undefined && !CREDENTIAL_NAME.test(name)) env[name] = source[name];
  }
  const preload = path.join(root, 'scripts', 'private-offline-preload.cjs');
  env.BUN_OPTIONS = `--preload=${preload}`;
  env.NODE_OPTIONS = `--require=${preload}`;
  env.BUN_CONFIG_NO_LOAD_DOTENV = '1';
  env.DISABLE_V8_COMPILE_CACHE = '1';
  env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
  env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false';
  return env;
}

async function readBounded(stream: ReadableStream<Uint8Array> | null | undefined): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      if (size < OUTPUT_LIMIT) { const chunk = next.value.slice(0, OUTPUT_LIMIT - size); chunks.push(chunk); size += chunk.length; }
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function readNodeBounded(stream: NodeJS.ReadableStream): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const chunks: Uint8Array[] = []; let size = 0; let done = false;
    const finish = () => {
      if (done) return; done = true;
      stream.removeListener('data', onData); stream.removeListener('error', finish); stream.removeListener('end', finish); stream.removeListener('close', finish);
      const output = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
      resolve(output);
    };
    const onData = (chunk: Uint8Array) => { if (size >= OUTPUT_LIMIT) return; const safe = chunk.slice(0, OUTPUT_LIMIT - size); chunks.push(safe); size += safe.byteLength; };
    stream.on('data', onData); stream.once('error', finish); stream.once('end', finish); stream.once('close', finish);
  });
}

export async function spawnPrivateOffline(argv: readonly string[], options: Parameters<Spawn>[1], timeoutMs = TIMEOUT_MS): Promise<SpawnResult> {
  const [command, ...args] = argv; if (!command) throw new Error('private offline: command failed');
  let child: ChildProcessWithoutNullStreams;
  try { child = spawnNode(command, args, { cwd: options.cwd, env: options.env as NodeJS.ProcessEnv, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' }) as unknown as ChildProcessWithoutNullStreams; } catch { return { exitCode: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }; }
  child.stdin.on('error', () => undefined);
  child.stdin.end();
  let timedOut = false; let interrupted = false;
  const signalGroup = (signal: NodeJS.Signals) => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { try { child.kill(signal); } catch { /* already exited */ } } };
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let termination: Promise<void> | undefined;
  const terminate = () => {
    if (termination) return;
    signalGroup('SIGTERM');
    termination = new Promise((resolve) => {
      killTimer = setTimeout(() => { signalGroup('SIGKILL'); resolve(); }, 1_000);
    });
  };
  const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
  const forward = () => { interrupted = true; terminate(); };
  process.once('SIGINT', forward); process.once('SIGTERM', forward);
  try {
    const stdoutPromise = readNodeBounded(child.stdout);
    const stderrPromise = readNodeBounded(child.stderr);
    const exit = await new Promise<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>>((resolve) => {
      const finish = (value: Readonly<{ code: number | null; signal: NodeJS.Signals | null }>) => { child.removeListener('exit', onExit); child.removeListener('error', onError); resolve(value); };
      const onExit = (code: number | null, signal: NodeJS.Signals | null) => finish({ code, signal });
      const onError = () => finish({ code: 1, signal: null });
      child.once('exit', onExit); child.once('error', onError);
    });
    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
    if (termination) await termination;
    return { exitCode: timedOut ? 124 : interrupted ? 130 : exit.code, signalCode: exit.signal, stdout, stderr };
  } finally { clearTimeout(timer); if (killTimer) clearTimeout(killTimer); process.removeListener('SIGINT', forward); process.removeListener('SIGTERM', forward); }
}

export async function runPrivateOffline(root: string, sourceEnv: PrivateOfflineEnvironment, argv: readonly string[], spawn: Spawn = spawnPrivateOffline): Promise<void> {
  const command = parsePrivateOfflineArguments(argv);
  let result: Awaited<ReturnType<Spawn>>;
  try {
    result = await spawn(
      command,
      { cwd: root, env: createPrivateOfflineEnvironment(sourceEnv, root) },
      privateOfflineTimeoutMs(command),
    );
  } catch {
    throw new Error('private offline: command failed');
  }
  // Deliberately do not include child output: it can contain caller data or a secret.
  if (result.exitCode !== 0 || result.signalCode) throw new Error('private offline: command failed');
}

export async function runPrivateOfflineCli(root: string, sourceEnv: PrivateOfflineEnvironment, execArgv: readonly string[] = process.execArgv, argv: readonly string[] = process.argv): Promise<void> {
  await runPrivateOffline(root, sourceEnv, execArgv.includes('--') ? ['--', ...argv.slice(2)] : []);
}

if (import.meta.main) {
  try {
    await runPrivateOfflineCli(path.resolve(import.meta.dir, '..'), process.env);
  } catch {
    console.error('private offline: command failed');
    process.exitCode = 1;
  }
}
