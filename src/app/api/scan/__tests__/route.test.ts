import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';
import type { ProviderOperationInput, ProviderOperationResult } from '@/platform/cloudflare/provider-operation';
import { setPlatformRuntimeForTests } from '@/platform/runtime';
import { ScanResponseSchema } from '@/types/scannerHttp';
import { setTypeSafeKeyForTests } from '@/server/typesafe/client';

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const HANDLE_ID = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_ID = '44444444-4444-4444-8444-444444444444';
const VALID_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
const providerBodies: unknown[] = [];
let received: ProviderOperationInput | undefined;
let nextOutcome: ProviderOperationResult | undefined;

const claim = <Value>(value: Value) => ({ value, confidence: null, evidence: [] });
const providerValue = {
  choices: [{
    finish_reason: 'stop', refusal: null,
    message: { content: JSON.stringify({ candidates: [{ sourceUid: null, title: claim('Planning session'), description: claim(null), location: claim(null), url: claim(null), temporal: claim({ start: null, end: null, duration: null, allDay: 'unknown' }), recurrence: claim(null), issues: [] }], issues: [] }) },
  }],
};

const runProviderOperation = mock(async (input: ProviderOperationInput): Promise<ProviderOperationResult> => {
  received = input;
  if (nextOutcome) return nextOutcome;
  const replay = await input.execute(async (providerBody) => {
    providerBodies.push(providerBody);
    return { status: 'success', value: providerValue, costOutcome: { kind: 'exact', nanodollars: 10 } };
  });
  return { status: 'completed', replay, settlement: 'settlement_complete' };
});
const providerRequestStatus = mock(async () => ({ status: 'not-found' as const }));
const ownerBudgetStatus = mock(async () => ({ status: 'day-mismatch' as const }));
const shapeKeys = () => ({ current: { version: 'test-v1', key: 'synthetic-shape-key' } });

const { POST } = await import('@/app/api/scan/route');

function request(body: unknown, requestId = REQUEST_ID, signal?: AbortSignal): NextRequest {
  return new NextRequest('http://localhost/api/scan', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-event-every-request-id': requestId },
    body: JSON.stringify(body), signal,
  });
}

beforeEach(() => {
  // Off unless a test asks for it, so no unit test can reach api.typesafe.ai.
  setTypeSafeKeyForTests(null);
  received = undefined;
  nextOutcome = undefined;
  providerBodies.length = 0;
  runProviderOperation.mockClear();
  setPlatformRuntimeForTests({ runProviderOperation, providerRequestStatus, ownerBudgetStatus, shapeKeys });
});

afterEach(() => { setPlatformRuntimeForTests(undefined); setTypeSafeKeyForTests(undefined); });

describe('/api/scan authority route', () => {
  test.each(['', 'not-a-uuid', '018f47a0-7b5c-7cc4-9a34-123456789abc', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'])(
    'rejects strict request UUID %p before body or authority',
    async (requestId) => {
      const req = request({ kind: 'text', text: 'Office hours' }, requestId);
      const json = mock(async () => ({ kind: 'text', text: 'Office hours' }));
      Object.defineProperty(req, 'json', { value: json });
      expect((await POST(req)).status).toBe(400);
      expect(json).not.toHaveBeenCalled();
      expect(runProviderOperation).not.toHaveBeenCalled();
    },
  );

  test.each([
    ['unknown key', { kind: 'text', text: 'hello', extra: true }],
    ['blank text', { kind: 'text', text: ' \n ' }],
    ['bad image', { kind: 'image', dataUrl: 'data:image/gif;base64,R0lGODlh' }],
  ])('rejects %s before authority work', async (_name, body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(runProviderOperation).not.toHaveBeenCalled();
  });

  test.each([
    [{ kind: 'text', text: 'Private planning notes' }, 'scan-text'],
    [{ kind: 'image', dataUrl: VALID_PNG_DATA_URL }, 'scan-image'],
  ] as const)('passes one closed %s operation and returns only the durable projection', async (body, variant) => {
    const response = await POST(request(body));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(ScanResponseSchema.parse(json)).toEqual(json);
    expect(received).toMatchObject({ requestId: REQUEST_ID, variant, signal: expect.any(AbortSignal) });
    expect(received?.bindingCandidates).toEqual([{ version: 'test-v1', digest: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    expect(runProviderOperation).toHaveBeenCalledTimes(1);
    expect(providerBodies).toHaveLength(1);
    expect(JSON.stringify(json)).not.toContain(body.kind === 'text' ? body.text : body.dataUrl);
  });

  test('returns a stored same-binding replay without invoking transport', async () => {
    nextOutcome = { status: 'completed', replay: { source: { sourceId: OTHER_ID, kind: 'text', contentHandle: HANDLE_ID }, candidates: [], issues: [] }, settlement: 'settlement_pending' };
    const response = await POST(request({ kind: 'text', text: 'same shape' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ source: { sourceId: OTHER_ID, kind: 'text', contentHandle: HANDLE_ID }, candidates: [], issues: [] });
    expect(providerBodies).toHaveLength(0);
  });

  test.each([
    ['provider_rejected', 502], ['provider_unavailable', 502], ['provider_timeout', 504],
    ['provider_rate_limited', 503], ['owner_provider_credit_unavailable', 503],
    ['privacy_endpoint_unavailable', 503], ['provider_invalid_response', 502],
    ['accounting_policy_breach', 502], ['accounting_cost_overflow', 502],
  ] as const)('maps fixed failure %s without native detail', async (code, status) => {
    nextOutcome = { status: 'failed', code, httpStatus: status as 502 | 503 | 504, settlement: 'settlement_complete' };
    const response = await POST(request({ kind: 'text', text: 'native canary' }));
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
    expect(JSON.stringify(await (await POST(request({ kind: 'text', text: 'native canary' }))).json())).not.toContain('native canary');
  });

  test.each([
    [{ status: 'pending', phase: 'provider_inflight', executionId: OTHER_ID, authorityDay: '2026-08-12', shapeKeyVersion: 'v1', transportDeadlineMs: 1234 } as const, 409, 'provider_request_pending'],
    [{ status: 'conflict' } as const, 409, 'provider_request_conflict'],
    [{ status: 'expired', executionId: OTHER_ID, terminalClass: 'failed' } as const, 409, 'provider_request_expired'],
    [{ status: 'unknown', code: 'provider_outcome_unknown', httpStatus: 502, settlement: 'settlement_pending' } as const, 502, 'provider_outcome_unknown'],
    [{ status: 'unavailable' } as const, 503, 'provider_state_unavailable'],
  ])('maps coordinator state %o', async (result, status, code) => {
    nextOutcome = result;
    const response = await POST(request({ kind: 'text', text: 'hello' }));
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });

  test('preserves the frozen original-day budget reset across a midnight retry', async () => {
    const originalReset = '2026-08-13T00:00:00.000Z';
    nextOutcome = { status: 'pending', phase: 'prepared', executionId: OTHER_ID, authorityDay: '2026-08-12', shapeKeyVersion: 'v1' };
    expect((await POST(request({ kind: 'text', text: 'same request' }))).status).toBe(409);
    nextOutcome = { status: 'budget-exhausted', resetAt: originalReset };
    const retry = await POST(request({ kind: 'text', text: 'same request' }));
    expect(retry.status).toBe(402);
    expect(await retry.json()).toMatchObject({ code: 'owner_budget_exhausted', resetAt: originalReset });
  });
});

describe('/api/scan verification', () => {
  const originalFetch = globalThis.fetch;
  const verifiable = {
    source: { sourceId: OTHER_ID, kind: 'text', contentHandle: HANDLE_ID },
    candidates: [{
      candidateId: CANDIDATE_ID, sourceUid: null,
      title: claim('Autumn Social'), description: claim(null), location: claim(null), url: claim(null),
      temporal: claim({
        start: { kind: 'floating', date: { year: 2026, month: 10, day: 3 }, time: { hour: 19, minute: 30, second: 0 } },
        end: null, duration: null, allDay: false,
      }),
      recurrence: claim(null), issues: [],
    }],
    issues: [],
  };

  afterEach(() => { globalThis.fetch = originalFetch; });

  const scan = async () => {
    nextOutcome = { status: 'completed', replay: verifiable, settlement: 'settlement_complete' };
    const response = await POST(request({ kind: 'text', text: 'Autumn Social, Fri 3 Oct, 7.30pm' }));
    return { response, json: await response.json() as ReturnType<typeof ScanResponseSchema.parse> };
  };

  test('carries no verification field without a key', async () => {
    const { response, json } = await scan();
    expect(response.status).toBe(200);
    expect(json.verification).toBeUndefined();
    expect(ScanResponseSchema.parse(json)).toEqual(json);
  });

  test('adds one verification per candidate from a good answer', async () => {
    setTypeSafeKeyForTests('k');
    globalThis.fetch = (async () => Response.json({
      answers: {
        date_ok: { type: 'noul', noul: 0.93 },
        time_ok: { type: 'noul', noul: 0.88 },
        duration: { type: 'score', score: 3, legend: {}, probabilities: { '1': 0.1, '3': 0.8 }, confidence: 0.82 },
      },
      usage: { input_tokens: 1, output_tokens: 1 },
    })) as unknown as typeof fetch;

    const { json } = await scan();
    expect(ScanResponseSchema.parse(json)).toEqual(json);
    expect(json.verification).toEqual([{
      candidateId: CANDIDATE_ID,
      fields: { date: 0.93, time: 0.88, location: null },
      timed: null,
      title: null,
      durationMinutes: 120,
    }]);
  });

  test('a failed call leaves the response exactly as the scanner made it', async () => {
    globalThis.fetch = (async () => new Response('down', { status: 503 })) as unknown as typeof fetch;
    const withoutKey = (await scan()).json;
    setTypeSafeKeyForTests('k');
    const withKey = (await scan()).json;
    expect(withKey.verification).toBeUndefined();
    expect(withKey).toEqual(withoutKey);
  });
});
