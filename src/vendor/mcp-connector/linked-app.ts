// GENERATED FROM @mannan/mcp-connector/linked-app.ts - DO NOT EDIT HERE.
// Edit ~/Documents/mcp-connector and re-run: node bin/sync.mjs <this dir>
/**
 * Signing in to ANOTHER app's MCP server, from this app's server.
 *
 * The connector's "Add other MCPs" rows are the face of this: Calendar signs
 * in to Event Every, Event Every signs in to Calendar. Both sides already run
 * an OAuth 2.1 MCP server (`workers-oauth-provider`), so the app doing the
 * signing in is just one more OAuth client - exactly what claude.ai is - and
 * the other app needs no new code: its consent page asks, the person says yes,
 * and a token comes back.
 *
 * SERVER ONLY. Plain fetch + Web Crypto, no React and no Node built-ins, so it
 * runs in a Next route handler on Workers and under bun/vitest alike. Storage
 * is the app's: this module seals tokens and hands back strings; where they
 * live (D1, SQLite, KV) is not its business.
 *
 * Flow, all on the app's own origin:
 *
 *   GET  /…/connect   startSignIn()  -> registers a client, PKCE, sealed
 *                                       flow cookie, 302 to their /authorize
 *   (their consent page, on their site, with their session)
 *   GET  /…/callback  finishSignIn() -> checks the cookie's state, swaps the
 *                                       code for tokens, app stores them sealed
 *   POST /…/read      callTool()     -> one tools/call with a fresh token
 *   DELETE /…         revoke()       -> RFC 7009 revocation, app forgets them
 */

export interface LinkedAppServer {
  /** e.g. https://event-every-mcp.mannanteam.workers.dev/mcp */
  mcpUrl: string;
}

export interface AuthServerMeta {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
}

/** What a sign-in leaves behind. Seal it before it touches storage. */
export interface LinkedTokens {
  clientId: string;
  accessToken: string;
  refreshToken?: string;
  /** Unix ms. Absent when the server did not say. */
  expiresAt?: number;
}

/** Carried in a sealed, short-lived, host-only cookie between connect and callback. */
export interface SignInFlow {
  appId: string;
  state: string;
  verifier: string;
  clientId: string;
  redirectUri: string;
  /** Same-origin path to land on afterwards. Checked with `safeReturnTo`. */
  returnTo: string;
  /** The account that started it: the callback must be the same person. */
  owner: string;
  /** Unix ms. */
  expiresAt: number;
}

const FLOW_TTL_MS = 10 * 60_000;

// ─── encoding ──────────────────────────────────────────────────────────────

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

// ─── sealing ───────────────────────────────────────────────────────────────

/**
 * AES-GCM under a key derived from the app's secret.
 *
 * WHY SEAL AND NOT HASH. Unlike a device token we only ever compare, these are
 * credentials we must present to someone else, so they have to come back out.
 * A database dump without the Worker secret yields nothing usable.
 *
 * The purpose is mixed into the derivation, so a sealed flow cookie cannot be
 * replayed as a sealed token row or the other way round.
 */
async function sealKey(secret: string, purpose: string): Promise<CryptoKey> {
  const material = new TextEncoder().encode(`mcp-linked-app.v1|${purpose}|${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(secret: string, purpose: string, value: unknown): Promise<string> {
  if (!secret) throw new Error('seal: no secret configured');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await sealKey(secret, purpose);
  const data = new TextEncoder().encode(JSON.stringify(value));
  const box = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  return `${b64url(iv)}.${b64url(box)}`;
}

/** Null on anything wrong - tampered, wrong key, wrong purpose, malformed. */
export async function unseal<T>(secret: string, purpose: string, sealed: string | null | undefined): Promise<T | null> {
  if (!secret || !sealed) return null;
  const [iv, box] = sealed.split('.');
  if (!iv || !box) return null;
  try {
    const key = await sealKey(secret, purpose);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, key, fromB64url(box));
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}

// ─── the OAuth half ────────────────────────────────────────────────────────

export async function discover(server: LinkedAppServer, f: typeof fetch = fetch): Promise<AuthServerMeta> {
  const origin = new URL(server.mcpUrl).origin;
  const res = await f(`${origin}/.well-known/oauth-authorization-server`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`discovery failed: ${res.status}`);
  const meta = (await res.json()) as AuthServerMeta;
  if (!meta.authorization_endpoint || !meta.token_endpoint) throw new Error('discovery: endpoints missing');
  return meta;
}

/** Same-origin path only. Anything else - absolute, protocol-relative, backslashed - becomes the fallback. */
export function safeReturnTo(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}

export interface StartSignIn {
  appId: string;
  server: LinkedAppServer;
  /** The name the other app's "Connected" list will show, e.g. "Calendar". */
  clientName: string;
  /** Absolute, on this app's origin: where their server sends the code. */
  redirectUri: string;
  returnTo: string;
  owner: string;
  scope?: string;
  /** Wins over `startSignIn`'s randomness in tests only. */
  now?: number;
}

/**
 * Register, build PKCE, and say where to send the browser.
 *
 * A client is registered per sign-in rather than once per app: the other side
 * then lists each sign-in as its own connection, so disconnecting one there
 * cuts exactly that one here, and nothing global has to be stored.
 */
export async function startSignIn(
  input: StartSignIn,
  f: typeof fetch = fetch,
): Promise<{ location: string; flow: SignInFlow }> {
  const meta = await discover(input.server, f);
  if (!meta.registration_endpoint) throw new Error('server does not allow registration');

  const reg = await f(meta.registration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_name: input.clientName,
      redirect_uris: [input.redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });
  if (!reg.ok) throw new Error(`registration failed: ${reg.status}`);
  const { client_id: clientId } = (await reg.json()) as { client_id?: string };
  if (!clientId) throw new Error('registration returned no client_id');

  const verifier = randomToken(48);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = randomToken(24);

  const url = new URL(meta.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (input.scope) url.searchParams.set('scope', input.scope);

  const now = input.now ?? Date.now();
  return {
    location: url.toString(),
    flow: {
      appId: input.appId,
      state,
      verifier,
      clientId,
      redirectUri: input.redirectUri,
      returnTo: safeReturnTo(input.returnTo),
      owner: input.owner,
      expiresAt: now + FLOW_TTL_MS,
    },
  };
}

export type FinishResult =
  | { ok: true; tokens: LinkedTokens }
  | { ok: false; reason: 'denied' | 'state' | 'expired' | 'owner' | 'exchange'; detail?: string };

/**
 * Check what came back, then swap the code.
 *
 * The state must match the sealed cookie this browser holds - so a code minted
 * for someone else's flow cannot be landed in this account - and the person on
 * the callback must be the one who started it.
 */
export async function finishSignIn(
  input: { flow: SignInFlow | null; query: URLSearchParams; owner: string; server: LinkedAppServer; now?: number },
  f: typeof fetch = fetch,
): Promise<FinishResult> {
  const { flow, query } = input;
  if (query.get('error')) return { ok: false, reason: 'denied', detail: query.get('error') ?? undefined };
  if (!flow || !query.get('state') || query.get('state') !== flow.state) return { ok: false, reason: 'state' };
  if ((input.now ?? Date.now()) > flow.expiresAt) return { ok: false, reason: 'expired' };
  if (flow.owner !== input.owner) return { ok: false, reason: 'owner' };
  const code = query.get('code');
  if (!code) return { ok: false, reason: 'state' };

  const meta = await discover(input.server, f);
  const res = await f(meta.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: flow.redirectUri,
      client_id: flow.clientId,
      code_verifier: flow.verifier,
    }),
  });
  if (!res.ok) return { ok: false, reason: 'exchange', detail: String(res.status) };
  return { ok: true, tokens: toTokens(flow.clientId, await res.json(), input.now) };
}

function toTokens(clientId: string, body: unknown, now = Date.now()): LinkedTokens {
  const t = body as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!t.access_token) throw new Error('token response has no access_token');
  return {
    clientId,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: typeof t.expires_in === 'number' ? now + t.expires_in * 1000 : undefined,
  };
}

/** Within a minute of expiry counts as expired: a token that dies mid-call is worse than a refresh. */
export function needsRefresh(tokens: LinkedTokens, now = Date.now()): boolean {
  return tokens.expiresAt !== undefined && tokens.expiresAt - 60_000 <= now;
}

/** New tokens, or null when the other side refused (revoked there): the link is gone. */
export async function refresh(server: LinkedAppServer, tokens: LinkedTokens, f: typeof fetch = fetch): Promise<LinkedTokens | null> {
  if (!tokens.refreshToken) return null;
  const meta = await discover(server, f);
  const res = await f(meta.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken, client_id: tokens.clientId }),
  });
  if (res.status === 400 || res.status === 401) return null;
  if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
  const next = toTokens(tokens.clientId, await res.json());
  // A server that does not rotate keeps the old refresh token valid.
  return { ...next, refreshToken: next.refreshToken ?? tokens.refreshToken };
}

/** Best effort: the link is forgotten here whatever their server answers. */
export async function revoke(server: LinkedAppServer, tokens: LinkedTokens, f: typeof fetch = fetch): Promise<void> {
  try {
    const meta = await discover(server, f);
    if (!meta.revocation_endpoint) return;
    for (const [token, hint] of [[tokens.refreshToken, 'refresh_token'], [tokens.accessToken, 'access_token']] as const) {
      if (!token) continue;
      await f(meta.revocation_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token, token_type_hint: hint, client_id: tokens.clientId }),
      });
    }
  } catch {
    // Unreachable server: nothing more to do from here.
  }
}

// ─── the MCP half ──────────────────────────────────────────────────────────

export class LinkedAppError extends Error {
  constructor(
    readonly code: 'unauthorized' | 'tool' | 'transport',
    message: string,
  ) {
    super(message);
  }
}

/** A streamable-HTTP answer is either JSON or an SSE stream; take the JSON-RPC message either way. */
export async function readRpc(res: Response): Promise<{ result?: unknown; error?: { message?: string } }> {
  const text = await res.text();
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const messages = text
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .filter(Boolean);
    for (let i = messages.length - 1; i >= 0; i--) {
      try {
        const m = JSON.parse(messages[i]!);
        if ('result' in m || 'error' in m) return m;
      } catch {
        // keep looking
      }
    }
    throw new LinkedAppError('transport', 'no JSON-RPC result in stream');
  }
  return JSON.parse(text);
}

const PROTOCOL = '2025-06-18';

/**
 * initialize → notifications/initialized → tools/call, the handshake every
 * client does. A 401 anywhere means the token is no good: the caller refreshes
 * once or forgets the link.
 */
export async function callTool<T = unknown>(
  server: LinkedAppServer,
  accessToken: string,
  name: string,
  args: Record<string, unknown>,
  f: typeof fetch = fetch,
): Promise<{ structured: T | undefined; text: string }> {
  let session: string | null = null;
  let id = 0;
  const post = async (body: Record<string, unknown>) => {
    const res = await f(server.mcpUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${accessToken}`,
        'mcp-protocol-version': PROTOCOL,
        ...(session ? { 'mcp-session-id': session } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', ...body }),
    });
    if (res.status === 401 || res.status === 403) throw new LinkedAppError('unauthorized', 'signed out on the other side');
    if (!res.ok && res.status !== 202) throw new LinkedAppError('transport', `MCP ${res.status}`);
    session = res.headers.get('mcp-session-id') ?? session;
    return res;
  };

  await readRpc(
    await post({
      id: ++id,
      method: 'initialize',
      params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'mcp-linked-app', version: '1' } },
    }),
  );
  await post({ method: 'notifications/initialized' });
  const answer = await readRpc(await post({ id: ++id, method: 'tools/call', params: { name, arguments: args } }));
  if (answer.error) throw new LinkedAppError('tool', answer.error.message ?? 'tool failed');
  const result = answer.result as {
    isError?: boolean;
    structuredContent?: T;
    content?: { type: string; text?: string }[];
  };
  const text = (result.content ?? []).map((c) => c.text ?? '').join('\n').trim();
  if (result.isError) throw new LinkedAppError('tool', text || 'tool failed');
  return { structured: result.structuredContent, text };
}
