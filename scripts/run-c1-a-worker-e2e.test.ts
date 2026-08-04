import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { Readable } from 'node:stream';
import tls from 'node:tls';
import { C1_A_WORKER_E2E_STATES, assertBridgeRootSmoke, assertInternalHarnessInvocation, awaitHarnessChildReady, createC1AWorkerE2EEnvironment, createHarnessChildEnvironment, createInternalHarnessLifecycle, detachedDelay, dispatchBridgeRequest, drainChildOutput, emitReadyAfterBridgeSmoke, harnessChildInvocation, nodeHarnessChildInvocation, parseC1AWorkerE2EArgs, requestFromNode, runC1AWorkerE2E, runOutboundCanary, startEgressGuard, stopChild, type C1AWorkerE2EChild, type C1AWorkerE2ESeams } from './run-c1-a-worker-e2e';

const root = '/fixture'; const suffix = '0123456789ab'; const token = 'a'.repeat(64);
const stream = (...chunks: string[]) => new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } });
const child = (exited: Promise<number> = new Promise<number>(() => undefined), stdout = stream(), stderr = stream(), kills: string[] = []): C1AWorkerE2EChild => ({ exited, stdout, stderr, kill: (signal) => kills.push(signal) });

function fixture(overrides: Partial<C1AWorkerE2ESeams> = {}) {
  const calls: string[] = []; const cleanup: string[] = []; let listener: ((signal: 'SIGINT' | 'SIGTERM' | 'SIGHUP') => void) | undefined;
  const seams: C1AWorkerE2ESeams = {
    randomSuffix: () => suffix, randomToken: () => token, assertNoWranglerLocalFiles: () => calls.push('dev-vars'), probePortFree: async () => { calls.push('probe'); }, exists: () => false, hash: (file) => `hash:${file}`, installCloudflareProcessBoundary: () => calls.push('boundary'), createChildEnvironment: () => ({ C1_A_OUTPUT_SUFFIX: suffix, NODE_OPTIONS: '--require=offline' }), build: async () => { calls.push('build'); },
    startHarnessChild: async () => { calls.push('harness'); return child(); }, startHarnessReadiness: () => ({ ready: Promise.resolve(), drained: Promise.resolve('') }), startupDeadline: async () => new Promise<void>(() => undefined), playwrightDeadline: async () => new Promise<void>(() => undefined), startPlaywright: async (_root, _env, argv) => { calls.push(`playwright:${JSON.stringify(argv)}`); return child(Promise.resolve(0)); }, stopChild: async (value, label) => { value.kill('SIGTERM'); cleanup.push(label); }, assertPortClosed: async () => { cleanup.push('port'); }, removeOwned: () => cleanup.push('outputs'), subscribeSignals: (value) => { listener = value; return () => calls.push('signals-removed'); }, ...overrides,
  };
  return { calls, cleanup, seams, signal: (value: 'SIGINT' | 'SIGTERM' | 'SIGHUP') => listener?.(value) };
}

describe('C1-A Worker E2E runner', () => {
  test('keeps deterministic parent states', () => expect(C1_A_WORKER_E2E_STATES).toEqual(['preflight', 'process-boundary-installed', 'build', 'harness-child-started', 'harness-ready', 'http-ready', 'playwright-started', 'playwright-settled', 'playwright-stopped', 'harness-child-stopped', 'port-closed', 'outputs-removed']));

  test('converts bridge GET to a string/plain init and never a foreign Request', async () => {
    const request = Object.assign(Readable.from([]), { method: 'GET', url: '/?root=1', headers: { host: '127.0.0.1:8788', 'x-test': 'yes' } });
    const converted = requestFromNode(request as never);
    expect(converted.input).toBe('http://127.0.0.1:8788/?root=1'); expect(converted.init).toMatchObject({ method: 'GET' }); expect(converted.init.body).toBeUndefined(); expect((converted.init as RequestInit & { duplex?: string }).duplex).toBeUndefined();
    const calls: unknown[] = []; await dispatchBridgeRequest({ listen: async () => undefined, close: async () => undefined, fetch: async (input) => { calls.push(input); if (input instanceof Request) throw new Error('foreign Request'); return new Response('ok'); } }, request as never, { statusCode: 0, setHeader() {}, end() {}, write() { return true; } } as never);
    expect(calls[0]).toBe('http://127.0.0.1:8788/?root=1');
  });

  test('preserves bridge POST headers, stream bytes, and duplex in a plain init', async () => {
    const request = Object.assign(Readable.from([Buffer.from('bridge-body')]), { method: 'POST', url: '/api/scan?from=bridge', headers: { host: '127.0.0.1:8788', 'content-type': 'text/plain', 'x-bridge': 'yes' } }); const converted = requestFromNode(request as never); const headers = new Headers(converted.init.headers); expect(converted.input).toBe('http://127.0.0.1:8788/api/scan?from=bridge'); expect(headers.get('content-type')).toBe('text/plain'); expect(headers.get('x-bridge')).toBe('yes'); expect((converted.init as RequestInit & { duplex?: string }).duplex).toBe('half'); const reader = (converted.init.body as ReadableStream<Uint8Array>).getReader(); const chunks: Uint8Array[] = []; for (;;) { const value = await reader.read(); if (value.done) break; chunks.push(value.value); } expect(new TextDecoder().decode(Buffer.concat(chunks))).toBe('bridge-body');
  });

  test('returns only the fixed bridge 502 JSON when harness dispatch rejects', async () => {
    const request = Object.assign(Readable.from([]), { method: 'GET', url: '/', headers: {} }); const headers = new Map<string, string>(); let body = ''; const output = { statusCode: 0, setHeader(name: string, value: string) { headers.set(name, value); }, end(value?: string) { body = value ?? ''; }, write() { return true; } }; await dispatchBridgeRequest({ listen: async () => undefined, close: async () => undefined, fetch: async () => { throw new Error('native-secret-canary'); } }, request as never, output as never); expect(output.statusCode).toBe(502); expect(headers.get('content-type')).toBe('application/json; charset=utf-8'); expect(body).toBe('{"error":"Worker bridge dispatch failed.","code":"worker_bridge_dispatch_failed"}'); expect(body).not.toContain('native-secret-canary');
  });

  test('returns only the fixed bridge 502 JSON when Node request conversion throws', async () => {
    const request = Object.assign(Readable.from([]), { method: 'POST', url: '/', headers: {} }); const headers = new Map<string, string>(); let body = ''; let dispatched = false; const output = { statusCode: 0, setHeader(name: string, value: string) { headers.set(name, value); }, end(value?: string) { body = value ?? ''; }, write() { return true; } };
    await dispatchBridgeRequest({ listen: async () => undefined, close: async () => undefined, fetch: async () => { dispatched = true; return new Response('wrong'); } }, request as never, output as never, () => { throw new Error('native-conversion-secret'); });
    expect(dispatched).toBe(false); expect(output.statusCode).toBe(502); expect(headers.get('content-type')).toBe('application/json; charset=utf-8'); expect(body).toBe('{"error":"Worker bridge dispatch failed.","code":"worker_bridge_dispatch_failed"}'); expect(body).not.toContain('native-conversion-secret');
  });

  test('accepts only a 200 root smoke, cancels its body, and rejects a pre-aborted lifecycle before fetch', async () => {
    let cancelled = false; await assertBridgeRootSmoke(async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 200 })); expect(cancelled).toBe(true); await expect(assertBridgeRootSmoke(async () => new Response(null, { status: 502 }))).rejects.toThrow('c1-a worker e2e: bridge root smoke'); const controller = new AbortController(); controller.abort(); let fetched = false;
    await expect(assertBridgeRootSmoke(async () => { fetched = true; return new Response(null, { status: 200 }); }, controller.signal)).rejects.toThrow('c1-a worker e2e: bridge root smoke'); expect(fetched).toBe(false);
  });

  test('emits readiness only after the root bridge smoke succeeds', async () => {
    const calls: string[] = []; await emitReadyAfterBridgeSmoke(async () => { calls.push('smoke'); }, () => calls.push('ready')); expect(calls).toEqual(['smoke', 'ready']); await expect(emitReadyAfterBridgeSmoke(async () => { calls.push('failed-smoke'); throw new Error('fixed'); }, () => calls.push('wrong-ready'))).rejects.toThrow('fixed'); expect(calls).toEqual(['smoke', 'ready', 'failed-smoke']);
  });

  test('aborts an in-flight child root smoke, resolves stopped, and never emits readiness after termination', async () => {
    const lifecycle = createInternalHarnessLifecycle(); let sawAbort = false; let emitted = false;
    const running = emitReadyAfterBridgeSmoke((signal) => new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => { sawAbort = true; reject(new Error('smoke-aborted')); }, { once: true })), () => { emitted = true; }, lifecycle.signal);
    lifecycle.terminate(); await expect(running).rejects.toThrow('smoke-aborted'); await lifecycle.stopped;
    expect(lifecycle.signal.aborted).toBe(true); expect(sawAbort).toBe(true); expect(emitted).toBe(false);
  });

  test('unrefs detached deadlines and grace delays so a graceful stop leaves no lingering timer', async () => {
    let unrefs = 0; let fire!: () => void; const schedule = ((callback: () => void) => { fire = callback; return { unref() { unrefs += 1; } }; }) as unknown as typeof setTimeout; const delay = detachedDelay(10, schedule); expect(unrefs).toBe(1); fire(); await delay; const kills: string[] = []; await stopChild(child(Promise.resolve(0), stream(), stream(), kills), 'child', (ms) => detachedDelay(ms, schedule)); expect(kills).toEqual(['SIGTERM']); expect(unrefs).toBe(2);
  });

  test('closes public parser including private mode', () => {
    expect(parseC1AWorkerE2EArgs([])).toEqual({});
    expect(parseC1AWorkerE2EArgs(['--project=webkit', '--grep', 'corrupt Scanner review storage recovers and persists the next scan'])).toEqual({ project: 'webkit', grep: 'corrupt Scanner review storage recovers and persists the next scan' });
    for (const argv of [['--internal-harness', token], ['--project=firefox'], ['--project', 'chromium'], ['--grep'], ['--grep', 'unknown'], ['--headed'], ['--project=webkit', '--project=chromium']]) expect(() => parseC1AWorkerE2EArgs(argv)).toThrow('c1-a worker e2e: arguments');
  });

  test('binds private Node mode to an exact 256-bit argv and environment capability', () => {
    expect(nodeHarnessChildInvocation(root, token)).toEqual(['node', '--no-warnings', '--experimental-strip-types', `${root}/scripts/run-c1-a-worker-e2e.ts`, '--internal-harness', token]);
    expect(harnessChildInvocation(root)).toEqual(['node', '--no-warnings', '--experimental-strip-types', `${root}/scripts/run-c1-a-worker-e2e.ts`, '--internal-harness']);
    for (const [argv, env, version] of [[['--internal-harness'], { C1_A_WORKER_E2E_INTERNAL_TOKEN: token }, '22.22.0'], [['--internal-harness', token], { C1_A_WORKER_E2E_INTERNAL_TOKEN: 'b'.repeat(64) }, '22.22.0'], [['--internal-harness', token], { C1_A_WORKER_E2E_INTERNAL_TOKEN: token }, '21.9.0']] as const) expect(() => assertInternalHarnessInvocation(argv, env, version)).toThrow('c1-a worker e2e: internal invocation');
    expect(() => assertInternalHarnessInvocation(['--internal-harness', token], { C1_A_WORKER_E2E_INTERNAL_TOKEN: token }, '22.22.0')).not.toThrow();
  });

  test('removes all injection controls from the Node child while retaining scrubbed values', () => {
    const env = createHarnessChildEnvironment({ NODE_OPTIONS: '--require=/tmp/x', NODE_PATH: '/tmp/x', BUN_OPTIONS: '--preload=/tmp/x', LD_PRELOAD: '/tmp/x', DYLD_INSERT_LIBRARIES: '/tmp/x', HTTPS_PROXY: 'http://proxy.invalid', OPENROUTER_API_KEY: 'secret', SAFE: 'yes' }, root, token);
    for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'BUN_OPTIONS', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'HTTPS_PROXY']) expect(env[key]).toBeUndefined();
    expect(env.OPENROUTER_API_KEY).toBe(''); expect(env.C1_A_WORKER_E2E_INTERNAL_TOKEN).toBe(token); expect(env.SAFE).toBe('yes');
  });

  test('parses fragmented readiness, rejects prefix/extra lines, and drains stdout', async () => {
    const good = awaitHarnessChildReady(child(new Promise<number>(() => undefined), stream('C1_A_', 'WORKER_E2E_', 'READY\n', '')), {}, new AbortController().signal);
    await expect(good.ready).resolves.toBeUndefined(); await expect(good.drained).resolves.toBe('C1_A_WORKER_E2E_READY\n');
    for (const value of ['xC1_A_WORKER_E2E_READY\n', 'C1_A_WORKER_E2E_READY\nextra\n']) {
      const parsed = awaitHarnessChildReady(child(new Promise<number>(() => undefined), stream(value)), {}, new AbortController().signal);
      await expect(parsed.ready).rejects.toThrow('c1-a worker e2e: harness child readiness'); await expect(parsed.drained).rejects.toThrow('c1-a worker e2e: harness child stdout');
    }
  });

  test('runs build then Node readiness then exact Playwright and only KILLs when TERM loses', async () => {
    const f = fixture(); const states = await runC1AWorkerE2E([], root, f.seams);
    expect(states).toEqual(C1_A_WORKER_E2E_STATES); expect(f.calls).toEqual(['dev-vars', 'probe', 'boundary', 'build', 'harness', 'playwright:["node","node_modules/@playwright/test/cli.js","test","--config","playwright.c1-a.config.ts"]', 'signals-removed']); expect(f.cleanup).toEqual(['playwright', 'harness child', 'port', 'outputs']);
  });

  test('passes exact browser options without dotenv values', async () => { const f = fixture(); await runC1AWorkerE2E(['--project=chromium', '--grep', 'community exhaustion exposes no pattern or admin bypass'], root, f.seams); expect(f.calls.find((value) => value.startsWith('playwright:'))).toBe('playwright:["node","node_modules/@playwright/test/cli.js","test","--config","playwright.c1-a.config.ts","--project=chromium","--grep","community exhaustion exposes no pattern or admin bypass"]'); });

  test('starts the absolute deadline before child acquisition and cleans a late child', async () => {
    let release!: (value: C1AWorkerE2EChild) => void; const pending = new Promise<C1AWorkerE2EChild>((resolve) => { release = resolve; }); const f = fixture({ startHarnessChild: async () => pending, startupDeadline: async () => { release(child(Promise.resolve(0))); } });
    await expect(runC1AWorkerE2E([], root, f.seams)).rejects.toThrow('c1-a worker e2e: harness startup timeout'); expect(f.cleanup).toContain('harness child');
  });

  test('treats premature harness exit and bounded Playwright timeout as terminal', async () => {
    let release!: () => void; const f = fixture({ startHarnessChild: async () => child(Promise.resolve(1)), startPlaywright: async () => child(new Promise((resolve) => { release = () => resolve(0); })), stopChild: async (value, label) => { value.kill('SIGTERM'); release?.(); f.cleanup.push(label); } });
    await expect(runC1AWorkerE2E([], root, f.seams)).rejects.toThrow('c1-a worker e2e: harness child exited');
    const timeout = fixture({ playwrightDeadline: async () => undefined }); await expect(runC1AWorkerE2E([], root, timeout.seams)).rejects.toThrow('c1-a worker e2e: playwright timeout');
  });

  test('fails before build for local-vars, port, and owned-output collisions', async () => {
    for (const stage of ['vars', 'port', 'collision'] as const) { const f = fixture({ assertNoWranglerLocalFiles: () => { if (stage === 'vars') throw new Error(); }, probePortFree: async () => { if (stage === 'port') throw new Error(); }, exists: () => stage === 'collision' }); await expect(runC1AWorkerE2E([], root, f.seams)).rejects.toThrow(stage === 'collision' ? 'owned output collision' : stage === 'vars' ? 'local-vars preflight failed' : 'port preflight failed'); expect(f.calls).not.toContain('build'); expect(f.cleanup).not.toContain('outputs'); }
  });

  test('covers boundary, build, child, readiness, Playwright, and nonzero failures', async () => {
    const stages = ['boundary', 'build', 'child', 'ready', 'playwright', 'nonzero'] as const;
    for (const stage of stages) { const f = fixture({ installCloudflareProcessBoundary: () => { if (stage === 'boundary') throw new Error(); }, build: async () => { if (stage === 'build') throw new Error(); }, startHarnessChild: async () => { if (stage === 'child') throw new Error(); return child(); }, startHarnessReadiness: () => stage === 'ready' ? { ready: Promise.reject(new Error('native')), drained: Promise.resolve('') } : { ready: Promise.resolve(), drained: Promise.resolve('') }, startPlaywright: async () => { if (stage === 'playwright') throw new Error(); return child(Promise.resolve(stage === 'nonzero' ? 1 : 0)); } }); await expect(runC1AWorkerE2E([], root, f.seams)).rejects.toThrow(stage === 'nonzero' ? 'playwright failed' : stage === 'boundary' ? 'process boundary failed' : stage === 'build' ? 'build failed' : stage === 'child' ? 'harness child start failed' : stage === 'ready' ? 'harness readiness failed' : 'playwright start failed'); }
  });

  test('signals each async acquisition and waits for late child cleanup', async () => {
    for (const stage of ['build', 'child', 'ready', 'playwright'] as const) {
      let entered!: () => void; let release!: () => void; const enteredPromise = new Promise<void>((resolve) => { entered = resolve; }); const never = new Promise<void>((resolve) => { release = resolve; }); const f = fixture({ build: async (_root, _env, signal) => { if (stage === 'build') { entered(); await new Promise<void>((resolve) => signal.addEventListener('abort', () => { release(); resolve(); }, { once: true })); } }, startHarnessChild: async () => { if (stage === 'child') { entered(); await never; } return child(); }, startHarnessReadiness: () => stage === 'ready' ? ({ ready: new Promise<void>((resolve) => { entered(); release = resolve; }), drained: Promise.resolve('') }) : ({ ready: Promise.resolve(), drained: Promise.resolve('') }), startPlaywright: async () => { if (stage === 'playwright') { entered(); await never; } return child(Promise.resolve(0)); } }); const running = runC1AWorkerE2E([], root, f.seams); await enteredPromise; f.signal('SIGTERM'); release(); await expect(running).rejects.toThrow('c1-a worker e2e: aborted (SIGTERM)'); expect(f.cleanup).toContain('port'); }
  });

  test('aggregates late cleanup, hash, port, drain, and owned-output failures', async () => {
    let release!: (value: C1AWorkerE2EChild) => void; let entered!: () => void; let reads = 0; const started = new Promise<void>((resolve) => { entered = resolve; }); const f = fixture({ startHarnessChild: async () => new Promise((resolve) => { entered(); release = resolve; }), hash: (file) => `${reads++ > 4 ? 'changed' : 'same'}:${file}`, assertPortClosed: async () => { throw new Error(); }, removeOwned: () => { throw new Error(); } }); const running = runC1AWorkerE2E([], root, f.seams); await started; f.signal('SIGHUP'); release(child(Promise.resolve(0), stream(), new ReadableStream({ start(controller) { controller.error(new Error('native')); } }))); const error = await running.then(() => undefined, (value) => value); expect(error).toBeInstanceOf(AggregateError); if (!(error instanceof AggregateError)) throw new Error(); expect(error.errors.some((value) => value instanceof Error && value.message.includes('port closure failed'))).toBe(true); expect(error.errors.some((value) => value instanceof Error && value.message.includes('authored input changed'))).toBe(true);
  });

  test('observes and aggregates a child drain failure without exposing its native cause', async () => { const f = fixture({ startHarnessReadiness: () => ({ ready: Promise.resolve(), drained: Promise.reject(new Error('native secret')) }) }); const error = await runC1AWorkerE2E([], root, f.seams).then(() => undefined, (value) => value); expect(error).toBeInstanceOf(AggregateError); if (!(error instanceof AggregateError)) throw new Error(); expect(error.errors.some((value) => value instanceof Error && value.message === 'c1-a worker e2e: harness stdout drain failed')).toBe(true); });

  test('aggregates a late child cleanup failure after an abort race', async () => { let release!: (value: C1AWorkerE2EChild) => void; let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; }); const f = fixture({ startHarnessChild: async () => new Promise((resolve) => { entered(); release = resolve; }), stopChild: async () => { throw new Error('native'); } }); const running = runC1AWorkerE2E([], root, f.seams); await started; f.signal('SIGTERM'); release(child(Promise.resolve(0))); const error = await running.then(() => undefined, (value) => value); expect(error).toBeInstanceOf(AggregateError); if (!(error instanceof AggregateError)) throw new Error(); expect(error.errors.some((value) => value instanceof Error && value.message === 'c1-a worker e2e: late harness child cleanup failed')).toBe(true); });

  test('stopChild does not KILL after TERM wins, but escalates when it loses', async () => {
    const graceful: string[] = []; await stopChild(child(Promise.resolve(0), stream(), stream(), graceful), 'child', async () => undefined); expect(graceful).toEqual(['SIGTERM']);
    let release!: () => void; const stubborn: string[] = []; await stopChild(child(new Promise((resolve) => { release = () => resolve(0); }), stream(), stream(), stubborn), 'child', async () => { if (stubborn.includes('SIGKILL')) release(); }); expect(stubborn).toEqual(['SIGTERM', 'SIGKILL']);
  });

  test('keeps exact canary response shape and ignores safe human error text', async () => {
    let observed: { input?: RequestInfo | URL; init?: RequestInit } = {}; const harness = { listen: async () => undefined, close: async () => undefined, fetch: async (input: RequestInfo | URL, init?: RequestInit) => { observed = { input, init }; return Response.json({ error: 'safe', code: 'scan_provider_failed' }, { status: 502 }); } }; await runOutboundCanary(harness, { assertOutboundCanary: () => undefined, close: () => undefined }); expect(observed.input).toBe('http://127.0.0.1:8788/api/scan'); expect(observed.init?.method).toBe('POST'); await expect(runOutboundCanary({ ...harness, fetch: async () => Response.json({ error: 'scan_provider_failed' }, { status: 502 }) }, { assertOutboundCanary: () => undefined, close: () => undefined })).rejects.toThrow('outbound canary response');
  });

  test('throws before every non-loopback connector can delegate and permits loopback', async () => {
    const originalNet = net.connect; const originalCreate = net.createConnection; const originalTls = tls.connect; let called = 0; const fake = (() => { called += 1; return { on() { return this; } }; }) as unknown as typeof net.connect; net.connect = fake; net.createConnection = fake; tls.connect = fake as unknown as typeof tls.connect; const guard = await startEgressGuard(); try { expect(() => net.connect({ host: '192.0.2.1', port: 443 })).toThrow('non-loopback socket'); expect(() => tls.connect({ host: '192.0.2.1', port: 443 })).toThrow('non-loopback socket'); expect(called).toBe(0); net.connect({ host: '127.0.0.1', port: 1 }); expect(called).toBe(1); } finally { guard.close(); net.connect = originalNet; net.createConnection = originalCreate; tls.connect = originalTls; }
  });

  test('records only exact OpenRouter target without a provider request', async () => { const guard = await startEgressGuard(); try { await expect(fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST' })).rejects.toThrow(); expect(() => guard.assertOutboundCanary()).not.toThrow(); } finally { guard.close(); } });

  test('bounds and redacts child output and sanitizes native runner failures', async () => {
    const output = await drainChildOutput(stream(`OPENROUTER_API_KEY:secret:${'x'.repeat(70_000)}`), { OPENROUTER_API_KEY: 'secret' }); expect(output).not.toContain('secret'); expect(output).not.toContain('OPENROUTER_API_KEY'); expect(output.length).toBeLessThanOrEqual(64 * 1024); const boundary = await drainChildOutput(stream('x'.repeat(64 * 1024 - 6), 'boundary-secret-canary'), { OPENROUTER_API_KEY: 'boundary-secret-canary' }); expect(boundary).not.toContain('secret'); expect(boundary.length).toBeLessThanOrEqual(64 * 1024); const f = fixture({ build: async () => { throw new Error('native secret'); } }); const error = await runC1AWorkerE2E([], root, f.seams).then(() => { throw new Error('expected failure'); }, (value) => value instanceof Error ? value : new Error()); expect(error.message).toBe('c1-a worker e2e: build failed'); expect(error.message).not.toContain('secret');
  });

  test('scrubs parent and dotenv credentials without changing parent-child suffix behavior', () => { const directory = mkdtempSync(path.join(tmpdir(), 'event-every-c1a-')); try { for (const [file, key] of [['.env.production.local', 'OPENROUTER_A'], ['.env.local', 'OPENROUTER_B'], ['.env.production', 'OPENROUTER_C'], ['.env', 'OPENROUTER_D']] as const) writeFileSync(path.join(directory, file), `${key}=secret\n`); const env = createC1AWorkerE2EEnvironment({ OPENROUTER_PARENT: 'secret', SAFE: 'yes' }, directory, suffix); for (const key of ['OPENROUTER_PARENT', 'OPENROUTER_A', 'OPENROUTER_B', 'OPENROUTER_C', 'OPENROUTER_D']) expect(env[key]).toBe(''); expect(env.C1_A_OUTPUT_SUFFIX).toBe(suffix); expect(env.SAFE).toBe('yes'); } finally { rmSync(directory, { recursive: true, force: true }); } });

  test('loads under local Node 22+ and rejects unauthenticated private mode before harness creation', () => { const version = Bun.spawnSync(['node', '--version'], { stdout: 'pipe', stderr: 'pipe' }); expect(version.exitCode).toBe(0); const major = Number(new TextDecoder().decode(version.stdout).match(/^v(\d+)\./)?.[1]); expect(major).toBeGreaterThanOrEqual(22); const rejected = Bun.spawnSync(['node', '--no-warnings', '--experimental-strip-types', 'scripts/run-c1-a-worker-e2e.ts', '--internal-harness', token], { cwd: process.cwd(), env: { ...process.env, C1_A_WORKER_E2E_INTERNAL_TOKEN: 'b'.repeat(64) }, stdout: 'pipe', stderr: 'pipe' }); expect(rejected.exitCode).toBe(1); const stderr = new TextDecoder().decode(rejected.stderr); expect(stderr).toBe('c1-a worker e2e: internal failed\n'); expect(stderr).not.toContain('ERR_'); });
});
