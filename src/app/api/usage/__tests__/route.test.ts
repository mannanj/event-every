import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';
import type { OwnerBudgetStatusResult } from '@/platform/contracts';
import { setPlatformRuntimeForTests } from '@/platform/runtime';

const ownerBudgetStatus = mock(async (_authorityDay: string): Promise<OwnerBudgetStatusResult> => current);
let current: OwnerBudgetStatusResult;

const unavailableProvider = mock(async () => ({ status: 'not-found' as const }));
const unavailableOperation = mock(async () => ({ status: 'unavailable' as const }));
const shapeKeys = () => ({ current: { version: 'test-v1', key: 'synthetic' } });

const { GET } = await import('@/app/api/usage/route');

beforeEach(() => {
  current = {
    status: 'available',
    policyVersion: 'owner-v1',
    authorityDay: new Date().toISOString().slice(0, 10),
    limitNanodollars: 5_000_000_000,
    spentNanodollars: 1_000_000_000,
    reservedNanodollars: 1_500_000_000,
    remainingNanodollars: 2_500_000_000,
    exhausted: false,
    frozen: false,
    resetAt: '2026-08-14T00:00:00.000Z',
  };
  ownerBudgetStatus.mockClear();
  setPlatformRuntimeForTests({ runProviderOperation: unavailableOperation, providerRequestStatus: unavailableProvider, ownerBudgetStatus, shapeKeys });
});

afterEach(() => setPlatformRuntimeForTests(undefined));

test.each([
  [1_500_000_000, 2_500_000_000, false, false],
  [3_999_600_000, 400_000, true, false],
  [4_500_000_000, 0, true, true],
] as const)('usage returns content-free integer accounting for reserved=%i', async (reserved, remaining, exhausted, frozen) => {
  if (current.status !== 'available') throw new Error('expected available fixture');
  current = { ...current, reservedNanodollars: reserved, remainingNanodollars: remaining, exhausted, frozen };
  const response = await GET(new NextRequest('http://localhost/api/usage'));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual(current);
  expect(ownerBudgetStatus).toHaveBeenCalledWith(new Date().toISOString().slice(0, 10));
  expect(JSON.stringify(await (await GET(new NextRequest('http://localhost/api/usage'))).json())).not.toMatch(/requestId|identity|model|route|source|candidate/i);
});

test('usage fails closed without Redis fallback', async () => {
  current = { status: 'day-mismatch' };
  const response = await GET(new NextRequest('http://localhost/api/usage'));
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ error: 'Owner budget unavailable.', code: 'owner_budget_unavailable' });
});

test('usage rejects an internal result with extra or inconsistent fields', async () => {
  current = {
    status: 'available', policyVersion: 'owner-v1', authorityDay: new Date().toISOString().slice(0, 10),
    limitNanodollars: 5_000_000_000, spentNanodollars: 1, reservedNanodollars: 1,
    remainingNanodollars: 5_000_000_000, exhausted: false, frozen: false,
    resetAt: '2026-08-14T00:00:00.000Z', requestId: 'must-not-leak',
  } as OwnerBudgetStatusResult;
  const response = await GET(new NextRequest('http://localhost/api/usage'));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain('must-not-leak');
});
