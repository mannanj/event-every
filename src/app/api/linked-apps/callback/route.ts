import { NextResponse } from 'next/server';
import { failJson, flowCookie, personAndApp } from '@/server/linked-apps/http';
import { FLOW_COOKIE, LinkedAppUnavailable, linkedApps } from '@/server/linked-apps/service';
import { readCookie } from '@/server/accounts/auth';

export const dynamic = 'force-dynamic';

/**
 * Back from the other app's consent page. Either way the browser goes back to
 * where it started, with `?linked=<app>` or `?linked_error=<reason>`; the flow
 * cookie is spent.
 */
export async function GET(request: Request) {
  // Which app is not in the path: it is in the sealed flow cookie this browser
  // carries, which is the only thing that can say what it started.
  const who = await personAndApp(request, null);
  if ('error' in who) return who.error;
  try {
    const url = new URL(request.url);
    const result = await linkedApps.finish(who.ctx, {
      cookie: readCookie(request.headers.get('cookie'), FLOW_COOKIE) ?? undefined,
      query: url.searchParams,
    });
    const back = new URL(`${who.origin}${result.returnTo === '/' ? '' : result.returnTo}`);
    if (result.ok) back.searchParams.set('linked', result.appId);
    else back.searchParams.set('linked_error', result.reason);
    const res = NextResponse.redirect(back, 302);
    res.headers.append('set-cookie', flowCookie(FLOW_COOKIE, '', who.origin, 0));
    res.headers.set('cache-control', 'no-store');
    return res;
  } catch (e) {
    if (e instanceof LinkedAppUnavailable) return failJson(503, 'Sign-in to other apps is not set up here.');
    return failJson(502, 'Could not finish signing in.');
  }
}
