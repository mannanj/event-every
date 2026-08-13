import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';
import type { ProviderOperationInput, ProviderOperationResult } from '@/platform/cloudflare/provider-operation';
import { setPlatformRuntimeForTests } from '@/platform/runtime';

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
let received: ProviderOperationInput | undefined;
let nextOutcome: ProviderOperationResult | undefined;
const providerBodies: unknown[] = [];

const runProviderOperation = mock(async (input: ProviderOperationInput): Promise<ProviderOperationResult> => {
  received = input;
  if (nextOutcome) return nextOutcome;
  const replay = await input.execute(async (providerBody) => {
    providerBodies.push(providerBody);
    return { status: 'success', value: { choices: [{ message: { content: 'Team Lunch' } }] }, costOutcome: { kind: 'exact', nanodollars: 5 } };
  });
  return { status: 'completed', replay, settlement: 'settlement_complete' };
});
const providerRequestStatus = mock(async () => ({ status: 'not-found' as const }));
const ownerBudgetStatus = mock(async () => ({ status: 'day-mismatch' as const }));
const shapeKeys = () => ({ current: { version: 'test-v1', key: 'synthetic-shape-key' } });

const { POST } = await import('@/app/api/summarize/route');

function request(body: unknown = { text: 'Lunch', eventTitles: ['Planning'] }, requestId = REQUEST_ID): NextRequest {
  return new NextRequest('http://localhost/api/summarize', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-event-every-request-id': requestId }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  received = undefined; nextOutcome = undefined; providerBodies.length = 0; runProviderOperation.mockClear();
  setPlatformRuntimeForTests({ runProviderOperation, providerRequestStatus, ownerBudgetStatus, shapeKeys });
});
afterEach(() => setPlatformRuntimeForTests(undefined));

test.each(['', 'not-a-uuid', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'])('summary rejects strict UUID %p before body or authority', async (requestId) => {
  const req = request({}, requestId);
  const json = mock(async () => ({})); Object.defineProperty(req, 'json', { value: json });
  expect((await POST(req)).status).toBe(400);
  expect(json).not.toHaveBeenCalled(); expect(runProviderOperation).not.toHaveBeenCalled();
});

test.each([[{}, 'empty'], [{ text: '', eventTitles: [] }, 'empty'], [{ text: 'Lunch', extra: true }, 'unknown']])(
  'summary rejects %s input before authority', async (body) => {
    expect((await POST(request(body))).status).toBe(400); expect(runProviderOperation).not.toHaveBeenCalled();
  },
);

test('summary binds normalized input to one closed operation', async () => {
  const response = await POST(request({ text: '  lunch  ', eventTitles: [' Planning ', ''] }));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ summary: 'Team Lunch' });
  expect(received).toMatchObject({ requestId: REQUEST_ID, variant: 'summarize', signal: expect.any(AbortSignal) });
  expect(received?.bindingCandidates).toEqual([{ version: 'test-v1', digest: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
  expect(providerBodies).toHaveLength(1); expect(JSON.stringify(providerBodies[0])).toContain('Input text: lunch');
});

test('summary returns minimized durable replay without transport', async () => {
  nextOutcome = { status: 'completed', replay: { summary: 'Saved Replay' }, settlement: 'settlement_pending' };
  const response = await POST(request()); expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ summary: 'Saved Replay' }); expect(providerBodies).toHaveLength(0);
});

test.each([
  ['provider_rejected', 502], ['provider_unavailable', 502], ['provider_timeout', 504],
  ['provider_rate_limited', 503], ['owner_provider_credit_unavailable', 503],
  ['privacy_endpoint_unavailable', 503], ['provider_invalid_response', 502],
  ['accounting_policy_breach', 502], ['accounting_cost_overflow', 502],
] as const)('summary maps %s to fixed status %i', async (code, status) => {
  nextOutcome = { status: 'failed', code, httpStatus: status as 502 | 503 | 504, settlement: 'settlement_complete' };
  const response = await POST(request({ text: 'native canary' })); expect(response.status).toBe(status);
  const body = await response.json(); expect(body.code).toBe(code); expect(JSON.stringify(body)).not.toContain('native canary');
});

test.each([
  [{ status: 'pending', phase: 'reserved', executionId: OTHER_ID, authorityDay: '2026-08-13', shapeKeyVersion: 'v1' } as const, 409, 'provider_request_pending'],
  [{ status: 'conflict' } as const, 409, 'provider_request_conflict'],
  [{ status: 'expired', executionId: OTHER_ID, terminalClass: 'completed' } as const, 409, 'provider_request_expired'],
  [{ status: 'unknown', code: 'provider_outcome_unknown', httpStatus: 502, settlement: 'settlement_complete' } as const, 502, 'provider_outcome_unknown'],
  [{ status: 'budget-exhausted', resetAt: '2026-08-14T00:00:00.000Z' } as const, 402, 'owner_budget_exhausted'],
  [{ status: 'unavailable' } as const, 503, 'provider_state_unavailable'],
])('summary maps coordinator state %o', async (result, status, code) => {
  nextOutcome = result; const response = await POST(request()); expect(response.status).toBe(status); expect((await response.json()).code).toBe(code);
});
