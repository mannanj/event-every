import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import type { LegacyProviderInput, LegacyProviderPort } from '@/platform/contracts';
import { setPlatformRuntimeForTests } from '@/platform/runtime';
import { ScanResponseSchema } from '@/types/scannerHttp';

const calls = { evaluate: 0, key: 0, charge: 0, transport: 0 };
const timeline: string[] = [];
const transportRequests: unknown[] = [];
const transportSignals: Array<AbortSignal | undefined> = [];
const uuidValues = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
] as const;
let uuidIndex = 0;
spyOn(crypto, 'randomUUID').mockImplementation(() => (
  uuidValues[uuidIndex++] ?? '00000000-0000-4000-8000-000000000099'
));
const limits = { allowed: true, reason: null as 'community-budget' | 'ip-rate' | null };
const transportState = { status: null as number | null };
const abortTransportState = { waitForAbort: false, cancellations: 0 };
let transportStarted: Promise<void>;
let markTransportStarted: () => void;
const VALID_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

const claim = <Value>(value: Value) => ({ value, confidence: null, evidence: [] });

class FakeCommunityLimitError extends Error {
  constructor(readonly resetAt: string) {
    super('This app is community sponsored. The usage limits have been hit today.');
  }
}

mock.module('@/lib/llm', () => ({
  getLlmMode: () => 'community',
  getLlmKey: () => { calls.key++; return 'test-key'; },
  CommunityLimitError: FakeCommunityLimitError,
  communityLimitResponse: (error: FakeCommunityLimitError) => Response.json({ error: error.message, code: 'community_limit', resetAt: error.resetAt }, { status: 402 }),
  openRouterChat: async () => { throw new Error('scan route must use its scanner transport'); },
}));

mock.module('@/lib/limits', () => ({
  evaluateLimits: async () => {
    calls.evaluate++;
    timeline.push('evaluate');
    return {
      allowed: limits.allowed,
      reason: limits.reason,
      resetAt: '2026-08-01T00:00:00.000Z',
      isAdmin: false,
      budget: null,
      ipRate: { limit: 1000, remaining: 1000, exhausted: false, resetAt: '2026-08-01T00:00:00.000Z' },
    };
  },
  chargeIpRate: async () => {
    calls.charge++;
    timeline.push('charge');
    return { success: true, remaining: 999, reset: Date.UTC(2026, 7, 1) };
  },
}));

mock.module('@/server/scanner/transport', () => ({
  createEventEveryOpenRouterTransport: (input: { signal?: AbortSignal }) => ({
    complete: async (scannerRequest: unknown) => {
      calls.transport++;
      timeline.push('transport');
      transportRequests.push(scannerRequest);
      transportSignals.push(input.signal);
      markTransportStarted();
      if (abortTransportState.waitForAbort && input.signal) {
        await new Promise<void>((resolve) => {
          const cancel = () => {
            abortTransportState.cancellations++;
            resolve();
          };
          if (input.signal?.aborted) cancel();
          else input.signal?.addEventListener('abort', cancel, { once: true });
        });
        return { ok: false as const, failure: 'network' as const, status: null, retryable: false };
      }
      if (transportState.status !== null) {
        return { ok: false as const, failure: 'http' as const, status: transportState.status, retryable: false };
      }
      return {
        ok: true,
        body: {
          choices: [{
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                candidates: [{
                  sourceUid: null,
                  title: claim('Planning session'),
                  description: claim(null),
                  location: claim(null),
                  url: claim(null),
                  temporal: claim({ start: null, end: null, duration: null, allDay: 'unknown' }),
                  recurrence: claim(null),
                  issues: [],
                }],
                issues: [{
                  code: 'field_not_found',
                  field: 'location',
                  message: 'Location not found.',
                  evidence: [],
                }],
              }),
              refusal: null,
            },
          }],
        },
      };
    },
  }),
}));

const { POST } = await import('@/app/api/scan/route');
const { createScanJob } = await import('@/server/scanner/job');
const { getClientIP } = await import('@/lib/clientIp');

const request = (body: unknown, signal?: AbortSignal) => new NextRequest('http://localhost/api/scan', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-event-every-request-id': '018f47a0-7b5c-7cc4-9a34-123456789abc' }, body: JSON.stringify(body), signal,
});

const requestWithId = (body: unknown, requestId: string) => new NextRequest('http://localhost/api/scan', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-event-every-request-id': requestId }, body: JSON.stringify(body),
});

beforeEach(() => {
  calls.evaluate = 0;
  calls.key = 0;
  calls.charge = 0;
  calls.transport = 0;
  timeline.length = 0;
  transportRequests.length = 0;
  transportSignals.length = 0;
  uuidIndex = 0;
  limits.allowed = true;
  limits.reason = null;
  transportState.status = null;
  abortTransportState.waitForAbort = false;
  abortTransportState.cancellations = 0;
  transportStarted = new Promise<void>((resolve) => { markTransportStarted = resolve; });
});

afterEach(() => setPlatformRuntimeForTests(undefined));

describe('/api/scan', () => {
  test('forged forwarding header is ignored by the limiter shard', () => {
    const forged = new NextRequest('http://localhost/api/scan', {
      headers: {
        'x-forwarded-for': '203.0.113.99',
        'x-real-ip': '203.0.113.100',
      },
    });
    expect(getClientIP(forged)).toBe('unknown');
  });

  test('the limiter shard consumes only the validated server-injected identity', () => {
    const injected = 'known:test-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const admitted = new NextRequest('http://localhost/api/scan', {
      headers: {
        'x-event-every-identity': injected,
        'x-forwarded-for': '203.0.113.99',
        'x-real-ip': '203.0.113.100',
      },
    });
    expect(getClientIP(admitted)).toBe(injected);
  });

  test.each(['', 'not-a-uuid', '00000000-0000-0000-0000-000000000000'])(
    'rejects strict request UUID %p before reading the body',
    async (requestId) => {
      const req = requestWithId({ kind: 'text', text: 'Office hours' }, requestId);
      const json = mock(async () => ({ kind: 'text', text: 'Office hours' }));
      Object.defineProperty(req, 'json', { value: json });
      expect((await POST(req)).status).toBe(400);
      expect(json).not.toHaveBeenCalled();
      expect(calls).toEqual({ evaluate: 0, key: 0, charge: 0, transport: 0 });
    },
  );

  test('passes closed dispatch fields and the strict caller UUID unchanged', async () => {
    const callerRequestId = '018F47A0-7B5C-7CC4-9A34-123456789ABC';
    let received: LegacyProviderInput<unknown> | undefined;
    const provider: LegacyProviderPort = {
      dispatch<T>(input: LegacyProviderInput<T>) {
        received = input as LegacyProviderInput<unknown>;
        return { status: 'started', charge: Promise.resolve({ status: 'charged' }), provider: Promise.resolve(input.provider(input.signal)) };
      },
    };
    setPlatformRuntimeForTests({ mode: 'legacy', provider });

    const req = requestWithId({ kind: 'text', text: 'Office hours' }, callerRequestId);
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(received).toMatchObject({
      route: 'scan',
      requestId: callerRequestId,
      identity: { kind: 'unknown', keyVersion: '', hmac: '' },
    });
    expect(received?.signal).toBeInstanceOf(AbortSignal);
    expect(typeof received?.charge).toBe('function');
    expect(typeof received?.provider).toBe('function');
    expect(calls).toEqual({ evaluate: 1, key: 1, charge: 0, transport: 1 });
    expect(transportSignals).toEqual([req.signal]);
  });

  test.each(['shadow', 'cloudflare'] as const)('%s fails before body, limits, charging, or provider transport', async (mode) => {
    setPlatformRuntimeForTests({ mode });
    const req = request({ kind: 'text', text: 'Office hours' });
    const json = mock(async () => ({ kind: 'text', text: 'Office hours' }));
    Object.defineProperty(req, 'json', { value: json });
    const response = await POST(req);
    expect(response.status).toBe(503);
    expect(json).not.toHaveBeenCalled();
    expect(calls).toEqual({ evaluate: 0, key: 0, charge: 0, transport: 0 });
  });

  test.each([
    ['invalid JSON', new NextRequest('http://localhost/api/scan', { method: 'POST', body: '{' })],
    ['unknown request key', request({ kind: 'text', text: 'hello', extra: true })],
    ['blank text', request({ kind: 'text', text: ' \n ' })],
    ['unsupported declared image', request({ kind: 'image', dataUrl: 'data:image/gif;base64,R0lGODlh' })],
    ['malformed image base64', request({ kind: 'image', dataUrl: 'data:image/png;base64,%%%%' })],
    ['empty image bytes', request({ kind: 'image', dataUrl: 'data:image/png;base64,' })],
  ])('rejects %s before limits, charging, or provider work', async (_name, req) => {
    const response = await POST(req);
    expect(response.status).toBe(400);
    expect(calls).toEqual({ evaluate: 0, key: 0, charge: 0, transport: 0 });
  });

  test('rejects magic-byte spoofing and decoded oversize images before any gate', async () => {
    const spoof = await POST(request({ kind: 'image', dataUrl: 'data:image/png;base64,/9j/' }));
    expect(spoof.status).toBe(400);
    const bytes = new Uint8Array((8 * 1024 * 1024) + 1);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const oversize = await POST(request({ kind: 'image', dataUrl: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}` }));
    expect(oversize.status).toBe(400);
    expect(calls).toEqual({ evaluate: 0, key: 0, charge: 0, transport: 0 });
  });

  test('enforces the 100,000 UTF-8 text byte ceiling before any gate', async () => {
    const exact = 'é'.repeat(50_000);
    const exactResponse = await POST(request({ kind: 'text', text: exact }));
    expect(exactResponse.status).toBe(200);
    expect(calls).toEqual({ evaluate: 1, key: 1, charge: 1, transport: 1 });

    const overflowResponse = await POST(request({ kind: 'text', text: `${exact}a` }));
    expect(overflowResponse.status).toBe(400);
    expect(await overflowResponse.json()).toEqual({ error: 'Invalid scan request.' });
    expect(calls).toEqual({ evaluate: 1, key: 1, charge: 1, transport: 1 });
  });

  test('abort before dispatch returns fixed 408 with zero charge or transport', async () => {
    const controller = new AbortController();
    controller.abort();

    const response = await POST(request({ kind: 'text', text: 'Office hours' }, controller.signal));

    expect(response.status).toBe(408);
    expect(await response.json()).toEqual({ error: 'Unable to scan this source.' });
    expect(calls).toEqual({ evaluate: 1, key: 1, charge: 0, transport: 0 });
  });

  test('abort after dispatch cancels the exact transport and returns outcome_unknown without retry', async () => {
    const controller = new AbortController();
    abortTransportState.waitForAbort = true;
    const req = request({ kind: 'text', text: 'Office hours' }, controller.signal);

    const responsePromise = POST(req);
    await transportStarted;
    controller.abort();
    const response = await responsePromise;

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'The scan outcome is unknown.',
      code: 'outcome_unknown',
    });
    expect(transportSignals).toEqual([req.signal]);
    expect(abortTransportState.cancellations).toBe(1);
    expect(calls).toEqual({ evaluate: 1, key: 1, charge: 1, transport: 1 });
  });

  test('creates UUID identities, charges before one scan, and returns only the validated response shape', async () => {
    const rawText = 'Private planning notes';
    const response = await POST(request({ kind: 'text', text: rawText }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(calls).toEqual({ evaluate: 1, key: 1, charge: 1, transport: 1 });
    expect(timeline).toEqual(['evaluate', 'charge', 'transport']);
    expect(ScanResponseSchema.parse(body)).toEqual(body);
    expect(body).toMatchObject({
      source: {
        kind: 'text',
        sourceId: uuidValues[0],
        contentHandle: uuidValues[1],
      },
      candidates: [{ candidateId: uuidValues[2], title: { value: 'Planning session' } }],
      issues: [{ code: 'field_not_found', field: 'location' }],
    });
    expect(transportRequests).toHaveLength(1);
    const providerRequest = transportRequests[0] as {
      model: string;
      messages: Array<{ role: string; content: unknown }>;
      provider: unknown;
      stream: boolean;
    };
    expect(providerRequest.model).toBe('deepseek/deepseek-v4-flash');
    expect(providerRequest.messages[0]).toEqual({ role: 'system', content: expect.any(String) });
    expect(JSON.parse(String(providerRequest.messages[1]?.content))).toEqual([{
      sourceId: uuidValues[0],
      kind: 'text',
      text: rawText,
    }]);
    expect(providerRequest.provider).toEqual({ require_parameters: true, data_collection: 'deny', zdr: true });
    expect(providerRequest.stream).toBe(false);
    expect(JSON.stringify(providerRequest)).not.toContain(uuidValues[1]);
    expect(JSON.stringify(providerRequest)).not.toContain('test-key');
    expect(JSON.stringify(body)).not.toContain(rawText);
    expect(body).not.toHaveProperty('request');
  });

  test('uses the real vision adapter but never returns its image data URL', async () => {
    const dataUrl = VALID_PNG_DATA_URL;
    const response = await POST(request({ kind: 'image', dataUrl }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(calls).toEqual({ evaluate: 1, key: 1, charge: 1, transport: 1 });
    expect(ScanResponseSchema.parse(body)).toEqual(body);
    expect(JSON.stringify(body)).not.toContain(dataUrl);
  });

  test('maps limit decisions without charging', async () => {
    limits.allowed = false;
    limits.reason = 'community-budget';
    expect((await POST(request({ kind: 'text', text: 'hello' }))).status).toBe(402);
    limits.reason = 'ip-rate';
    expect((await POST(request({ kind: 'text', text: 'hello' }))).status).toBe(429);
    expect(calls.charge).toBe(0);
    expect(calls.key).toBe(0);
  });

  test.each([
    [402, 402, { code: 'community_limit' }],
    [408, 504, { error: 'The provider timed out.', code: 'upstream_timeout' }],
    [429, 502, { error: 'The provider could not scan this source.', code: 'scan_provider_failed' }],
    [503, 503, { error: 'No privacy-compatible model endpoint is available.', code: 'privacy_endpoint_unavailable' }],
    [500, 502, { error: 'The provider could not scan this source.', code: 'scan_provider_failed' }],
  ])('maps a provider HTTP %i without upstream details', async (upstreamStatus, expectedStatus, expectedBody) => {
    transportState.status = upstreamStatus;
    const response = await POST(request({ kind: 'text', text: 'sensitive source' }));
    const body = await response.json();
    expect(response.status).toBe(expectedStatus);
    if (expectedStatus === 402) {
      expect(body).toEqual({
        error: 'This app is community sponsored. The usage limits have been hit today.',
        code: 'community_limit',
        resetAt: expect.any(String),
      });
    } else {
      expect(body).toEqual(expectedBody);
    }
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('sensitive source');
    expect(serialized).not.toContain('test-key');
    expect(serialized).not.toContain('stack');
    expect(serialized).not.toContain('provider prompt');
    expect(serialized).not.toContain('upstream response');
    expect(calls).toEqual({ evaluate: 1, key: 1, charge: 1, transport: 1 });
  });

  test('returns a fixed response for unexpected internal failures', async () => {
    const parse = spyOn(ScanResponseSchema, 'parse').mockImplementation(() => {
      throw new Error('private raw provider response');
    });
    try {
      const response = await POST(request({ kind: 'text', text: 'sensitive source' }));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Unable to scan this source.' });
    } finally {
      parse.mockRestore();
    }
  });

  test('makes resolver identity mismatch fail through the selected real adapter before transport', async () => {
    const source = { sourceId: 'source-1', kind: 'text' as const, contentHandle: 'handle-1' };
    const job = createScanJob(
      { kind: 'text', text: 'secret' },
      source,
      { key: 'test', mode: 'community' },
      new AbortController().signal,
    );
    if (job.kind !== 'text') throw new Error('expected text job');
    await expect(job.provider.scan([{ ...source, contentHandle: 'other-handle' }])).rejects.toMatchObject({ code: 'source_resolution_failed' });
    expect(calls.transport).toBe(0);
  });

  test('rejects a mismatched image handle before the real vision adapter transports it', async () => {
    const source = { sourceId: 'source-2', kind: 'image' as const, contentHandle: 'handle-2' };
    const job = createScanJob(
      { kind: 'image', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
      source,
      { key: 'test', mode: 'community' },
      new AbortController().signal,
    );
    if (job.kind !== 'image') throw new Error('expected image job');
    await expect(job.provider.scan([{ ...source, contentHandle: 'other-handle' }])).rejects.toMatchObject({ code: 'source_resolution_failed' });
    expect(calls.transport).toBe(0);
  });
});
