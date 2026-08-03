import { describe, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';
import { issueResolverCapability, resolverRequestAuthorityName, utcDay } from '@/platform/resolver/capability';
import { POST } from '../route';

const nowMs = Date.UTC(2026, 7, 3, 12);
const origin = 'https://event-every.test';
const target = 'https://events.example.com/event';
const requestId = '018f47a0-7b5c-7cc4-9a34-123456789abc';
const identity = `known:v1:${'a'.repeat(64)}`;
const key = 'synthetic-resolver-capability-key';

async function fixture(overrides: Partial<{
  target: string;
  urls: string[];
  requestId: string;
  identity: string;
  origin: string;
  capability: string;
  admission: { status: 'admitted'; leaseId: string; expiresAtMs: number } | { status: 'busy'; retryAfterSeconds: number };
  signal: AbortSignal;
  onClaim(): void;
}> = {}) {
  const urls = overrides.urls ?? [target];
  const issued = await issueResolverCapability({ identity, urls, nowMs, key, nonce: requestId });
  if (issued.status !== 'issued') throw new Error('fixture capability');
  const calls: string[] = [];
  const authority = {
    begin: mock(async (_input: Record<string, string | number>) => { calls.push('begin'); return { status: 'begun' as const, executionId: 'execution-1' }; }),
    claim: mock(async (_input: Record<string, string | number>) => { calls.push('claim'); overrides.onClaim?.(); return { status: 'permit' as const, nonce: 'permit-1' }; }),
    complete: mock(async (input: { outcome: string }) => { calls.push(`complete:${input.outcome}`); return { status: 'stored' as const }; }),
  };
  const counter = {
    admitResolver: mock(async (_input: Record<string, string | number>) => { calls.push('admit'); return overrides.admission ?? { status: 'admitted' as const, leaseId: 'lease-1', expiresAtMs: nowMs + 10_000 }; }),
    releaseResolver: mock(async (input: { phase: string }) => { calls.push(`release:${input.phase}`); return { status: input.phase === 'after-outbound' ? 'consumed' as const : 'released' as const }; }),
  };
  const namespace = <T>(stub: T) => ({ idFromName: (name: string) => name, get: () => stub });
  const env = {
    RESOLVER_CAPABILITY_HMAC: key,
    RESOLVER_REQUEST_AUTHORITY: namespace(authority),
    RESOLVER_DAILY_COUNTER: namespace(counter),
  };
  const request = new NextRequest(`${origin}/api/scrape-url`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: overrides.origin ?? origin,
      'x-event-every-identity': overrides.identity ?? identity,
    },
    body: JSON.stringify({
      url: overrides.target ?? target,
      urls,
      requestId: overrides.requestId ?? requestId,
      resolverCapability: overrides.capability ?? issued.capability,
    }),
    signal: overrides.signal,
  });
  return { request, env, authority, counter, calls };
}

async function invoke(request: NextRequest, env: unknown, fetchFn: typeof fetch): Promise<Response> {
  const symbol = Symbol.for('__cloudflare-context__');
  const globalScope = globalThis as typeof globalThis & { [symbol]: unknown };
  const previousContext = globalScope[symbol];
  const previousFetch = globalThis.fetch;
  const previousNow = Date.now;
  globalScope[symbol] = { env, ctx: { waitUntil() {} }, cf: undefined };
  globalThis.fetch = fetchFn;
  Date.now = () => nowMs;
  try { return await POST(request); }
  finally {
    Date.now = previousNow;
    globalThis.fetch = previousFetch;
    if (previousContext === undefined) delete globalScope[symbol];
    else globalScope[symbol] = previousContext;
  }
}

describe('bounded scrape route', () => {
  test('validates authority before state and executes begin/admit/claim/outbound/release/complete in order', async () => {
    const value = await fixture();
    const fetchFn = mock(async () => new Response('<title>Event</title><body>Details</body>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }));
    const response = await invoke(value.request, value.env, fetchFn as unknown as typeof fetch);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: target, text: 'Details', title: 'Event', status: 'success' });
    expect(value.calls).toEqual(['begin', 'admit', 'claim', 'release:after-outbound', 'complete:success']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(value.authority.begin.mock.calls[0]?.[0]).toMatchObject({
      requestId,
      authorityDay: utcDay(nowMs),
      identityVersion: 'v1',
      identityHmac: 'a'.repeat(64),
      permitDeadlineMs: nowMs + 120_000,
    });
    expect(await resolverRequestAuthorityName(requestId)).toHaveLength(64);
  });

  test('canonical origin, trusted identity, UUID, URL policy, and capability membership precede state', async () => {
    const cases = [
      { origin: 'https://evil.example' },
      { identity: 'forged' },
      { requestId: 'not-a-uuid' },
      { target: 'http://127.0.0.1/private' },
      { target: 'https://other.example/path' },
    ];
    for (const changes of cases) {
      const value = await fixture(changes);
      const fetchFn = mock(async () => new Response('should not run'));
      const response = await invoke(value.request, value.env, fetchFn as unknown as typeof fetch);
      expect(response.status).toBe(400);
      expect(value.calls).toEqual([]);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });

  test('accepts only HTML and plain text and leaves upstream error bodies unread', async () => {
    for (const response of [
      new Response('binary', { headers: { 'content-type': 'application/octet-stream' } }),
      new Response('plain details', { headers: { 'content-type': 'text/plain' } }),
    ]) {
      const value = await fixture();
      const result = await invoke(value.request, value.env, mock(async () => response) as unknown as typeof fetch);
      expect(result.status).toBe(response.headers.get('content-type') === 'text/plain' ? 200 : 415);
    }

    let pulled = false;
    let cancelled = false;
    const canary = new ReadableStream<Uint8Array>(
      { pull() { pulled = true; }, cancel() { cancelled = true; } },
      { highWaterMark: 0 },
    );
    const value = await fixture();
    const result = await invoke(value.request, value.env, mock(async () => new Response(canary, { status: 502 })) as unknown as typeof fetch);
    expect(result.status).toBe(502);
    expect(pulled).toBe(false);
    expect(cancelled).toBe(true);
    expect(value.calls).toEqual(['begin', 'admit', 'claim', 'release:after-outbound', 'complete:failed']);
  });

  test('error-body canary is unread', async () => {
    let pulled = false;
    let cancelled = false;
    const canary = new ReadableStream<Uint8Array>(
      { pull() { pulled = true; }, cancel() { cancelled = true; } },
      { highWaterMark: 0 },
    );
    const value = await fixture();
    const result = await invoke(value.request, value.env, mock(async () => new Response(canary, { status: 500 })) as unknown as typeof fetch);
    expect(result.status).toBe(502);
    expect(pulled).toBe(false);
    expect(cancelled).toBe(true);
  });

  test('512 KiB plus one cancels upstream', async () => {
    let cancelled = false;
    let sent = false;
    const overflow = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (sent) { controller.close(); return; }
          sent = true;
          controller.enqueue(new Uint8Array(512 * 1024 + 1));
        },
        cancel() { cancelled = true; },
      },
      { highWaterMark: 0 },
    );
    const value = await fixture();
    const result = await invoke(value.request, value.env, mock(async () => new Response(overflow, {
      headers: { 'content-type': 'text/plain' },
    })) as unknown as typeof fetch);
    expect(result.status).toBe(502);
    expect(cancelled).toBe(true);
  });

  test('maps busy without claim or fetch and preserves the retry contract', async () => {
    const value = await fixture({ admission: { status: 'busy', retryAfterSeconds: 3 } });
    const fetchFn = mock(async () => new Response('should not run'));
    const response = await invoke(value.request, value.env, fetchFn as unknown as typeof fetch);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ code: 'resolver_busy', retryAfterSeconds: 3 });
    expect(value.calls).toEqual(['begin', 'admit', 'complete:failed']);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test('abort during claim releases before outbound and performs zero fetches', async () => {
    const controller = new AbortController();
    const value = await fixture({
      signal: controller.signal,
      onClaim: () => controller.abort(new DOMException('cancelled during claim', 'AbortError')),
    });
    const fetchFn = mock(async () => new Response('should not run'));
    const response = await invoke(value.request, value.env, fetchFn as unknown as typeof fetch);
    expect(response.status).toBe(408);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(value.calls).toEqual(['begin', 'admit', 'claim', 'release:before-outbound', 'complete:unknown']);
  });
});
