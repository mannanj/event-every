import { readSession } from '@/server/accounts/auth';
import { accountsConfigured, accountsDb, accountsEnv, appOrigin } from '@/server/accounts/env';
import { mcpConfigured, mcpEnv } from '@/server/mcp/env';
import { signMcpGrant } from '@/server/mcp/grant';
import { back, consentToken, constantTimeEqual, grantRedirect, sessionId, STATE } from '../../shared';

export const dynamic = 'force-dynamic';

/**
 * The half that actually signs.
 *
 * Separate from the consent page because the route manifest admits exactly one
 * method per path - and the split is honest anyway: asking and doing are
 * different operations, and only one of them is safe to reach with a link.
 */
/** Signing the grant happens here, and only with a token this session produced. */
export async function POST(request: Request) {
  const env = accountsEnv();
  const origin = appOrigin(request, env);

  const mcp = mcpEnv();
  if (!mcpConfigured(mcp) || !accountsConfigured(env)) {
    return back(origin, '/?connect=unavailable');
  }

  // From the query, not a body: see the note on the consent form. The values
  // are unguessable rather than secret-in-transit, which is what CSRF needs.
  const params = new URL(request.url).searchParams;
  const state = params.get('state') ?? '';
  const presented = params.get('consent') ?? '';
  if (!state || !STATE.test(state) || !presented) return back(origin, '/');

  const cookie = request.headers.get('cookie');
  let account;
  try {
    account = await readSession(accountsDb(env), cookie);
  } catch {
    return back(origin, '/?connect=unavailable');
  }
  if (!account) return back(origin, `/signin?state=${encodeURIComponent(state)}`);

  const id = sessionId(cookie);
  if (!id) return back(origin, `/signin?state=${encodeURIComponent(state)}`);

  const expected = await consentToken(id, state, mcp.MCP_GRANT_SECRET!);
  if (!constantTimeEqual(presented, expected)) return back(origin, '/');

  const grant = await signMcpGrant(
    { sub: account.id, email: account.email, state },
    mcp.MCP_GRANT_SECRET!,
  );

  return grantRedirect(new URL('/callback', mcp.MCP_ORIGIN!), grant, state);
}
