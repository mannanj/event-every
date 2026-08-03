// Route-level proof that ALL four LLM routes now consult the unified limit
// authority and map both blocking reasons correctly: community-budget → 402 with
// code 'community_limit', ip-rate → 429. The authority itself is mocked so these
// stay hermetic (no Redis, no OpenRouter) — they assert the routes' wiring/contract,
// not the authority's internals (those live in src/lib/__tests__/limits.test.ts).
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';

const IP_RESET_ISO = '2026-06-14T00:00:00.000Z';
const BUDGET_RESET_ISO = '2026-06-14T00:00:00.000Z';

const decision = {
  allowed: false,
  reason: 'ip-rate' as 'ip-rate' | 'community-budget',
  resetAt: IP_RESET_ISO,
};

const chargeIpRate = mock(async (_req: NextRequest) => ({
  success: true,
  remaining: 999,
  reset: Date.parse(IP_RESET_ISO),
}));

mock.module('@/lib/limits', () => ({
  evaluateLimits: async (_req: NextRequest) => {
    if (decision.reason === 'community-budget') {
      return {
        allowed: false,
        reason: 'community-budget',
        resetAt: BUDGET_RESET_ISO,
        isAdmin: false,
        budget: { limitUsd: 5, spentUsd: 5, remainingUsd: 0, exhausted: true, resetAt: BUDGET_RESET_ISO },
        ipRate: { limit: 1000, remaining: 1000, exhausted: false, resetAt: IP_RESET_ISO },
      };
    }
    return {
      allowed: false,
      reason: 'ip-rate',
      resetAt: IP_RESET_ISO,
      isAdmin: false,
      budget: { limitUsd: 5, spentUsd: 1, remainingUsd: 4, exhausted: false, resetAt: BUDGET_RESET_ISO },
      ipRate: { limit: 1000, remaining: 0, exhausted: true, resetAt: IP_RESET_ISO },
    };
  },
  chargeIpRate,
}));

// The three legacy non-scan routes derive getLlmKey() before the gate; give them a
// key so they reach the authority rather than short-circuiting on a missing-key 500.
process.env.OPENROUTER_API_KEY = 'sk-test';

const { POST: scanPOST } = await import('@/app/api/scan/route');
const { POST: summarizePOST } = await import('@/app/api/summarize/route');
const { POST: detectUrlsPOST } = await import('@/app/api/detect-urls/route');
const { POST: resolveTzPOST } = await import('@/app/api/resolve-timezone/route');

const routes: Array<{ name: string; post: (req: NextRequest) => Promise<Response>; body: unknown; path: string }> = [
  { name: 'scan', post: scanPOST, body: { kind: 'text', text: 'meet tomorrow' }, path: '/api/scan' },
  { name: 'summarize', post: summarizePOST, body: { text: 'meet tomorrow' }, path: '/api/summarize' },
  { name: 'detect-urls', post: detectUrlsPOST, body: { text: 'see example.com' }, path: '/api/detect-urls' },
  { name: 'resolve-timezone', post: resolveTzPOST, body: { rawTimezone: 'EST' }, path: '/api/resolve-timezone' },
];

const makeRequest = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', 'x-event-every-request-id': '018f47a0-7b5c-7cc4-9a34-123456789abc' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  decision.reason = 'ip-rate';
  chargeIpRate.mockClear();
});

describe('per-IP gate (ip-rate) → 429 on every LLM route', () => {
  for (const r of routes) {
    test(`${r.name} returns 429 when the authority reports ip-rate`, async () => {
      decision.reason = 'ip-rate';
      const res = await r.post(makeRequest(r.path, r.body));
      expect(res.status).toBe(429);
      expect(res.headers.get('X-RateLimit-Limit')).toBe('1000');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    });
  }
});

describe('community-budget → 402 with code community_limit on every LLM route', () => {
  for (const r of routes) {
    test(`${r.name} returns 402 + community_limit when the authority reports community-budget`, async () => {
      decision.reason = 'community-budget';
      const res = await r.post(makeRequest(r.path, r.body));
      expect(res.status).toBe(402);
      const data = await res.json();
      expect(data.code).toBe('community_limit');
      expect(data.resetAt).toBe(BUDGET_RESET_ISO);
    });
  }
});
