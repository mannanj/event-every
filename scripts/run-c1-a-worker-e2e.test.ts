import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { C1_A_HARNESS_VARS, C1_A_WORKER_E2E_STATES, createC1AWorkerE2EEnvironment, drainChildOutput, parseC1AWorkerE2EArgs, runC1AWorkerE2E, runOutboundCanary, startEgressGuard, type C1AWorkerE2ESeams } from './run-c1-a-worker-e2e';

const root = '/fixture';
const suffix = '0123456789ab';

function fixture(overrides: Partial<C1AWorkerE2ESeams> = {}) {
  const calls: string[] = [];
  const cleanup: string[] = [];
  let signal: ((signal: 'SIGINT' | 'SIGTERM' | 'SIGHUP') => void) | undefined;
  const seams: C1AWorkerE2ESeams = {
    randomSuffix: () => suffix,
    assertNoWranglerLocalFiles: () => calls.push('dev-vars'),
    probePortFree: async () => { calls.push('probe'); },
    exists: () => false,
    hash: (file) => `hash:${file}`,
    installCloudflareProcessBoundary: () => calls.push('boundary'),
    createChildEnvironment: () => ({ C1_A_OUTPUT_SUFFIX: suffix }),
    build: async (_root, _env) => { calls.push('build'); },
    startEgressGuard: async () => ({ assertOutboundCanary: () => calls.push('canary-origin'), close: () => cleanup.push('guard') }),
    createHarness: async (vars) => {
      calls.push(`harness:${JSON.stringify(vars)}`);
      return { listen: async () => { calls.push('listen'); }, close: async () => { cleanup.push('harness'); }, fetch: async () => new Response('ok') };
    },
    runOutboundCanary: async (_harness, guard) => { calls.push('canary'); guard.assertOutboundCanary(); },
    startBridge: async () => ({ close: async () => { cleanup.push('server'); } }),
    awaitReady: async () => { calls.push('ready'); },
    startPlaywright: async (_root, _env, argv) => {
      calls.push(`playwright:${JSON.stringify(argv)}`);
      return { exited: Promise.resolve(0), kill: (signal) => calls.push(`kill:${signal}`) };
    },
    stopChild: async (child) => { child.kill('SIGTERM'); child.kill('SIGKILL'); cleanup.push('playwright'); },
    assertPortClosed: async () => { cleanup.push('port'); },
    removeOwned: () => cleanup.push('outputs'),
    subscribeSignals: (listener) => { signal = listener; return () => calls.push('signals-removed'); },
    ...overrides,
  };
  return { calls, cleanup, seams, sendSignal: (value: 'SIGINT' | 'SIGTERM' | 'SIGHUP') => signal?.(value) };
}

describe('C1-A Worker E2E runner', () => {
  test('has the complete deterministic lifecycle through owned-output cleanup', () => {
    expect(C1_A_WORKER_E2E_STATES).toEqual([
      'preflight', 'process-boundary-installed', 'build', 'egress-guard-started', 'harness-created', 'harness-listening', 'http-ready', 'playwright-started', 'playwright-settled', 'playwright-stopped', 'server-closed', 'harness-closed', 'egress-guard-closed', 'outputs-removed',
    ]);
  });

  test('accepts only the closed local browser argument surface', () => {
    expect(parseC1AWorkerE2EArgs([])).toEqual({});
    expect(parseC1AWorkerE2EArgs(['--project=chromium', '--grep', 'community exhaustion exposes no pattern or admin bypass']))
      .toEqual({ project: 'chromium', grep: 'community exhaustion exposes no pattern or admin bypass' });
    for (const argv of [
      ['--project=firefox'], ['--project', 'chromium'], ['--grep'], ['--grep', 'unknown'], ['--project=webkit', '--project=chromium'], ['--grep', 'community exhaustion exposes no pattern or admin bypass', '--grep', 'community exhaustion exposes no pattern or admin bypass'], ['--headed'],
    ]) expect(() => parseC1AWorkerE2EArgs(argv)).toThrow('c1-a worker e2e: arguments');
  });

  test('runs every state in order after building before the dynamic harness import', async () => {
    const f = fixture();
    const states = await runC1AWorkerE2E([], root, f.seams);
    expect(states).toEqual(C1_A_WORKER_E2E_STATES);
    expect(f.calls).toEqual([
      'dev-vars', 'probe', 'boundary', 'build',
      `harness:${JSON.stringify(C1_A_HARNESS_VARS)}`, 'listen', 'canary', 'canary-origin', 'ready',
      'playwright:["node","node_modules/@playwright/test/cli.js","test","--config","playwright.c1-a.config.ts"]',
      'kill:SIGTERM', 'kill:SIGKILL', 'signals-removed',
    ]);
    expect(f.cleanup).toEqual(['playwright', 'server', 'harness', 'guard', 'port', 'outputs']);
  });

  test('passes exact optional Playwright arguments and does not add dotenv-derived values', async () => {
    const f = fixture();
    await runC1AWorkerE2E(['--project=webkit', '--grep', 'corrupt Scanner review storage recovers and persists the next scan'], root, f.seams);
    expect(f.calls.find((call) => call.startsWith('playwright:'))).toBe('playwright:["node","node_modules/@playwright/test/cli.js","test","--config","playwright.c1-a.config.ts","--project=webkit","--grep","corrupt Scanner review storage recovers and persists the next scan"]');
  });

  test('uses the exact outbound canary and requires one observed OpenRouter origin', async () => {
    let observed: { input?: RequestInfo | URL; init?: RequestInit } = {};
    let asserted = 0;
    await runOutboundCanary({
      listen: async () => undefined,
      close: async () => undefined,
      fetch: async (input, init) => { observed = { input, init }; return Response.json({ error: 'scan_provider_failed' }, { status: 502 }); },
    }, { assertOutboundCanary: () => { asserted += 1; }, close: () => undefined });
    expect(observed.input).toBe('http://127.0.0.1:8788/api/scan');
    expect(observed.init).toEqual({
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:8788', 'cf-connecting-ip': '203.0.113.10', 'X-Event-Every-Request-Id': '018f47a0-7b5c-7cc4-9a34-123456789abc' },
      body: JSON.stringify({ kind: 'text', text: 'C1-A outbound canary' }),
    });
    expect(asserted).toBe(1);
  });

  test('records the OpenRouter origin while causally rejecting a Node non-loopback socket attempt', async () => {
    const originalNetConnect = net.connect;
    const originalNetCreateConnection = net.createConnection;
    const originalTlsConnect = tls.connect;
    const fake = (() => ({ on() { return this; } })) as unknown as typeof net.connect;
    net.connect = fake;
    net.createConnection = fake;
    tls.connect = fake as unknown as typeof tls.connect;
    const guard = await startEgressGuard();
    try {
      await expect(fetch('https://openrouter.ai/api/v1/chat/completions')).rejects.toThrow();
      expect(() => guard.assertOutboundCanary()).not.toThrow();
      net.connect({ host: '192.0.2.1', port: 443 });
      expect(() => guard.assertOutboundCanary()).toThrow('c1-a worker e2e: outbound canary socket');
      await expect(fetch('https://example.invalid/extra')).rejects.toThrow();
      expect(() => guard.assertOutboundCanary()).toThrow('c1-a worker e2e: outbound canary origin');
    } finally {
      guard.close();
      net.connect = originalNetConnect;
      net.createConnection = originalNetCreateConnection;
      tls.connect = originalTlsConnect;
    }
  });

  test('fails before build for every preflight collision and leaves no output cleanup claim', async () => {
    for (const failing of ['dev-vars', 'probe', 'collision'] as const) {
      const f = fixture({
        assertNoWranglerLocalFiles: () => { if (failing === 'dev-vars') throw new Error('local vars'); },
        probePortFree: async () => { if (failing === 'probe') throw new Error('port'); },
        exists: () => failing === 'collision',
      });
      await expect(runC1AWorkerE2E([], root, f.seams)).rejects.toThrow(failing === 'collision' ? 'c1-a worker e2e: owned output collision' : failing === 'dev-vars' ? 'c1-a worker e2e: local-vars preflight failed' : 'c1-a worker e2e: port preflight failed');
      expect(f.calls).not.toContain('build');
      expect(f.cleanup).toContain('port');
      expect(f.cleanup).not.toContain('outputs');
    }
  });

  test('fails at each lifecycle state while aggregating subsequent cleanup failures', async () => {
    const stages = ['boundary', 'build', 'guard', 'harness', 'listen', 'bridge', 'ready', 'playwright', 'settled'] as const;
    for (const stage of stages) {
      const f = fixture({
        installCloudflareProcessBoundary: () => { if (stage === 'boundary') throw new Error('boundary'); },
        build: async () => { if (stage === 'build') throw new Error('build'); },
        startEgressGuard: async () => { if (stage === 'guard') throw new Error('guard'); return { assertOutboundCanary: () => undefined, close: () => undefined }; },
        createHarness: async () => {
          if (stage === 'harness') throw new Error('harness');
          return { listen: async () => { if (stage === 'listen') throw new Error('listen'); }, close: async () => undefined, fetch: async () => new Response('ok') };
        },
        startBridge: async () => { if (stage === 'bridge') throw new Error('bridge'); return { close: async () => undefined }; },
        awaitReady: async () => { if (stage === 'ready') throw new Error('ready'); },
        startPlaywright: async () => {
          if (stage === 'playwright') throw new Error('playwright');
          return { exited: Promise.resolve(stage === 'settled' ? 1 : 0), kill: () => undefined };
        },
      });
      const expected = stage === 'settled' ? 'playwright failed' : ({ boundary: 'process boundary failed', build: 'build failed', guard: 'egress guard failed', harness: 'harness creation failed', listen: 'harness listen failed', bridge: 'bridge start failed', ready: 'readiness failed', playwright: 'playwright start failed' } as const)[stage];
      await expect(runC1AWorkerE2E([], root, f.seams)).rejects.toThrow(`c1-a worker e2e: ${expected}`);
    }
  });

  test('cancels via the shared finally path and sends TERM then KILL to Playwright', async () => {
    let release!: () => void;
    let playwrightStarted!: () => void;
    const started = new Promise<void>((resolve) => { playwrightStarted = resolve; });
    const f = fixture({ startPlaywright: async () => { playwrightStarted(); return { exited: new Promise<number>((resolve) => { release = () => resolve(0); }), kill: (signal) => { if (signal === 'SIGKILL') release(); f.calls.push(`kill:${signal}`); } }; } });
    const running = runC1AWorkerE2E([], root, f.seams);
    await started;
    f.sendSignal('SIGTERM');
    await expect(running).rejects.toThrow('c1-a worker e2e: aborted (SIGTERM)');
    expect(f.calls).toContain('kill:SIGTERM');
    expect(f.calls).toContain('kill:SIGKILL');
    expect(f.cleanup).toEqual(['playwright', 'server', 'harness', 'guard', 'port', 'outputs']);
  });

  test('signals interrupt a never-settling build and still clean only invocation-owned outputs', async () => {
    let entered!: () => void;
    const buildStarted = new Promise<void>((resolve) => { entered = resolve; });
    const f = fixture({ build: async () => { entered(); await new Promise(() => undefined); } });
    const running = runC1AWorkerE2E([], root, f.seams);
    await buildStarted;
    f.sendSignal('SIGTERM');
    await expect(running).rejects.toThrow('c1-a worker e2e: aborted (SIGTERM)');
    expect(f.cleanup).toEqual(['port', 'outputs']);
  });

  test('signals interrupt every remaining asynchronous acquisition and readiness stage', async () => {
    for (const stage of ['guard', 'harness', 'listen', 'bridge', 'ready', 'playwright'] as const) {
      let entered!: () => void;
      const stageStarted = new Promise<void>((resolve) => { entered = resolve; });
      const never = () => new Promise<never>(() => undefined);
      const overrides: Partial<C1AWorkerE2ESeams> = {
        ...(stage === 'guard' ? { startEgressGuard: async () => { entered(); return never(); } } : {}),
        ...(stage === 'harness' ? { createHarness: async () => { entered(); return never(); } } : {}),
        ...(stage === 'listen' ? { createHarness: async () => ({ listen: async () => { entered(); return never(); }, close: async () => undefined, fetch: async () => new Response('ok') }) } : {}),
        ...(stage === 'bridge' ? { startBridge: async () => { entered(); return never(); } } : {}),
        ...(stage === 'ready' ? { awaitReady: async () => { entered(); return never(); } } : {}),
        ...(stage === 'playwright' ? { startPlaywright: async () => { entered(); return never(); } } : {}),
      };
      const f = fixture(overrides);
      const running = runC1AWorkerE2E([], root, f.seams);
      await stageStarted;
      f.sendSignal('SIGTERM');
      await expect(Promise.race([running, Bun.sleep(500).then(() => { throw new Error('signal stage timeout'); })])).rejects.toThrow('c1-a worker e2e: aborted (SIGTERM)');
    }
  });

  test('a signal received during cleanup is terminal and a late cleanup failure is aggregated', async () => {
    const cleanupSignal = fixture({ startBridge: async () => ({ close: async () => cleanupSignal.sendSignal('SIGHUP') }) });
    await expect(runC1AWorkerE2E([], root, cleanupSignal.seams)).rejects.toThrow('c1-a worker e2e: aborted (SIGHUP)');

    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const late = fixture({
      startEgressGuard: async () => {
        entered();
        return new Promise((resolve) => { release = () => resolve({ assertOutboundCanary: () => undefined, close: () => { throw new Error('late close'); } }); });
      },
    });
    const running = runC1AWorkerE2E([], root, late.seams);
    await started;
    late.sendSignal('SIGTERM');
    release();
    const error = await running.then(() => undefined, (value) => value);
    expect(error).toBeInstanceOf(AggregateError);
    if (!(error instanceof AggregateError)) throw new Error('expected aggregate error');
    expect(error.errors.some((value) => value instanceof Error && value.message === 'c1-a worker e2e: late egress cleanup failed')).toBe(true);
  });

  test('detects authored hash changes, keeps all cleanup errors, and removes only owned paths', async () => {
    let count = 0;
    const f = fixture({
      hash: (file) => `${count++ > 4 ? 'changed:' : 'same:'}${file}`,
      removeOwned: () => { throw new Error('remove'); },
      assertPortClosed: async () => { throw new Error('port'); },
    });
    const error = await runC1AWorkerE2E([], root, f.seams).then(() => undefined, (value) => value);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.message).toBe('c1-a worker e2e: cleanup failed');
    expect(f.cleanup).toContain('guard');
  });

  test('drains unbounded child output while retaining only bounded, redacted diagnostics', async () => {
    const canary = 'synthetic-c1-a-never-sent';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`OPENROUTER_COMMUNITY_KEY:${canary}:${'x'.repeat(70_000)}`));
        controller.enqueue(new TextEncoder().encode('tail-consumed'));
        controller.close();
      },
    });
    const output = await drainChildOutput(stream, { OPENROUTER_COMMUNITY_KEY: canary });
    expect(output).not.toContain(canary);
    expect(output).not.toContain('OPENROUTER_COMMUNITY_KEY');
    expect(output.length).toBeLessThanOrEqual(64 * 1024);

    const boundaryCanary = 'boundary-secret-canary';
    const boundary = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(64 * 1024 - 6)));
        controller.enqueue(new TextEncoder().encode(boundaryCanary));
        controller.close();
      },
    });
    const boundaryOutput = await drainChildOutput(boundary, { OPENROUTER_COMMUNITY_KEY: boundaryCanary });
    expect(boundaryOutput).not.toContain('secret');
    expect(boundaryOutput.length).toBeLessThanOrEqual(64 * 1024);
  });

  test('does not expose native failure messages and accepts SIGHUP through the shared cleanup path', async () => {
    const failure = fixture({ build: async () => { throw new Error('OPENROUTER_API_KEY=secret-canary'); } });
    const error = await runC1AWorkerE2E([], root, failure.seams).then(() => { throw new Error('expected failure'); }, (value) => value as Error);
    expect(error.message).toBe('c1-a worker e2e: build failed');
    expect(error.message).not.toContain('secret-canary');

    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const signal = fixture({ startPlaywright: async () => { started(); return { exited: new Promise<number>((resolve) => { release = () => resolve(0); }), kill: (value) => { if (value === 'SIGKILL') release(); } }; } });
    const running = runC1AWorkerE2E([], root, signal.seams);
    await ready;
    signal.sendSignal('SIGHUP');
    await expect(running).rejects.toThrow('c1-a worker e2e: aborted (SIGHUP)');
    expect(signal.cleanup).toEqual(['playwright', 'server', 'harness', 'guard', 'port', 'outputs']);
  });

  test('scrubs parent, dotenv, and Cloudflare-control canaries before every child receives the exact suffix', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-worker-e2e-'));
    try {
      for (const [name, key] of [
        ['.env.production.local', 'OPENROUTER_PRODUCTION_LOCAL'], ['.env.local', 'OPENROUTER_LOCAL'],
        ['.env.production', 'OPENROUTER_PRODUCTION'], ['.env', 'OPENROUTER_ENV'],
      ] as const) writeFileSync(path.join(directory, name), `${key}=dotenv-canary-${key}\n`);
      const env = createC1AWorkerE2EEnvironment({
        OPENROUTER_PARENT: 'parent-canary', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true', SAFE_VALUE: 'preserved',
      }, directory, suffix);
      for (const key of ['OPENROUTER_PARENT', 'OPENROUTER_PRODUCTION_LOCAL', 'OPENROUTER_LOCAL', 'OPENROUTER_PRODUCTION', 'OPENROUTER_ENV']) expect(env[key]).toBe('');
      expect(env.CLOUDFLARE_INCLUDE_PROCESS_ENV).toBe('false');
      expect(env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV).toBe('false');
      expect(env.C1_A_OUTPUT_SUFFIX).toBe(suffix);
      expect(env.SAFE_VALUE).toBe('preserved');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
