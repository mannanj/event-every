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

const { openRouterChat, CommunityLimitError } = await import('@/lib/llm');

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
  const fetchMock = mock(async (_url: string, init?: { body?: string }) => {
    return new Response(JSON.stringify(body), { status });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
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

  test('admin 402 throws a plain Error (not CommunityLimitError) with the upstream message', async () => {
    mockFetch(402, { error: { message: 'nope' } });
    let caught: unknown;
    try {
      await openRouterChat(TOOL_OPTS, ADMIN);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(CommunityLimitError);
    expect((caught as Error).message).toBe('nope');
  });

  test('non-402 upstream error throws an Error carrying the upstream message', async () => {
    mockFetch(500, { error: { message: 'boom' } });
    await expect(openRouterChat(TOOL_OPTS, ADMIN)).rejects.toThrow('boom');
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
});
