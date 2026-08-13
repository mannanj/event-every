import type { CostOutcome, StoredProviderFailure } from './contracts';
import { parseBoundedProviderJson, parseCostLexeme, PROVIDER_BODY_MAX_BYTES } from './cost';
import { OWNER_MODELS, OWNER_PROVIDER_URL } from './policy';

export type ConsumerKind = 'scan_text' | 'scan_image' | 'resolve_timezone' | 'summarize';

const VARIANT_BY_CONSUMER = Object.freeze({
  scan_text: 'scan-text',
  scan_image: 'scan-image',
  resolve_timezone: 'resolve-timezone',
  summarize: 'summarize',
} as const satisfies Record<ConsumerKind, keyof typeof OWNER_MODELS>);

const FIXED_SCANNER_PROVIDER = Object.freeze({
  require_parameters: true,
  data_collection: 'deny',
  zdr: true,
} as const);

const FIXED_TIMEZONE_TOOLS = Object.freeze([Object.freeze({
  type: 'function',
  function: Object.freeze({
    name: 'resolve_timezone',
    description: 'Return the resolved IANA timezone',
    parameters: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        timezone: Object.freeze({ type: 'string', description: 'IANA timezone identifier' }),
        confidence: Object.freeze({ type: 'number', description: 'Confidence 0-1', minimum: 0, maximum: 1 }),
      }),
      required: Object.freeze(['timezone', 'confidence']),
    }),
  }),
})]);
const FIXED_TIMEZONE_TOOL_CHOICE = Object.freeze({
  type: 'function',
  function: Object.freeze({ name: 'resolve_timezone' }),
});

export type ProviderTransportResult =
  | Readonly<{ status: 'success'; value: unknown; costOutcome: CostOutcome }>
  | Readonly<{
    status: 'failed';
    failure: StoredProviderFailure;
    costOutcome: Extract<CostOutcome, { kind: 'missing' | 'malformed' }>;
    providerStatus?: number;
  }>
  | Readonly<{
    status: 'unknown';
    failure: Readonly<{ code: 'provider_outcome_unknown'; httpStatus: 502 }>;
  }>;

export type ProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ProviderInvocation = (providerBody: Readonly<Record<string, unknown>>) => Promise<ProviderTransportResult>;

export type ProviderTransportInput = Readonly<{
  consumerKind: ConsumerKind;
  apiKey: string;
  providerBody: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
}>;

type TransportDependencies = Readonly<{
  fetcher?: ProviderFetch;
}>;

class InvalidProviderResponse extends Error {}
class AmbiguousProviderStream extends Error {}

const invalidFailure = (): Extract<ProviderTransportResult, { status: 'failed' }> => ({
  status: 'failed',
  failure: { code: 'provider_invalid_response', httpStatus: 502 },
  costOutcome: { kind: 'malformed' },
});

const unknownFailure = (): Extract<ProviderTransportResult, { status: 'unknown' }> => ({
  status: 'unknown',
  failure: { code: 'provider_outcome_unknown', httpStatus: 502 },
});

function fixedHttpFailure(consumerKind: ConsumerKind, status: number): StoredProviderFailure {
  if (status === 402) return { code: 'owner_provider_credit_unavailable', httpStatus: 503 };
  if (status === 408) return { code: 'provider_timeout', httpStatus: 504 };
  if (status === 429) return { code: 'provider_rate_limited', httpStatus: 503 };
  if ((consumerKind === 'scan_text' || consumerKind === 'scan_image') && status === 503) {
    return { code: 'privacy_endpoint_unavailable', httpStatus: 503 };
  }
  if (status >= 400 && status < 500) return { code: 'provider_rejected', httpStatus: 502 };
  if (status >= 500 && status < 600) return { code: 'provider_unavailable', httpStatus: 502 };
  return { code: 'provider_rejected', httpStatus: 502 };
}

function fixedProviderBody(
  consumerKind: ConsumerKind,
  providerBody: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | null {
  if (!Array.isArray(providerBody.messages)) return null;
  const model = OWNER_MODELS[VARIANT_BY_CONSUMER[consumerKind]];
  if (consumerKind === 'scan_text' || consumerKind === 'scan_image') {
    const responseFormat = providerBody.response_format;
    if (!responseFormat || typeof responseFormat !== 'object' || Array.isArray(responseFormat)) return null;
    const jsonSchema = (responseFormat as Record<string, unknown>).json_schema;
    if (!jsonSchema || typeof jsonSchema !== 'object' || Array.isArray(jsonSchema)) return null;
    const schema = (jsonSchema as Record<string, unknown>).schema;
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null;
    return {
      model,
      messages: providerBody.messages,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'event_scanner_observation', strict: true, schema },
      },
      temperature: 0,
      max_completion_tokens: 8192,
      reasoning: { exclude: true },
      provider: FIXED_SCANNER_PROVIDER,
      stream: false,
    };
  }
  if (consumerKind === 'resolve_timezone') {
    return {
      model,
      messages: providerBody.messages,
      tools: FIXED_TIMEZONE_TOOLS,
      tool_choice: FIXED_TIMEZONE_TOOL_CHOICE,
      stream: false,
    };
  }
  return {
    model,
    messages: providerBody.messages,
    max_tokens: 16,
    temperature: 0.2,
    stream: false,
  };
}

async function cancelStatusBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Status alone is authoritative. Cancellation errors are never materialized.
  }
}

async function readSuccessBody(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<Readonly<{
  value: unknown;
  costLexeme?: string;
}>> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let cancelled = false;
  const cancelOnce = async (): Promise<void> => {
    if (cancelled) return;
    cancelled = true;
    try { await reader.cancel(); } catch { /* fixed failure below */ }
  };
  const abort = (): void => { void cancelOnce(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      if (signal.aborted) throw new AmbiguousProviderStream();
      let next: Awaited<ReturnType<typeof reader.read>>;
      try {
        next = await reader.read();
      } catch {
        throw new AmbiguousProviderStream();
      }
      if (signal.aborted) throw new AmbiguousProviderStream();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > PROVIDER_BODY_MAX_BYTES) {
        await cancelOnce();
        throw new InvalidProviderResponse();
      }
      chunks.push(next.value);
    }
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidProviderResponse();
  }
  try {
    return parseBoundedProviderJson(decoded);
  } catch {
    throw new InvalidProviderResponse();
  }
}

export async function callOpenRouter(
  input: ProviderTransportInput,
  dependencies: TransportDependencies = {},
): Promise<ProviderTransportResult> {
  const fetcher = dependencies.fetcher ?? globalThis.fetch.bind(globalThis);
  const providerBody = fixedProviderBody(input.consumerKind, input.providerBody);
  if (providerBody === null) return invalidFailure();

  let response: Response;
  try {
    response = await fetcher(OWNER_PROVIDER_URL, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(providerBody),
      signal: input.signal,
    });
  } catch {
    return unknownFailure();
  }

  if (!response.ok) {
    await cancelStatusBody(response);
    return {
      status: 'failed',
      failure: fixedHttpFailure(input.consumerKind, response.status),
      providerStatus: response.status,
      costOutcome: { kind: 'missing' },
    };
  }
  if (!response.body) return invalidFailure();

  try {
    const parsed = await readSuccessBody(response.body, input.signal);
    return {
      status: 'success',
      value: parsed.value,
      costOutcome: parsed.costLexeme === undefined
        ? { kind: 'missing' }
        : parseCostLexeme(parsed.costLexeme),
    };
  } catch (error) {
    return error instanceof AmbiguousProviderStream ? unknownFailure() : invalidFailure();
  }
}
