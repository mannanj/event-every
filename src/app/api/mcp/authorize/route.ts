import { readSession } from '@/server/accounts/auth';
import { accountsConfigured, accountsDb, accountsEnv, appOrigin } from '@/server/accounts/env';
import { mcpConfigured, mcpEnv } from '@/server/mcp/env';
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

/** The consent page. Plain HTML, because it must not depend on anything. */
function askPage(state: string, email: string, token: string): Response {
  const safeState = state.replace(/[^A-Za-z0-9_-]/g, '');
  const safeEmail = email.replace(/[<>&"]/g, '');
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Connect an assistant - Event Every</title>
<style>
 body{font:16px/1.5 system-ui,-apple-system,sans-serif;margin:0;min-height:100vh;
      display:flex;align-items:center;justify-content:center;padding:24px;background:#fff;color:#000}
 .card{max-width:26rem;width:100%;border:2px solid #000;padding:24px;box-shadow:6px 6px 0 #000}
 h1{font-size:1.35rem;margin:0 0 12px}
 p{margin:0 0 12px}
 ul{margin:0 0 16px;padding-left:20px}
 li{margin:4px 0}
 .who{font-weight:600}
 button{width:100%;padding:12px;font:inherit;font-weight:600;border:2px solid #000;
        background:#000;color:#fff;cursor:pointer}
 button:hover{background:#fff;color:#000}
 a{display:block;text-align:center;margin-top:12px;color:#555;font-size:.875rem}
 .small{font-size:.8125rem;color:#555}
</style></head><body>
<div class="card">
  <h1>Connect an assistant?</h1>
  <p>An AI assistant is asking to connect to <span class="who">${safeEmail}</span>.</p>
  <p>If you did not just start this yourself, close this page.</p>
  <ul>
    <li>It will be able to read every event on this account.</li>
    <li>It will be able to add and remove events.</li>
    <li>It can spend from the daily scanning budget.</li>
  </ul>
  <!-- No body: the edge admission policy pins one media type per route and
       every other route here is JSON. A POST with an empty body skips that
       check entirely, so the two values ride in the query. They are still
       unguessable - the token is an HMAC over this session and this state -
       so a cross-site form cannot construct this URL. -->
  <form method="POST" action="/api/mcp/authorize/confirm?state=${safeState}&consent=${encodeURIComponent(token)}">
    <button type="submit">Connect it</button>
  </form>
  <a href="/">Cancel</a>
  <p class="small" style="margin-top:16px">You can see what each tool does at <a href="/mcp" style="display:inline">/mcp</a>.</p>
</div></body></html>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
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

  return askPage(state, account.email, await consentToken(id, state, mcp.MCP_GRANT_SECRET!));
}
