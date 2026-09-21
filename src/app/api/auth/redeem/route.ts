import { consumeLoginToken, createSession, sessionCookie } from '@/server/accounts/auth';
import { accountsDb, accountsEnv, appOrigin } from '@/server/accounts/env';
import type { D1Like } from '@/server/accounts/d1';

export const dynamic = 'force-dynamic';

/**
 * Spend a sign-in link: set the session, then put the person back on the app.
 *
 * A GET because what arrives here is a person clicking a link in their mail
 * client. The token is single-use and burned inside `consumeLoginToken`, so a
 * mail scanner that pre-fetches the URL spends the link — the cost of magic
 * links generally, and the reason the window is twenty minutes.
 */
export async function GET(request: Request) {
  const env = accountsEnv();
  const origin = appOrigin(request, env);

  let db: D1Like;
  try {
    db = accountsDb(env);
  } catch {
    return Response.redirect(new URL('/?signin=unavailable', origin).toString(), 302);
  }

  const token = new URL(request.url).searchParams.get('token') ?? '';
  const account = token ? await consumeLoginToken(db, token) : null;
  if (!account) {
    return Response.redirect(new URL('/?signin=expired', origin).toString(), 302);
  }

  const session = await createSession(db, account.id);

  // Somebody who started at an assistant's "connect" button goes back to the
  // bridge, now carrying a session, rather than to the home page wondering what
  // happened. The state came from our own table, and its shape was checked
  // before it was stored, so this is not a caller-supplied redirect.
  const destination = account.mcpState
    ? `/api/mcp/authorize?state=${encodeURIComponent(account.mcpState)}`
    : '/?signin=ok';

  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(destination, origin).toString(),
      // `secure` follows the scheme this request actually arrived on, so a
      // local http run still sets a usable cookie while production never does.
      'Set-Cookie': sessionCookie(session, new URL(request.url).protocol === 'https:'),
      'Cache-Control': 'no-store',
    },
  });
}
