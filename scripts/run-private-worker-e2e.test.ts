import { describe, expect, test } from 'bun:test';
import dgram from 'node:dgram';
import dns from 'node:dns';
import {
  PRIVATE_WORKER_E2E_STATES,
  assertPrivateLoopbackSocketArgs,
  createPrivateBrowserEnvironment,
  createPrivateBuildEnvironment,
  createPrivateWorkerEnvironment,
  installPrivateHarnessEgressGuard,
  runPrivateWorkerE2E,
  stopPrivateWorkerChild,
  type PrivateWorkerE2EChild,
  type PrivateWorkerE2ESeams,
} from './run-private-worker-e2e';

const root = '/repo';
const child = (code: Promise<number> = new Promise(() => undefined)): PrivateWorkerE2EChild => ({
  exited: code,
  stdout: new ReadableStream({ start(controller) { controller.close(); } }),
  stderr: new ReadableStream({ start(controller) { controller.close(); } }),
  kill: () => undefined,
});

function fixture(overrides: Partial<PrivateWorkerE2ESeams> = {}) {
  const calls: string[] = [];
  const cleaned: string[] = [];
  let signal: ((name: 'SIGINT' | 'SIGTERM' | 'SIGHUP') => void) | undefined;
  const browser = child(Promise.resolve(0));
  const harness = child();
  const seams: PrivateWorkerE2ESeams = {
    suffix: () => '123456abcdef', token: () => 'a'.repeat(64),
    exists: () => false, hash: (file) => `hash:${file}`,
    probePort: async () => undefined,
    build: async () => { calls.push('build'); },
    startHarness: async () => { calls.push('harness'); return harness; },
    waitReady: async () => { calls.push('ready'); },
    startBrowser: async (_env, argv) => { calls.push(`browser:${JSON.stringify(argv)}`); return browser; },
    stopChild: async (_value, label) => { cleaned.push(label); },
    removeOwned: (paths) => cleaned.push(`outputs:${paths.length}`),
    subscribeSignals: (listener) => { signal = listener; return () => calls.push('signals-removed'); },
    startupDeadline: () => new Promise(() => undefined), browserDeadline: () => new Promise(() => undefined),
    ...overrides,
  };
  return { seams, calls, cleaned, sendSignal: (name: 'SIGINT' | 'SIGTERM' | 'SIGHUP') => signal?.(name) };
}

describe('private Worker browser runner', () => {
  test('builds, starts the private harness, runs both-engine config, and cleans in reverse order', async () => {
    const f = fixture();
    await expect(runPrivateWorkerE2E([], root, f.seams, {})).resolves.toEqual(PRIVATE_WORKER_E2E_STATES);
    expect(f.calls).toEqual([
      'build', 'harness', 'ready',
      'browser:["node","node_modules/@playwright/test/cli.js","test","--config","playwright.private.config.ts"]',
      'signals-removed',
    ]);
    expect(f.cleaned).toEqual(['browser', 'harness', 'outputs:4']);
  });

  test('accepts only exact browser selectors and scrubs all inherited credentials', async () => {
    const f = fixture();
    await runPrivateWorkerE2E(['--project=webkit'], root, f.seams, {});
    expect(f.calls).toContain('browser:["node","node_modules/@playwright/test/cli.js","test","--config","playwright.private.config.ts","--project=webkit"]');
    await expect(runPrivateWorkerE2E(['--project=firefox'], root, fixture().seams, {})).rejects.toThrow('private worker e2e: arguments');
    const env = createPrivateWorkerEnvironment({ OPENROUTER_API_KEY: 'real', CLOUDFLARE_API_TOKEN: 'real', PATH: '/bin' }, root, '123456abcdef');
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    expect(env.CLOUDFLARE_API_TOKEN).toBeUndefined();
    expect(env.OPENROUTER_OWNER_KEY).toBe('private-secret-marker-7e13f0');
    expect(env.PRIVATE_OUTPUT_SUFFIX).toBe('123456abcdef');
    expect(env.PRIVATE_PRIVACY_CANARY).toBeUndefined();
    expect(env.CLOUDFLARE_CF_FETCH_ENABLED).toBe('false');

    const buildEnv = createPrivateBuildEnvironment(env, root);
    expect(buildEnv.OPENROUTER_OWNER_KEY).toBe('');
    expect(buildEnv.NODE_OPTIONS).toBe(`--require=${root}/scripts/c1-a-offline-preload.cjs`);
    expect(buildEnv.BUN_OPTIONS).toBeUndefined();

    const browserEnv = createPrivateBrowserEnvironment(env, root);
    expect(browserEnv.PRIVATE_OUTPUT_SUFFIX).toBe('123456abcdef');
    expect(browserEnv.OPENROUTER_OWNER_KEY).toBeUndefined();
    expect(browserEnv.NODE_OPTIONS).toBe(`--require=${root}/scripts/private-offline-preload.cjs`);
    expect(browserEnv.BUN_OPTIONS).toBe(`--preload=${root}/scripts/private-offline-preload.cjs`);
    expect(browserEnv.CLOUDFLARE_CF_FETCH_ENABLED).toBeUndefined();
  });

  test('leaves generated outputs for the outer privacy canary to scan', async () => {
    const f = fixture();
    await runPrivateWorkerE2E([], root, f.seams, { PRIVATE_PRIVACY_CANARY: '1', PRIVATE_OUTPUT_SUFFIX: '123456abcdef' });
    expect(f.cleaned).toEqual(['browser', 'harness']);
  });

  test('rejects external socket arguments at the private harness boundary', () => {
    expect(() => assertPrivateLoopbackSocketArgs([{ host: 'openrouter.ai', port: 443 }])).toThrow('private worker e2e: non-loopback socket');
    expect(() => assertPrivateLoopbackSocketArgs([8789, '127.0.0.1'])).not.toThrow();
  });

  test('rejects DNS and UDP at the in-process provider harness boundary', () => {
    const guard = installPrivateHarnessEgressGuard();
    try {
      expect(() => dns.resolve('example.invalid', () => undefined)).toThrow('private worker e2e: non-loopback socket');
      expect(() => dgram.createSocket('udp4')).toThrow('private worker e2e: non-loopback socket');
    } finally { guard.close(); }
  });

  test('rejects custom DNS Resolver instances at the in-process provider harness boundary', () => {
    const mutableDns = dns as unknown as { Resolver: new () => { resolve(hostname: string): void } };
    const NativeResolver = mutableDns.Resolver;
    let calls = 0;
    mutableDns.Resolver = class FakeResolver { resolve(): void { calls += 1; } };
    const guard = installPrivateHarnessEgressGuard();
    try {
      expect(() => new mutableDns.Resolver().resolve('example.invalid')).toThrow('private worker e2e: non-loopback socket');
      expect(calls).toBe(0);
    } finally {
      guard.close();
      mutableDns.Resolver = NativeResolver;
    }
  });

  test('refuses collisions, non-loopback port failures, and authored-input drift', async () => {
    await expect(runPrivateWorkerE2E([], root, fixture({ exists: () => true }).seams, {})).rejects.toThrow('private worker e2e: owned output collision');
    await expect(runPrivateWorkerE2E([], root, fixture({ probePort: async () => { throw new Error('occupied'); } }).seams, {})).rejects.toThrow('private worker e2e: port preflight');
    let reads = 0;
    const changed = fixture({ hash: (file) => `${reads++ >= 4 ? 'changed' : 'same'}:${file}` });
    await expect(runPrivateWorkerE2E([], root, changed.seams, {})).rejects.toThrow('private worker e2e: authored input changed');
    expect(changed.cleaned).toContain('outputs:4');
  });

  test('aborts and cleans late children on timeout or signal', async () => {
    let release!: (value: PrivateWorkerE2EChild) => void;
    const pending = new Promise<PrivateWorkerE2EChild>((resolve) => { release = resolve; });
    const timed = fixture({ startHarness: async () => pending, startupDeadline: async () => { release(child(Promise.resolve(0))); } });
    await expect(runPrivateWorkerE2E([], root, timed.seams, {})).rejects.toThrow('private worker e2e: harness startup timeout');
    expect(timed.cleaned).toContain('harness');

    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const interrupted = fixture({ build: async (_env, signal) => {
      entered(); await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    } });
    const running = runPrivateWorkerE2E([], root, interrupted.seams, {});
    await started;
    interrupted.sendSignal('SIGINT');
    await expect(running).rejects.toThrow('private worker e2e: aborted (SIGINT)');
    expect(interrupted.cleaned).toContain('outputs:4');
  });

  test('kills the process group after the direct child exits during shutdown', async () => {
    const signals: string[] = [];
    const exitedLeader: PrivateWorkerE2EChild = {
      ...child(Promise.resolve(0)),
      kill: (signal) => { signals.push(signal); },
    };
    await stopPrivateWorkerChild(exitedLeader, async () => undefined);
    expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
  });

  test('waits for an interrupted build to stop before removing outputs', async () => {
    let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void; const exited = new Promise<void>((resolve) => { release = resolve; });
    const f = fixture({ build: async (_env, signal) => {
      entered();
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
      await exited;
    } });
    const running = runPrivateWorkerE2E([], root, f.seams, {});
    await started; f.sendSignal('SIGTERM'); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.cleaned).toEqual([]);
    release();
    await expect(running).rejects.toThrow('private worker e2e: aborted (SIGTERM)');
    expect(f.cleaned).toContain('outputs:4');
  });

  test('ignores a settled startup deadline and scans all browser output for markers', async () => {
    let releaseStartup!: () => void;
    const staleStartup = new Promise<void>((resolve) => { releaseStartup = resolve; });
    let releaseBrowser!: (code: number) => void;
    const browserExit = new Promise<number>((resolve) => { releaseBrowser = resolve; });
    const stale = fixture({
      startupDeadline: () => staleStartup,
      startBrowser: async () => child(browserExit),
    });
    const running = runPrivateWorkerE2E([], root, stale.seams, {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseStartup();
    releaseBrowser(0);
    await expect(running).resolves.toEqual(PRIVATE_WORKER_E2E_STATES);

    const markerOutput = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`${'x'.repeat(70_000)}private-secret-marker-7e13f0`));
        controller.close();
      },
    });
    const leakingBrowser: PrivateWorkerE2EChild = {
      ...child(Promise.resolve(0)),
      stdout: markerOutput,
    };
    const leaked = fixture({ startBrowser: async () => leakingBrowser });
    await expect(runPrivateWorkerE2E([], root, leaked.seams, {})).rejects.toThrow('private worker e2e: marker leak');
    expect(leaked.cleaned).toContain('browser');
  });
});
