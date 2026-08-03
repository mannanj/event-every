import { describe, expect, it } from 'vitest';
import { admitEdgeRequest } from '../../src/platform/admission';
import { headerBackedTrustedEdgeAddressForTests } from '../../src/platform/identity';

const env = {
  IDENTITY_KEY_CURRENT_VERSION: 'workerd-v1',
  IDENTITY_HMAC_CURRENT: 'synthetic-workerd-identity-key',
};

const trustedEdge = headerBackedTrustedEdgeAddressForTests;

type CustomBody = {
  body: ReadableStream<Uint8Array>;
  cancelled(): boolean;
  pulls(): number;
};

function customBody(chunks: Uint8Array[], onPull?: (count: number) => void): CustomBody {
  let index = 0;
  let pullCount = 0;
  let wasCancelled = false;
  return {
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount++;
        onPull?.(pullCount);
        const chunk = chunks[index++];
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
      cancel() {
        wasCancelled = true;
      },
    }, { highWaterMark: 0 }),
    cancelled: () => wasCancelled,
    pulls: () => pullCount,
  };
}

function scanRequest(body: ReadableStream<Uint8Array>, headers: HeadersInit = {}, signal?: AbortSignal): Request {
  return new Request('https://event-every.test/api/scan', {
    method: 'POST',
    headers: {
      origin: 'https://event-every.test',
      'content-type': 'application/json',
      'cf-connecting-ip': '203.0.113.20',
      ...headers,
    },
    body,
    signal,
  });
}

describe('workerd streaming admission', () => {
  it('rejects gzip before pulling a custom request stream', async () => {
    const stream = customBody([new TextEncoder().encode('compressed-canary')]);
    const result = await admitEdgeRequest(scanRequest(stream.body, { 'content-encoding': 'gzip' }), env, {}, trustedEdge);
    expect(result.status).toBe('failure');
    if (result.status === 'success') throw new Error('expected rejection');
    expect(result.response.status).toBe(415);
    expect(await result.response.text()).not.toContain('compressed-canary');
    expect(stream.pulls()).toBe(0);
  });

  it('accepts the exact 12 MiB scan ceiling despite a false Content-Length', async () => {
    const stream = customBody([new Uint8Array(6 * 1024 * 1024), new Uint8Array(6 * 1024 * 1024)]);
    const result = await admitEdgeRequest(scanRequest(stream.body, { 'content-length': '1' }), env, {}, trustedEdge);
    expect(result.status).toBe('success');
    if (result.status === 'failure') throw new Error('expected admission');
    expect((await result.request.arrayBuffer()).byteLength).toBe(12 * 1024 * 1024);
    expect(stream.cancelled()).toBe(false);
  });

  it('rejects one byte over the 12 MiB scan ceiling and cancels the custom stream', async () => {
    const stream = customBody([
      new Uint8Array(6 * 1024 * 1024),
      new Uint8Array(6 * 1024 * 1024),
      new Uint8Array([1]),
      new Uint8Array([2]),
    ]);
    const result = await admitEdgeRequest(scanRequest(stream.body, { 'content-length': '0' }), env, {}, trustedEdge);
    expect(result.status).toBe('failure');
    if (result.status === 'success') throw new Error('expected rejection');
    expect(result.response.status).toBe(413);
    expect(stream.cancelled()).toBe(true);
    expect(stream.pulls()).toBe(3);
  });

  it('cancels a custom stream when the request aborts during consumption', async () => {
    const controller = new AbortController();
    const stream = customBody([new Uint8Array([1]), new Uint8Array([2])], (count) => {
      if (count === 1) controller.abort('workerd-abort-canary');
    });
    const result = await admitEdgeRequest(scanRequest(stream.body, {}, controller.signal), env, {}, trustedEdge);
    expect(result.status).toBe('failure');
    if (result.status === 'success') throw new Error('expected rejection');
    expect(result.response.status).toBe(400);
    expect(await result.response.text()).not.toContain('workerd-abort-canary');
    expect(stream.cancelled()).toBe(true);
  });

  it('passes a scrubbed non-API stream through without pulling it', async () => {
    const stream = customBody([new TextEncoder().encode('workerd-page-canary')]);
    const request = new Request('https://event-every.test/events/import', {
      method: 'POST',
      headers: {
        'cf-connecting-ip': '203.0.113.20',
        'x-forwarded-for': '198.51.100.20',
        'x-event-every-identity': 'known:forged:deadbeef',
      },
      body: stream.body,
    });

    const result = await admitEdgeRequest(request, env, {}, trustedEdge);
    expect(result.status).toBe('success');
    if (result.status === 'failure') throw new Error('expected pass-through');
    expect(stream.pulls()).toBe(0);
    expect(result.request.headers.get('cf-connecting-ip')).toBeNull();
    expect(result.request.headers.get('x-forwarded-for')).toBeNull();
    expect(result.request.headers.get('x-event-every-identity')).toMatch(/^known:workerd-v1:[0-9a-f]{64}$/);
    await result.request.body?.cancel();
  });
});
