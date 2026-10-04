import { NextResponse } from 'next/server';
import { callbackUrl, failJson, flowCookie, personAndApp } from '@/server/linked-apps/http';
import { FLOW_COOKIE, LinkedAppUnavailable, linkedApps } from '@/server/linked-apps/service';
import { safeReturnTo } from '@/vendor/mcp-connector/linked-app';

export const dynamic = 'force-dynamic';

/**
 * Start signing in to a sister app: a browser navigation, not a fetch (`?app=calendar`).
 * Static paths, because the edge admission policy keys on the exact pathname. Answers
 * with a 302 to the other app's /authorize and a sealed flow cookie.
 * `?returnTo=/linked-apps/done` (an app path) is where it lands after.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const who = await personAndApp(request, url.searchParams.get('app') ?? '');
  if ('error' in who) return who.error;
  try {
    const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
    const { location, cookie } = await linkedApps.start(who.ctx, who.appId!, {
      redirectUri: callbackUrl(who.origin),
      returnTo,
    });
    const res = NextResponse.redirect(location, 302);
    res.headers.append('set-cookie', flowCookie(FLOW_COOKIE, cookie, who.origin));
    res.headers.set('cache-control', 'no-store');
    return res;
  } catch (e) {
    if (e instanceof LinkedAppUnavailable) return failJson(503, 'Sign-in to other apps is not set up here.');
    return failJson(502, 'Could not reach that app.');
  }
}
