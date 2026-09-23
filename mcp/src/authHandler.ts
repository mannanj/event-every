import type { AuthRequest, OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import { REVOKE_PURPOSE, verifyActor, verifyMcpGrant } from '../../src/server/mcp/grant';
import { handleConnections } from './connections';

/**
 * Everything that is not the MCP API itself: the OAuth authorize and callback.
 *
 * This Worker is the OAuth server as far as a client is concerned, but it
 * cannot see who the person is - `ee_session` is host-only to eventevery.com.
 * So /authorize bounces the browser to the app, the one place that cookie is
 * readable, and /callback verifies the signed grant handed back.
 *
 *   client --/authorize--> [this Worker] --redirect--> app /api/mcp/authorize
 *                                                             | session cookie
 *   client <--redirect+code-- [this Worker] <--grant----------+
 *
 * The grant code is IMPORTED from the app rather than copied. One definition of
 * what a valid grant is, verified by the same function that signs it; a second
 * copy is how the two halves of a bridge end up disagreeing about expiry.
 */

export interface Env {
  OAUTH_KV: KVNamespace;
  APP_ORIGIN: string;
  MCP_GRANT_SECRET: string;
  OAUTH_PROVIDER: OAuthHelpers;
}

/** Identity carried on the issued token and surfaced to tools. */
export interface McpProps {
  userId: string;
  email: string;
  [key: string]: unknown;
}

const STATE_TTL_SECONDS = 600;
const stateKey = (state: string) => `mcp:authreq:${state}`;

/**
 * Binds the browser that STARTED an authorization to the one that finishes it.
 *
 * WITHOUT THIS, ANY SIGNED-IN PERSON CAN BE MADE TO CONNECT SOMEBODY ELSE'S
 * ASSISTANT TO THEIR ACCOUNT WITH ONE CLICK. An attacker begins a flow in their
 * own client, takes the opaque `state`, and sends a victim the app's bridge URL
 * carrying it. The victim's session signs a grant for the victim's account, the
 * callback completes the authorization the ATTACKER started, and the attacker's
 * client receives a token for the victim's calendar. Nothing in the state, the
 * grant or the PKCE exchange prevents that: every one of them is about the
 * client and the account, and none is about the browser.
 *
 * So /authorize sets this, and /callback refuses without it. The attacker's
 * browser holds the cookie; the victim's does not.
 *
 * Host-only, HttpOnly, SameSite=Lax - Lax rather than Strict because the
 * callback IS a cross-site navigation back from the app, and Strict would
 * withhold the cookie on exactly the request that needs it.
 */
const FLOW_COOKIE = 'ee_mcp_flow';
const FLOW_TTL_SECONDS = STATE_TTL_SECONDS;

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** Compared in constant time: it is a secret that gates completing a flow. */
function sameFlow(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/**
 * 32 bytes, base64url. The app's bridge and its sign-in page both validate the
 * shape `[A-Za-z0-9_-]{1,128}`, so anything minted here has to satisfy it.
 */
function newState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fail(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export const authHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/authorize') return handleAuthorize(request, env);
    if (url.pathname === '/callback') return handleCallback(request, env);
    if (url.pathname === '/revoke' && request.method === 'POST') {
      return handleRevoke(request, env);
    }
    if (url.pathname === '/connections' || url.pathname.startsWith('/connections/')) {
      const response = await handleConnections(request, env.OAUTH_PROVIDER, env.MCP_GRANT_SECRET);
      if (response) return response;
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return Response.json({
        service: 'event-every-mcp',
        status: 'ok',
        mcpEndpoint: '/mcp',
        guide: `${env.APP_ORIGIN}/mcp`,
      });
    }

    return fail(404, 'Not found');
  },
};

async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  let authRequest: AuthRequest;
  try {
    authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch {
    return fail(400, 'Invalid authorization request.');
  }

  // Park the parsed request server-side and hand the app only an opaque state.
  // Nothing about the client round-trips through the browser, so the redirect
  // target and the scope cannot be tampered with mid-flow.
  const state = newState();
  await env.OAUTH_KV.put(stateKey(state), JSON.stringify(authRequest), {
    expirationTtl: STATE_TTL_SECONDS,
  });

  // A secret this browser holds, checked at /callback. See FLOW_COOKIE.
  const flow = newState();
  await env.OAUTH_KV.put(`mcp:flow:${state}`, flow, { expirationTtl: FLOW_TTL_SECONDS });

  const bridge = new URL('/api/mcp/authorize', env.APP_ORIGIN);
  bridge.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: bridge.toString(),
      'Cache-Control': 'no-store',
      'Set-Cookie':
        `${FLOW_COOKIE}=${flow}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${FLOW_TTL_SECONDS}`,
    },
  });
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const grant = url.searchParams.get('grant') ?? '';
  if (!state || !grant) return fail(400, 'Missing authorization response.');

  const stored = await env.OAUTH_KV.get(stateKey(state));
  if (!stored) return fail(400, 'That took too long. Start connecting again.');

  // THE BROWSER THAT STARTED THIS MUST BE THE ONE FINISHING IT. Checked before
  // the grant, because a request from a browser that never began a flow should
  // not reach the verifier at all - and because failing here costs an attacker
  // the state, which is burned below whatever happens.
  const expectedFlow = await env.OAUTH_KV.get(`mcp:flow:${state}`);
  const presentedFlow = readCookie(request.headers.get('cookie'), FLOW_COOKIE);
  const boundToThisBrowser =
    expectedFlow !== null && presentedFlow !== null && sameFlow(expectedFlow, presentedFlow);

  await env.OAUTH_KV.delete(`mcp:flow:${state}`);

  if (!boundToThisBrowser) {
    await env.OAUTH_KV.delete(stateKey(state));
    // Deliberately the same shape of refusal as a bad grant: which check failed
    // is information for somebody probing.
    return fail(403, 'That sign-in could not be verified.');
  }

  // Burn the state before touching the grant, so a forged grant cannot be
  // brute-forced against a live one. The burn is best-effort - KV deletes are
  // eventually consistent - which is acceptable because it is not what makes
  // this safe: a replayed callback issues a second code bound to the SAME PKCE
  // challenge, and only the holder of the original verifier can spend it.
  await env.OAUTH_KV.delete(stateKey(state));

  const verified = await verifyMcpGrant(grant, env.MCP_GRANT_SECRET, { expectedState: state });
  if (!verified.ok) {
    // Uniform on purpose. "Expired" and "bad signature" are different pieces of
    // information to somebody probing, and this must not be the thing that
    // tells them which one they hit.
    return fail(403, 'That sign-in could not be verified.');
  }

  const authRequest = JSON.parse(stored) as AuthRequest;
  const props: McpProps = { userId: verified.payload.sub, email: verified.payload.email };

  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: authRequest,
    userId: verified.payload.sub,
    metadata: { email: verified.payload.email },
    scope: authRequest.scope,
    props,
  });

  return Response.redirect(redirectTo, 302);
}

/**
 * End every connection this account has.
 *
 * WHY IT LIVES HERE. The tokens are in this Worker's KV and the session is on
 * the app's origin, so neither side can do this alone. The app asserts who is
 * asking, signed and short-lived, and this acts on it - the same bridge as
 * starting a connection, pointed the other way.
 *
 * ALL of them, not one. Somebody disconnecting has decided they do not want an
 * assistant on their calendar, and asking which of several they meant is the
 * wrong question at the wrong moment. The /mcp page promised this could be done
 * and nothing implemented it, which is worse than not offering it.
 */
async function handleRevoke(request: Request, env: Env): Promise<Response> {
  const token = (await request.text()).trim();
  if (!token) return fail(400, 'Nothing to revoke.');

  const who = await verifyActor(token, env.MCP_GRANT_SECRET, { purpose: REVOKE_PURPOSE });
  if (!who) return fail(403, 'That request could not be verified.');

  let revoked = 0;
  let cursor: string | undefined;
  do {
    const page = await env.OAUTH_PROVIDER.listUserGrants(who.sub, cursor ? { cursor } : {});
    for (const grant of page.items) {
      await env.OAUTH_PROVIDER.revokeGrant(grant.id, who.sub);
      revoked += 1;
    }
    cursor = page.cursor;
  } while (cursor);

  return Response.json(
    { revoked },
    { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
  );
}
