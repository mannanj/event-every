import { readSession } from '@/server/accounts/auth';
import { accountsConfigured, accountsDb, accountsEnv, appOrigin } from '@/server/accounts/env';
import { mcpConfigured, mcpEnv } from '@/server/mcp/env';
import { consentResponse } from '@/vendor/mcp-connector/consent';
import { back, consentToken, sessionId, STATE } from '../shared';

export const dynamic = 'force-dynamic';

/**
 * The authorize bridge.
 *
 * The MCP Worker is the OAuth server as far as a client is concerned, but it
 * cannot see who the person is: `ee_session` is host-only to this origin. So it
 * sends the browser here, the one place the cookie is readable, and this route
 * hands back a short-lived signed grant saying who signed in.
 *
 * IT DOES NOT DO THAT ON A GET, AND THE REASON IS A HOLE THIS ROUTE SHIPPED
 * WITH. It used to sign the grant and redirect immediately, which meant anybody
 * could start a connect flow in their own client, take the opaque `state`, and
 * send a signed-in person this URL. One click and that person's calendar was
 * readable and writable by a stranger's assistant. No password, no warning, and
 * nothing in the state, the grant or PKCE to prevent it - they are all about the
 * client and the account, and none of them is about intent.
 *
 * So a GET now only ASKS. The grant is signed on a POST carrying a token tied to
 * the session, which a cross-site link cannot produce. The Worker separately
 * binds the browser that began the flow (see mcp/src/authHandler.ts); this is
 * the half that makes it a decision rather than a redirect.
 *
 * THE RETURN URL IS NOT CALLER-SUPPLIED. It is built from MCP_ORIGIN, server
 * configuration, never a query parameter.
 */

/** The consent page. Shared across every app: see ~/Documents/mcp-connector/src/consent.ts. */
function askPage(origin: string, state: string, email: string, token: string): Response {
  // No body on the POST: the edge admission policy pins one media type per
  // route and every other route here is JSON. A POST with an empty body skips
  // that check entirely, so the two values ride in the query. They are still
  // unguessable - the token is an HMAC over this session and this state - so a
  // cross-site form cannot construct this URL.
  const action = new URL('/api/mcp/authorize/confirm', origin);
  action.searchParams.set('state', state);
  action.searchParams.set('consent', token);
  return consentResponse({
    appName: 'Event Every',
    siteUrl: origin,
    account: email,
    abilities: [
      'It will be able to read every event on this account.',
      'It will be able to add and remove events.',
      'It can spend from the daily scanning budget.',
    ],
    action: action.pathname + action.search,
  });
}

export async function GET(request: Request) {
  const env = accountsEnv();
  const origin = appOrigin(request, env);
  const state = new URL(request.url).searchParams.get('state') ?? '';

  if (!state || !STATE.test(state)) return back(origin, '/');

  const mcp = mcpEnv();
  if (!mcpConfigured(mcp) || !accountsConfigured(env)) {
    return back(origin, '/?connect=unavailable');
  }

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

  return askPage(origin, state, account.email, await consentToken(id, state, mcp.MCP_GRANT_SECRET!));
}
