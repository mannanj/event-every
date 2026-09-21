import type { AuthRequest, OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import { verifyMcpGrant } from '../../src/server/mcp/grant';

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

  const bridge = new URL('/api/mcp/authorize', env.APP_ORIGIN);
  bridge.searchParams.set('state', state);
  return Response.redirect(bridge.toString(), 302);
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const grant = url.searchParams.get('grant') ?? '';
  if (!state || !grant) return fail(400, 'Missing authorization response.');

  const stored = await env.OAUTH_KV.get(stateKey(state));
  if (!stored) return fail(400, 'That took too long. Start connecting again.');

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
