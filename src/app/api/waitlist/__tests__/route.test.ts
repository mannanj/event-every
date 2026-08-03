import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';
import { setPlatformRuntimeForTests } from '@/platform/runtime';

const redisCalls = { incr: [] as string[], expire: [] as Array<[string, number]>, setnx: [] as Array<[string, string]> };
const redisState = { incrResult: 1, setnxResult: 1 };
const d1State = { configured: false, insertFailure: false, changes: 1 };
const d1Calls: Array<[string, Array<string | number | null>]> = [];
const deferred = mock((_work: Promise<void>) => {});

class FakeRedis {
  async incr(key: string) { redisCalls.incr.push(key); return redisState.incrResult; }
  async expire(key: string, ttl: number) { redisCalls.expire.push([key, ttl]); return 1; }
  async setnx(key: string, value: string) { redisCalls.setnx.push([key, value]); return redisState.setnxResult; }
}

mock.module('@upstash/redis', () => ({ Redis: FakeRedis }));
mock.module('@/lib/d1', () => ({
  isD1Configured: () => d1State.configured,
  d1Query: async (sql: string, params: Array<string | number | null>) => {
    d1Calls.push([sql, params]);
    if (sql.startsWith('INSERT') && d1State.insertFailure) throw new Error('native d1 canary');
    return { results: [], meta: { changes: d1State.changes } };
  },
}));
mock.module('@/platform/cloudflare-context', () => ({ deferPlatformWork: deferred }));

const { POST } = await import('@/app/api/waitlist/route');
const originalFetch = globalThis.fetch;

function request(email: string, ip = '203.0.113.10'): NextRequest {
  return new NextRequest('http://localhost/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, 'user-agent': 'waitlist-test' },
    body: JSON.stringify({ email }),
  });
}

beforeEach(() => {
  process.env.KV_REST_API_URL = 'https://synthetic.invalid';
  process.env.KV_REST_API_TOKEN = 'synthetic-token';
  delete process.env.RESEND_API_KEY;
  redisCalls.incr.length = 0;
  redisCalls.expire.length = 0;
  redisCalls.setnx.length = 0;
  redisState.incrResult = 1;
  redisState.setnxResult = 1;
  d1State.configured = false;
  d1State.insertFailure = false;
  d1State.changes = 1;
  d1Calls.length = 0;
  deferred.mockClear();
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  setPlatformRuntimeForTests(undefined);
  globalThis.fetch = originalFetch;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.RESEND_API_KEY;
});

test('legacy waitlist preserves distinct IP-equivalent rate-limit shards without exposing them to the port input', async () => {
  expect((await POST(request('one@example.com', '203.0.113.11'))).status).toBe(200);
  expect((await POST(request('two@example.com', '203.0.113.12'))).status).toBe(200);
  expect(redisCalls.incr).toHaveLength(2);
  expect(redisCalls.incr[0]).toContain('203.0.113.11');
  expect(redisCalls.incr[1]).toContain('203.0.113.12');
  expect(redisCalls.incr[0]).not.toBe(redisCalls.incr[1]);

  const submit = mock(async () => ({ status: 'accepted' as const, alreadyJoined: false, emailSent: false }));
  setPlatformRuntimeForTests({ mode: 'legacy', waitlist: { submit } });
  await POST(request('three@example.com', '203.0.113.99'));
  expect(submit).toHaveBeenCalledWith({
    identity: { kind: 'unknown', keyVersion: '', hmac: '' },
    email: 'three@example.com',
    honeypot: '',
    userAgent: 'waitlist-test',
  });
  expect(JSON.stringify(submit.mock.calls)).not.toContain('203.0.113.99');
});

test('normalizes email and falls back from D1 to idempotent Redis persistence', async () => {
  d1State.configured = true;
  d1State.insertFailure = true;
  const response = await POST(request('  Person@Example.COM  '));
  expect(response.status).toBe(200);
  expect(redisCalls.setnx[0]?.[0]).toBe('waitlist:pending:person@example.com');
  expect(JSON.parse(redisCalls.setnx[0]?.[1] ?? '{}')).toMatchObject({ email: 'person@example.com', source: 'event-every', userAgent: 'waitlist-test' });
});

test('treats an existing normalized Redis signup as idempotent and sends no duplicate mail', async () => {
  redisState.setnxResult = 0;
  process.env.RESEND_API_KEY = 'synthetic-resend-key';
  const send = mock(async () => new Response(null, { status: 200 }));
  globalThis.fetch = send as unknown as typeof fetch;

  const response = await POST(request(' Person@Example.COM '));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, alreadyJoined: true, emailSent: false });
  expect(redisCalls.setnx[0]?.[0]).toBe('waitlist:pending:person@example.com');
  expect(send).not.toHaveBeenCalled();
});

test('sends the complete one-time confirmation and cancels a non-success body unread', async () => {
  process.env.RESEND_API_KEY = 'synthetic-resend-key';
  let canceled = 0;
  let mailInit: RequestInit | undefined;
  globalThis.fetch = mock(async (_url, init) => {
    mailInit = init;
    return new Response(new ReadableStream({ cancel() { canceled++; } }), { status: 503 });
  }) as unknown as typeof fetch;

  const response = await POST(request('Person@Example.COM'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, alreadyJoined: false, emailSent: false });
  expect(canceled).toBe(1);
  const body = JSON.parse(String(mailInit?.body));
  expect(body).toMatchObject({
    to: ['person@example.com'],
    subject: "You're on the waitlist — Spirit & Hammer",
  });
  expect(body.text).toContain('Spirit & Hammer collective');
  expect(body.text).toContain('Event Every');
  expect(body.text).toContain('summonit.app');
  expect(body.html).toContain('Spirit &amp; Hammer');
  expect(new Headers(mailInit?.headers).get('Idempotency-Key')).toBe('waitlist-confirmation/person@example.com');
});

test('observes the background D1 email-sent update', async () => {
  process.env.RESEND_API_KEY = 'synthetic-resend-key';
  d1State.configured = true;
  globalThis.fetch = mock(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;

  const response = await POST(request('person@example.com'));
  expect(response.status).toBe(200);
  expect(deferred).toHaveBeenCalledTimes(1);
  await (deferred.mock.calls[0]?.[0] as Promise<void>);
  expect(d1Calls.some(([sql]) => sql.startsWith('UPDATE waitlist SET email_sent'))).toBe(true);
});

test.each(['shadow', 'cloudflare'] as const)('%s waitlist fails before body, state, or mail access', async (mode) => {
  const submit = mock(async () => ({ status: 'accepted' as const, alreadyJoined: false, emailSent: false }));
  setPlatformRuntimeForTests({ mode, waitlist: { submit } });
  const req = request('person@example.com');
  const json = mock(async () => ({ email: 'person@example.com' }));
  Object.defineProperty(req, 'json', { value: json });
  globalThis.fetch = mock(async () => { throw new Error('mail must not run'); }) as unknown as typeof fetch;

  const response = await POST(req);
  expect(response.status).toBe(503);
  expect(json).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
  expect(redisCalls.incr).toEqual([]);
  expect(d1Calls).toEqual([]);
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
