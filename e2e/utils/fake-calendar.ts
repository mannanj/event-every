import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';

/**
 * A stand-in for Calendar's MCP Worker: OAuth discovery, dynamic client
 * registration, a consent page with a real Continue button, and the token
 * endpoint (with RFC 7009 revocation).
 *
 * Event Every's server talks to it exactly as it talks to the real one - only
 * the origin is swapped (CALENDAR_MCP_URL in the webServer env) - so the
 * routes, the sealing, the PKCE check and the code exchange all run for real.
 */
export const FAKE_CALENDAR_PORT = 8978;
export const FAKE_CALENDAR_ORIGIN = `http://localhost:${FAKE_CALENDAR_PORT}`;

export interface FakeCalendar {
  close: () => Promise<void>;
  /** client_name of every registration, in order. */
  registered: string[];
  /** Tokens revoked, in order. */
  revoked: string[];
}

export async function startFakeCalendar(): Promise<FakeCalendar> {
  const registered: string[] = [];
  const revoked: string[] = [];
  const codes = new Map<string, { redirectUri: string }>();
  let n = 0;

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', FAKE_CALENDAR_ORIGIN);
    const body = await new Promise<string>((resolve) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => resolve(b));
    });
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return json(200, {
        issuer: FAKE_CALENDAR_ORIGIN,
        authorization_endpoint: `${FAKE_CALENDAR_ORIGIN}/authorize`,
        token_endpoint: `${FAKE_CALENDAR_ORIGIN}/token`,
        registration_endpoint: `${FAKE_CALENDAR_ORIGIN}/register`,
        revocation_endpoint: `${FAKE_CALENDAR_ORIGIN}/token`,
      });
    }
    if (url.pathname === '/register') {
      const reg = JSON.parse(body);
      registered.push(reg.client_name);
      return json(201, { client_id: `client-${++n}`, client_name: reg.client_name, redirect_uris: reg.redirect_uris });
    }
    if (url.pathname === '/authorize') {
      const p = url.searchParams;
      const approve = new URL('/authorize/approve', FAKE_CALENDAR_ORIGIN);
      approve.search = p.toString();
      const deny = new URL(p.get('redirect_uri')!);
      deny.searchParams.set('error', 'access_denied');
      deny.searchParams.set('state', p.get('state') ?? '');
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(`<!doctype html><title>Calendar</title><h1>Connect an assistant?</h1>
        <p>Event Every wants to use your Calendar account.</p>
        <a id="continue" href="${approve}">Continue</a> <a id="cancel" href="${deny}">Cancel</a>`);
    }
    if (url.pathname === '/authorize/approve') {
      const p = url.searchParams;
      const code = `code-${randomUUID()}`;
      codes.set(code, { redirectUri: p.get('redirect_uri')! });
      const back = new URL(p.get('redirect_uri')!);
      back.searchParams.set('code', code);
      back.searchParams.set('state', p.get('state') ?? '');
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }
    if (url.pathname === '/token') {
      const form = new URLSearchParams(body);
      if (form.get('token')) {
        revoked.push(form.get('token')!);
        res.writeHead(200);
        return res.end();
      }
      const c = codes.get(form.get('code') ?? '');
      if (!c || c.redirectUri !== form.get('redirect_uri') || !form.get('code_verifier')) {
        return json(400, { error: 'invalid_grant' });
      }
      codes.delete(form.get('code')!);
      return json(200, { access_token: `at-${randomUUID()}`, refresh_token: `rt-${randomUUID()}`, expires_in: 3600, token_type: 'bearer' });
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(FAKE_CALENDAR_PORT, resolve));
  return { registered, revoked, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
