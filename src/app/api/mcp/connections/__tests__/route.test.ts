import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

/**
 * The finer-grained sibling of /api/mcp/disconnect: GET lists what is
 * connected, DELETE cuts off one id named in `?id=`. Both need a session
 * (401 without one), both need MCP configured (503 without it), and both
 * reach the Worker over `fetch`, which is mocked here rather than a real
 * network call.
 */

let envOverride: Record<string, unknown> = {};
let sessionRow: { id: string; email: string; expires_at: string } | null = null;

mock.module('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: envOverride }),
}));

const { GET, DELETE } = await import('@/app/api/mcp/connections/route');

function fakeDb() {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => sessionRow,
        run: async () => ({ meta: {} }),
        all: async () => ({ results: [] }),
      }),
    }),
    batch: async () => [],
  };
}

function configuredEnv(overrides: Record<string, unknown> = {}) {
  return {
    ACCOUNTS_DB: fakeDb(),
    ACCOUNT_DATA_KEK: 'synthetic-kek',
    MCP_GRANT_SECRET: 'synthetic-mcp-secret',
    MCP_ORIGIN: 'https://event-every-mcp.test',
    ...overrides,
  };
}

function futureIso(): string {
  return new Date(Date.now() + 3_600_000).toISOString();
}

function req(path: string, init: RequestInit = {}) {
  return new Request(`https://eventevery.test${path}`, {
    headers: { cookie: 'ee_session=session-1', ...(init.headers ?? {}) },
    ...init,
  });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  envOverride = configuredEnv();
  sessionRow = { id: 'account-1', email: 'person@example.com', expires_at: futureIso() };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('GET /api/mcp/connections', () => {
  test('401s without a session', async () => {
    sessionRow = null;
    const response = await GET(req('/api/mcp/connections'));
    expect(response.status).toBe(401);
  });

  test('503s when MCP is not configured', async () => {
    envOverride = configuredEnv({ MCP_GRANT_SECRET: undefined, MCP_ORIGIN: undefined });
    const response = await GET(req('/api/mcp/connections'));
    expect(response.status).toBe(503);
  });

  test('503s when accounts are not configured', async () => {
    envOverride = configuredEnv({ ACCOUNTS_DB: undefined });
    const response = await GET(req('/api/mcp/connections'));
    expect(response.status).toBe(503);
  });

  test('lists connections from the Worker, carrying a bearer assertion', async () => {
    const seen: Request[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input as RequestInfo, init));
      return new Response(
        JSON.stringify({ connections: [{ id: 'grant-1', client: 'Claude', connectedAt: 1700000000 }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const response = await GET(req('/api/mcp/connections'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      connections: [{ id: 'grant-1', client: 'Claude', connectedAt: 1700000000 }],
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe('https://event-every-mcp.test/connections');
    expect(seen[0]!.headers.get('authorization')).toMatch(/^Bearer .+\..+$/);
  });

  test('502s when the Worker fails', async () => {
    globalThis.fetch = mock(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const response = await GET(req('/api/mcp/connections'));
    expect(response.status).toBe(502);
  });

  test('502s when the Worker cannot be reached', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const response = await GET(req('/api/mcp/connections'));
    expect(response.status).toBe(502);
  });
});

describe('DELETE /api/mcp/connections', () => {
  test('401s without a session', async () => {
    sessionRow = null;
    const response = await DELETE(req('/api/mcp/connections?id=grant-1', { method: 'DELETE' }));
    expect(response.status).toBe(401);
  });

  test('503s when MCP is not configured', async () => {
    envOverride = configuredEnv({ MCP_GRANT_SECRET: undefined, MCP_ORIGIN: undefined });
    const response = await DELETE(req('/api/mcp/connections?id=grant-1', { method: 'DELETE' }));
    expect(response.status).toBe(503);
  });

  test('400s on a malformed id', async () => {
    const response = await DELETE(req('/api/mcp/connections?id=not%20a%20valid%20id', { method: 'DELETE' }));
    expect(response.status).toBe(400);
  });

  test('400s on a missing id', async () => {
    const response = await DELETE(req('/api/mcp/connections', { method: 'DELETE' }));
    expect(response.status).toBe(400);
  });

  test('disconnects the id at the Worker, carrying a bearer assertion', async () => {
    const seen: { url: string; method: string | undefined; auth: string | null }[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      seen.push({ url: request.url, method: request.method, auth: request.headers.get('authorization') });
      return new Response(JSON.stringify({ revoked: 1 }), { status: 200 });
    }) as unknown as typeof fetch;

    const response = await DELETE(req('/api/mcp/connections?id=grant-1', { method: 'DELETE' }));
    expect(response.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe('https://event-every-mcp.test/connections/grant-1');
    expect(seen[0]!.method).toBe('DELETE');
    expect(seen[0]!.auth).toMatch(/^Bearer .+\..+$/);
  });

  test('502s when the Worker fails', async () => {
    globalThis.fetch = mock(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const response = await DELETE(req('/api/mcp/connections?id=grant-1', { method: 'DELETE' }));
    expect(response.status).toBe(502);
  });
});
