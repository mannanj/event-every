import { readSession } from '@/server/accounts/auth';
import { accountsConfigured, accountsDb, accountsEnv } from '@/server/accounts/env';
import { mcpConfigured, mcpEnv } from '@/server/mcp/env';
import { REVOKE_PURPOSE, REVOKE_TTL_SECONDS, signActor } from '@/server/mcp/grant';

export const dynamic = 'force-dynamic';

/**
 * End every assistant connection on this account.
 *
 * THE PAGE PROMISED THIS BEFORE THE CODE DID. `/mcp` has said "you can
 * disconnect whenever you like" since the guide was written, and nothing
 * implemented it: tokens sat in the Worker's KV until they expired. A promise
 * in an interface is a claim about behaviour, and that one was false.
 *
 * It takes two sides because the two halves own different things. The session
 * lives here; the tokens live in the Worker's KV. So this asserts who is asking
 * - signed, purpose-separated, sixty seconds - and the Worker acts on it. The
 * same bridge that starts a connection, pointed the other way.
 *
 * A POST, and only from a signed-in session. Disconnecting is not something a
 * link should be able to do to somebody, which is the lesson from the hole the
 * authorize bridge shipped with.
 */
export async function POST(request: Request) {
  const env = accountsEnv();
  const headers = { 'Cache-Control': 'no-store' } as const;

  if (!accountsConfigured(env)) {
    return Response.json({ error: 'Accounts are not available.' }, { status: 503, headers });
  }

  const mcp = mcpEnv();
  if (!mcpConfigured(mcp)) {
    return Response.json({ error: 'Connecting is not available.' }, { status: 503, headers });
  }

  let account;
  try {
    account = await readSession(accountsDb(env), request.headers.get('cookie'));
  } catch {
    return Response.json({ error: 'Accounts are not available.' }, { status: 503, headers });
  }
  if (!account) {
    return Response.json({ error: 'Not signed in.' }, { status: 401, headers });
  }

  const assertion = await signActor(
    { sub: account.id, email: account.email },
    mcp.MCP_GRANT_SECRET!,
    { purpose: REVOKE_PURPOSE, ttlSeconds: REVOKE_TTL_SECONDS },
  );

  let response: Response;
  try {
    response = await fetch(new URL('/revoke', mcp.MCP_ORIGIN!).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: assertion,
    });
  } catch {
    return Response.json({ error: 'Could not reach the connector.' }, { status: 502, headers });
  }

  if (!response.ok) {
    return Response.json({ error: 'Could not disconnect.' }, { status: 502, headers });
  }

  const body = (await response.json().catch(() => null)) as { revoked?: number } | null;
  return Response.json({ revoked: body?.revoked ?? 0 }, { headers });
}
