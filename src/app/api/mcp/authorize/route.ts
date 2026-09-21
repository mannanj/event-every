import { readSession } from '@/server/accounts/auth';
import { accountsConfigured, accountsDb, accountsEnv, appOrigin } from '@/server/accounts/env';
import { mcpConfigured, mcpEnv } from '@/server/mcp/env';
import { signMcpGrant } from '@/server/mcp/grant';

export const dynamic = 'force-dynamic';

/**
 * The authorize bridge.
 *
 * The MCP Worker is the OAuth server as far as a client is concerned, but it
 * cannot see who the person is: `ee_session` is host-only to this origin. So it
 * sends the browser here, the one place the cookie is readable, and this route
 * hands back a short-lived signed grant saying who signed in.
 *
 *   client --/authorize--> [MCP Worker] --redirect--> here
 *                                                      | reads session cookie
 *   client <--redirect+code-- [MCP Worker] <--grant----+
 *
 * Someone arriving signed out is sent to /signin carrying the same state, which
 * the login token then remembers, so finishing the email sign-in lands back
 * here and the flow continues where it stopped.
 *
 * THE RETURN URL IS NOT CALLER-SUPPLIED. It is built from MCP_ORIGIN, server
 * configuration, and never from a query parameter. A bridge that redirects
 * wherever it is told is how one of these leaks a credential.
 */

/** Matches the opaque state the Worker mints. Anything else never came from it. */
const STATE = /^[A-Za-z0-9_-]{1,128}$/;

function back(origin: string, path: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: new URL(path, origin).toString(), 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: Request) {
  const env = accountsEnv();
  const origin = appOrigin(request, env);
  const state = new URL(request.url).searchParams.get('state') ?? '';

  // No state means nobody is mid-flow, so there is nothing to authorize. A
  // malformed one means whatever sent it was not our Worker.
  if (!state || !STATE.test(state)) return back(origin, '/');

  const mcp = mcpEnv();
  if (!mcpConfigured(mcp) || !accountsConfigured(env)) {
    return back(origin, '/?connect=unavailable');
  }

  let account;
  try {
    account = await readSession(accountsDb(env), request.headers.get('cookie'));
  } catch {
    return back(origin, '/?connect=unavailable');
  }

  if (!account) {
    return back(origin, `/signin?state=${encodeURIComponent(state)}`);
  }

  const grant = await signMcpGrant(
    { sub: account.id, email: account.email, state },
    mcp.MCP_GRANT_SECRET!,
  );

  const callback = new URL('/callback', mcp.MCP_ORIGIN!);
  callback.searchParams.set('state', state);
  callback.searchParams.set('grant', grant);
  return new Response(null, {
    status: 302,
    headers: {
      Location: callback.toString(),
      'Cache-Control': 'no-store',
      // The grant is in the URL for exactly one hop. Do not let it ride along
      // as a Referer to wherever the client goes next.
      'Referrer-Policy': 'no-referrer',
    },
  });
}
