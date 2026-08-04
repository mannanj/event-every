import { describe, expect, test } from 'bun:test';
import { INTERNAL_IDENTITY_HEADER, admitEdgeRequest } from '@/platform/admission';
import { headerBackedTrustedEdgeAddressForTests } from '@/platform/identity';

const env = {
  IDENTITY_KEY_CURRENT_VERSION: 'test-v1',
  IDENTITY_HMAC_CURRENT: 'synthetic-admission-key',
};

const trustedEdge = headerBackedTrustedEdgeAddressForTests;

type StreamProbe = {
  stream: ReadableStream<Uint8Array>;
  pulls: () => number;
  cancelled: () => boolean;
};

function probedStream(chunks: Uint8Array[], onFirstPull?: () => void): StreamProbe {
  let pullCount = 0;
  let wasCancelled = false;
  let index = 0;
  return {
    stream: new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount++;
        if (pullCount === 1) onFirstPull?.();
        const chunk = chunks[index++];
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
      cancel() {
        wasCancelled = true;
      },
    }, { highWaterMark: 0 }),
    pulls: () => pullCount,
    cancelled: () => wasCancelled,
  };
}

function postRequest(
  path: string,
  body: BodyInit | null = '{}',
  headers: HeadersInit = {},
  signal?: AbortSignal,
): Request {
  return new Request(`https://event-every.test${path}`, {
    method: 'POST',
    headers: {
      origin: 'https://event-every.test',
      'content-type': 'application/json',
      'cf-connecting-ip': '203.0.113.8',
      ...headers,
    },
    body,
    signal,
  });
}

async function expectFixedError(response: Response, status: number, code: string, canary: string): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get('content-type')).toContain('application/json');
  const text = await response.text();
  expect(JSON.parse(text)).toMatchObject({ code });
  expect(text).not.toContain(canary);
}

describe('edge admission policy', () => {
  test.each(['/api/auth/challenge', '/api/auth/redeem'])('%s is reserved before method, origin, body, or identity work', async (path) => {
    const bodyCanary = 'reserved-auth-body-canary';
    const methodProbe = probedStream([new TextEncoder().encode(bodyCanary)]);
    const wrongMethod = new Request(`https://event-every.test${path}`, {
      method: 'PUT',
      headers: { origin: 'https://hostile.invalid', 'content-type': 'text/plain' },
      body: methodProbe.stream,
    });
    const result = await admitEdgeRequest(wrongMethod, env, {}, {
      readAddress() { throw new Error('identity must not run'); },
    });

    expect(result.status).toBe('failure');
    if (result.status === 'success') throw new Error('expected reserved rejection');
    await expectFixedError(result.response, 404, 'auth_not_available', bodyCanary);
    expect(methodProbe.pulls()).toBe(0);

    const originProbe = probedStream([new TextEncoder().encode(bodyCanary)]);
    const hostileOrigin = new Request(`https://event-every.test${path}`, {
      method: 'POST',
      headers: { origin: 'https://hostile.invalid', 'content-type': 'application/json' },
      body: originProbe.stream,
    });
    const originResult = await admitEdgeRequest(hostileOrigin, env, {}, {
      readAddress() { throw new Error('identity must not run'); },
    });

    expect(originResult.status).toBe('failure');
    if (originResult.status === 'success') throw new Error('expected reserved rejection');
    await expectFixedError(originResult.response, 404, 'auth_not_available', bodyCanary);
    expect(originProbe.pulls()).toBe(0);
  });

  test.each([
    ['/api/auth/challenge', 'media', { 'content-type': 'text/plain' }],
    ['/api/auth/challenge', 'encoding', { 'content-type': 'application/json', 'content-encoding': 'gzip' }],
    ['/api/auth/redeem', 'media', { 'content-type': 'text/plain' }],
    ['/api/auth/redeem', 'encoding', { 'content-type': 'application/json', 'content-encoding': 'gzip' }],
  ])('%s is reserved before invalid %s validation', async (path, kind, headers) => {
    const bodyCanary = `reserved-auth-${kind}-body-canary`;
    const probe = probedStream([new TextEncoder().encode(bodyCanary)]);
    const request = new Request(`https://event-every.test${path}`, {
      method: 'POST',
      headers: { origin: 'https://event-every.test', ...headers },
      body: probe.stream,
    });
    const result = await admitEdgeRequest(request, env, {}, {
      readAddress() { throw new Error('identity must not run'); },
    });

    expect(result.status).toBe('failure');
    if (result.status === 'success') throw new Error('expected reserved rejection');
    await expectFixedError(result.response, 404, 'auth_not_available', bodyCanary);
    expect(probe.pulls()).toBe(0);
  });

  test('cross-site text is rejected before route', async () => {
    const canary = 'private-cross-site-canary';
    const probe = probedStream([new TextEncoder().encode(canary)]);
    const result = await admitEdgeRequest(postRequest('/api/scan', probe.stream, {
      origin: `https://${canary}.invalid`,
    }), env, {}, trustedEdge);

    expect(result.status).toBe('failure');
    if (result.status === 'success') throw new Error('expected rejection');
    await expectFixedError(result.response, 403, 'origin_not_allowed', canary);
    expect(probe.pulls()).toBe(0);
  });

  test('rejects an unclassified route and wrong method before reading with closed Allow', async () => {
    const unknownProbe = probedStream([new Uint8Array([1])]);
    const unknown = await admitEdgeRequest(postRequest('/api/not-classified', unknownProbe.stream), env, {}, trustedEdge);
    expect(unknown.status).toBe('failure');
    if (unknown.status === 'success') throw new Error('expected rejection');
    await expectFixedError(unknown.response, 404, 'route_not_found', 'not-classified');
    expect(unknownProbe.pulls()).toBe(0);

    const methodProbe = probedStream([new Uint8Array([1])]);
    const wrongMethod = new Request('https://event-every.test/api/scan', {
      method: 'PUT',
      headers: { origin: 'https://event-every.test', 'content-type': 'application/json' },
      body: methodProbe.stream,
    });
    const rejected = await admitEdgeRequest(wrongMethod, env, {}, trustedEdge);
    expect(rejected.status).toBe('failure');
    if (rejected.status === 'success') throw new Error('expected rejection');
    expect(rejected.response.status).toBe(405);
    expect(rejected.response.headers.get('allow')).toBe('POST');
    expect(methodProbe.pulls()).toBe(0);
  });

  test.each([
    ['/api/auth/verify', 'POST'],
    ['/api/keep-alive', 'GET'],
  ])('retires %s with fixed 410 before identity or body read', async (path, method) => {
    const probe = probedStream([new TextEncoder().encode('retired-route-canary')]);
    const request = new Request(`https://event-every.test${path}`, {
      method,
      headers: {
        origin: 'https://cross-site.invalid',
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.90',
      },
      ...(method === 'POST' ? { body: probe.stream } : {}),
    });
    const result = await admitEdgeRequest(request, env, {}, {
      readAddress() { throw new Error('identity must not run'); },
    });
    expect(result.status).toBe('failure');
    if (result.status === 'success') throw new Error('expected retirement');
    await expectFixedError(result.response, 410, 'route_retired', 'retired-route-canary');
    expect(probe.pulls()).toBe(0);
  });

  test.each([
    ['absent', undefined],
    ['empty', ''],
  ])('accepts %s Origin for a non-resolver API route', async (_case, origin) => {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (origin !== undefined) headers.set('origin', origin);
    const request = new Request('https://event-every.test/api/scan', {
      method: 'POST',
      headers,
      body: '{}',
    });
    const result = await admitEdgeRequest(request, env, {}, trustedEdge);
    expect(result.status).toBe('success');
  });

  test('accepts exact same Origin and rejects literal null Origin', async () => {
    const sameOrigin = await admitEdgeRequest(postRequest('/api/scan', '{}'), env, {}, trustedEdge);
    const nullOrigin = await admitEdgeRequest(postRequest('/api/scan', '{}', { origin: 'null' }), env, {}, trustedEdge);
    expect(sameOrigin.status).toBe('success');
    expect(nullOrigin.status).toBe('failure');
  });

  test.each([
    ['absent', undefined],
    ['empty', ''],
    ['literal null', 'null'],
  ])('resolver %s Origin is rejected before body read', async (_case, origin) => {
    const probe = probedStream([new TextEncoder().encode('{"url":"https://example.test"}')]);
    const headers = new Headers({ 'content-type': 'application/json' });
    if (origin !== undefined) headers.set('origin', origin);
    const request = new Request('https://event-every.test/api/scrape-url', {
      method: 'POST',
      headers,
      body: probe.stream,
    });
    const result = await admitEdgeRequest(request, env, {}, trustedEdge);
    expect(result.status).toBe('failure');
    if (result.status === 'success') throw new Error('expected rejection');
    expect(result.response.status).toBe(403);
    expect(probe.pulls()).toBe(0);
  });

  test.each([
    ['missing JSON media', { 'content-type': '' }, 415, 'unsupported_media_type'],
    ['text media', { 'content-type': 'text/plain' }, 415, 'unsupported_media_type'],
    ['gzip encoding', { 'content-encoding': 'gzip' }, 415, 'unsupported_content_encoding'],
    ['multiple encodings', { 'content-encoding': 'identity, gzip' }, 415, 'unsupported_content_encoding'],
  ])('rejects %s before reading the body', async (_case, headers, status, code) => {
    const probe = probedStream([new TextEncoder().encode('body-media-canary')]);
    const result = await admitEdgeRequest(postRequest('/api/scan', probe.stream, headers), env, {}, trustedEdge);
    expect(result.status).toBe('failure');
    if (result.status === 'success') throw new Error('expected rejection');
    await expectFixedError(result.response, status, code, 'body-media-canary');
    expect(probe.pulls()).toBe(0);
  });

  test.each([
    ['application/json', undefined],
    ['application/json; charset=utf-8', undefined],
    ['application/json', 'identity'],
  ])('accepts JSON media %s with content encoding %s', async (contentType, encoding) => {
    const headers: Record<string, string> = { 'content-type': contentType };
    if (encoding) headers['content-encoding'] = encoding;
    const result = await admitEdgeRequest(postRequest('/api/waitlist', '{}', headers), env, {}, trustedEdge);
    expect(result.status).toBe('success');
  });

  test('exact byte ceiling is accepted', async () => {
    const body = new Uint8Array(4 * 1024);
    const result = await admitEdgeRequest(postRequest('/api/waitlist', body), env, {}, trustedEdge);
    expect(result.status).toBe('success');
    if (result.status === 'failure') throw new Error('expected admission');
    expect((await result.request.arrayBuffer()).byteLength).toBe(4 * 1024);
  });

  test('chunked overflow cancels the stream', async () => {
    const probe = probedStream([new Uint8Array(4 * 1024), new Uint8Array([1]), new Uint8Array([2])]);
    const request = postRequest('/api/waitlist', probe.stream, { 'content-length': '1' });
    const result = await admitEdgeRequest(request, env, {}, trustedEdge);
    expect(result.status).toBe('failure');
    if (result.status === 'success') throw new Error('expected rejection');
    expect(result.response.status).toBe(413);
    expect(probe.cancelled()).toBe(true);
    expect(probe.pulls()).toBe(2);
  });

  test('counts real bytes when Content-Length falsely claims an oversized body', async () => {
    const result = await admitEdgeRequest(postRequest('/api/waitlist', '{}', { 'content-length': '999999' }), env, {}, trustedEdge);
    expect(result.status).toBe('success');
    if (result.status === 'failure') throw new Error('expected admission');
    expect(await result.request.text()).toBe('{}');
  });

  test('abort during stream cancels the reader and returns a fixed response', async () => {
    const controller = new AbortController();
    const probe = probedStream([new Uint8Array([1]), new Uint8Array([2])], () => controller.abort('abort-canary'));
    const result = await admitEdgeRequest(postRequest('/api/waitlist', probe.stream, {}, controller.signal), env, {}, trustedEdge);
    expect(result.status).toBe('failure');
    if (result.status === 'success') throw new Error('expected rejection');
    await expectFixedError(result.response, 400, 'request_aborted', 'abort-canary');
    expect(probe.cancelled()).toBe(true);
  });

  test('rebuilds one request with only server-injected identity headers', async () => {
    const original = postRequest('/api/scan', '{"kind":"text","text":"hello"}', {
      'x-forwarded-for': '198.51.100.22',
      'x-real-ip': '198.51.100.23',
      [INTERNAL_IDENTITY_HEADER]: 'known:forged:deadbeef',
      'x-preserved': 'yes',
    });
    const result = await admitEdgeRequest(original, env, {}, trustedEdge);
    expect(result.status).toBe('success');
    if (result.status === 'failure') throw new Error('expected admission');

    expect(result.request).not.toBe(original);
    expect(result.request.headers.get('cf-connecting-ip')).toBeNull();
    expect(result.request.headers.get('x-forwarded-for')).toBeNull();
    expect(result.request.headers.get('x-real-ip')).toBeNull();
    expect(result.request.headers.get(INTERNAL_IDENTITY_HEADER)).toMatch(/^known:test-v1:[0-9a-f]{64}$/);
    expect(result.request.headers.get('x-preserved')).toBe('yes');
    expect(await result.request.text()).toBe('{"kind":"text","text":"hello"}');
    expect(result.identity).toMatchObject({ kind: 'known', keyVersion: 'test-v1' });
  });

  test('passes a scrubbed non-API stream through without consuming it', async () => {
    const probe = probedStream([new TextEncoder().encode('page-body-canary')]);
    const request = new Request('https://event-every.test/events/import', {
      method: 'POST',
      headers: {
        'cf-connecting-ip': '203.0.113.8',
        'x-forwarded-for': '198.51.100.22',
        [INTERNAL_IDENTITY_HEADER]: 'known:forged:deadbeef',
      },
      body: probe.stream,
    });

    const result = await admitEdgeRequest(request, env, {}, trustedEdge);
    expect(result.status).toBe('success');
    if (result.status === 'failure') throw new Error('expected pass-through');
    expect(probe.pulls()).toBe(0);
    expect(result.request.headers.get('cf-connecting-ip')).toBeNull();
    expect(result.request.headers.get('x-forwarded-for')).toBeNull();
    expect(result.request.headers.get(INTERNAL_IDENTITY_HEADER)).toMatch(/^known:test-v1:[0-9a-f]{64}$/);
  });
});
