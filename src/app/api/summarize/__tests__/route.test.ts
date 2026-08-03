import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';
import type { LegacyProviderInput, LegacyProviderPort } from '@/platform/contracts';
import { setPlatformRuntimeForTests } from '@/platform/runtime';

const calls = { key: 0, limits: 0, charge: 0, transport: 0 };
const transportState = { kind: 'success' as 'success' | 'community-limit' | 'failure' };

class FakeCommunityLimitError extends Error {
  constructor(readonly resetAt: string) { super('community limit'); }
}

mock.module('@/lib/llm', () => ({
  getLlmMode: () => 'community',
  getLlmKey: () => { calls.key++; return 'synthetic-key'; },
  openRouterChat: async () => {
    calls.transport++;
    if (transportState.kind === 'community-limit') throw new FakeCommunityLimitError('2026-08-03T00:00:00.000Z');
    if (transportState.kind === 'failure') throw new Error('native summary canary');
    return { choices: [{ message: { content: 'Team Lunch' } }] };
  },
  CommunityLimitError: FakeCommunityLimitError,
  communityLimitResponse: (error: FakeCommunityLimitError) => Response.json({ error: error.message, code: 'community_limit', resetAt: error.resetAt }, { status: 402 }),
}));
mock.module('@/lib/limits', () => ({
  evaluateLimits: async () => {
    calls.limits++;
    return { allowed: true, reason: null, resetAt: '2026-08-03T00:00:00.000Z', isAdmin: false, budget: null, ipRate: { limit: 1000, remaining: 1000, exhausted: false, resetAt: '2026-08-03T00:00:00.000Z' } };
  },
  chargeIpRate: async () => { calls.charge++; return { success: true, remaining: 999, reset: 0 }; },
}));

const { POST } = await import('@/app/api/summarize/route');
const REQUEST_ID = '018F47A0-7B5C-7CC4-9A34-123456789ABC';

function request(body: unknown = { text: 'Lunch' }): NextRequest {
  return new NextRequest('http://localhost/api/summarize', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-event-every-request-id': REQUEST_ID },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  calls.key = 0;
  calls.limits = 0;
  calls.charge = 0;
  calls.transport = 0;
  transportState.kind = 'success';
});

afterEach(() => setPlatformRuntimeForTests(undefined));

test('summary rejects malformed request UUID before provider work', async () => {
  const response = await POST(new NextRequest('http://localhost/api/summarize', { method: 'POST', body: JSON.stringify({ text: 'hello' }) }));
  expect(response.status).toBe(400);
  expect(calls).toEqual({ key: 0, limits: 0, charge: 0, transport: 0 });
});

test('summary passes closed dispatch fields and keeps charge separate from provider transport', async () => {
  let received: LegacyProviderInput<unknown> | undefined;
  const provider: LegacyProviderPort = {
    dispatch<T>(input: LegacyProviderInput<T>) {
      received = input as LegacyProviderInput<unknown>;
      return { status: 'started', charge: Promise.resolve({ status: 'charged' }), provider: Promise.resolve(input.provider(input.signal)) };
    },
  };
  setPlatformRuntimeForTests({ mode: 'legacy', provider });

  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ summary: 'Team Lunch' });
  expect(received).toMatchObject({
    route: 'summarize',
    requestId: REQUEST_ID,
    identity: { kind: 'unknown', keyVersion: '', hmac: '' },
  });
  expect(received?.signal).toBeInstanceOf(AbortSignal);
  expect(typeof received?.charge).toBe('function');
  expect(typeof received?.provider).toBe('function');
  expect(calls).toEqual({ key: 1, limits: 1, charge: 0, transport: 1 });
});

test.each([
  ['community-limit', 402, 'community_limit'],
  ['failure', 500, undefined],
] as const)('summary preserves the %s provider response without native details', async (kind, status, code) => {
  transportState.kind = kind;
  const response = await POST(request());
  const body = await response.json();
  expect(response.status).toBe(status);
  if (code) expect(body.code).toBe(code);
  expect(JSON.stringify(body)).not.toContain('native summary canary');
});

test.each(['shadow', 'cloudflare'] as const)('%s summary fails before body, limits, key, charging, or transport', async (mode) => {
  setPlatformRuntimeForTests({ mode });
  const req = request();
  const json = mock(async () => ({ text: 'Lunch' }));
  Object.defineProperty(req, 'json', { value: json });
  const response = await POST(req);
  expect(response.status).toBe(503);
  expect(json).not.toHaveBeenCalled();
  expect(calls).toEqual({ key: 0, limits: 0, charge: 0, transport: 0 });
});
