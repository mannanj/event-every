import { describe, expect, mock, test } from 'bun:test';
import type { OpenRouterChatRequest } from '@event-every/scanner/openrouter';
import {
  CommunityLimitError,
  OpenRouterUpstreamError,
  type LlmCallAuth,
  type openRouterChat,
} from '@/lib/llm';
import { createEventEveryOpenRouterTransport } from '../transport';

const auth: LlmCallAuth = { key: 'scanner-test-key', mode: 'community' };
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

describe('Event Every OpenRouter scanner transport', () => {
  test('forwards the Scanner request and host auth exactly once', async () => {
    const body = { choices: [], usage: { cost: 0.01 } };
    const call = mock(async () => body) as unknown as typeof openRouterChat;

    const result = await createEventEveryOpenRouterTransport(auth, call).complete(request);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith(request, auth);
    expect(result).toEqual({ ok: true, body });
    expect(JSON.stringify(result)).not.toContain(auth.key);
  });

  test('does not retry provider errors and maps a community limit to HTTP 402', async () => {
    const call: typeof openRouterChat = mock(async () => {
      throw new CommunityLimitError('2026-08-01T00:00:00.000Z');
    }) as unknown as typeof openRouterChat;

    const result = await createEventEveryOpenRouterTransport(auth, call).complete(request);

    expect(call).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, failure: 'http', status: 402, retryable: false });
    expect(JSON.stringify(result)).not.toContain(auth.key);
  });

  test('maps a typed upstream 503 into Scanner HTTP failure without its message', async () => {
    const call: typeof openRouterChat = mock(async () => {
      throw new OpenRouterUpstreamError(503, true, 'private upstream detail');
    }) as unknown as typeof openRouterChat;

    const result = await createEventEveryOpenRouterTransport(auth, call).complete(request);

    expect(call).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, failure: 'http', status: 503, retryable: true });
    expect(JSON.stringify(result)).not.toContain('private upstream detail');
  });

  test('sanitizes arbitrary thrown values into a non-retryable network failure', async () => {
    const call = mock(async () => { throw new Error('secret stack detail'); }) as unknown as typeof openRouterChat;

    const result = await createEventEveryOpenRouterTransport(auth, call).complete(request);

    expect(result).toEqual({ ok: false, failure: 'network', status: null, retryable: false });
    expect(JSON.stringify(result)).not.toContain('secret stack detail');
  });
});
