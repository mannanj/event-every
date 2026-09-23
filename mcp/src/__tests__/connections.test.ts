import { describe, expect, test } from 'bun:test';
import { signActor } from '../../../src/server/mcp/grant';
import { handleConnections, type GrantStore } from '../connections';

/**
 * Plain-function coverage for the Worker half of listing and disconnecting
 * one MCP client at a time. No Cloudflare runtime needed - `GrantStore` is a
 * structural slice of `OAuthHelpers`, faked here the way `mcp-grant`'s own
 * tests fake it.
 */

const SECRET = 'synthetic-worker-secret';
const MANAGE_PURPOSE = 'ee.mcp.manage.v1';

function fakeStore(
  grants: { id: string; clientId: string; userId: string; createdAt: number }[],
  clientNames: Record<string, string> = {},
): GrantStore & { revoked: { id: string; userId: string }[] } {
  const revoked: { id: string; userId: string }[] = [];
  return {
    revoked,
    async listUserGrants(userId) {
      return { items: grants.filter((g) => g.userId === userId) };
    },
    async revokeGrant(grantId, userId) {
      revoked.push({ id: grantId, userId });
    },
    async lookupClient(clientId) {
      return clientNames[clientId] ? { clientName: clientNames[clientId] } : null;
    },
  };
}

function req(path: string, init: RequestInit = {}) {
  return new Request(`https://mcp.test${path}`, init);
}

async function token(sub = 'account-1', email = 'person@example.com') {
  return signActor({ sub, email }, SECRET, { purpose: MANAGE_PURPOSE, ttlSeconds: 60 });
}

describe('handleConnections', () => {
  test('returns null for an unrelated path', async () => {
    const store = fakeStore([]);
    const response = await handleConnections(req('/mcp'), store, SECRET);
    expect(response).toBeNull();
  });

  test('401s with no bearer token', async () => {
    const store = fakeStore([]);
    const response = await handleConnections(req('/connections'), store, SECRET);
    expect(response?.status).toBe(401);
  });

  test('401s with a token signed for a different purpose', async () => {
    const store = fakeStore([]);
    const wrongPurpose = await signActor({ sub: 'account-1', email: 'a@b.com' }, SECRET, {
      purpose: 'ee.mcp.actor.v1',
    });
    const response = await handleConnections(req('/connections', { headers: { authorization: `Bearer ${wrongPurpose}` } }), store, SECRET);
    expect(response?.status).toBe(401);
  });

  test('lists only the caller\'s grants, newest first, named by client', async () => {
    const store = fakeStore(
      [
        { id: 'g1', clientId: 'client-a', userId: 'account-1', createdAt: 100 },
        { id: 'g2', clientId: 'client-b', userId: 'account-1', createdAt: 200 },
        { id: 'g3', clientId: 'client-a', userId: 'someone-else', createdAt: 300 },
      ],
      { 'client-a': 'Claude', 'client-b': 'Codex' },
    );
    const bearer = await token();
    const response = await handleConnections(req('/connections', { headers: { authorization: `Bearer ${bearer}` } }), store, SECRET);
    expect(response?.status).toBe(200);
    const body = (await response!.json()) as { connections: { id: string; client: string; connectedAt: number }[] };
    expect(body.connections).toEqual([
      { id: 'g2', client: 'Codex', connectedAt: 200 },
      { id: 'g1', client: 'Claude', connectedAt: 100 },
    ]);
  });

  test('falls back to the raw client id when lookupClient has none', async () => {
    const store = fakeStore([{ id: 'g1', clientId: 'unregistered', userId: 'account-1', createdAt: 1 }]);
    const bearer = await token();
    const response = await handleConnections(req('/connections', { headers: { authorization: `Bearer ${bearer}` } }), store, SECRET);
    const body = (await response!.json()) as { connections: { client: string }[] };
    expect(body.connections[0]!.client).toBe('unregistered');
  });

  test('DELETE revokes the id scoped to the caller', async () => {
    const store = fakeStore([{ id: 'g1', clientId: 'client-a', userId: 'account-1', createdAt: 1 }]);
    const bearer = await token();
    const response = await handleConnections(
      req('/connections/g1', { method: 'DELETE', headers: { authorization: `Bearer ${bearer}` } }),
      store,
      SECRET,
    );
    expect(response?.status).toBe(200);
    expect(store.revoked).toEqual([{ id: 'g1', userId: 'account-1' }]);
  });

  test('DELETE answers the same for an id that does not exist', async () => {
    const store = fakeStore([]);
    const bearer = await token();
    const response = await handleConnections(
      req('/connections/does-not-exist', { method: 'DELETE', headers: { authorization: `Bearer ${bearer}` } }),
      store,
      SECRET,
    );
    expect(response?.status).toBe(200);
    const body = (await response!.json()) as { revoked: number };
    expect(body).toEqual({ revoked: 1 });
  });

  test('DELETE rejects an id shaped id that could not be a real grant id', async () => {
    const store = fakeStore([]);
    const bearer = await token();
    const response = await handleConnections(
      req('/connections/not a valid id', { method: 'DELETE', headers: { authorization: `Bearer ${bearer}` } }),
      store,
      SECRET,
    );
    expect(response?.status).toBe(404);
    expect(store.revoked).toEqual([]);
  });
});
