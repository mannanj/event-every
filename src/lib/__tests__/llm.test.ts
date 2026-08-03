// Unit tests for openRouterChat — the single OpenRouter transport. Budget metering
// is kept offline by stubbing the Redis-backed ./budget module at the boundary, and
// global fetch is mocked per case. recordCommunitySpend is spied to pin the usage-
// accounting contract (community records spend, admin does not).
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const recordCommunitySpend = mock(async (_cost: number) => {});
mock.module('@/lib/budget', () => ({
  recordCommunitySpend,
  getBudgetStatus: mock(async () => ({
    limitUsd: 5,
    spentUsd: 0,
    remainingUsd: 5,
    exhausted: false,
    resetAt: '2026-01-01T00:00:00.000Z',
  })),
  nextResetISO: () => '2026-01-01T00:00:00.000Z',
  DAILY_BUDGET_USD: 5,
}));

const { openRouterChat, CommunityLimitError, OpenRouterUpstreamError } = await import('@/lib/llm');

const ADMIN = { key: 'sk-test', mode: 'admin' as const };
const COMMUNITY = { key: 'sk-test', mode: 'community' as const };

const TOOL_OPTS = {
  model: 'm',
  messages: [{ role: 'user' as const, content: 'x' }],
  tools: [
    {
      type: 'function' as const,
      function: { name: 'extract_events', description: 'd', parameters: { type: 'object' } },
    },
  ],
  tool_choice: { type: 'function' as const, function: { name: 'extract_events' } },
};

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = mock(
    async () => new Response(JSON.stringify(body), { status })
  ) as unknown as typeof fetch;
}

// Captures the JSON body passed to fetch so request-shape assertions can read it.
function captureFetch(status: number, body: unknown) {
  const fetchMock = mock(async (_url: string, _init?: { body?: string }) => {
    return new Response(JSON.stringify(body), { status });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function responseFetch(response: Response) {
  const fetchMock = mock(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function unreadErrorResponse(status: number) {
  const cancel = mock(async () => {});
  const json = mock(async () => { throw new Error('provider body was read as JSON'); });
  const text = mock(async () => { throw new Error('provider body was read as text'); });
  const response = {
    body: { cancel },
    json,
    ok: false,
    status,
    text,
  } as unknown as Response;
  return { cancel, json, response, text };
}

beforeEach(() => {
  recordCommunitySpend.mockClear();
});

describe('openRouterChat', () => {
  test('success returning a tool call exposes choices[0].message.tool_calls', async () => {
    mockFetch(200, {
      choices: [
        {
          message: {
            tool_calls: [{ function: { name: 'extract_events', arguments: '{"ok":true}' } }],
          },
        },
      ],
      usage: { cost: 0.003 },
    });
    const data = await openRouterChat(TOOL_OPTS, ADMIN);
    expect(data.choices?.[0]?.message?.tool_calls?.[0]?.function.name).toBe('extract_events');
  });

  test('success returning content exposes choices[0].message.content', async () => {
    mockFetch(200, {
      choices: [{ message: { content: 'Team Lunch' } }],
      usage: { cost: 0.0001 },
    });
    const data = await openRouterChat(
      {
        model: 'm',
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'ctx' },
        ],
        max_tokens: 16,
        temperature: 0.2,
      },
      ADMIN
    );
    expect(data.choices?.[0]?.message?.content).toBe('Team Lunch');
  });

  test('records usage exactly once with the upstream cost for community mode', async () => {
    mockFetch(200, {
      choices: [{ message: { content: 'x' } }],
      usage: { cost: 0.5 },
    });
    await openRouterChat(TOOL_OPTS, COMMUNITY);
    expect(recordCommunitySpend).toHaveBeenCalledTimes(1);
    expect(recordCommunitySpend).toHaveBeenCalledWith(0.5);
  });

  test('does NOT record usage for admin mode', async () => {
    mockFetch(200, {
      choices: [{ message: { content: 'x' } }],
      usage: { cost: 0.5 },
    });
    await openRouterChat(TOOL_OPTS, ADMIN);
    expect(recordCommunitySpend).toHaveBeenCalledTimes(0);
  });

  test('community 402 throws CommunityLimitError and does not record usage', async () => {
    mockFetch(402, { error: { message: 'out of credits' } });
    await expect(openRouterChat(TOOL_OPTS, COMMUNITY)).rejects.toBeInstanceOf(
      CommunityLimitError
    );
    expect(recordCommunitySpend).toHaveBeenCalledTimes(0);
  });

  test('admin 402 throws a fixed typed error without the upstream message', async () => {
    mockFetch(402, { error: { message: 'nope' } });
    let caught: unknown;
    try {
      await openRouterChat(TOOL_OPTS, ADMIN);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OpenRouterUpstreamError);
    expect(caught).not.toBeInstanceOf(CommunityLimitError);
    expect((caught as Error).message).toBe('OpenRouter API error');
    expect((caught as Error).message).not.toContain('nope');
  });

  test('non-402 upstream error throws a fixed error without upstream text', async () => {
    mockFetch(500, { error: { message: 'boom' } });
    await expect(openRouterChat(TOOL_OPTS, ADMIN)).rejects.toThrow('OpenRouter API error');
    await expect(openRouterChat(TOOL_OPTS, ADMIN)).rejects.not.toThrow('boom');
  });

  test('missing key throws before fetch and never calls fetch', async () => {
    const fetchMock = mock(async () => new Response('{}', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(
      openRouterChat(TOOL_OPTS, { key: '', mode: 'admin' })
    ).rejects.toThrow(/OPENROUTER_API_KEY/);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test('tool-call request body emits tools + tool_choice and no max_tokens/temperature', async () => {
    const fetchMock = captureFetch(200, {
      choices: [{ message: { tool_calls: [{ function: { name: 'extract_events', arguments: '{}' } }] } }],
      usage: { cost: 0 },
    });
    await openRouterChat(TOOL_OPTS, ADMIN);
    const init = fetchMock.mock.calls[0][1] as { body: string };
    const sent = JSON.parse(init.body);
    expect(sent.tools).toBeDefined();
    expect(sent.tool_choice).toBeDefined();
    expect('max_tokens' in sent).toBe(false);
    expect('temperature' in sent).toBe(false);
  });

  test('content request body emits max_tokens + temperature and no tools/tool_choice', async () => {
    const fetchMock = captureFetch(200, {
      choices: [{ message: { content: 'Team Lunch' } }],
      usage: { cost: 0 },
    });
    await openRouterChat(
      {
        model: 'm',
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'ctx' },
        ],
        max_tokens: 16,
        temperature: 0.2,
      },
      ADMIN
    );
    const init = fetchMock.mock.calls[0][1] as { body: string };
    const sent = JSON.parse(init.body);
    expect(sent.max_tokens).toBe(16);
    expect(sent.temperature).toBe(0.2);
    expect('tools' in sent).toBe(false);
    expect('tool_choice' in sent).toBe(false);
  });

  test('forwards Scanner requests exactly without translating them to tool calls', async () => {
    const fetchMock = captureFetch(200, { choices: [], usage: { cost: 0 } });
    const scannerRequest = {
      model: 'deepseek/deepseek-v4-flash' as const,
      messages: [{ role: 'system' as const, content: 'extract' }],
      response_format: {
        type: 'json_schema' as const,
        json_schema: { name: 'event_scanner_observation' as const, strict: true as const, schema: {} },
      },
      temperature: 0 as const,
      max_completion_tokens: 8192 as const,
      reasoning: { exclude: true as const },
      provider: { require_parameters: true as const, data_collection: 'deny' as const, zdr: true as const },
      stream: false as const,
    };

    await openRouterChat(scannerRequest, ADMIN);

    const sent = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(sent).toEqual(scannerRequest);
    expect('tools' in sent).toBe(false);
  });

  test('forwards the exact abort signal to fetch', async () => {
    const controller = new AbortController();
    const fetchMock = captureFetch(200, { choices: [], usage: { cost: 0 } });

    await openRouterChat(TOOL_OPTS, ADMIN, { signal: controller.signal });

    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
  });

  test('records Scanner request usage exactly once for community mode', async () => {
    mockFetch(200, { choices: [], usage: { cost: 0.25 } });
    const scannerRequest = {
      model: 'deepseek/deepseek-v4-flash' as const,
      messages: [{ role: 'system' as const, content: 'extract' }],
      response_format: {
        type: 'json_schema' as const,
        json_schema: { name: 'event_scanner_observation' as const, strict: true as const, schema: {} },
      },
      temperature: 0 as const,
      max_completion_tokens: 8192 as const,
      reasoning: { exclude: true as const },
      provider: { require_parameters: true as const, data_collection: 'deny' as const, zdr: true as const },
      stream: false as const,
    };

    await openRouterChat(scannerRequest, COMMUNITY);

    expect(recordCommunitySpend).toHaveBeenCalledTimes(1);
    expect(recordCommunitySpend).toHaveBeenCalledWith(0.25);
  });

  test('checks status before JSON and sanitizes malformed successful JSON', async () => {
    responseFetch(new Response('not json', { status: 200 }));

    await expect(openRouterChat(TOOL_OPTS, ADMIN)).rejects.toThrow('OpenRouter API error');
  });

  test('maps community 402 before parsing empty, text, or malformed bodies', async () => {
    for (const body of ['', 'provider leaked this', '{broken']) {
      const fetchMock = responseFetch(new Response(body, { status: 402 }));

      await expect(openRouterChat(TOOL_OPTS, COMMUNITY)).rejects.toBeInstanceOf(CommunityLimitError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  test('sanitizes empty, text, and malformed error bodies into typed upstream errors', async () => {
    for (const body of ['', 'provider leaked this', '{broken']) {
      const fetchMock = responseFetch(new Response(body, { status: 503 }));
      let caught: unknown;
      try {
        await openRouterChat(TOOL_OPTS, ADMIN);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(OpenRouterUpstreamError);
      expect((caught as Error).message).toBe('OpenRouter API error');
      expect((caught as { status: number }).status).toBe(503);
      expect((caught as { retryable: boolean }).retryable).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  test.each([
    [402, COMMUNITY, CommunityLimitError, 'community_limit'],
    [402, ADMIN, OpenRouterUpstreamError, 'upstream_unavailable'],
    [408, ADMIN, OpenRouterUpstreamError, 'upstream_timeout'],
    [429, ADMIN, OpenRouterUpstreamError, 'upstream_unavailable'],
    [503, ADMIN, OpenRouterUpstreamError, 'upstream_unavailable'],
  ] as const)('provider error body remains unread and canceled for HTTP %i in %s mode', async (
    status,
    auth,
    ErrorType,
    expectedCode,
  ) => {
    const unread = unreadErrorResponse(status);
    responseFetch(unread.response);

    let caught: unknown;
    try {
      await openRouterChat(TOOL_OPTS, auth);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ErrorType);
    expect(caught).toMatchObject({ code: expectedCode });
    expect(unread.cancel).toHaveBeenCalledTimes(1);
    expect(unread.json).not.toHaveBeenCalled();
    expect(unread.text).not.toHaveBeenCalled();
    expect(JSON.stringify(caught)).not.toContain('provider body');
  });

  test('sets retryability only for timeout, rate-limit, and server upstream statuses', async () => {
    for (const [status, retryable] of [[400, false], [408, true], [429, true]] as const) {
      responseFetch(new Response('not JSON', { status }));
      let caught: unknown;
      try {
        await openRouterChat(TOOL_OPTS, ADMIN);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(OpenRouterUpstreamError);
      expect((caught as { status: number }).status).toBe(status);
      expect((caught as { retryable: boolean }).retryable).toBe(retryable);
      expect((caught as Error).message).toBe('OpenRouter API error');
      expect(caught).toMatchObject({
        code: status === 408 ? 'upstream_timeout' : 'upstream_unavailable',
      });
    }
  });
});
