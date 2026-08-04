import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

type KeepAliveEnv = {
  KEEPALIVE_DEPLOYMENT_DISABLED: '1';
  STATE_AUTHORITY_MODE: 'legacy' | 'shadow' | 'cloudflare';
  KV_REST_API_URL: string;
  KV_REST_API_TOKEN: string;
};
type ScheduledController = { scheduledTime: number };
type ExecutionContext = { waitUntil(work: Promise<unknown>): void };
type KeepAliveWorker = typeof import('../../cloudflare/legacy-keepalive-worker').default;

function executionContext(): [ExecutionContext, () => Promise<void>] {
  const pending: Promise<unknown>[] = [];
  return [{ waitUntil(work) { pending.push(work); } }, async () => { await Promise.all(pending); }];
}

function env(mode: KeepAliveEnv['STATE_AUTHORITY_MODE']): KeepAliveEnv {
  return {
    KEEPALIVE_DEPLOYMENT_DISABLED: '1',
    STATE_AUTHORITY_MODE: mode,
    KV_REST_API_URL: 'http://127.0.0.1:8799',
    KV_REST_API_TOKEN: 'synthetic-c1-a-token',
  } as KeepAliveEnv;
}

describe('private legacy keep-alive Worker', () => {
  let worker: KeepAliveWorker;
  let consoleSpies: MockInstance[];

  beforeEach(async () => {
    consoleSpies = (['log', 'debug', 'info', 'warn', 'error'] as const)
      .map((channel) => vi.spyOn(console, channel).mockImplementation(() => undefined));
    vi.resetModules();
    ({ default: worker } = await import('../../cloudflare/legacy-keepalive-worker'));
  });

  afterEach(() => {
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    for (const spy of consoleSpies) spy.mockRestore();
    vi.unstubAllGlobals();
  });

  it.each(['legacy', 'shadow'] as const)('exports scheduled only and performs one bounded %s set', async (mode) => {
    expect(Object.keys(worker)).toEqual(['scheduled']);
    const captured = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', captured);
    const [ctx, wait] = executionContext();

    worker.scheduled({ scheduledTime: 1_700_000_000_000 } as ScheduledController, env(mode), ctx);
    await wait();

    expect(captured).toHaveBeenCalledTimes(1);
    const [url, init] = captured.mock.calls[0];
    expect(String(url)).toBe('http://127.0.0.1:8799/set/keep-alive/1700000000000?EX=172800');
    expect(init).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer synthetic-c1-a-token' } });
  });

  it('cloudflare mode performs no keep-alive state call', async () => {
    const captured = vi.fn();
    vi.stubGlobal('fetch', captured);
    const [ctx, wait] = executionContext();
    worker.scheduled({ scheduledTime: 1 } as ScheduledController, env('cloudflare'), ctx);
    await wait();
    expect(captured).not.toHaveBeenCalled();
  });

  it('maps native failure to status-only evidence', async () => {
    const captured = vi.fn().mockRejectedValue(new Error('native keepalive canary'));
    vi.stubGlobal('fetch', captured);
    const [ctx, wait] = executionContext();
    worker.scheduled({ scheduledTime: 1 } as ScheduledController, env('legacy'), ctx);
    await expect(wait()).resolves.toBeUndefined();
  });

  it('maps a non-OK keep-alive response without native-error disclosure', async () => {
    const captured = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', captured);
    const [ctx, wait] = executionContext();
    worker.scheduled({ scheduledTime: 1 } as ScheduledController, env('legacy'), ctx);
    await expect(wait()).resolves.toBeUndefined();
    expect(captured).toHaveBeenCalledTimes(1);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});
