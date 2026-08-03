import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import net from 'node:net';
import tls from 'node:tls';
import path from 'node:path';
import { Readable } from 'node:stream';
import { assertNoWranglerLocalFiles, createCloudflareChildEnvironment, CREDENTIAL_NAME, installCloudflareProcessBoundary, type C1AEnvironment } from './run-c1-a-cloudflare';

const PORT = 8788;
const MAX_CHILD_OUTPUT = 64 * 1024;
const PLAYWRIGHT_TITLES = [
  'community exhaustion exposes no pattern or admin bypass',
  'corrupt Scanner review storage recovers and persists the next scan',
  'URL-only scan waits through resolver rollover and busy responses then succeeds',
] as const;
const AUTHORED_INPUTS = ['open-next.config.ts', 'wrangler.jsonc', 'next.config.js', 'playwright.c1-a.config.ts', 'vitest.config.workers.ts'] as const;

export const C1_A_WORKER_E2E_STATES = [
  'preflight', 'process-boundary-installed', 'build', 'egress-guard-started', 'harness-created', 'harness-listening', 'http-ready', 'playwright-started', 'playwright-settled', 'playwright-stopped', 'server-closed', 'harness-closed', 'egress-guard-closed', 'outputs-removed',
] as const;
export type C1AWorkerE2EState = typeof C1_A_WORKER_E2E_STATES[number];

export const C1_A_HARNESS_VARS = {
  IDENTITY_HMAC_CURRENT: 'synthetic-c1-a-identity-key',
  RESOLVER_CAPABILITY_HMAC: 'synthetic-c1-a-capability-key',
  OPENROUTER_COMMUNITY_KEY: 'synthetic-c1-a-never-sent',
} as const;

type ParsedArgs = Readonly<{ project?: 'chromium' | 'webkit'; grep?: typeof PLAYWRIGHT_TITLES[number] }>;
type Harness = Readonly<{ listen(): Promise<unknown>; close(): Promise<void>; fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> }>;
type EgressGuard = Readonly<{ assertOutboundCanary(): void; close(): void }>;
type Child = Readonly<{ exited: Promise<number>; kill(signal: 'SIGTERM' | 'SIGKILL'): unknown }>;
type ClosableServer = Readonly<{ close(): Promise<void> }>;
type OutputPaths = Readonly<{ openNext: string; wrangler: string; results: string; report: string }>;
type SignalName = 'SIGINT' | 'SIGTERM' | 'SIGHUP';

export type C1AWorkerE2ESeams = Readonly<{
  randomSuffix(): string;
  assertNoWranglerLocalFiles(root: string): void;
  probePortFree(): Promise<void>;
  exists(file: string): boolean;
  hash(file: string): string;
  installCloudflareProcessBoundary(root: string): void;
  createChildEnvironment(root: string, suffix: string): C1AEnvironment;
  build(root: string, env: C1AEnvironment, signal: AbortSignal): Promise<void>;
  startEgressGuard(): Promise<EgressGuard>;
  createHarness(vars: typeof C1_A_HARNESS_VARS): Promise<Harness>;
  runOutboundCanary(harness: Harness, guard: EgressGuard): Promise<void>;
  startBridge(harness: Harness): Promise<ClosableServer>;
  awaitReady(signal: AbortSignal): Promise<void>;
  startPlaywright(root: string, env: C1AEnvironment, argv: readonly string[]): Promise<Child>;
  stopChild(child: Child): Promise<void>;
  assertPortClosed(): Promise<void>;
  removeOwned(paths: OutputPaths): void;
  subscribeSignals(listener: (signal: SignalName) => void): () => void;
}>;

function fail(message: string): never { throw new Error(`c1-a worker e2e: ${message}`); }
function asFailure(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith('c1-a worker e2e:')) return error;
  return new Error('c1-a worker e2e: failed');
}
async function guarded<T>(label: string, action: () => Promise<T> | T): Promise<T> {
  try { return await action(); } catch (error) {
    if (error instanceof Error && error.message.startsWith('c1-a worker e2e:')) throw error;
    fail(`${label} failed`);
  }
}
function outputPaths(root: string, suffix: string): OutputPaths {
  return { openNext: path.join(root, '.open-next'), wrangler: path.join(root, '.wrangler'), results: path.join(root, `test-results-c1-a-${suffix}`), report: path.join(root, `playwright-report-c1-a-${suffix}`) };
}
function hash(file: string): string { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
export function createC1AWorkerE2EEnvironment(source: C1AEnvironment, root: string, suffix: string): C1AEnvironment {
  return { ...createCloudflareChildEnvironment(source, root), C1_A_OUTPUT_SUFFIX: suffix };
}
function childEnvironment(root: string, suffix: string): C1AEnvironment { return createC1AWorkerE2EEnvironment(process.env, root, suffix); }

function redactionNeedles(env: C1AEnvironment): string[] {
  const needles: string[] = [];
  for (const [name, value] of [...Object.entries(env), ...Object.entries(C1_A_HARNESS_VARS)]) {
    if (CREDENTIAL_NAME.test(name)) needles.push(name);
    if (value) needles.push(value);
  }
  return [...new Set(needles)].sort((left, right) => right.length - left.length);
}

export async function drainChildOutput(output: ReadableStream<Uint8Array> | number | undefined, env: C1AEnvironment): Promise<string> {
  if (!output || typeof output === 'number') return '';
  const reader = output.getReader();
  const decoder = new TextDecoder();
  const needles = redactionNeedles(env);
  const longest = Math.max(1, ...needles.map((value) => value.length));
  let captured = '';
  let pending = '';
  const consume = (final = false): void => {
    const limit = final ? pending.length : Math.max(0, pending.length - longest + 1);
    let index = 0;
    while (index < limit) {
      const match = needles.find((needle) => pending.startsWith(needle, index));
      const value = match ? '[redacted]' : pending[index];
      if (captured.length < MAX_CHILD_OUTPUT) captured += value.slice(0, MAX_CHILD_OUTPUT - captured.length);
      index += match?.length ?? 1;
    }
    pending = pending.slice(index);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      consume();
    }
    pending += decoder.decode();
    consume(true);
  } finally {
    reader.releaseLock();
  }
  return captured;
}

export function parseC1AWorkerE2EArgs(argv: readonly string[]): ParsedArgs {
  const parsed: { project?: 'chromium' | 'webkit'; grep?: typeof PLAYWRIGHT_TITLES[number] } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith('--project=')) {
      const project = value.slice('--project='.length);
      if ((project !== 'chromium' && project !== 'webkit') || parsed.project) fail('arguments');
      parsed.project = project;
    } else if (value === '--grep') {
      const grep = argv[++index];
      if (!grep || !PLAYWRIGHT_TITLES.includes(grep as typeof PLAYWRIGHT_TITLES[number]) || parsed.grep) fail('arguments');
      parsed.grep = grep as typeof PLAYWRIGHT_TITLES[number];
    } else {
      fail('arguments');
    }
  }
  return parsed;
}

async function probePortFree(): Promise<void> {
  const server = net.createServer();
  try {
    server.listen(PORT, '127.0.0.1');
    await once(server, 'listening');
  } catch {
    fail('port 8788 unavailable');
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function runChild(argv: readonly string[], root: string, env: C1AEnvironment, label: string, signal: AbortSignal): Promise<void> {
  let child: ReturnType<typeof Bun.spawn>;
  try { child = Bun.spawn([...argv], { cwd: root, env, stdout: 'pipe', stderr: 'pipe' }); } catch { fail(`${label} start failed`); }
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => {
    child.kill('SIGTERM');
    killTimer = setTimeout(() => child.kill('SIGKILL'), 25);
  };
  signal.addEventListener('abort', abort, { once: true });
  const [code, stdout, stderr] = await Promise.all([child.exited, drainChildOutput(child.stdout, env), drainChildOutput(child.stderr, env)]).finally(() => {
    signal.removeEventListener('abort', abort);
    if (killTimer) clearTimeout(killTimer);
  });
  if (code !== 0) fail(`${label} failed (${code}): ${stderr || stdout}`);
}

async function build(root: string, env: C1AEnvironment, signal: AbortSignal): Promise<void> {
  await runChild(['node', 'node_modules/@opennextjs/cloudflare/dist/cli/index.js', 'build'], root, env, 'build', signal);
  if (!existsSync(path.join(root, '.open-next', 'worker.js'))) fail('missing .open-next/worker.js');
}

async function createHarness(vars: typeof C1_A_HARNESS_VARS): Promise<Harness> {
  // This import must remain after build and the process boundary installation.
  const { createTestHarness } = await import('wrangler');
  return createTestHarness({ workers: [{ configPath: './wrangler.jsonc', vars }] }) as unknown as Harness;
}

function isLoopback(url: string): boolean {
  const hostname = new URL(url).hostname;
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]';
}

function isLoopbackSocketArgs(args: readonly unknown[]): boolean {
  const first = args[0];
  const host = typeof first === 'number'
    ? args[1]
    : first && typeof first === 'object'
      ? (first as { host?: unknown; hostname?: unknown }).hostname ?? (first as { host?: unknown }).host
      : undefined;
  return typeof host === 'string' && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host.toLowerCase());
}

export async function startEgressGuard(): Promise<EgressGuard> {
  const { setupServer } = await import('msw/node');
  const { http, passthrough } = await import('msw');
  const observedOrigins: string[] = [];
  let nonLoopbackNodeSocketAttempts = 0;
  const originalNetConnect = net.connect;
  const originalNetCreateConnection = net.createConnection;
  const originalTlsConnect = tls.connect;
  const observe = <T extends (...args: never[]) => unknown>(original: T): T => function observedSocket(this: unknown, ...args: never[]) {
    if (!isLoopbackSocketArgs(args)) nonLoopbackNodeSocketAttempts += 1;
    return original.apply(this, args);
  } as T;
  net.connect = observe(net.connect);
  net.createConnection = observe(net.createConnection);
  tls.connect = observe(tls.connect);
  const server = setupServer(
    http.all(/^https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/|$)/, ({ request }) => {
      if (!isLoopback(request.url)) fail('non-loopback egress');
      return passthrough();
    }),
  );
  server.events.on('request:unhandled', ({ request }) => observedOrigins.push(new URL(request.url).origin));
  try { server.listen({ onUnhandledRequest: 'error' }); } catch (error) {
    net.connect = originalNetConnect;
    net.createConnection = originalNetCreateConnection;
    tls.connect = originalTlsConnect;
    throw error;
  }
  return {
    assertOutboundCanary: () => {
      if (observedOrigins.length !== 1 || observedOrigins[0] !== 'https://openrouter.ai') fail('outbound canary origin');
      if (nonLoopbackNodeSocketAttempts !== 0) fail('outbound canary socket');
    },
    close: () => {
      net.connect = originalNetConnect;
      net.createConnection = originalNetCreateConnection;
      tls.connect = originalTlsConnect;
      server.close();
    },
  };
}

export async function runOutboundCanary(harness: Harness, guard: EgressGuard): Promise<void> {
  const response = await harness.fetch('http://127.0.0.1:8788/api/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:8788', 'cf-connecting-ip': '203.0.113.10', 'X-Event-Every-Request-Id': '018f47a0-7b5c-7cc4-9a34-123456789abc' },
    body: JSON.stringify({ kind: 'text', text: 'C1-A outbound canary' }),
  });
  let body: unknown;
  try { body = await response.json(); } catch { fail('outbound canary response'); }
  if (response.status !== 502 || !body || typeof body !== 'object' || (body as { error?: unknown }).error !== 'scan_provider_failed') fail('outbound canary response');
  guard.assertOutboundCanary();
}

function requestFromNode(req: IncomingMessage): Request {
  const url = `http://127.0.0.1:${PORT}${req.url || '/'}`;
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  const method = req.method || 'GET';
  return new Request(url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : Readable.toWeb(req) as unknown as ReadableStream, duplex: 'half' } as RequestInit);
}

function streamResponse(response: Response, output: ServerResponse): void {
  output.statusCode = response.status;
  response.headers.forEach((value, name) => output.setHeader(name, value));
  if (!response.body) return void output.end();
  const pump = async (): Promise<void> => {
    const reader = response.body!.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!output.write(value)) await once(output, 'drain');
      }
      output.end();
    } finally { reader.releaseLock(); }
  };
  void pump().catch(() => output.destroy());
}

async function startBridge(harness: Harness): Promise<ClosableServer> {
  const server = createServer((req, res) => void harness.fetch(requestFromNode(req)).then((response) => streamResponse(response, res), () => { res.statusCode = 502; res.end(); }));
  server.listen(PORT, '127.0.0.1');
  await once(server, 'listening');
  return { close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

async function awaitReady(signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (signal.aborted) fail('aborted');
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/auth/check`)).status > 0) return; } catch { /* bounded loopback readiness poll */ }
    await Bun.sleep(100);
  }
  fail('readiness timeout');
}

function playwrightArgv(parsed: ParsedArgs): string[] {
  const argv = ['node', 'node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.c1-a.config.ts'];
  if (parsed.project) argv.push(`--project=${parsed.project}`);
  if (parsed.grep) argv.push('--grep', parsed.grep);
  return argv;
}

async function startPlaywright(root: string, env: C1AEnvironment, argv: readonly string[]): Promise<Child> {
  let processChild: ReturnType<typeof Bun.spawn>;
  try { processChild = Bun.spawn([...argv], { cwd: root, env, stdout: 'pipe', stderr: 'pipe' }); } catch { fail('playwright start failed'); }
  // Drain pipes immediately so a chatty failing browser process cannot block on a full pipe.
  void Promise.all([drainChildOutput(processChild.stdout, env), drainChildOutput(processChild.stderr, env)]);
  return { exited: processChild.exited, kill: (signal) => processChild.kill(signal) };
}

async function stopChild(child: Child): Promise<void> {
  const completion = child.exited.then(() => undefined, () => undefined);
  child.kill('SIGTERM');
  await Promise.race([completion, Bun.sleep(2_000)]);
  child.kill('SIGKILL');
  await Promise.race([completion, Bun.sleep(2_000).then(() => fail('playwright did not terminate'))]);
}

function removeOwned(paths: OutputPaths): void {
  for (const target of Object.values(paths)) if (existsSync(target)) rmSync(target, { recursive: true, force: false });
}

function subscribeSignals(listener: (signal: SignalName) => void): () => void {
  const handlers = new Map<SignalName, () => void>();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    const handler = () => listener(signal);
    handlers.set(signal, handler);
    process.once(signal, handler);
  }
  return () => { for (const [signal, handler] of handlers) process.removeListener(signal, handler); };
}

const DEFAULT_SEAMS: C1AWorkerE2ESeams = {
  randomSuffix: () => randomBytes(6).toString('hex'), assertNoWranglerLocalFiles, probePortFree, exists: existsSync, hash,
  installCloudflareProcessBoundary, createChildEnvironment: childEnvironment, build, startEgressGuard, createHarness,
  runOutboundCanary, startBridge, awaitReady, startPlaywright, stopChild, assertPortClosed: probePortFree, removeOwned, subscribeSignals,
};

export async function runC1AWorkerE2E(argv: readonly string[] = [], root = path.resolve(import.meta.dir, '..'), seams: C1AWorkerE2ESeams = DEFAULT_SEAMS): Promise<readonly C1AWorkerE2EState[]> {
  const parsed = parseC1AWorkerE2EArgs(argv);
  const states: C1AWorkerE2EState[] = [];
  const suffix = seams.randomSuffix();
  if (!/^[a-f0-9]{12}$/.test(suffix)) fail('invalid output suffix');
  const paths = outputPaths(root, suffix);
  const authored = AUTHORED_INPUTS.map((file) => path.join(root, file));
  const hashes = new Map<string, string>();
  let harness: Harness | undefined;
  let bridge: ClosableServer | undefined;
  let egressGuard: EgressGuard | undefined;
  let playwright: Child | undefined;
  let aborted: SignalName | undefined;
  let rejectAbort!: (reason: Error) => void;
  const abortController = new AbortController();
  const abort = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  void abort.catch(() => undefined);
  const lateAcquisitions: Promise<void>[] = [];
  const lateCleanupErrors: Error[] = [];
  // A rejection is always observed by the lifecycle races below, including signals received during cleanup.
  const unsubscribe = seams.subscribeSignals((signal) => { if (!aborted) { aborted = signal; abortController.abort(); rejectAbort(new Error(`c1-a worker e2e: aborted (${signal})`)); } });
  const interruptible = <T>(work: Promise<T>): Promise<T> => aborted ? Promise.reject(new Error(`c1-a worker e2e: aborted (${aborted})`)) : Promise.race([work, abort]);
  const acquire = async <T>(label: string, work: Promise<T>, cleanup: (value: T) => Promise<void> | void): Promise<T> => {
    let handedOff = false;
    const watched = work.then(async (value) => {
      if (aborted && !handedOff) {
        try { await cleanup(value); } catch { lateCleanupErrors.push(new Error(`c1-a worker e2e: late ${label} cleanup failed`)); }
        throw new Error(`c1-a worker e2e: aborted (${aborted})`);
      }
      return value;
    });
    lateAcquisitions.push(watched.then(() => undefined, () => undefined));
    const value = await interruptible(watched);
    handedOff = true;
    return value;
  };
  const assertNotAborted = (): void => { if (aborted) fail(`aborted (${aborted})`); };
  let primary: Error | undefined;
  let ownsOutputs = false;
  try {
    await guarded('local-vars preflight', () => seams.assertNoWranglerLocalFiles(root));
    await interruptible(guarded('port preflight', () => seams.probePortFree()));
    if (Object.values(paths).some(seams.exists)) fail('owned output collision');
    ownsOutputs = true;
    for (const file of authored) hashes.set(file, await guarded('authored-input preflight', () => seams.hash(file)));
    states.push('preflight');
    await guarded('process boundary', () => seams.installCloudflareProcessBoundary(root));
    states.push('process-boundary-installed');
    const env = await guarded('child environment', () => seams.createChildEnvironment(root, suffix));
    const buildWork = guarded('build', () => seams.build(root, env, abortController.signal));
    lateAcquisitions.push(buildWork.then(() => undefined, () => undefined));
    await interruptible(buildWork);
    assertNotAborted();
    states.push('build');
    egressGuard = await acquire('egress', guarded('egress guard', () => seams.startEgressGuard()), (value) => value.close());
    assertNotAborted();
    states.push('egress-guard-started');
    harness = await acquire('harness', guarded('harness creation', () => seams.createHarness(C1_A_HARNESS_VARS)), (value) => value.close());
    assertNotAborted();
    states.push('harness-created');
    await interruptible(guarded('harness listen', () => harness!.listen()));
    assertNotAborted();
    states.push('harness-listening');
    await interruptible(guarded('outbound canary', () => seams.runOutboundCanary(harness!, egressGuard!)));
    bridge = await acquire('server', guarded('bridge start', () => seams.startBridge(harness!)), (value) => value.close());
    assertNotAborted();
    await interruptible(guarded('readiness', () => seams.awaitReady(abortController.signal)));
    assertNotAborted();
    states.push('http-ready');
    playwright = await acquire('playwright', guarded('playwright start', () => seams.startPlaywright(root, env, playwrightArgv(parsed))), (value) => seams.stopChild(value));
    assertNotAborted();
    states.push('playwright-started');
    if (await interruptible(playwright.exited) !== 0) fail('playwright failed');
    states.push('playwright-settled');
  } catch (error) {
    primary = asFailure(error);
  } finally {
    const cleanupErrors: Error[] = [];
    if (playwright) try { await seams.stopChild(playwright); states.push('playwright-stopped'); } catch { cleanupErrors.push(new Error('c1-a worker e2e: playwright cleanup failed')); }
    if (bridge) try { await bridge.close(); states.push('server-closed'); } catch { cleanupErrors.push(new Error('c1-a worker e2e: server cleanup failed')); }
    if (harness) try { await harness.close(); states.push('harness-closed'); } catch { cleanupErrors.push(new Error('c1-a worker e2e: harness cleanup failed')); }
    if (egressGuard) try { egressGuard.close(); states.push('egress-guard-closed'); } catch { cleanupErrors.push(new Error('c1-a worker e2e: egress cleanup failed')); }
    try { await seams.assertPortClosed(); } catch { cleanupErrors.push(new Error('c1-a worker e2e: port closure failed')); }
    for (const file of authored) if (hashes.has(file)) try { if (seams.hash(file) !== hashes.get(file)) throw new Error(); } catch { cleanupErrors.push(new Error(`c1-a worker e2e: authored input changed: ${path.basename(file)}`)); }
    await Promise.race([Promise.allSettled(lateAcquisitions), Bun.sleep(100)]);
    cleanupErrors.push(...lateCleanupErrors);
    if (ownsOutputs) try { seams.removeOwned(paths); states.push('outputs-removed'); } catch { cleanupErrors.push(new Error('c1-a worker e2e: output cleanup failed')); }
    unsubscribe();
    if (!primary && aborted) primary = new Error(`c1-a worker e2e: aborted (${aborted})`);
    if (primary && cleanupErrors.length) throw new AggregateError([primary, ...cleanupErrors], 'c1-a worker e2e: failed');
    if (primary) throw primary;
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'c1-a worker e2e: cleanup failed');
  }
  return states;
}

if (import.meta.main) {
  try { await runC1AWorkerE2E(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : 'c1-a worker e2e: failed'}\n`); process.exitCode = 1; }
}
