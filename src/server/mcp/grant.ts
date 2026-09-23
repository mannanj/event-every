/**
 * The two signed assertions that join this app to the MCP Worker.
 *
 * WHY THEY EXIST. `ee_session` is set with `Path=/` and no `Domain`
 * (server/accounts/auth.ts), so it is host-only to eventevery.com and a Worker
 * on any other hostname cannot read it. Widening it to `.eventevery.com` would
 * delete both halves of this file and hand every session to every subdomain
 * this account will ever deploy, to save one redirect. So the MCP Worker never
 * sees the session at all.
 *
 * Instead:
 *
 *   GRANT - minted by /api/mcp/authorize, the one place the cookie is readable,
 *   and carried back to the Worker's /callback. It says who just signed in.
 *
 *   ACTOR - minted by the Worker on every call back into this app's API. It
 *   says which account this one request is for. The Worker holds no database,
 *   so every read and write it makes goes through the app's own routes and
 *   there is one implementation of each operation rather than two that drift.
 *
 * Both are HMAC-SHA256 over the exact encoded payload, verified in constant
 * time, and short-lived: a grant lives for one redirect hop and an actor token
 * for one request. Neither is a session and neither confers anything alone.
 */

export const MCP_GRANT_TTL_SECONDS = 120;
export const ACTOR_TTL_SECONDS = 60;

/**
 * The two are DOMAIN SEPARATED, and that is not decoration.
 *
 * A grant travels as a query parameter: it lands in browser history, in a
 * `Referer`, and in the MCP Worker's request log. An actor token is a bearer
 * credential for this app's API. They are signed with the same secret and their
 * payloads differ only by a `state` field nothing was checking, so without
 * separation a grant scraped out of a URL could be presented as an actor token
 * and read the account's events for the remaining life of the grant.
 *
 * So the purpose is mixed into the signed message and carried in the payload.
 * A signature made for one can never verify as the other, whatever the payload
 * happens to contain.
 */
const GRANT_PURPOSE = 'ee.mcp.grant.v1';
const ACTOR_PURPOSE = 'ee.mcp.actor.v1';

/**
 * Who a server-side scan is for. The MCP routes and the photo handoff reach
 * /api/scan over HTTP from the Worker itself, so the request carries no session
 * cookie and its edge identity is the Worker's own address - every assistant in
 * the world would share one per-person cap, and an admin would be charged to
 * the shared budget. This token names the account instead.
 *
 * Its own purpose, so an MCP actor token cannot be replayed here and this one
 * cannot be replayed as an actor.
 */
export const SCAN_ON_BEHALF_PURPOSE = 'ee.scan.on-behalf.v1';
export const SCAN_ON_BEHALF_HEADER = 'x-event-every-on-behalf';

/**
 * Disconnecting.
 *
 * The app owns the session; the Worker owns the tokens. So ending a connection
 * needs the same bridge as starting one, pointed the other way: the app says
 * who is asking, the Worker acts on it.
 *
 * Purpose-separated like the others, so a revoke assertion cannot be presented
 * as an actor token, a grant, or an upload link. Sixty seconds, because it is
 * one form submission and not a session.
 */
export const REVOKE_PURPOSE = 'ee.mcp.revoke.v1';
export const REVOKE_TTL_SECONDS = 60;

/**
 * Seeing and disconnecting one connection at a time.
 *
 * The same bridge as REVOKE, pointed at a narrower job: REVOKE ends every
 * connection on the account, while a MANAGE token lets the Worker's
 * /connections route list them and end just one. Its own purpose, for the
 * same reason every purpose here is its own: a token minted to list
 * connections must never verify as one that can end all of them, or an actor
 * token, or a grant. Sixty seconds, because it is one page load or one click,
 * not a session.
 */
export const MANAGE_PURPOSE = 'ee.mcp.manage.v1';
export const MANAGE_TTL_SECONDS = 60;

export interface McpGrantPayload {
  /** Account id. */
  sub: string;
  email: string;
  /** The MCP Worker's opaque OAuth state, echoed back for binding. */
  state: string;
  /** Unix seconds. */
  exp: number;
  nonce: string;
  aud: typeof GRANT_PURPOSE;
}

export interface ActorPayload {
  sub: string;
  email: string;
  exp: number;
  nonce: string;
  aud: typeof ACTOR_PURPOSE;
}

export type McpGrantVerification =
  | { ok: true; payload: McpGrantPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'state_mismatch' };

const encoder = new TextEncoder();

function b64urlEncode(value: string): string {
  let binary = '';
  for (const byte of encoder.encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(value: string): string | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return null;
  }
}

async function sign(purpose: string, payload: string, secret: string): Promise<string> {
  if (!secret) throw new Error('mcp_grant_secret_missing');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${purpose}.${payload}`));
  let binary = '';
  for (const byte of new Uint8Array(mac)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/**
 * Split on the LAST separator. Base64url never contains a dot, but reading from
 * the end means a payload that somehow did could not shift the signature.
 */
function split(token: string): { encoded: string; signature: string } | null {
  const at = token.lastIndexOf('.');
  if (at <= 0) return null;
  const encoded = token.slice(0, at);
  const signature = token.slice(at + 1);
  if (!encoded || !signature) return null;
  return { encoded, signature };
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function signMcpGrant(
  identity: { sub: string; email: string; state: string },
  secret: string,
): Promise<string> {
  const payload: McpGrantPayload = {
    ...identity,
    exp: currentSeconds() + MCP_GRANT_TTL_SECONDS,
    nonce: crypto.randomUUID(),
    aud: GRANT_PURPOSE,
  };
  const encoded = b64urlEncode(JSON.stringify(payload));
  return `${encoded}.${await sign(GRANT_PURPOSE, encoded, secret)}`;
}

/**
 * Returns a typed reason rather than throwing, so a caller can log which
 * category failed without ever echoing the token. What it must not do is tell
 * the holder which check failed: /callback collapses every reason into one
 * message, because "expired" and "bad signature" are different pieces of
 * information to somebody probing.
 */
export async function verifyMcpGrant(
  grant: string,
  secret: string,
  options: { expectedState: string; nowSeconds?: number },
): Promise<McpGrantVerification> {
  const parts = split(grant);
  if (!parts) return { ok: false, reason: 'malformed' };

  // Signature FIRST. Parsing unauthenticated JSON is how a verifier becomes the
  // attack surface it was written to close.
  if (!constantTimeEqual(parts.signature, await sign(GRANT_PURPOSE, parts.encoded, secret))) {
    return { ok: false, reason: 'bad_signature' };
  }

  const json = b64urlDecode(parts.encoded);
  if (json === null) return { ok: false, reason: 'malformed' };

  let payload: McpGrantPayload;
  try {
    payload = JSON.parse(json) as McpGrantPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (
    typeof payload?.sub !== 'string' ||
    typeof payload?.email !== 'string' ||
    typeof payload?.state !== 'string' ||
    typeof payload?.exp !== 'number' ||
    payload?.aud !== GRANT_PURPOSE ||
    !payload.sub ||
    !payload.email
  ) {
    return { ok: false, reason: 'malformed' };
  }

  const now = options.nowSeconds ?? currentSeconds();
  if (payload.exp <= now) return { ok: false, reason: 'expired' };
  if (!constantTimeEqual(payload.state, options.expectedState)) {
    return { ok: false, reason: 'state_mismatch' };
  }

  return { ok: true, payload };
}

/**
 * `purpose` and `ttlSeconds` exist so a THIRD short-lived assertion - the
 * upload handoff link - can reuse this rather than copy it. A different purpose
 * produces a token that cannot verify as an actor token, and vice versa, which
 * is the same separation the grant already has. One implementation of "sign a
 * short-lived assertion" is one place to get it right.
 */
export async function signActor(
  identity: { sub: string; email: string },
  secret: string,
  options: { purpose?: string; ttlSeconds?: number } = {},
): Promise<string> {
  const purpose = options.purpose ?? ACTOR_PURPOSE;
  const payload = {
    ...identity,
    exp: currentSeconds() + (options.ttlSeconds ?? ACTOR_TTL_SECONDS),
    nonce: crypto.randomUUID(),
    aud: purpose,
  };
  const encoded = b64urlEncode(JSON.stringify(payload));
  return `${encoded}.${await sign(purpose, encoded, secret)}`;
}

/** Null means "acting for nobody", which every caller must treat as unauthorized. */
export async function verifyActor(
  token: string,
  secret: string,
  options: { nowSeconds?: number; purpose?: string } = {},
): Promise<ActorPayload | null> {
  const purpose = options.purpose ?? ACTOR_PURPOSE;
  const parts = split(token);
  if (!parts) return null;
  if (!constantTimeEqual(parts.signature, await sign(purpose, parts.encoded, secret))) {
    return null;
  }

  const json = b64urlDecode(parts.encoded);
  if (json === null) return null;

  try {
    const payload = JSON.parse(json) as ActorPayload;
    if (typeof payload?.sub !== 'string' || typeof payload?.email !== 'string') return null;
    if (!payload.sub || !payload.email) return null;
    if (typeof payload?.exp !== 'number') return null;
    if (payload?.aud !== purpose) return null;
    if (payload.exp <= (options.nowSeconds ?? currentSeconds())) return null;
    return payload;
  } catch {
    return null;
  }
}

export function signScanOnBehalf(identity: { sub: string; email: string }, secret: string): Promise<string> {
  return signActor(identity, secret, { purpose: SCAN_ON_BEHALF_PURPOSE, ttlSeconds: ACTOR_TTL_SECONDS });
}

export function verifyScanOnBehalf(token: string, secret: string): Promise<ActorPayload | null> {
  return verifyActor(token, secret, { purpose: SCAN_ON_BEHALF_PURPOSE });
}
