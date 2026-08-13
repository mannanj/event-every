import { describe, expect, mock, test } from 'bun:test';
import type { OpenRouterChatRequest } from '@event-every/scanner/openrouter';
import type { ProviderOperationInput, ProviderOperationResult } from '@/platform/cloudflare/provider-operation';
import { createEventEveryOpenRouterTransport } from '../transport';
import { runCoordinatedScanJob } from '../job';

const request: OpenRouterChatRequest = {
  model: 'deepseek/deepseek-v4-flash',
  messages: [{ role: 'system', content: 'extract' }],
  response_format: {
    type: 'json_schema',
    json_schema: { name: 'event_scanner_observation', strict: true, schema: {} },
  },
  temperature: 0,
  max_completion_tokens: 8192,
  reasoning: { exclude: true },
  provider: { require_parameters: true, data_collection: 'deny', zdr: true },
  stream: false,
};

const claim = <Value>(value: Value) => ({ value, confidence: null, evidence: [] });
const providerBody = {
  choices: [{
    finish_reason: 'stop',
    message: {
      content: JSON.stringify({
        candidates: [{
          sourceUid: null,
          title: claim('Planning Session'),
          description: claim(null),
          location: claim(null),
          url: claim(null),
          temporal: claim({ start: null, end: null, duration: null, allDay: 'unknown' }),
          recurrence: claim(null),
          issues: [],
        }],
        issues: [],
      }),
      refusal: null,
    },
  }],
};

describe('Event Every scanner coordinator adapter', () => {
  test('is a typed pass-through from the Scanner request to the permitted invocation', async () => {
    const invoke = mock(async () => ({
      status: 'success' as const,
      value: providerBody,
      costOutcome: { kind: 'exact' as const, nanodollars: 1 },
    }));

    const result = await createEventEveryOpenRouterTransport({ invoke }).complete(request);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(request);
    expect(result).toEqual({ ok: true, body: providerBody });
  });

  test.each([
    [408, true],
    [429, true],
    [503, true],
    [400, false],
  ])('maps a closed HTTP %i result without leaking provider failure details', async (status, retryable) => {
    const invoke = mock(async () => ({
      status: 'failed' as const,
      failure: { code: 'provider_unavailable' as const, httpStatus: 502 as const },
      providerStatus: status,
      costOutcome: { kind: 'missing' as const },
    }));

    const result = await createEventEveryOpenRouterTransport({ invoke }).complete(request);

    expect(result).toEqual({ ok: false, failure: 'http', status, retryable });
    expect(JSON.stringify(result)).not.toContain('provider_unavailable');
  });

  test('maps an ambiguous transport outcome to one non-retryable network failure', async () => {
    const invoke = mock(async () => ({
      status: 'unknown' as const,
      failure: { code: 'provider_outcome_unknown' as const, httpStatus: 502 as const },
    }));

    const result = await createEventEveryOpenRouterTransport({ invoke }).complete(request);

    expect(result).toEqual({ ok: false, failure: 'network', status: null, retryable: false });
  });

  test('has the job call the coordinator and materialize only its minimized replay', async () => {
    let coordinatorInput: ProviderOperationInput | undefined;
    const runOperation = mock(async (input: ProviderOperationInput): Promise<ProviderOperationResult> => {
      coordinatorInput = input;
      const replay = await input.execute(async (rawProviderRequest) => {
        expect(JSON.stringify(rawProviderRequest)).toContain('private scan text');
        return {
          status: 'success',
          value: providerBody,
          costOutcome: { kind: 'exact', nanodollars: 1 },
        };
      });
      return { status: 'completed', replay, settlement: 'settlement_complete' };
    });

    const result = await runCoordinatedScanJob({
      requestId: '11111111-1111-4111-8111-111111111111',
      request: { kind: 'text', text: 'private scan text' },
      source: {
        sourceId: '22222222-2222-4222-8222-222222222222',
        kind: 'text',
        contentHandle: '33333333-3333-4333-8333-333333333333',
      },
      bindingCandidates: [{ version: 'c1-b-current-v1', digest: 'a'.repeat(64) }],
      signal: new AbortController().signal,
      candidateIdFactory: () => '44444444-4444-4444-8444-444444444444',
    }, { runOperation });

    expect(runOperation).toHaveBeenCalledTimes(1);
    expect(coordinatorInput).toMatchObject({
      requestId: '11111111-1111-4111-8111-111111111111',
      variant: 'scan-text',
    });
    expect(JSON.stringify(coordinatorInput)).not.toContain('private scan text');
    expect(result).toMatchObject({
      status: 'completed',
      value: {
        candidates: [{
          candidateId: '44444444-4444-4444-8444-444444444444',
          title: { value: 'Planning Session' },
        }],
        issues: [],
      },
    });
    expect(JSON.stringify(result)).not.toContain('private scan text');
  });

  test('returns the durable source handle when a same-UUID retry has fresh transient handles', async () => {
    const runOperation = mock(async (): Promise<ProviderOperationResult> => ({
      status: 'completed',
      settlement: 'settlement_complete',
      replay: {
        source: {
          sourceId: '22222222-2222-4222-8222-222222222222',
          kind: 'text',
          contentHandle: '33333333-3333-4333-8333-333333333333',
        },
        candidates: [{
          candidateId: '44444444-4444-4444-8444-444444444444',
          sourceUid: null,
          title: { value: 'Planning Session', confidence: null, evidence: [] },
          description: { value: null, confidence: null, evidence: [] },
          location: { value: null, confidence: null, evidence: [] },
          url: { value: null, confidence: null, evidence: [] },
          temporal: { value: { start: null, end: null, duration: null, allDay: 'unknown' }, confidence: null, evidence: [] },
          recurrence: { value: null, confidence: null, evidence: [] },
          issues: [{ code: 'field_not_found', field: 'location' }],
        }],
        issues: [],
      },
    }));

    const result = await runCoordinatedScanJob({
      requestId: '11111111-1111-4111-8111-111111111111',
      request: { kind: 'text', text: 'never executed' },
      source: {
        sourceId: '66666666-6666-4666-8666-666666666666',
        kind: 'text',
        contentHandle: '77777777-7777-4777-8777-777777777777',
      },
      bindingCandidates: [{ version: 'c1-b-current-v1', digest: 'a'.repeat(64) }],
      signal: new AbortController().signal,
      candidateIdFactory: () => '55555555-5555-4555-8555-555555555555',
    }, { runOperation });

    expect(result).toMatchObject({
      status: 'completed',
      value: {
        source: {
          sourceId: '22222222-2222-4222-8222-222222222222',
          kind: 'text',
          contentHandle: '33333333-3333-4333-8333-333333333333',
        },
        candidates: [{
          candidateId: '44444444-4444-4444-8444-444444444444',
          issues: [{
            code: 'field_not_found',
            field: 'location',
            message: 'This field was not found.',
            evidence: [],
          }],
        }],
      },
    });
    expect(Object.keys((result.status === 'completed' ? result.value : {}) as object).sort()).toEqual(['candidates', 'issues', 'source']);
  });
});
