import { beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { ScanResponseSchema } from '@/types/scannerHttp';

const calls = { evaluate: 0, charge: 0, transport: 0 };
const timeline: string[] = [];
const transportRequests: unknown[] = [];
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

const claim = <Value>(value: Value) => ({ value, confidence: null, evidence: [] });

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
  createEventEveryOpenRouterTransport: () => ({
    complete: async (scannerRequest: unknown) => {
      calls.transport++;
      timeline.push('transport');
      transportRequests.push(scannerRequest);
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

const request = (body: unknown) => new NextRequest('http://localhost/api/scan', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  calls.evaluate = 0;
  calls.charge = 0;
  calls.transport = 0;
  timeline.length = 0;
  transportRequests.length = 0;
  uuidIndex = 0;
  limits.allowed = true;
  limits.reason = null;
  transportState.status = null;
});

describe('/api/scan', () => {
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
    expect(calls).toEqual({ evaluate: 0, charge: 0, transport: 0 });
  });

  test('rejects magic-byte spoofing and decoded oversize images before any gate', async () => {
    const spoof = await POST(request({ kind: 'image', dataUrl: 'data:image/png;base64,/9j/' }));
    expect(spoof.status).toBe(400);
    const bytes = new Uint8Array((8 * 1024 * 1024) + 1);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const oversize = await POST(request({ kind: 'image', dataUrl: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}` }));
    expect(oversize.status).toBe(400);
    expect(calls).toEqual({ evaluate: 0, charge: 0, transport: 0 });
  });

  test('creates UUID identities, charges before one scan, and returns only the validated response shape', async () => {
    const rawText = 'Private planning notes';
    const response = await POST(request({ kind: 'text', text: rawText }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(calls).toEqual({ evaluate: 1, charge: 1, transport: 1 });
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
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const response = await POST(request({ kind: 'image', dataUrl }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(calls).toEqual({ evaluate: 1, charge: 1, transport: 1 });
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
  });

  test.each([
    [402, 402, { code: 'community_limit' }],
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
    expect(calls).toEqual({ evaluate: 1, charge: 1, transport: 1 });
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
    const job = createScanJob({ kind: 'text', text: 'secret' }, source, { key: 'test', mode: 'community' });
    if (job.kind !== 'text') throw new Error('expected text job');
    await expect(job.provider.scan([{ ...source, contentHandle: 'other-handle' }])).rejects.toMatchObject({ code: 'source_resolution_failed' });
    expect(calls.transport).toBe(0);
  });

  test('rejects a mismatched image handle before the real vision adapter transports it', async () => {
    const source = { sourceId: 'source-2', kind: 'image' as const, contentHandle: 'handle-2' };
    const job = createScanJob({ kind: 'image', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }, source, { key: 'test', mode: 'community' });
    if (job.kind !== 'image') throw new Error('expected image job');
    await expect(job.provider.scan([{ ...source, contentHandle: 'other-handle' }])).rejects.toMatchObject({ code: 'source_resolution_failed' });
    expect(calls.transport).toBe(0);
  });
});
