// GENERATED FROM @mannan/mcp-connector/browser-linked-app.ts - DO NOT EDIT HERE.
// Edit ~/Documents/mcp-connector and re-run: node bin/sync.mjs <this dir>
/**
 * Signing in to a sister app's MCP server FROM THE BROWSER: a public OAuth client (no secret) with PKCE, for an
 * app that has no server session to keep a sealed cookie in (otherwise use `linked-app.ts`). Born in Sun Signal
 * (its clock reads Mannan's calendar), kept here so the next app gets the lessons for free; see the README.
 *
 * The flow, and why each part is the way it is:
 *  - `startSignIn` must run inside the click: it opens the pop-up synchronously (anything later is blocked),
 *    then registers a client (RFC 7591), makes a PKCE pair and saves what the callback needs — verifier, client,
 *    redirect, where to come back to, and whether a pop-up exists — in localStorage under the request's state.
 *  - No pop-up (blocked, or a web-app window that has none): the same window goes to sign in instead.
 *  - The callback page calls `finishSignIn`: it finishes the exchange itself (the opener page may be gone, so
 *    the verifier must survive a navigation), checks the issuer (RFC 9207), stores the tokens, tells every
 *    window on a BroadcastChannel, and says whether to close (pop-up) or go back to `returnTo`. Whether this is
 *    the pop-up was decided when it opened: `window.opener` cannot tell, a pop-out window has one too.
 *
 * Browser-only (fetch, Web Crypto, localStorage, BroadcastChannel); nothing touches `window` at module load.
 */

export interface BrowserLinkedAppConfig {
  /** The MCP server's origin, e.g. https://calendar-mcp.example.workers.dev (also the expected `iss`). */
  origin: string;
  /** Shown on the server's consent page and in its Connected list. */
  clientName: string;
  /** Requested OAuth scope, if the server wants one. */
  scope?: string;
  /** Path of the MCP endpoint on `origin`. */
  mcpPath?: string;
  /** Names what the user signs in to in error messages ("Calendar"). */
  label?: string;
  /** localStorage prefix for pending sign-ins. */
  pendingPrefix: string;
  /** BroadcastChannel name the callback announces on. */
  channel: string;
  /** window.open target name for the pop-up. */
  popupName: string;
}

export interface LinkedTokens {
  clientId: string;
  redirectUri: string;
  accessToken: string;
  refreshToken?: string;
  /** ms since epoch. */
  expiresAt?: number;
  /** When this sign-in happened, ms since epoch. */
  connectedAt?: number;
}

/** What a sign-in needs to finish wherever it comes back. */
export interface PendingSignIn { verifier: string; clientId: string; redirectUri: string; returnTo: string; popup: boolean; at: number }

/** Sent on the channel when a sign-in finishes. */
export type SignInMessage = { state: string; linked: true } | { state: string; failed: true };

/** The server refused the sign-in or the token: sign in again. */
export class LinkedAppAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'LinkedAppAuthError'; }
}

type Fetch = typeof fetch;
type TokenReply = { access_token: string; refresh_token?: string; expires_in?: number };

// A sign-in not finished within this long is dropped.
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge: b64url(digest) };
}

export const randomState = () => b64url(crypto.getRandomValues(new Uint8Array(16)));

/** A JSON-RPC message from a JSON or an event-stream (SSE) reply. */
export async function readRpc(res: Response): Promise<{ result?: unknown; error?: { message?: string } }> {
  const type = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (!type.includes('text/event-stream')) return JSON.parse(text);
  const data = text.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).filter(Boolean);
  for (let k = data.length - 1; k >= 0; k--) {
    const msg = JSON.parse(data[k]);
    if ('result' in msg || 'error' in msg) return msg;
  }
  throw new Error('The MCP server sent no result');
}

export function browserLinkedApp(cfg: BrowserLinkedAppConfig) {
  const label = cfg.label ?? 'The linked app';
  const mcpPath = cfg.mcpPath ?? '/mcp';
  const pendingKey = (state: string) => `${cfg.pendingPrefix}${state}`;

  async function registerClient(redirectUri: string, fetchImpl: Fetch = fetch): Promise<string> {
    const res = await fetchImpl(`${cfg.origin}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: cfg.clientName,
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      }),
    });
    if (!res.ok) throw new Error(`${label} client registration failed: ${res.status}`);
    const body = await res.json() as { client_id?: string };
    if (!body.client_id) throw new Error(`${label} client registration returned no client id`);
    return body.client_id;
  }

  function authorizeUrl(o: { clientId: string; redirectUri: string; challenge: string; state: string }): string {
    const q = new URLSearchParams({
      response_type: 'code', client_id: o.clientId, redirect_uri: o.redirectUri,
      code_challenge: o.challenge, code_challenge_method: 'S256', state: o.state,
      ...(cfg.scope ? { scope: cfg.scope } : {}),
    });
    return `${cfg.origin}/authorize?${q}`;
  }

  async function tokenRequest(form: Record<string, string>, fetchImpl: Fetch): Promise<TokenReply> {
    const res = await fetchImpl(`${cfg.origin}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
    if (res.status === 400 || res.status === 401) throw new LinkedAppAuthError(`${label} token refused: ${res.status}`);
    if (!res.ok) throw new Error(`${label} token request failed: ${res.status}`);
    return res.json();
  }

  const toTokens = (clientId: string, redirectUri: string, t: TokenReply, now: number, keepRefresh?: string): LinkedTokens => ({
    clientId, redirectUri,
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? keepRefresh,
    expiresAt: t.expires_in ? now + t.expires_in * 1000 : undefined,
  });

  async function exchangeCode(o: { clientId: string; redirectUri: string; code: string; verifier: string }, fetchImpl: Fetch = fetch, now = Date.now()): Promise<LinkedTokens> {
    const t = await tokenRequest({ grant_type: 'authorization_code', code: o.code, redirect_uri: o.redirectUri, client_id: o.clientId, code_verifier: o.verifier }, fetchImpl);
    return toTokens(o.clientId, o.redirectUri, t, now);
  }

  async function refresh(tokens: LinkedTokens, fetchImpl: Fetch = fetch, now = Date.now()): Promise<LinkedTokens> {
    if (!tokens.refreshToken) throw new LinkedAppAuthError('No refresh token: sign in again');
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken, client_id: tokens.clientId }, fetchImpl);
    return { ...toTokens(tokens.clientId, tokens.redirectUri, t, now, tokens.refreshToken), connectedAt: tokens.connectedAt };
  }

  /** One `tools/call`, for a stateless server (no initialize handshake or session id). */
  async function callTool<T>(accessToken: string, name: string, args: Record<string, unknown>, fetchImpl: Fetch = fetch): Promise<T> {
    const res = await fetchImpl(`${cfg.origin}${mcpPath}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    });
    // Only a 401 means sign in again. A 403 is the server turning this origin (or this account) away, which a new
    // sign-in cannot fix; reading it as expired sent people round a sign-in loop.
    if (res.status === 401) throw new LinkedAppAuthError(`${label} refused the token: ${res.status}`);
    if (!res.ok) throw new Error(`${label} MCP call failed: ${res.status}`);
    const msg = await readRpc(res);
    if (msg.error) throw new Error(`${label} MCP: ${msg.error.message ?? 'error'}`);
    const result = msg.result as { structuredContent?: T; content?: { type: string; text?: string }[]; isError?: boolean };
    if (result?.isError) throw new Error(`${label} MCP tool error: ${result.content?.[0]?.text ?? name}`);
    if (result?.structuredContent) return result.structuredContent;
    const text = result?.content?.find(c => c.type === 'text')?.text;
    if (!text) throw new Error(`${label} MCP returned no content`);
    return JSON.parse(text) as T;
  }

  /** RFC 9207: when the callback names its issuer it must be this server; an absent `iss` is allowed. */
  function assertIssuer(iss: string | null): void {
    if (iss == null) return;
    const norm = (u: string) => { try { return new URL(u).origin; } catch { return u.replace(/\/+$/, ''); } };
    if (norm(iss) !== norm(cfg.origin)) throw new LinkedAppAuthError(`Unexpected issuer ${iss}`);
  }

  /** Removes sign-ins that were never finished, or cannot be read. */
  function sweepPending(storage: Storage, now = Date.now(), maxAgeMs = PENDING_MAX_AGE_MS): void {
    for (let k = storage.length - 1; k >= 0; k--) {
      const key = storage.key(k);
      if (!key?.startsWith(cfg.pendingPrefix)) continue;
      let at = NaN;
      try { at = Number((JSON.parse(storage.getItem(key) ?? 'null') as PendingSignIn | null)?.at); } catch { /* unreadable: dropped below */ }
      if (!(now - at <= maxAgeMs)) storage.removeItem(key);
    }
  }

  const broadcast = (msg: SignInMessage) => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(cfg.channel);
    ch.postMessage(msg);
    ch.close();
  };

  /**
   * MUST be called synchronously in the user's click. Opens the pop-up at once and returns it, with a promise
   * of the request's state once the sign-in page is on its way (in the pop-up, or in this window when there is
   * none). Pass the client id of an earlier sign-in with the same redirect to skip registering again.
   */
  function startSignIn(o: {
    redirectUri: string; returnTo: string; priorClientId?: string; popupFeatures?: string;
    storage?: Storage; fetchImpl?: Fetch; open?: typeof window.open; navigate?: (url: string) => void;
  }): { popup: Window | null; started: Promise<{ state: string }> } {
    const open = o.open ?? ((...a: Parameters<typeof window.open>) => window.open(...a));
    const win = open('about:blank', cfg.popupName, o.popupFeatures ?? 'width=520,height=720');
    const popup = !!win && !win.closed;
    const started = (async () => {
      try {
        const storage = o.storage ?? localStorage;
        sweepPending(storage);
        const clientId = o.priorClientId ?? await registerClient(o.redirectUri, o.fetchImpl);
        const { verifier, challenge } = await pkcePair();
        const state = randomState();
        const saved: PendingSignIn = { verifier, clientId, redirectUri: o.redirectUri, returnTo: o.returnTo, popup, at: Date.now() };
        storage.setItem(pendingKey(state), JSON.stringify(saved));
        const url = authorizeUrl({ clientId, redirectUri: o.redirectUri, challenge, state });
        if (popup && win && !win.closed) win.location.href = url;
        else (o.navigate ?? ((u: string) => window.location.assign(u)))(url);
        return { state };
      } catch (err) {
        win?.close();
        throw err;
      }
    })();
    return { popup: popup ? win : null, started };
  }

  /**
   * For the callback page: finishes the sign-in named by the URL's `state`, stores the tokens, announces it on
   * the channel and returns what to do next — close (pop-up) or go back to `returnTo` (with `?<failParam>=failed`
   * added when it failed, for the app to show). Call it once per page load.
   */
  async function finishSignIn(o: {
    url: URL | Location; store: (tokens: LinkedTokens) => Promise<void>;
    storage?: Storage; fetchImpl?: Fetch; failParam?: string; windowName?: string;
  }): Promise<{ ok: boolean; close: boolean; returnTo: string | null; error?: unknown }> {
    const storage = o.storage ?? localStorage;
    const q = new URLSearchParams(o.url.search);
    const code = q.get('code'), state = q.get('state') ?? '', error = q.get('error');
    const key = pendingKey(state);
    let saved: PendingSignIn | null = null;
    try { saved = JSON.parse(storage.getItem(key) ?? 'null'); } catch { saved = null; }
    const close = !!saved?.popup || o.windowName === cfg.popupName;
    const settle = (ok: boolean, err?: unknown) => {
      try { storage.removeItem(key); sweepPending(storage); } catch { /* nothing to clean */ }
      broadcast(ok ? { state, linked: true } : { state, failed: true });
      let returnTo = saved?.returnTo ?? null;
      if (!ok && returnTo && o.failParam) { const u = new URL(returnTo); u.searchParams.set(o.failParam, 'failed'); returnTo = u.toString(); }
      return { ok, close, returnTo, error: err };
    };
    try {
      if (error || !code || !saved) throw new LinkedAppAuthError(error ?? 'No sign-in to finish');
      assertIssuer(q.get('iss'));
      const tokens = await exchangeCode({ clientId: saved.clientId, redirectUri: saved.redirectUri, code, verifier: saved.verifier }, o.fetchImpl);
      await o.store({ ...tokens, connectedAt: Date.now() });
      return settle(true);
    } catch (err) {
      return settle(false, err);
    }
  }

  return {
    config: cfg, pendingKey, registerClient, authorizeUrl, exchangeCode, refresh, callTool, assertIssuer, sweepPending, startSignIn, finishSignIn,
  };
}
