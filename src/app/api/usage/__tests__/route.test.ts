import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';
import { setPlatformRuntimeForTests } from '@/platform/runtime';

let evaluatedRequest: NextRequest | undefined;
const evaluateLimits = mock(async (request: NextRequest) => {
  evaluatedRequest = request;
  return {
    allowed: true,
    reason: null,
    resetAt: '2026-08-03T00:00:00.000Z',
    isAdmin: false,
    budget: { limitUsd: 5, spentUsd: 1.23456, remainingUsd: 3.76544, exhausted: false, resetAt: '2026-08-03T00:00:00.000Z' },
    ipRate: { limit: 1000, remaining: 999, exhausted: false, resetAt: '2026-08-03T00:00:00.000Z' },
  };
});

mock.module('@/lib/limits', () => ({ evaluateLimits }));

const { GET } = await import('@/app/api/usage/route');

beforeEach(() => {
  evaluatedRequest = undefined;
  evaluateLimits.mockClear();
});

afterEach(() => setPlatformRuntimeForTests(undefined));

test('usage preserves the exact request for legacy evaluateLimits composition', async () => {
  const request = new NextRequest('http://localhost/api/usage', { headers: { 'x-forwarded-for': '203.0.113.41' } });
  const response = await GET(request);
  expect(response.status).toBe(200);
  expect(evaluatedRequest).toBe(request);
  expect(await response.json()).toMatchObject({ spentUsd: 1.2346, remainingUsd: 3.7654, allowed: true });
});

test('usage passes only the closed identity input to an injected port', async () => {
  const read = mock(async () => ({
    status: 'available' as const,
    value: {
      isAdmin: false,
      exhausted: false,
      resetAt: '2026-08-03T00:00:00.000Z',
      limitUsd: 0,
      spentUsd: 0,
      remainingUsd: 0,
      allowed: true,
      reason: null,
      budget: null,
      ipRate: { limit: 1000, remaining: 1000, exhausted: false, resetAt: '2026-08-03T00:00:00.000Z' },
    },
  }));
  setPlatformRuntimeForTests({ mode: 'legacy', usage: { read } });

  expect((await GET(new NextRequest('http://localhost/api/usage'))).status).toBe(200);
  expect(read).toHaveBeenCalledWith({ identity: { kind: 'unknown', keyVersion: '', hmac: '' } });
  expect(evaluateLimits).not.toHaveBeenCalled();
});

test.each(['shadow', 'cloudflare'] as const)('%s usage fails before legacy state access', async (mode) => {
  const read = mock(async () => ({ status: 'unavailable' as const, code: 'legacy_usage_unavailable' as const }));
  setPlatformRuntimeForTests({ mode, usage: { read } });
  const response = await GET(new NextRequest('http://localhost/api/usage'));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'State is not ready.', code: 'c1_state_not_ready' });
  expect(read).not.toHaveBeenCalled();
  expect(evaluateLimits).not.toHaveBeenCalled();
});
