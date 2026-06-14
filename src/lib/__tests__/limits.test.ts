// Unit tests for the unified limit authority (src/lib/limits.ts). The authority
// owns no limiting logic — it composes the budget axis (@/lib/budget) and the
// per-IP axis (@/lib/ratelimit) through @/lib/llm's mode + budget accessor. Only
// the Redis-backed leaves (@/lib/budget, @/lib/ratelimit) and @/lib/clientIp are
// mocked, so @/lib/llm stays REAL (its getLlmMode/getCommunityBudgetStatus are the
// real composition under test, and not stubbing it avoids leaking a partial llm
// module mock into sibling test files). Admin mode is driven through a real auth
// cookie via the real generateAuthToken(). Budget is the GLOBAL gate, checked
// first; per-IP is the per-user gate. Fail-open (Redis-absent → allowed) is the spec.
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, generateAuthToken } from '@/app/api/auth/shared';

const IP_RESET_MS = Date.UTC(2026, 5, 14); // a fixed future UTC midnight (epoch ms)
const IP_RESET_ISO = new Date(IP_RESET_MS).toISOString();
const BUDGET_RESET_ISO = '2026-06-14T00:00:00.000Z';

const state = {
  budgetExhausted: false,
  ipSuccess: true,
  ipRemaining: 1000,
};

const DAILY_LIMIT = 1000;

const getBudgetStatus = mock(async () => ({
  limitUsd: 5,
  spentUsd: state.budgetExhausted ? 5 : 1,
  remainingUsd: state.budgetExhausted ? 0 : 4,
  exhausted: state.budgetExhausted,
  resetAt: BUDGET_RESET_ISO,
}));

const incrementRateLimit = mock(async (_id: string) => ({
  success: true,
  remaining: 999,
  reset: IP_RESET_MS,
}));

mock.module('@/lib/budget', () => ({
  getBudgetStatus,
  nextResetISO: () => BUDGET_RESET_ISO,
  recordCommunitySpend: mock(async (_c: number) => {}),
  DAILY_BUDGET_USD: 5,
}));

mock.module('@/lib/ratelimit', () => ({
  DAILY_LIMIT,
  checkRateLimit: async (_id: string) => ({
    success: state.ipSuccess,
    remaining: state.ipRemaining,
    reset: IP_RESET_MS,
    ...(state.ipSuccess ? {} : { error: 'Daily limit exceeded' }),
  }),
  incrementRateLimit,
}));

mock.module('@/lib/clientIp', () => ({
  getClientIP: (req: NextRequest) => req.headers.get('x-forwarded-for') || 'unknown',
}));

const { evaluateLimits, chargeIpRate } = await import('@/lib/limits');

const makeRequest = (opts: { ip?: string; admin?: boolean } = {}) => {
  const headers: Record<string, string> = { 'x-forwarded-for': opts.ip || '203.0.113.7' };
  if (opts.admin) headers['cookie'] = `${AUTH_COOKIE_NAME}=${generateAuthToken()}`;
  return new NextRequest('http://localhost/api/parse', { method: 'POST', headers });
};

beforeEach(() => {
  state.budgetExhausted = false;
  state.ipSuccess = true;
  state.ipRemaining = 1000;
  getBudgetStatus.mockClear();
  incrementRateLimit.mockClear();
  incrementRateLimit.mockImplementation(async (_id: string) => ({
    success: true,
    remaining: 999,
    reset: IP_RESET_MS,
  }));
});

describe('evaluateLimits', () => {
  test('neither exhausted → allowed, reason null, budget reset, ip not exhausted', async () => {
    const r = await evaluateLimits(makeRequest());
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe(null);
    expect(r.resetAt).toBe(BUDGET_RESET_ISO);
    expect(r.budget?.resetAt).toBe(BUDGET_RESET_ISO);
    expect(r.ipRate.exhausted).toBe(false);
    expect(r.ipRate.limit).toBe(DAILY_LIMIT);
    expect(r.ipRate.resetAt).toBe(IP_RESET_ISO);
    expect(r.isAdmin).toBe(false);
  });

  test('budget exhausted only → blocked with community-budget and the budget reset', async () => {
    state.budgetExhausted = true;
    const r = await evaluateLimits(makeRequest());
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('community-budget');
    expect(r.resetAt).toBe(BUDGET_RESET_ISO);
    expect(r.budget?.exhausted).toBe(true);
  });

  test('per-IP exhausted only → blocked with ip-rate and the limiter reset (ISO)', async () => {
    state.ipSuccess = false;
    state.ipRemaining = 0;
    const r = await evaluateLimits(makeRequest());
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('ip-rate');
    expect(r.resetAt).toBe(IP_RESET_ISO);
    expect(r.ipRate.exhausted).toBe(true);
    expect(r.ipRate.remaining).toBe(0);
  });

  test('both exhausted → budget wins (checked first) and reports the budget reset', async () => {
    state.budgetExhausted = true;
    state.ipSuccess = false;
    state.ipRemaining = 0;
    const r = await evaluateLimits(makeRequest());
    expect(r.reason).toBe('community-budget');
    expect(r.resetAt).toBe(BUDGET_RESET_ISO);
    expect(r.allowed).toBe(false);
  });

  test('admin mode → budget is null, isAdmin true, a budget-exhausted mock is irrelevant', async () => {
    state.budgetExhausted = true; // would block a community user; admins bypass the pool
    const r = await evaluateLimits(makeRequest({ admin: true }));
    expect(r.isAdmin).toBe(true);
    expect(r.budget).toBe(null);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe(null);
    // The community pool is never even consulted for an admin.
    expect(getBudgetStatus).not.toHaveBeenCalled();
  });

  test('admin still blocked by the per-IP gate (the only gate that applies)', async () => {
    state.ipSuccess = false;
    state.ipRemaining = 0;
    const r = await evaluateLimits(makeRequest({ admin: true }));
    expect(r.budget).toBe(null);
    expect(r.reason).toBe('ip-rate');
    expect(r.allowed).toBe(false);
  });

  test('fail-open: Redis-absent (budget not exhausted + ip success) → allowed', async () => {
    // Mirrors getBudgetStatus / checkRateLimit returning their fail-open values.
    state.budgetExhausted = false;
    state.ipSuccess = true;
    const r = await evaluateLimits(makeRequest());
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe(null);
  });
});

describe('chargeIpRate', () => {
  test('increments using the extracted IP and returns the RateLimitResult unchanged', async () => {
    const result = await chargeIpRate(makeRequest({ ip: '198.51.100.9' }));
    expect(incrementRateLimit).toHaveBeenCalledTimes(1);
    expect(incrementRateLimit.mock.calls[0][0]).toBe('198.51.100.9');
    expect(result).toEqual({ success: true, remaining: 999, reset: IP_RESET_MS });
  });
});
