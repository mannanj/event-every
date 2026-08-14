import { createHash, randomBytes } from 'node:crypto';
import { spawn as spawnNode, type ChildProcessWithoutNullStreams } from 'node:child_process';
import dgram from 'node:dgram';
import dns from 'node:dns';
import { once } from 'node:events';
import { existsSync, lstatSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { Readable } from 'node:stream';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
// @ts-expect-error Node strip-types requires explicit local TypeScript extensions.
import { createCloudflareChildEnvironment } from './run-c1-a-cloudflare.ts';
// @ts-expect-error Node strip-types requires explicit local TypeScript extensions.
import { createPrivatePrivacyEnvironment, PRIVATE_MARKERS } from './run-private-privacy.ts';
import type { PrivateOfflineEnvironment } from './run-private-offline.ts';

const PORT = 8789;
const INTERNAL_MODE = '--internal-harness';
const INTERNAL_ENV = 'PRIVATE_WORKER_E2E_TOKEN';
const READY = 'PRIVATE_WORKER_E2E_READY';
const MODULE_DIR = (import.meta as ImportMeta & { dirname?: string }).dirname ?? path.dirname(fileURLToPath(import.meta.url));
const AUTHORED_INPUTS = ['scripts/c1-a-offline-preload.cjs', 'scripts/private-offline-preload.cjs', 'scripts/run-private-worker-e2e.ts', 'scripts/run-private-worker-e2e.test.ts', 'playwright.private.config.ts', 'e2e/private-provider-state.spec.ts'] as const;
const BASE_CHILD_ENV = ['PATH', 'TMPDIR', 'TMP', 'TEMP', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TERM', 'CI'] as const;
type SignalName = 'SIGINT' | 'SIGTERM' | 'SIGHUP';
type Project = 'chromium' | 'webkit';
type OutputPaths = Readonly<{ openNext: string; wrangler: string; results: string; report: string }>;

export const PRIVATE_WORKER_E2E_STATES = [
  'preflight', 'build', 'harness-started', 'harness-ready', 'browser-started', 'browser-settled',
  'browser-stopped', 'harness-stopped', 'port-closed', 'inputs-verified', 'outputs-removed',
] as const;
export type PrivateWorkerE2EState = typeof PRIVATE_WORKER_E2E_STATES[number];
export type PrivateWorkerE2EChild = Readonly<{
  exited: Promise<number>;
  stdout: ReadableStream<Uint8Array> | number | undefined;
  stderr: ReadableStream<Uint8Array> | number | undefined;
  kill(signal: 'SIGTERM' | 'SIGKILL'): unknown;
}>;
export type PrivateWorkerE2ESeams = Readonly<{
  suffix(): string; token(): string; exists(file: string): boolean; hash(file: string): string;
  probePort(): Promise<void>; build(env: PrivateOfflineEnvironment, signal: AbortSignal): Promise<void>;
  startHarness(env: PrivateOfflineEnvironment, token: string): Promise<PrivateWorkerE2EChild>;
  waitReady(child: PrivateWorkerE2EChild, env: PrivateOfflineEnvironment, signal: AbortSignal): Promise<void>;
  startBrowser(env: PrivateOfflineEnvironment, argv: readonly string[]): Promise<PrivateWorkerE2EChild>;
  stopChild(child: PrivateWorkerE2EChild, label: string): Promise<void>;
  removeOwned(paths: readonly string[]): void;
  subscribeSignals(listener: (signal: SignalName) => void): () => void;
  startupDeadline(): Promise<void>; browserDeadline(): Promise<void>;
}>;

const fail = (message: string): never => { throw new Error(`private worker e2e: ${message}`); };
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const outputPaths = (root: string, suffix: string): OutputPaths => ({
  openNext: path.join(root, '.open-next'), wrangler: path.join(root, '.wrangler'),
  results: path.join(root, `test-results-private-${suffix}`), report: path.join(root, `playwright-report-private-${suffix}`),
});

export function createPrivateWorkerEnvironment(source: PrivateOfflineEnvironment, root: string, suffix: string): PrivateOfflineEnvironment {
  const env = createPrivatePrivacyEnvironment(source, root, suffix);
  if (source.PRIVATE_PRIVACY_CANARY === '1') return env;
  delete env.PRIVATE_PRIVACY_CANARY;
  for (const name of ['TMPDIR', 'TMP', 'TEMP'] as const) {
    if (source[name] === undefined) delete env[name]; else env[name] = source[name];
  }
  return env;
}

export function createPrivateBuildEnvironment(source: PrivateOfflineEnvironment, root: string): PrivateOfflineEnvironment {
  return createCloudflareChildEnvironment(source, root);
}

export function createPrivateBrowserEnvironment(source: PrivateOfflineEnvironment, root = path.resolve(MODULE_DIR, '..')): PrivateOfflineEnvironment {
  const env: PrivateOfflineEnvironment = {};
  for (const name of BASE_CHILD_ENV) if (source[name] !== undefined) env[name] = source[name];
  env.PRIVATE_OUTPUT_SUFFIX = source.PRIVATE_OUTPUT_SUFFIX;
  const preload = path.join(root, 'scripts', 'private-offline-preload.cjs');
  env.NODE_OPTIONS = `--require=${preload}`;
  env.BUN_OPTIONS = `--preload=${preload}`;
  env.BUN_CONFIG_NO_LOAD_DOTENV = '1';
  env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
  env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false';
  return env;
}

export function assertPrivateLoopbackSocketArgs(args: readonly unknown[]): void {
  const first = args[0];
  const host = typeof first === 'number'
    ? args[1]
    : first && typeof first === 'object'
      ? (first as { hostname?: unknown; host?: unknown }).hostname ?? (first as { host?: unknown }).host
      : undefined;
  const normalized = typeof host === 'string' ? host.toLowerCase().replace(/^\[|\]$/g, '') : '';
  if (!['127.0.0.1', 'localhost', '::1'].includes(normalized)) fail('non-loopback socket');
}

function parseArgs(argv: readonly string[]): Readonly<{ project?: Project }> {
  if (!argv.length) return {};
  if (argv.length === 1 && (argv[0] === '--project=chromium' || argv[0] === '--project=webkit')) return { project: argv[0].slice(10) as Project };
  return fail('arguments');
}

function playwrightArgv(project?: Project): readonly string[] {
  const argv = ['node', 'node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.private.config.ts'];
  if (project) argv.push(`--project=${project}`);
  return argv;
}

async function probePort(): Promise<void> {
  const server = net.createServer();
  try { server.listen(PORT, '127.0.0.1'); await once(server, 'listening'); }
  catch { fail('port preflight'); }
  finally { if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve())); }
}

async function drain(stream: ReadableStream<Uint8Array> | number | undefined): Promise<string> {
  if (!stream || typeof stream === 'number') return '';
  const reader = stream.getReader(); const decoder = new TextDecoder(); let output = ''; let carry = '';
  const forbidden = [PRIVATE_MARKERS.raw, PRIVATE_MARKERS.provider, PRIVATE_MARKERS.secret, PRIVATE_MARKERS.result];
  const longest = Math.max(...forbidden.map((value) => value.length));
  const inspect = (value: string) => { if (forbidden.some((marker) => value.includes(marker))) fail('marker leak'); };
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      const text = decoder.decode(next.value, { stream: true }); inspect(carry + text);
      carry = (carry + text).slice(-longest + 1);
      if (output.length < 65_536) output += text.slice(0, 65_536 - output.length);
    }
    const tail = decoder.decode(); inspect(carry + tail);
    return (output + tail.slice(0, Math.max(0, 65_536 - output.length))).slice(0, 65_536);
  }
  finally { reader.releaseLock(); }
}

async function supervised(argv: readonly string[], root: string, env: PrivateOfflineEnvironment, signal: AbortSignal): Promise<void> {
  const child = spawnGrouped(argv, root, env);
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= stopChildDefault(child);
  const abort = () => { void stop(); }; signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const outputs = [drain(child.stdout), drain(child.stderr)];
  try {
    const [code, stdout, stderr] = await Promise.all([child.exited, ...outputs]);
    if ([stdout, stderr].some((value) => [PRIVATE_MARKERS.raw, PRIVATE_MARKERS.provider, PRIVATE_MARKERS.secret, PRIVATE_MARKERS.result].some((marker) => value.includes(marker)))) fail('marker leak');
    if (code !== 0) fail('build');
  } catch (error) {
    await stop(); await Promise.allSettled(outputs); throw error;
  } finally { signal.removeEventListener('abort', abort); }
}

async function buildDefault(root: string, env: PrivateOfflineEnvironment, signal: AbortSignal): Promise<void> {
  await supervised(['node', 'node_modules/@opennextjs/cloudflare/dist/cli/index.js', 'build'], root, createPrivateBuildEnvironment(env, root), signal);
  if (!existsSync(path.join(root, '.open-next', 'worker.js'))) fail('build');
}

function spawnGrouped(argv: readonly string[], root: string, env: PrivateOfflineEnvironment): PrivateWorkerE2EChild {
  const [command, ...args] = argv;
  if (!command) return fail('child invocation');
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawnNode(command, args, {
      cwd: root, env: env as NodeJS.ProcessEnv, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.end();
  } catch { return fail('child invocation'); }
  const exited = new Promise<number>((resolve) => {
    let done = false;
    const finish = (code: number | null) => { if (!done) { done = true; resolve(code ?? 1); } };
    child.once('exit', finish); child.once('error', () => finish(1));
  });
  const kill = (signal: 'SIGTERM' | 'SIGKILL') => {
    try {
      if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch { try { child.kill(signal); } catch { /* already exited */ } }
  };
  return {
    exited,
    stdout: Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>,
    stderr: Readable.toWeb(child.stderr) as unknown as ReadableStream<Uint8Array>,
    kill,
  };
}

async function startHarnessDefault(root: string, env: PrivateOfflineEnvironment, token: string): Promise<PrivateWorkerE2EChild> {
  const childEnv: PrivateOfflineEnvironment = { ...env, [INTERNAL_ENV]: token };
  delete childEnv.NODE_OPTIONS; delete childEnv.BUN_OPTIONS;
  return spawnGrouped(['node', '--no-warnings', '--experimental-strip-types', path.join(root, 'scripts/run-private-worker-e2e.ts'), INTERNAL_MODE, token], root, childEnv);
}

async function waitReadyDefault(child: PrivateWorkerE2EChild, _env: PrivateOfflineEnvironment, signal: AbortSignal): Promise<void> {
  if (!child.stdout || typeof child.stdout === 'number') return fail('harness readiness');
  const reader = child.stdout.getReader(); const decoder = new TextDecoder(); let value = '';
  const abort = () => { void reader.cancel(); }; signal.addEventListener('abort', abort, { once: true });
  try { while (!value.includes('\n')) { const next = await reader.read(); if (next.done) break; value += decoder.decode(next.value, { stream: true }); if (value.length > 256) break; } if (value !== `${READY}\n`) fail('harness readiness'); }
  finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}

async function startBrowserDefault(root: string, env: PrivateOfflineEnvironment, argv: readonly string[]): Promise<PrivateWorkerE2EChild> {
  return spawnGrouped(argv, root, createPrivateBrowserEnvironment(env, root));
}

async function stopChildDefault(child: PrivateWorkerE2EChild): Promise<void> {
  const done = child.exited.then(() => true, () => true); child.kill('SIGTERM');
  const delay = new Promise<false>((resolve) => { const timer = setTimeout(() => resolve(false), 2_000); timer.unref?.(); });
  if (await Promise.race([done, delay])) return;
  child.kill('SIGKILL'); await child.exited.catch(() => undefined);
}

function removeOwnedDefault(paths: readonly string[]): void {
  for (const target of paths) if (existsSync(target)) { const meta = lstatSync(target); if (meta.isSymbolicLink()) fail('output cleanup'); rmSync(target, { recursive: meta.isDirectory(), force: false }); }
}

function subscribeSignalsDefault(listener: (signal: SignalName) => void): () => void {
  const entries = (['SIGINT', 'SIGTERM', 'SIGHUP'] as const).map((signal) => { const handler = () => listener(signal); process.once(signal, handler); return [signal, handler] as const; });
  return () => entries.forEach(([signal, handler]) => process.removeListener(signal, handler));
}

const deadline = (ms: number): Promise<void> => new Promise((resolve) => { const timer = setTimeout(resolve, ms); timer.unref?.(); });

function defaultSeams(root: string): PrivateWorkerE2ESeams {
  return {
    suffix: () => randomBytes(6).toString('hex'), token: () => randomBytes(32).toString('hex'), exists: existsSync, hash,
    probePort, build: (env, signal) => buildDefault(root, env, signal),
    startHarness: (env, token) => startHarnessDefault(root, env, token), waitReady: waitReadyDefault,
    startBrowser: (env, argv) => startBrowserDefault(root, env, argv), stopChild: (child) => stopChildDefault(child),
    removeOwned: removeOwnedDefault, subscribeSignals: subscribeSignalsDefault,
    startupDeadline: () => deadline(45_000), browserDeadline: () => deadline(240_000),
  };
}

export async function runPrivateWorkerE2E(
  argv: readonly string[] = [], root = path.resolve(MODULE_DIR, '..'), seams: PrivateWorkerE2ESeams = defaultSeams(root),
  source: PrivateOfflineEnvironment = process.env,
): Promise<readonly PrivateWorkerE2EState[]> {
  const parsed = parseArgs(argv); const parentOwnsOutputs = source.PRIVATE_PRIVACY_CANARY === '1';
  const suffix = parentOwnsOutputs ? source.PRIVATE_OUTPUT_SUFFIX ?? '' : seams.suffix(); const token = seams.token();
  if (!/^[a-f0-9]{12}$/.test(suffix) || !/^[a-f0-9]{64}$/.test(token)) fail('invocation');
  const outputs = Object.values(outputPaths(root, suffix));
  await seams.probePort().catch(() => fail('port preflight'));
  if (outputs.some(seams.exists)) fail('owned output collision');
  const files = AUTHORED_INPUTS.map((file) => path.join(root, file)); const hashes = new Map(files.map((file) => [file, seams.hash(file)]));
  const states: PrivateWorkerE2EState[] = ['preflight']; const env = createPrivateWorkerEnvironment(source, root, suffix);
  const controller = new AbortController(); let cancellation: Error | undefined; let rejectCancel!: (error: Error) => void;
  const cancelled = new Promise<never>((_resolve, reject) => { rejectCancel = reject; }); void cancelled.catch(() => undefined);
  const cancel = (error: Error) => { if (!cancellation) { cancellation = error; controller.abort(); rejectCancel(error); } };
  const unsubscribe = seams.subscribeSignals((signal) => cancel(new Error(`private worker e2e: aborted (${signal})`)));
  let harness: PrivateWorkerE2EChild | undefined; let browser: PrivateWorkerE2EChild | undefined; let primary: Error | undefined;
  let buildTask: Promise<void> | undefined;
  let startupFinished = false; let browserFinished = false; let harnessStdoutDraining = false;
  const late: Promise<void>[] = [];
  const drains: Promise<string>[] = [];
  const watchDrain = (promise: Promise<string>) => { drains.push(promise); void promise.catch(() => undefined); return promise; };
  const acquire = async (promise: Promise<PrivateWorkerE2EChild>, label: string): Promise<PrivateWorkerE2EChild> => {
    let handed = false;
    const watched = promise.then(async (value) => { if (cancellation && !handed) { await seams.stopChild(value, label); throw cancellation; } return value; });
    late.push(watched.then(() => undefined, () => undefined)); const value = await Promise.race([watched, cancelled]); handed = true; return value;
  };
  try {
    buildTask = seams.build(env, controller.signal);
    await Promise.race([buildTask, cancelled]); buildTask = undefined; states.push('build');
    const startup = seams.startupDeadline().then(() => { if (!startupFinished) cancel(new Error('private worker e2e: harness startup timeout')); }); void startup.catch(() => undefined);
    harness = await acquire(seams.startHarness(env, token), 'harness'); states.push('harness-started');
    watchDrain(drain(harness.stderr));
    await Promise.race([seams.waitReady(harness, env, controller.signal), cancelled]); states.push('harness-ready');
    startupFinished = true; harnessStdoutDraining = true; watchDrain(drain(harness.stdout));
    browser = await acquire(seams.startBrowser(env, playwrightArgv(parsed.project)), 'browser'); states.push('browser-started');
    const browserOutput = [watchDrain(drain(browser.stdout)), watchDrain(drain(browser.stderr))];
    const browserTimeout = seams.browserDeadline().then(() => { if (!browserFinished) cancel(new Error('private worker e2e: browser timeout')); }); void browserTimeout.catch(() => undefined);
    const outcome = await Promise.race([browser.exited.then((code) => ({ type: 'browser' as const, code })), harness.exited.then((code) => ({ type: 'harness' as const, code })), cancelled]);
    browserFinished = true;
    if (outcome.type === 'harness') fail('harness exited'); if (outcome.code !== 0) fail('browser failed');
    await Promise.all(browserOutput); states.push('browser-settled');
  } catch (error) { primary = error instanceof Error && error.message.startsWith('private worker e2e:') ? error : new Error('private worker e2e: failed'); }
  finally {
    startupFinished = true; browserFinished = true;
    const cleanup: Error[] = [];
    if (buildTask) {
      const settled = await Promise.allSettled([buildTask]);
      if (settled[0]?.status === 'rejected' && !primary) cleanup.push(new Error('private worker e2e: build cleanup'));
      buildTask = undefined;
    }
    if (harness && !harnessStdoutDraining) { harnessStdoutDraining = true; watchDrain(drain(harness.stdout)); }
    if (browser) try { await seams.stopChild(browser, 'browser'); states.push('browser-stopped'); } catch { cleanup.push(new Error('private worker e2e: browser cleanup')); }
    if (harness) try { await seams.stopChild(harness, 'harness'); states.push('harness-stopped'); } catch { cleanup.push(new Error('private worker e2e: harness cleanup')); }
    for (const result of await Promise.allSettled(drains)) if (result.status === 'rejected') {
      const error = result.reason instanceof Error && result.reason.message.startsWith('private worker e2e:') ? result.reason : new Error('private worker e2e: child output');
      if (error.message !== primary?.message) cleanup.push(error);
    }
    await Promise.allSettled(late);
    try { await seams.probePort(); states.push('port-closed'); } catch { cleanup.push(new Error('private worker e2e: port closure')); }
    let authoredChanged = false;
    for (const file of files) try { if (seams.hash(file) !== hashes.get(file)) authoredChanged = true; } catch { authoredChanged = true; }
    if (authoredChanged) cleanup.push(new Error('private worker e2e: authored input changed'));
    if (!cleanup.some((error) => error.message.includes('authored input'))) states.push('inputs-verified');
    if (!parentOwnsOutputs) try { seams.removeOwned(outputs); states.push('outputs-removed'); } catch { cleanup.push(new Error('private worker e2e: output cleanup')); }
    unsubscribe();
    if (primary && cleanup.length) throw new AggregateError([primary, ...cleanup], 'private worker e2e: failed');
    if (primary) throw primary; if (cleanup.length === 1) throw cleanup[0]; if (cleanup.length) throw new AggregateError(cleanup, 'private worker e2e: cleanup');
  }
  return states;
}

type Harness = Readonly<{ listen(): Promise<unknown>; close(): Promise<void>; fetch(input: string | URL, init?: RequestInit): Promise<Response> }>;

function providerBody(): object {
  const claim = <T>(value: T) => ({ value, confidence: null, evidence: [] });
  return {
    choices: [{ finish_reason: 'stop', refusal: null, message: { content: JSON.stringify({ candidates: [{
      sourceUid: null,
      title: claim(PRIVATE_MARKERS.result),
      description: claim('Synthetic description'),
      location: claim('Synthetic location'),
      url: claim('https://example.invalid/event'),
      temporal: claim({
        start: { kind: 'floating', date: { year: 2026, month: 8, day: 14 }, time: { hour: 12, minute: 0, second: 0 } },
        end: null, duration: null, allDay: false,
      }),
      recurrence: claim({
        rule: { frequency: 'DAILY', interval: 1, count: 1, until: null, byMonth: [], byMonthDay: [], byDay: [], weekStart: null },
        rDates: [], exDates: [],
      }),
      issues: [],
    }], issues: [] }) } }],
    usage: { cost: 0.000000001 }, provider_debug: PRIVATE_MARKERS.provider,
  };
}

function providerResponse(): Response {
  const body = JSON.stringify(providerBody()).replace('"cost":1e-9', '"cost":0.000000001');
  return new Response(body, { headers: { 'Content-Type': 'application/json' } });
}

function privateUsageResponse(): Response {
  const authorityDay = new Date().toISOString().slice(0, 10);
  const resetAt = new Date(Date.parse(`${authorityDay}T00:00:00.000Z`) + 86_400_000).toISOString();
  return Response.json({
    status: 'available', policyVersion: 'owner-v1', authorityDay,
    limitNanodollars: 5_000_000_000, spentNanodollars: 0, reservedNanodollars: 0,
    remainingNanodollars: 5_000_000_000, exhausted: false, frozen: false, resetAt,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export function installPrivateHarnessEgressGuard(): Readonly<{ close(): void }> {
  const originalNetConnect = net.connect;
  const originalNetCreateConnection = net.createConnection;
  const originalTlsConnect = tls.connect;
  const dnsMethods = ['lookup', 'lookupService', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCaa', 'resolveCname', 'resolveMx', 'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse'] as const;
  const mutableDns = dns as unknown as Record<string, (...args: never[]) => unknown>;
  const mutableDnsPromises = dns.promises as unknown as Record<string, (...args: never[]) => unknown>;
  const mutableDnsResolver = dns as unknown as { Resolver: typeof dns.Resolver };
  const OriginalDnsResolver = mutableDnsResolver.Resolver;
  const originalDns = new Map<string, (...args: never[]) => unknown>();
  const originalDnsPromises = new Map<string, (...args: never[]) => unknown>();
  const originalDgramCreateSocket = dgram.createSocket;
  const bunRuntime = (globalThis as unknown as { Bun?: { udpSocket?: (...args: never[]) => unknown } }).Bun;
  const originalBunUdp = bunRuntime?.udpSocket;
  const guard = <T extends (...args: never[]) => unknown>(original: T): T => function privateLoopbackSocket(this: unknown, ...args: never[]) {
    assertPrivateLoopbackSocketArgs(args);
    return original.apply(this, args);
  } as T;
  net.connect = guard(net.connect);
  net.createConnection = guard(net.createConnection);
  tls.connect = guard(tls.connect);
  for (const method of dnsMethods) {
    if (typeof mutableDns[method] === 'function') {
      originalDns.set(method, mutableDns[method]!);
      mutableDns[method] = function privateHarnessDns(...args: never[]) { assertPrivateLoopbackSocketArgs([{ host: args[0] }]); return originalDns.get(method)!.apply(this, args); };
    }
    if (typeof mutableDnsPromises[method] === 'function') {
      originalDnsPromises.set(method, mutableDnsPromises[method]!);
      mutableDnsPromises[method] = function privateHarnessDnsPromise(...args: never[]) { assertPrivateLoopbackSocketArgs([{ host: args[0] }]); return originalDnsPromises.get(method)!.apply(this, args); };
    }
  }
  mutableDnsResolver.Resolver = function PrivateHarnessResolver(...constructorArgs: ConstructorParameters<typeof dns.Resolver>) {
    const resolver = new OriginalDnsResolver(...constructorArgs);
    const mutableResolver = resolver as unknown as Record<string, (...args: never[]) => unknown>;
    for (const method of dnsMethods.filter((name) => name.startsWith('resolve') || name === 'reverse')) {
      const original = mutableResolver[method];
      if (typeof original === 'function') mutableResolver[method] = function privateHarnessResolver(...args: never[]) {
        assertPrivateLoopbackSocketArgs([{ host: args[0] }]);
        return original.apply(this, args);
      };
    }
    return resolver;
  } as unknown as typeof dns.Resolver;
  dgram.createSocket = function privateHarnessDgram(): never { return fail('non-loopback socket'); } as typeof dgram.createSocket;
  if (bunRuntime && originalBunUdp) bunRuntime.udpSocket = function privateHarnessBunUdp(): never { return fail('non-loopback socket'); };
  return { close: () => {
    net.connect = originalNetConnect; net.createConnection = originalNetCreateConnection; tls.connect = originalTlsConnect;
    for (const [method, original] of originalDns) mutableDns[method] = original;
    for (const [method, original] of originalDnsPromises) mutableDnsPromises[method] = original;
    mutableDnsResolver.Resolver = OriginalDnsResolver;
    dgram.createSocket = originalDgramCreateSocket;
    if (bunRuntime && originalBunUdp) bunRuntime.udpSocket = originalBunUdp;
  } };
}

async function runInternalHarness(root: string, token: string): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(token) || process.env[INTERNAL_ENV] !== token) fail('internal invocation');
  const { setupServer } = await import('msw/node'); const { http } = await import('msw');
  let calls = 0; let started = false; let resume!: () => void; let resumed = new Promise<void>((resolve) => { resume = resolve; });
  const reset = () => { calls = 0; started = false; resumed = new Promise<void>((resolve) => { resume = resolve; }); };
  const providerServer = setupServer(http.post('https://openrouter.ai/api/v1/chat/completions', async () => {
    calls += 1; started = true;
    await resumed;
    return providerResponse();
  }));
  const guard = installPrivateHarnessEgressGuard();
  let harness: Harness | undefined; let bridge: ReturnType<typeof createServer> | undefined;
  try {
    providerServer.listen({ onUnhandledRequest: 'error' });
    const { createTestHarness } = await import('wrangler');
    harness = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', vars: {
      IDENTITY_HMAC_CURRENT: 'synthetic-private-identity-hmac', RESOLVER_CAPABILITY_HMAC: 'synthetic-private-resolver-hmac',
      OPENROUTER_OWNER_KEY: PRIVATE_MARKERS.secret, PROVIDER_REQUEST_HMAC_CURRENT: 'synthetic-private-request-hmac',
      PROVIDER_REQUEST_HMAC_CURRENT_VERSION: 'c1-b-current-v1', PROVIDER_POLICY_VERSION: 'owner-v1', STATE_AUTHORITY_MODE: 'cloudflare',
    } }] }) as unknown as Harness;
    await harness.listen();
    bridge = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
    if (url.pathname === '/__private-canary/state') return void response.end(JSON.stringify({ calls, started }));
    if (url.pathname === '/__private-canary/resume') { resume(); return void response.end('{}'); }
    if (url.pathname === '/__private-canary/reset') { reset(); return void response.end('{}'); }
    try {
      if (url.pathname === '/api/usage' && request.method === 'GET') {
        const usage = privateUsageResponse();
        response.statusCode = usage.status;
        usage.headers.forEach((value, name) => response.setHeader(name, value));
        return void response.end(new Uint8Array(await usage.arrayBuffer()));
      }
      const headers = new Headers(); for (const [name, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      const method = request.method ?? 'GET'; const init: RequestInit = { method, headers };
      if (method !== 'GET' && method !== 'HEAD') Object.assign(init, { body: Readable.toWeb(request) as unknown as ReadableStream, duplex: 'half' });
      const workerResponse = await harness!.fetch(`http://127.0.0.1:${PORT}${request.url ?? '/'}`, init);
      response.statusCode = workerResponse.status; workerResponse.headers.forEach((value, name) => response.setHeader(name, value)); response.end(new Uint8Array(await workerResponse.arrayBuffer()));
    } catch { response.statusCode = 502; response.end('{}'); }
    });
    bridge.listen(PORT, '127.0.0.1'); await once(bridge, 'listening'); process.stdout.write(`${READY}\n`);
    await new Promise<void>((resolve) => { process.once('SIGTERM', () => resolve()); process.once('SIGINT', () => resolve()); });
  } finally {
    if (bridge?.listening) await new Promise<void>((resolve) => bridge!.close(() => resolve()));
    if (harness) await harness.close();
    providerServer.close();
    guard.close();
  }
}

if (import.meta.main) {
  const root = path.resolve(MODULE_DIR, '..'); const argv = process.argv.slice(2);
  try { if (argv[0] === INTERNAL_MODE) await runInternalHarness(root, argv[1] ?? ''); else await runPrivateWorkerE2E(argv, root); }
  catch (error) {
    const message = error instanceof Error && error.message.startsWith('private worker e2e:')
      ? error.message
      : 'private worker e2e: failed';
    process.stderr.write(`${message}\n`); process.exitCode = 1;
  }
}
