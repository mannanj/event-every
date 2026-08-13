import { describe, expect, mock, test } from 'bun:test';
import { PROVIDER_BODY_MAX_BYTES } from '../cost';
import { OWNER_MODELS, OWNER_PROVIDER_URL } from '../policy';
import {
  callOpenRouter,
  type ConsumerKind,
  type ProviderFetch,
} from '../transport';

const encoder = new TextEncoder();
const scannerResponseFormat = {
  type: 'json_schema',
  json_schema: { name: 'event_scanner_observation', strict: true, schema: { type: 'object' } },
} as const;
const callerScannerResponseFormat = {
  type: 'caller-format',
  json_schema: { name: 'caller-schema', strict: false, schema: scannerResponseFormat.json_schema.schema },
} as const;
const timezoneTools = [{
  type: 'function',
  function: {
    name: 'resolve_timezone',
    description: 'Return the resolved IANA timezone',
    parameters: {
      type: 'object',
      properties: {
        timezone: { type: 'string', description: 'IANA timezone identifier' },
        confidence: { type: 'number', description: 'Confidence 0-1', minimum: 0, maximum: 1 },
      },
      required: ['timezone', 'confidence'],
    },
  },
}] as const;
const timezoneToolChoice = { type: 'function', function: { name: 'resolve_timezone' } } as const;

function jsonResponse(value: string, status = 200): Response {
  return new Response(encoder.encode(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function successBody(cost = '0.000000001'): string {
  return `{"choices":[],"usage":{"cost":${cost}}}`;
}

describe('fixed OpenRouter transport', () => {
  test.each([
    [
      'scan_text',
      'scan-text',
      { messages: [], response_format: callerScannerResponseFormat },
      {
        messages: [],
        response_format: scannerResponseFormat,
        temperature: 0,
        max_completion_tokens: 8192,
        reasoning: { exclude: true },
        provider: { require_parameters: true, data_collection: 'deny', zdr: true },
        stream: false,
      },
    ],
    [
      'scan_image',
      'scan-image',
      { messages: [], response_format: callerScannerResponseFormat },
      {
        messages: [],
        response_format: scannerResponseFormat,
        temperature: 0,
        max_completion_tokens: 8192,
        reasoning: { exclude: true },
        provider: { require_parameters: true, data_collection: 'deny', zdr: true },
        stream: false,
      },
    ],
    [
      'resolve_timezone',
      'resolve-timezone',
      {
        messages: [],
        tools: [{ type: 'function', function: { name: 'caller_tool', parameters: {} } }],
        tool_choice: { type: 'function', function: { name: 'caller_tool' } },
      },
      { messages: [], tools: timezoneTools, tool_choice: timezoneToolChoice, stream: false },
    ],
    [
      'summarize',
      'summarize',
      { messages: [] },
      { messages: [], max_tokens: 16, temperature: 0.2, stream: false },
    ],
  ] as const)('pins %s to its complete policy request shape', async (consumerKind, variant, providerBody, expectedBody) => {
    let sentBody: unknown;
    const fetcher: ProviderFetch = mock(async (_url, init) => {
      sentBody = JSON.parse(String(init?.body));
      return jsonResponse(successBody());
    });

    const result = await callOpenRouter({
      consumerKind,
      apiKey: 'synthetic-owner-key',
      providerBody: { model: 'caller/forbidden-model', ...providerBody },
      signal: new AbortController().signal,
    }, { fetcher });

    expect(result.status).toBe('success');
    expect(sentBody).toEqual({ model: OWNER_MODELS[variant], ...expectedBody });
  });

  test.each([
    ['scan_text', { messages: [] }],
    ['scan_image', { response_format: scannerResponseFormat }],
    ['resolve_timezone', {}],
    ['summarize', {}],
  ] as const)('rejects an incomplete %s payload before provider fetch', async (consumerKind, providerBody) => {
    const fetcher: ProviderFetch = mock(async () => jsonResponse(successBody()));

    const result = await callOpenRouter({
      consumerKind,
      apiKey: 'synthetic-owner-key',
      providerBody,
      signal: new AbortController().signal,
    }, { fetcher });

    expect(result).toEqual({
      status: 'failed',
      failure: { code: 'provider_invalid_response', httpStatus: 502 },
      costOutcome: { kind: 'malformed' },
    });
    expect(fetcher).toHaveBeenCalledTimes(0);
  });

  test('uses only the fixed origin, exact headers/body, manual redirects, and caller signal', async () => {
    const controller = new AbortController();
    const fetcher: ProviderFetch = mock(async () => jsonResponse(successBody()));
    const providerBody = {
      model: 'caller/model-is-ignored',
      models: ['caller/fallback-is-forbidden'],
      messages: [{ role: 'user', content: 'synthetic input' }],
      price: 'caller-price-is-forbidden',
      max_tokens: 999,
      temperature: 1,
      stream: true,
      plugins: [{ id: 'caller-plugin-is-forbidden' }],
      provider: { order: ['caller-provider-is-forbidden'], allow_fallbacks: true },
      route: 'caller-route-is-forbidden',
    };

    await callOpenRouter({
      consumerKind: 'summarize',
      apiKey: 'opaque-test-key',
      providerBody,
      signal: controller.signal,
    }, { fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(OWNER_PROVIDER_URL, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        authorization: 'Bearer opaque-test-key',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: OWNER_MODELS.summarize,
        messages: providerBody.messages,
        max_tokens: 16,
        temperature: 0.2,
        stream: false,
      }),
      signal: controller.signal,
    });
  });

  test.each([302, 307, 402, 429, 500])('never reads status %i and cancels its body exactly once', async (status) => {
    const cancel = mock(async () => undefined);
    const getReader = mock(() => { throw new Error('body must not be read'); });
    const response = {
      ok: false,
      status,
      body: { cancel, getReader },
    } as unknown as Response;
    const fetcher: ProviderFetch = mock(async () => response);

    const result = await callOpenRouter({
      consumerKind: 'scan_text',
      apiKey: 'synthetic-owner-key',
      providerBody: { messages: [], response_format: scannerResponseFormat },
      signal: new AbortController().signal,
    }, { fetcher });

    expect(result.status).toBe('failed');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(getReader).toHaveBeenCalledTimes(0);
  });

  test.each([
    [402, 'owner_provider_credit_unavailable', 503],
    [408, 'provider_timeout', 504],
    [429, 'provider_rate_limited', 503],
    [503, 'privacy_endpoint_unavailable', 503],
    [400, 'provider_rejected', 502],
    [500, 'provider_unavailable', 502],
  ] as const)('maps scanner HTTP %i without provider content', async (status, code, httpStatus) => {
    const fetcher: ProviderFetch = mock(async () => new Response('private upstream body', { status }));
    const result = await callOpenRouter({
      consumerKind: 'scan_image',
      apiKey: 'synthetic-owner-key',
      providerBody: { messages: [], response_format: scannerResponseFormat },
      signal: new AbortController().signal,
    }, { fetcher });

    expect(result).toMatchObject({ status: 'failed', failure: { code, httpStatus } });
    expect(JSON.stringify(result)).not.toContain('private upstream body');
  });

  test('maps non-scanner 503 to provider_unavailable', async () => {
    const fetcher: ProviderFetch = mock(async () => new Response(null, { status: 503 }));
    await expect(callOpenRouter({
      consumerKind: 'summarize',
      apiKey: 'synthetic-owner-key',
      providerBody: { messages: [] },
      signal: new AbortController().signal,
    }, { fetcher })).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'provider_unavailable', httpStatus: 502 },
    });
  });

  test('fatal-decodes UTF-8 and returns only a fixed invalid-response failure', async () => {
    const bytes = new Uint8Array([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d]);
    const fetcher: ProviderFetch = mock(async () => new Response(bytes, { status: 200 }));

    const result = await callOpenRouter({
      consumerKind: 'summarize',
      apiKey: 'synthetic-owner-key',
      providerBody: { messages: [] },
      signal: new AbortController().signal,
    }, { fetcher });

    expect(result).toEqual({
      status: 'failed',
      failure: { code: 'provider_invalid_response', httpStatus: 502 },
      costOutcome: { kind: 'malformed' },
    });
  });

  test('cancels and rejects before byte 2,097,153', async () => {
    let cancellations = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(PROVIDER_BODY_MAX_BYTES));
        controller.enqueue(new Uint8Array([0x7b]));
      },
      cancel() { cancellations += 1; },
    });
    const fetcher: ProviderFetch = mock(async () => new Response(body, { status: 200 }));

    const result = await callOpenRouter({
      consumerKind: 'summarize',
      apiKey: 'synthetic-owner-key',
      providerBody: { messages: [] },
      signal: new AbortController().signal,
    }, { fetcher });

    expect(result).toMatchObject({
      status: 'failed',
      failure: { code: 'provider_invalid_response' },
    });
    expect(cancellations).toBe(1);
  });

  test.each([
    ['duplicate usage', '{"usage":{"cost":1},"usage":{"cost":2}}'],
    ['duplicate usage.cost', '{"usage":{"cost":1,"cost":2}}'],
    ['trailing JSON', '{"usage":{"cost":1}} {"second":true}'],
  ])('rejects %s instead of accepting ambiguous accounting', async (_name, body) => {
    const fetcher: ProviderFetch = mock(async () => jsonResponse(body));
    const result = await callOpenRouter({
      consumerKind: 'resolve_timezone',
      apiKey: 'synthetic-owner-key',
      providerBody: { messages: [] },
      signal: new AbortController().signal,
    }, { fetcher });

    expect(result).toEqual({
      status: 'failed',
      failure: { code: 'provider_invalid_response', httpStatus: 502 },
      costOutcome: { kind: 'malformed' },
    });
  });

  test.each([
    ['0.000000001', { kind: 'exact', nanodollars: 1 }],
    ['1e100', { kind: 'positive-overflow' }],
  ] as const)('returns one lossless cost outcome for %s', async (cost, expected) => {
    const fetcher: ProviderFetch = mock(async () => jsonResponse(successBody(cost)));
    const result = await callOpenRouter({
      consumerKind: 'summarize',
      apiKey: 'synthetic-owner-key',
      providerBody: { messages: [] },
      signal: new AbortController().signal,
    }, { fetcher });

    expect(result).toMatchObject({ status: 'success', costOutcome: expected });
  });

  test('classifies caller abort and network rejection as an ambiguous post-permit outcome', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('private reason', 'AbortError'));
    const fetcher: ProviderFetch = mock(async () => { throw controller.signal.reason; });

    const result = await callOpenRouter({
      consumerKind: 'scan_text',
      apiKey: 'synthetic-owner-key',
      providerBody: { messages: [], response_format: scannerResponseFormat },
      signal: controller.signal,
    }, { fetcher });

    expect(result).toEqual({
      status: 'unknown',
      failure: { code: 'provider_outcome_unknown', httpStatus: 502 },
    });
    expect(JSON.stringify(result)).not.toContain('private reason');
  });

  test('cancels a blocked response reader and returns unknown when the shared signal aborts', async () => {
    const controller = new AbortController();
    let started!: () => void;
    const readerStarted = new Promise<void>((resolve) => { started = resolve; });
    let cancellations = 0;
    const body = new ReadableStream<Uint8Array>({
      pull() { started(); },
      cancel() { cancellations += 1; },
    });
    const fetcher: ProviderFetch = mock(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      return new Response(body, { status: 200 });
    });

    const pending = callOpenRouter({
      consumerKind: 'summarize' satisfies ConsumerKind,
      apiKey: 'synthetic-owner-key',
      providerBody: { messages: [] },
      signal: controller.signal,
    }, { fetcher });
    await readerStarted;
    controller.abort();
    const result = await pending;

    expect(result).toEqual({
      status: 'unknown',
      failure: { code: 'provider_outcome_unknown', httpStatus: 502 },
    });
    expect(cancellations).toBe(1);
  });
});
