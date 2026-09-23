import { MANAGE_PURPOSE, verifyActor } from '../../src/server/mcp/grant';

/**
 * Seeing and disconnecting the AI clients a person has connected.
 *
 * WHY THIS IS NEEDED. An MCP client that has been through OAuth holds a
 * refresh token, and by default that token never expires. `/revoke` already
 * ends every connection at once (see authHandler.ts, handleRevoke), but
 * somebody who wants to cut off one lost laptop without disconnecting the
 * assistants they still use has had no way to do that.
 *
 * THE SHAPE. The Worker owns the grants (they live in its OAUTH_KV), but only
 * the app can see who is signed in. So the app asks, server to server, with a
 * short-lived MANAGE token naming the person (see src/server/mcp/grant.ts):
 *
 *   browser --session--> app /api/mcp/connections --manage token--> Worker /connections
 *                                                                       listUserGrants(sub)
 *                                                                       revokeGrant(id, sub)
 *
 * Modelled on ~/Documents/mcp-grant/src/connections.ts, but this Worker does
 * not vendor that package: the token is verified with THIS app's own
 * `verifyActor` under its own `MANAGE_PURPOSE`, domain-separated from GRANT,
 * ACTOR and REVOKE the same way every assertion in grant.ts already is.
 */

export const CONNECTIONS_PATH = '/connections';

/** One connected client, as the person should see it. */
export interface Connection {
  id: string;
  /** The name the client registered with, or its id when it gave none. */
  client: string;
  /** Unix seconds. */
  connectedAt: number;
}

/** The slice of OAuthHelpers this needs. The real object satisfies it. */
export interface GrantStore {
  listUserGrants(
    userId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<{
    items: { id: string; clientId: string; userId: string; createdAt: number }[];
    cursor?: string;
  }>;
  revokeGrant(grantId: string, userId: string): Promise<void>;
  lookupClient(clientId: string): Promise<{ clientName?: string } | null>;
}

/** Grant ids are the library's own random strings; anything else is refused. */
const GRANT_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** A person with more connections than this has a different problem. */
const MAX_PAGES = 10;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

async function allGrants(store: GrantStore, userId: string) {
  const grants: { id: string; clientId: string; userId: string; createdAt: number }[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await store.listUserGrants(userId, { cursor, limit: 100 });
    // Re-checked here rather than trusted from the library, the same way
    // /revoke never assumes a listed grant is the caller's own.
    grants.push(...result.items.filter((grant) => grant.userId === userId));
    cursor = result.cursor;
    if (!cursor) break;
  }
  return grants;
}

/**
 * Call from the Worker's defaultHandler; returns null for any path that is
 * not this one, so it composes with the handler's other routes.
 *
 *   GET    /connections        list
 *   DELETE /connections/:id    disconnect one
 */
export async function handleConnections(
  request: Request,
  store: GrantStore,
  secret: string,
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (pathname !== CONNECTIONS_PATH && !pathname.startsWith(`${CONNECTIONS_PATH}/`)) return null;

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const who = token ? await verifyActor(token, secret, { purpose: MANAGE_PURPOSE }) : null;
  if (!who) return json({ error: 'unauthorized' }, 401);

  const id = pathname.slice(CONNECTIONS_PATH.length + 1);

  if (request.method === 'GET' && !id) {
    const grants = await allGrants(store, who.sub);
    const names = new Map<string, string>();
    await Promise.all(
      [...new Set(grants.map((grant) => grant.clientId))].map(async (clientId) => {
        const client = await store.lookupClient(clientId).catch(() => null);
        names.set(clientId, client?.clientName?.trim() || clientId);
      }),
    );
    const connections: Connection[] = grants
      .map((grant) => ({
        id: grant.id,
        client: names.get(grant.clientId) ?? grant.clientId,
        connectedAt: grant.createdAt,
      }))
      .sort((a, b) => b.connectedAt - a.connectedAt);
    return json({ connections });
  }

  if (request.method === 'DELETE' && GRANT_ID.test(id)) {
    // Scoped by `sub` inside the library's key, so somebody else's id is a
    // no-op rather than a disconnect. Answered the same either way: telling a
    // caller whether an id exists would make ids enumerable.
    await store.revokeGrant(id, who.sub);
    return json({ revoked: 1 });
  }

  return json({ error: 'not-found' }, 404);
}
