// GENERATED FROM @mannan/mcp-connector/consent.ts - DO NOT EDIT HERE.
// Edit ~/Documents/mcp-connector and re-run: node bin/sync.mjs <this dir>
/**
 * The "Connect an assistant?" page every app's MCP authorize bridge shows.
 *
 * WHY A PAGE AND NOT A REDIRECT. A bridge that signs its grant on a GET lets
 * anyone start a connect flow in their own client, send a signed-in person the
 * bridge URL, and receive a token for that person's account with one click.
 * Nothing in the state, the grant or PKCE prevents it - they are about the
 * client and the account, never about intent. So the GET only asks, and the
 * grant is signed on a POST carrying `consentToken()`, an HMAC over the session
 * and the state that a cross-site link cannot produce.
 *
 * DELIBERATELY FRAMEWORK-FREE. Plain HTML from a function, Web Crypto only, no
 * React and no 'use client': the page must render from a route handler that
 * depends on nothing, and the same file runs in Next, a bare Worker and Node.
 *
 *   GET  /api/mcp/authorize?state=…          -> consentResponse({...})
 *   POST <action> (state + consent token)    -> verify, sign grant, grantRedirect()
 */

export interface ConsentPage {
  /** Shown above the box, e.g. "Event Every". */
  appName: string;
  /** The site's public origin, e.g. "https://eventevery.com". No trailing slash needed. */
  siteUrl: string;
  /** Who is being connected - normally the signed-in email address. */
  account: string;
  /** What an assistant will be able to do, one plain sentence each. */
  abilities: string[];
  /**
   * Where the Continue button POSTs. Must carry whatever the confirm route
   * needs (state, consent token) - in the query, or in `fields`.
   */
  action: string;
  /** Hidden form fields posted with the form. */
  fields?: Record<string, string>;
  /** Where Cancel goes. Default "/". */
  cancelHref?: string;
  /** Path of the page that lists the tools, joined onto siteUrl. Default "/mcp". */
  capabilitiesPath?: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** The page itself. Every interpolated value is escaped. */
export function consentHtml(page: ConsentPage): string {
  const site = page.siteUrl.replace(/\/+$/, '');
  const capabilities = site + (page.capabilitiesPath ?? '/mcp');
  const e = escapeHtml;
  const fields = Object.entries(page.fields ?? {})
    .map(([name, value]) => `<input type="hidden" name="${e(name)}" value="${e(value)}">`)
    .join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Connect an assistant - ${e(page.appName)}</title>
<style>
 body{font:16px/1.5 system-ui,-apple-system,sans-serif;margin:0;min-height:100vh;
      display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;
      background:#fff;color:#000}
 .consent{max-width:26rem;width:100%}
 .app{display:inline-block;margin:0 0 16px;font-size:1rem;font-weight:700;color:#000;text-decoration:none}
 .app:hover{text-decoration:underline}
 .card{border:2px solid #000;padding:24px;box-shadow:6px 6px 0 #000}
 h1{font-size:1.35rem;margin:0 0 12px}
 p{margin:0 0 12px}
 ul{margin:0 0 16px;padding-left:20px}
 li{margin:4px 0}
 .who{font-weight:600;overflow-wrap:anywhere}
 form{margin:0}
 button{width:100%;padding:12px;font:inherit;font-weight:600;border:2px solid #000;
        background:#000;color:#fff;cursor:pointer}
 button:hover{background:#fff;color:#000}
 .cancel{display:block;text-align:center;margin-top:12px;color:#555;font-size:.875rem}
 .small{margin:16px 0 0;font-size:.8125rem;color:#555}
 .small a{color:inherit;overflow-wrap:anywhere}
</style></head><body>
<main class="consent">
  <a class="app" href="${e(site)}/">${e(page.appName)}</a>
  <div class="card">
    <h1>Connect an assistant?</h1>
    <p>An AI assistant is asking to connect to <span class="who">${e(page.account)}</span>.</p>
    <p>If this wasn't you, close this page.</p>
    <ul>
${page.abilities.map((ability) => `      <li>${e(ability)}</li>`).join('\n')}
    </ul>
    <form method="POST" action="${e(page.action)}">${fields}
      <button type="submit">Continue</button>
    </form>
    <a class="cancel" href="${e(page.cancelHref ?? '/')}">Cancel</a>
    <p class="small">See its capabilities at <a href="${e(capabilities)}">${e(capabilities)}</a></p>
  </div>
</main></body></html>`;
}

/**
 * The page as a response, with headers that keep it out of caches and referrers.
 *
 * Its CSP sets no form-action, and must stay that way: browsers check the
 * Continue POST's redirect against form-action too, and Continue 302s to the
 * MCP Worker's /callback on another origin. An app whose own CSP replaces
 * these headers with `form-action 'self'` gets a Continue that silently does
 * nothing, so it must add the callback's origin to form-action on the
 * authorize route - `consentFormAction()` builds that directive.
 */
export function consentResponse(page: ConsentPage): Response {
  return new Response(consentHtml(page), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, private',
      // Not no-referrer: under it browsers send `Origin: null` on the page's own
      // Continue POST, and the origin check rejects it. same-origin still sends
      // nothing to other sites.
      'Referrer-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      // Nobody may frame the page and overlay the button (clickjacking).
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
    },
  });
}

/**
 * The confirm POST's answer: send the browser to the MCP Worker's /callback.
 *
 * Always 302, never 307 or 308. Those replay the POST, and a POST to another
 * site carries no SameSite=Lax cookie - the Worker's flow cookie stays home and
 * /callback refuses. `NextResponse.redirect(url)` is 307 by default, which is
 * how this was once got wrong. The grant rides in the URL for exactly one hop,
 * so the response keeps it out of caches and out of the next page's Referer.
 */
export function grantRedirect(callback: string | URL, grant: string, state: string): Response {
  const to = new URL(callback);
  to.searchParams.set('state', state);
  to.searchParams.set('grant', grant);
  return new Response(null, {
    status: 302,
    headers: {
      Location: to.toString(),
      'Cache-Control': 'no-store, private',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/**
 * The `form-action` directive an app-wide CSP needs on the authorize route.
 *
 * Only for an app whose own CSP replaces `consentResponse()`'s headers. Throws
 * without a callback URL rather than falling back to `'self'`, which would
 * block Continue silently - the failure should be loud and at deploy time.
 */
export function consentFormAction(callbackUrl: string | undefined): string {
  if (!callbackUrl) throw new Error('consentFormAction: the MCP callback URL is not configured');
  return `form-action 'self' ${new URL(callbackUrl).origin}`;
}

/**
 * A token only this session can produce, for this state.
 *
 * HMAC over the session id and the state. It reaches the browser only inside
 * the consent form, never in a link, so a cross-site GET cannot carry it and a
 * cross-site POST cannot guess it. Bound to the session as well as the state,
 * so a token minted for one person is useless to another.
 */
export async function consentToken(sessionId: string, state: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`consent.v1.${sessionId}.${state}`));
  let binary = '';
  for (const byte of new Uint8Array(mac)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Compare a presented token without leaking how much of it matched. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}
