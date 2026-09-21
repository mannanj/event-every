import { NextResponse } from 'next/server';

import { accountsConfigured, accountsDb, accountsEnv, type AccountsEnv } from '@/server/accounts/env';
import type { D1Like } from '@/server/accounts/d1';
import { mcpEnv } from '@/server/mcp/env';
import { verifyActor, type ActorPayload } from '@/server/mcp/grant';

/**
 * The door every /api/mcp/* route goes through.
 *
 * A call arriving here was made by the MCP Worker on behalf of somebody, and
 * the only evidence of who is a signed actor token in the Authorization header.
 * There is no cookie: the Worker is on another host and cannot have one.
 *
 * The identity is taken from the SIGNATURE and never from the request body. A
 * body field is something a model can invent; a signature is not.
 */

const HEADERS = { 'Cache-Control': 'no-store' } as const;

export interface ActorContext {
  db: D1Like;
  env: AccountsEnv;
  actor: ActorPayload;
}

export type ActorGate = { ok: true; context: ActorContext } | { ok: false; response: NextResponse };

function refuse(error: string, status: number): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error }, { status, headers: HEADERS }) };
}

export async function requireActor(request: Request): Promise<ActorGate> {
  const env = accountsEnv();
  if (!accountsConfigured(env)) return refuse('Accounts are not available.', 503);

  const secret = mcpEnv().MCP_GRANT_SECRET;
  // Unconfigured must refuse, not pass. A missing secret cannot be allowed to
  // become "no signature required".
  if (!secret) return refuse('Not signed in.', 401);

  const header = request.headers.get('authorization') ?? '';
  const token = header.slice(0, 7).toLowerCase() === 'bearer ' ? header.slice(7).trim() : '';
  if (!token) return refuse('Not signed in.', 401);

  const actor = await verifyActor(token, secret);
  if (!actor) return refuse('Not signed in.', 401);

  let db: D1Like;
  try {
    db = accountsDb(env);
  } catch {
    return refuse('Accounts are not available.', 503);
  }

  return { ok: true, context: { db, env, actor } };
}

export function mcpJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: HEADERS });
}
