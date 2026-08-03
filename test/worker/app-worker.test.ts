import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error cloudflare:test is injected by the Workers Vitest pool only.
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';

const { delegated } = vi.hoisted(() => ({ delegated: vi.fn() }));
vi.mock('../../.open-next/worker.js', () => ({
  default: { fetch: delegated },
}));

import worker from '../../cloudflare/app-worker';
import { INTERNAL_IDENTITY_HEADER } from '../../src/platform/admission';
import { settleLegacyDispatch, startLegacyDispatch } from '../../src/platform/legacy/dispatch';

const workerEnv = {
  IDENTITY_KEY_CURRENT_VERSION: 'test-v1',
  IDENTITY_HMAC_CURRENT: 'synthetic-worker-key',
} as unknown as CloudflareEnv;

type WaitUntilContext = Readonly<{
  waitUntil(work: Promise<unknown>): void;
}>;

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

describe('C1-A app Worker admission wrapper', () => {
  beforeEach(() => delegated.mockReset());

  it('wrapper forwards only rebuilt admitted request', async () => {
    const request = new Request('https://event-every.test/api/scan', {
      method: 'POST',
      headers: {
        origin: 'https://event-every.test',
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.12',
        'x-forwarded-for': '198.51.100.12',
        [INTERNAL_IDENTITY_HEADER]: 'known:forged:deadbeef',
        'x-c1-a': 'request',
      },
      body: '{}',
    });
    const env = {
      C1_DEPLOYMENT_DISABLED: '1',
      IDENTITY_KEY_CURRENT_VERSION: 'test-v1',
      IDENTITY_HMAC_CURRENT: 'synthetic-worker-key',
    } as unknown as CloudflareEnv;
    const ctx = { waitUntil: vi.fn() };
    const response = new Response('delegated exactly', { status: 209, headers: { 'x-c1-a': 'response' } });
    delegated.mockResolvedValueOnce(response);

    expect(Object.keys(worker)).toEqual(['fetch']);
    await expect(worker.fetch(request, env, ctx as never)).resolves.toBe(response);
    expect(delegated).toHaveBeenCalledTimes(1);
    const [admittedRequest, delegatedEnv, delegatedCtx] = delegated.mock.calls[0];
    expect(admittedRequest).not.toBe(request);
    expect(admittedRequest.headers.get('cf-connecting-ip')).toBeNull();
    expect(admittedRequest.headers.get('x-forwarded-for')).toBeNull();
    expect(admittedRequest.headers.get(INTERNAL_IDENTITY_HEADER)).toBe('unknown');
    expect(admittedRequest.headers.get('x-c1-a')).toBe('request');
    expect(await admittedRequest.text()).toBe('{}');
    expect(delegatedEnv).toBe(env);
    expect(delegatedCtx).toBe(ctx);
  });

  it('scrubs forged edge headers before delegating a non-API asset', async () => {
    const request = new Request('https://event-every.test/_next/static/app.js', {
      headers: {
        'cf-connecting-ip': '203.0.113.99',
        'x-forwarded-for': '198.51.100.99',
        'x-real-ip': '192.0.2.99',
        forwarded: 'for=203.0.113.99',
        [INTERNAL_IDENTITY_HEADER]: 'known:forged:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'x-preserved-asset': 'yes',
      },
    });
    const env = {
      IDENTITY_KEY_CURRENT_VERSION: 'test-v1',
      IDENTITY_HMAC_CURRENT: 'synthetic-worker-key',
    } as unknown as CloudflareEnv;
    const ctx = { waitUntil: vi.fn() };
    const response = new Response('asset');
    delegated.mockResolvedValueOnce(response);

    await expect(worker.fetch(request, env, ctx as never)).resolves.toBe(response);
    expect(delegated).toHaveBeenCalledTimes(1);
    const [scrubbedRequest] = delegated.mock.calls[0];
    expect(scrubbedRequest.headers.get('cf-connecting-ip')).toBeNull();
    expect(scrubbedRequest.headers.get('x-forwarded-for')).toBeNull();
    expect(scrubbedRequest.headers.get('x-real-ip')).toBeNull();
    expect(scrubbedRequest.headers.get('forwarded')).toBeNull();
    expect(scrubbedRequest.headers.get(INTERNAL_IDENTITY_HEADER)).toBe('unknown');
    expect(scrubbedRequest.headers.get('x-preserved-asset')).toBe('yes');
  });

  it('returns a fixed admission failure without delegating', async () => {
    const request = new Request('https://event-every.test/api/scan', {
      method: 'POST',
      headers: { origin: 'https://cross-site.invalid', 'content-type': 'application/json' },
      body: '{"private":"worker-canary"}',
    });
    const env = {
      IDENTITY_KEY_CURRENT_VERSION: 'test-v1',
      IDENTITY_HMAC_CURRENT: 'synthetic-worker-key',
    } as unknown as CloudflareEnv;

    const response = await worker.fetch(request, env, {} as never);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('worker-canary');
    expect(delegated).not.toHaveBeenCalled();
  });

  it('keeps late legacy charge observation owned after the response', async () => {
    const ctx = createExecutionContext();
    const releaseCharge = deferred<void>();
    let chargeObserved = false;
    delegated.mockImplementationOnce(async (
      request: Request,
      _env: CloudflareEnv,
      delegatedCtx: WaitUntilContext,
    ) => {
      const start = startLegacyDispatch({
        signal: request.signal,
        charge: () => releaseCharge.promise.then(() => {
          chargeObserved = true;
          return { status: 'charged' as const };
        }),
        provider: () => ({ status: 'success' as const, value: 'response-ready' }),
      });
      if (start.status !== 'started') throw new Error('dispatch did not start');
      const result = await settleLegacyDispatch(start, request.signal, (work) => delegatedCtx.waitUntil(work));
      return new Response(result.status === 'success' ? result.value : result.code);
    });

    const response = await worker.fetch(
      new Request('https://event-every.test/_next/task-5-charge'),
      workerEnv,
      ctx,
    );

    expect(await response.text()).toBe('response-ready');
    expect(chargeObserved).toBe(false);
    releaseCharge.resolve();
    await waitOnExecutionContext(ctx);
    expect(chargeObserved).toBe(true);
  });

  it('keeps concurrent late charge work scoped to each request context', async () => {
    const ctxA = createExecutionContext();
    const ctxB = createExecutionContext();
    const charges = {
      a: deferred<void>(),
      b: deferred<void>(),
    };
    const observed: string[] = [];
    const delegateRequest = (expectedLabel: 'a' | 'b') => async (
      request: Request,
      _env: CloudflareEnv,
      delegatedCtx: WaitUntilContext,
    ) => {
      const label = request.headers.get('x-task-5-label');
      if (label !== expectedLabel) throw new Error('missing request label');
      const start = startLegacyDispatch({
        signal: request.signal,
        charge: () => charges[expectedLabel].promise.then(() => {
          observed.push(expectedLabel);
          return { status: 'charged' as const };
        }),
        provider: () => ({ status: 'success' as const, value: expectedLabel }),
      });
      if (start.status !== 'started') throw new Error('dispatch did not start');
      const result = await settleLegacyDispatch(start, request.signal, (work) => delegatedCtx.waitUntil(work));
      return new Response(result.status === 'success' ? result.value : result.code);
    };
    delegated.mockImplementationOnce(delegateRequest('a'));
    delegated.mockImplementationOnce(delegateRequest('b'));

    const responseA = await worker.fetch(
      new Request('https://event-every.test/_next/task-5-a', { headers: { 'x-task-5-label': 'a' } }),
      workerEnv,
      ctxA,
    );
    const responseB = await worker.fetch(
      new Request('https://event-every.test/_next/task-5-b', { headers: { 'x-task-5-label': 'b' } }),
      workerEnv,
      ctxB,
    );
    await expect(Promise.all([responseA.text(), responseB.text()])).resolves.toEqual(['a', 'b']);

    charges.a.resolve();
    await waitOnExecutionContext(ctxA);
    expect(observed).toEqual(['a']);
    charges.b.resolve();
    await waitOnExecutionContext(ctxB);
    expect(observed).toEqual(['a', 'b']);
  });
});
