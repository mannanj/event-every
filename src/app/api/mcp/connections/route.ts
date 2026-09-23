import { readSession } from '@/server/accounts/auth';
import { accountsConfigured, accountsDb, accountsEnv } from '@/server/accounts/env';
import { mcpConfigured, mcpEnv } from '@/server/mcp/env';
import { MANAGE_PURPOSE, MANAGE_TTL_SECONDS, signActor } from '@/server/mcp/grant';

export const dynamic = 'force-dynamic';

/**
 * Seeing and disconnecting one assistant at a time.
 *
 * `/api/mcp/disconnect` already ends every connection on the account; this is
 * the finer-grained sibling the `/mcp` guide never had - listing what is
 * connected, and cutting off one of them without touching the rest. Same
 * bridge, same reason it takes two sides: the session lives here, the tokens
 * live in the Worker's KV (mcp/src/connections.ts, handleConnections).
 *
 * GET lists. DELETE disconnects the id named in `?id=`, not a JSON body - this
 * route carries no body at all, which is what lets it skip the media-type
 * check that pins every other route here to application/json (see the note in
 * ../authorize/route.ts about bodies) and keep GET and DELETE on one path.
 */

const GRANT_ID = /^[A-Za-z0-9_-]{1,128}$/;

type Guard =
  | { ok: true; identity: { sub: string; email: string } }
  | { ok: false; response: Response };

async function guard(request: Request): Promise<Guard> {
  const headers = { 'Cache-Control': 'no-store' } as const;
  const env = accountsEnv();

  if (!accountsConfigured(env)) {
    return { ok: false, response: Response.json({ error: 'Accounts are not available.' }, { status: 503, headers }) };
  }

  const mcp = mcpEnv();
  if (!mcpConfigured(mcp)) {
    return { ok: false, response: Response.json({ error: 'Connecting is not available.' }, { status: 503, headers }) };
  }

  let account;
  try {
    account = await readSession(accountsDb(env), request.headers.get('cookie'));
  } catch {
    return { ok: false, response: Response.json({ error: 'Accounts are not available.' }, { status: 503, headers }) };
  }
  if (!account) {
    return { ok: false, response: Response.json({ error: 'Not signed in.' }, { status: 401, headers }) };
  }

  return { ok: true, identity: { sub: account.id, email: account.email } };
}

async function assertion(identity: { sub: string; email: string }): Promise<string> {
  const mcp = mcpEnv();
  return signActor(identity, mcp.MCP_GRANT_SECRET!, { purpose: MANAGE_PURPOSE, ttlSeconds: MANAGE_TTL_SECONDS });
}

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' } as const;
  const checked = await guard(request);
  if (!checked.ok) return checked.response;

  const mcp = mcpEnv();
  let response: Response;
  try {
    response = await fetch(new URL('/connections', mcp.MCP_ORIGIN!).toString(), {
      headers: { authorization: `Bearer ${await assertion(checked.identity)}` },
    });
  } catch {
    return Response.json({ error: 'Could not reach the connector.' }, { status: 502, headers });
  }
  if (!response.ok) {
    return Response.json({ error: 'Could not load connections.' }, { status: 502, headers });
  }

  const body = (await response.json().catch(() => null)) as { connections?: unknown } | null;
  return Response.json({ connections: body?.connections ?? [] }, { headers });
}

export async function DELETE(request: Request) {
  const headers = { 'Cache-Control': 'no-store' } as const;
  const checked = await guard(request);
  if (!checked.ok) return checked.response;

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!GRANT_ID.test(id)) {
    return Response.json({ error: 'Invalid id.' }, { status: 400, headers });
  }

  const mcp = mcpEnv();
  let response: Response;
  try {
    response = await fetch(new URL(`/connections/${id}`, mcp.MCP_ORIGIN!).toString(), {
      method: 'DELETE',
      headers: { authorization: `Bearer ${await assertion(checked.identity)}` },
    });
  } catch {
    return Response.json({ error: 'Could not reach the connector.' }, { status: 502, headers });
  }
  if (!response.ok) {
    return Response.json({ error: 'Could not disconnect.' }, { status: 502, headers });
  }

  return Response.json({ ok: true }, { headers });
}
