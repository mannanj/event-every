import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';
import type { ProviderRequestStatusResult } from '@/platform/contracts';
import { setPlatformRuntimeForTests } from '@/platform/runtime';

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
let current: ProviderRequestStatusResult;
const providerRequestStatus = mock(async (_requestId: string): Promise<ProviderRequestStatusResult> => current);
const forbidden = {
  begin: mock(async () => undefined), reserve: mock(async () => undefined), commit: mock(async () => undefined),
  release: mock(async () => undefined), settle: mock(async () => undefined), claim: mock(async () => undefined),
  transport: mock(async () => undefined), alarm: mock(async () => undefined), retention: mock(async () => undefined),
};
const runProviderOperation = mock(async () => { forbidden.transport(); return { status: 'unavailable' as const }; });
const ownerBudgetStatus = mock(async () => ({ status: 'day-mismatch' as const }));
const shapeKeys = () => ({ current: { version: 'test-v1', key: 'synthetic' } });

const { POST } = await import('@/app/api/provider-status/route');

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/provider-status', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  current = { status: 'not-found' };
  providerRequestStatus.mockClear();
  for (const value of Object.values(forbidden)) value.mockClear();
  setPlatformRuntimeForTests({ runProviderOperation, providerRequestStatus, ownerBudgetStatus, shapeKeys });
});

afterEach(() => setPlatformRuntimeForTests(undefined));

test.each([
  [{}, 400],
  [{ requestId: 'not-a-uuid' }, 400],
  [{ requestId: REQUEST_ID, extra: true }, 400],
])('status rejects malformed strict input before authority access', async (body, expected) => {
  expect((await POST(request(body))).status).toBe(expected);
  expect(providerRequestStatus).not.toHaveBeenCalled();
});

test.each([
  [{ status: 'pending', phase: 'prepared', executionId: REQUEST_ID, authorityDay: '2026-08-13', shapeKeyVersion: 'v1', reservedUntilMs: 1000 } as const, 409, 'provider_request_pending'],
  [{ status: 'pending', phase: 'provider_inflight', executionId: REQUEST_ID, authorityDay: '2026-08-13', shapeKeyVersion: 'v1', transportDeadlineMs: 2000 } as const, 409, 'provider_request_pending'],
  [{ status: 'failed', code: 'provider_timeout', httpStatus: 504, settlement: 'settlement_complete' } as const, 504, 'provider_timeout'],
  [{ status: 'unknown', code: 'provider_outcome_unknown', httpStatus: 502, settlement: 'settlement_pending' } as const, 502, 'provider_outcome_unknown'],
  [{ status: 'expired', executionId: REQUEST_ID, terminalClass: 'completed' } as const, 409, 'provider_request_expired'],
  [{ status: 'not-found' } as const, 404, 'provider_request_not_found'],
  [{ status: 'unavailable' } as const, 503, 'provider_state_unavailable'],
])('status maps %o read-only', async (result, expectedStatus, expectedCode) => {
  current = result;
  const response = await POST(request({ requestId: REQUEST_ID }));
  expect(response.status).toBe(expectedStatus);
  expect((await response.json()).code).toBe(expectedCode);
  expect(providerRequestStatus).toHaveBeenCalledWith(REQUEST_ID);
  expect(Object.values(forbidden).every((value) => value.mock.calls.length === 0)).toBe(true);
});

test.each([
  { source: { sourceId: REQUEST_ID, kind: 'text', contentHandle: '22222222-2222-4222-8222-222222222222' }, candidates: [], issues: [] },
  { summary: 'Team Lunch' },
  { timezone: 'America/New_York', confidence: 1 },
])('status returns each minimized completed replay without mutation', async (replay) => {
  current = { status: 'completed', replay, settlement: 'settlement_complete' };
  const response = await POST(request({ requestId: REQUEST_ID }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'completed', replay });
  expect(Object.values(forbidden).every((value) => value.mock.calls.length === 0)).toBe(true);
});

test('status rejects a body beyond its 1 KiB wire contract', async () => {
  const response = await POST(request({ requestId: REQUEST_ID, padding: 'x'.repeat(1024) }));
  expect(response.status).toBe(400);
  expect(providerRequestStatus).not.toHaveBeenCalled();
});

test('status responses are never cacheable', async () => {
  current = { status: 'not-found' };
  const response = await POST(request({ requestId: REQUEST_ID }));
  expect(response.headers.get('cache-control')).toBe('no-store');
});
