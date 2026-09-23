#!/usr/bin/env node
/**
 * Click through the consent page in a REAL browser, against the deployed pair.
 *
 * WHY THIS EXISTS BESIDE verify-oauth-live.mjs. That script drives the chain
 * with fetch, and fetch sends no Origin header - which the edge admission
 * check accepts. A browser posting the consent form sends one, and under the
 * page's old `Referrer-Policy: no-referrer` it sent `Origin: null`, which the
 * check refuses. So the scripted chain passed while every real "Continue"
 * answered 403 origin_not_allowed. Only a browser can see this class of bug.
 *
 *   EE_SESSION=<seeded session id> node verify-consent-browser.mjs
 *
 * Env: APP_ORIGIN, MCP_ORIGIN, EE_SESSION - as verify-oauth-live.mjs.
 * Exits non-zero unless the click lands on the client's callback with a code.
 */
import { createServer } from 'node:http';

import { chromium, webkit } from '@playwright/test';

const APP = (process.env.APP_ORIGIN || 'https://eventevery.com').replace(/\/$/, '');
const MCP = (process.env.MCP_ORIGIN || 'https://event-every-mcp.mannanteam.workers.dev').replace(/\/$/, '');
const SESSION = process.env.EE_SESSION || '';
const REDIRECT = 'http://localhost:8976/callback';

if (!SESSION) {
  console.error('EE_SESSION is required (seed a session row first)');
  process.exit(2);
}

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function authorizeUrl() {
  const registration = await fetch(`${MCP}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'verify-consent-browser',
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    }),
  });
  const client = await registration.json();
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
  const url = new URL(`${MCP}/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', client.client_id);
  url.searchParams.set('redirect_uri', REDIRECT);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope', 'account');
  url.searchParams.set('state', 'browser-state');
  return url.toString();
}

let failures = 0;

// A real listener, not a route intercept: the callback is reached through two
// redirects, and Playwright does not intercept a request a redirect produced.
let callback = null;
const listener = createServer((request, response) => {
  callback = new URL(request.url ?? '/', REDIRECT).toString();
  response.end('callback reached');
});
await new Promise((resolve) => listener.listen(8976, '127.0.0.1', resolve));

// Both engines: Safari is where this was reported, Chromium is most clients.
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: 'ee_session',
      value: SESSION,
      domain: new URL(APP).hostname,
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  callback = null;

  const page = await context.newPage();
  await page.goto(await authorizeUrl());
  const consentShown = page.url().startsWith(`${APP}/api/mcp/authorize`);
  await page.locator('form button[type="submit"]').click();
  await page.waitForLoadState();
  const body = (await page.textContent('body').catch(() => '')) ?? '';

  const code = callback ? new URL(callback).searchParams.get('code') : null;
  if (consentShown && code) {
    console.log(`  ok    ${name.padEnd(9)} consent -> Continue -> client callback with a code`);
  } else {
    failures += 1;
    console.log(
      `  FAIL  ${name.padEnd(9)} consent shown: ${consentShown}; landed on ${page.url().slice(0, 90)}; body: ${body.slice(0, 100)}`,
    );
  }
  await browser.close();
}

listener.close();
process.exit(failures === 0 ? 0 : 1);
