#!/usr/bin/env node
/**
 * Drive the whole OAuth chain against the deployed pair, with no human
 * clicking anything, and then call the tools for real.
 *
 * WHY A SEEDED ACCOUNT RATHER THAN A MAGIC LINK. The skeleton's equivalent
 * reads the sign-in link out of the Worker log, which works because its local
 * runtime uses EMAIL_PROVIDER=console. Production sends real mail to a real
 * inbox, and there is nothing to scrape. So the session is seeded straight into
 * D1 instead: the rows a magic link would have produced, made directly.
 *
 * That is the ONLY step this skips. Everything after it is the real thing -
 * real dynamic client registration, real PKCE, the real bridge reading a real
 * session cookie, a real grant signed by the app and verified by the Worker,
 * a real token exchange, and real tool calls against real stored events.
 *
 *   node verify-oauth-live.mjs
 *
 * Env:
 *   APP_ORIGIN   default https://eventevery.com
 *   MCP_ORIGIN   default https://event-every-mcp.mannanteam.workers.dev
 *   EE_SESSION   a session id already seeded in the accounts database
 *
 * Exits non-zero on any failure.
 */

const APP = (process.env.APP_ORIGIN || 'https://eventevery.com').replace(/\/$/, '');
const MCP = (process.env.MCP_ORIGIN || 'https://event-every-mcp.mannanteam.workers.dev').replace(/\/$/, '');
const SESSION = process.env.EE_SESSION || '';

if (!SESSION) {
  console.error('EE_SESSION is required (seed a session row first)');
  process.exit(2);
}

let failures = 0;
const ok = (label, detail = '') => console.log(`  ok    ${label.padEnd(44)} ${detail}`);
const fail = (label, detail) => { failures += 1; console.log(`  FAIL  ${label.padEnd(44)} ${detail}`); };
const check = (label, expected, actual) =>
  String(expected) === String(actual) ? ok(label, String(actual)) : fail(label, `expected ${expected}, got ${actual}`);

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

console.log(`Driving the full chain\n  app ${APP}\n  mcp ${MCP}\n`);

// 1. Dynamic client registration ─────────────────────────────────────────────
console.log('1. dynamic client registration');
const REDIRECT = 'http://localhost:8976/callback';
const registration = await fetch(`${MCP}/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_name: 'verify-oauth-live',
    redirect_uris: [REDIRECT],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    response_types: ['code'],
  }),
});
const client = await registration.json().catch(() => ({}));
check('POST /register', 201, registration.status);
client.client_id ? ok('client_id issued') : fail('client_id issued', JSON.stringify(client).slice(0, 160));

// 2. /authorize, with PKCE ───────────────────────────────────────────────────
console.log('\n2. authorize, with PKCE S256');
const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
const challenge = b64url(await sha256(verifier));
const authorizeUrl = new URL(`${MCP}/authorize`);
authorizeUrl.searchParams.set('response_type', 'code');
authorizeUrl.searchParams.set('client_id', client.client_id);
authorizeUrl.searchParams.set('redirect_uri', REDIRECT);
authorizeUrl.searchParams.set('code_challenge', challenge);
authorizeUrl.searchParams.set('code_challenge_method', 'S256');
authorizeUrl.searchParams.set('scope', 'account');
authorizeUrl.searchParams.set('state', 'client-state');

const authorize = await fetch(authorizeUrl, { redirect: 'manual' });
check('GET /authorize', 302, authorize.status);

// The Worker binds the browser that started this flow. A client follows the
// redirect chain with a cookie jar; this harness has to keep it by hand.
const flowCookie = (authorize.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
flowCookie.startsWith('ee_mcp_flow=')
  ? ok('the browser that began the flow is bound')
  : fail('the browser that began the flow is bound', flowCookie.slice(0, 60) || 'no cookie set');
const bridge = authorize.headers.get('location') ?? '';
bridge.startsWith(`${APP}/api/mcp/authorize?state=`)
  ? ok('bounces to the app bridge', new URL(bridge).pathname)
  : fail('bounces to the app bridge', bridge.slice(0, 120));

// 3. The bridge, signed OUT, must not hand over a grant ──────────────────────
console.log('\n3. the bridge refuses a stranger');
const anonymous = await fetch(bridge, { redirect: 'manual' });
const anonymousTo = anonymous.headers.get('location') ?? '';
anonymousTo.includes('/signin?state=')
  ? ok('signed out goes to sign-in, keeping the state')
  : fail('signed out goes to sign-in, keeping the state', anonymousTo.slice(0, 120));

// 4. The bridge ASKS rather than signing ─────────────────────────────────────
console.log('\n4. the bridge asks before it signs');
const asked = await fetch(bridge, {
  redirect: 'manual',
  headers: { cookie: `ee_session=${SESSION}` },
});
check('GET the bridge', 200, asked.status);
const page = await asked.text();

// The property that closes the one-click account takeover: a GET must NOT
// produce a grant, however good the session is.
page.includes('/callback?state=') || page.includes('grant=')
  ? fail('a GET does not hand back a grant', 'the page contains one')
  : ok('a GET does not hand back a grant');
page.includes('Connect an assistant?')
  ? ok('a consent page is shown instead')
  : fail('a consent page is shown instead', page.slice(0, 120));

// The consent token reaches the browser only inside this page.
// The attribute is HTML-escaped, so `&` arrives as `&amp;`.
const consentAction = (page.match(/action="([^"]*\/confirm[^"]*)"/)?.[1] ?? '').replace(/&amp;/g, '&');
const consent = consentAction ? new URL(consentAction, APP).searchParams.get('consent') : null;
consent ? ok('a consent token is issued to this session') : fail('a consent token is issued to this session', consentAction.slice(0, 80));

// 4b. Confirming ─────────────────────────────────────────────────────────────
console.log('\n4b. confirming');
const confirmUrl = new URL(consentAction || '/api/mcp/authorize/confirm', APP);
const bridged = await fetch(confirmUrl, {
  method: 'POST',
  redirect: 'manual',
  headers: { cookie: `ee_session=${SESSION}` },
});
check('POST the confirmation', 302, bridged.status);
const callback = bridged.headers.get('location') ?? '';
callback.startsWith(`${MCP}/callback?state=`) && callback.includes('grant=')
  ? ok('grant issued and sent to /callback')
  : fail('grant issued and sent to /callback', callback.slice(0, 120));

// A confirmation without the token, which is what a cross-site form could send.
{
  const forged = new URL('/api/mcp/authorize/confirm', APP);
  forged.searchParams.set('state', new URL(bridge).searchParams.get('state') ?? '');
  forged.searchParams.set('consent', 'not-the-real-token');
  const refused = await fetch(forged, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: `ee_session=${SESSION}` },
  });
  const to = refused.headers.get('location') ?? '';
  to.includes('/callback') && to.includes('grant=')
    ? fail('a forged consent token is refused', 'it signed a grant')
    : ok('a forged consent token is refused', String(refused.status));
}

// 5. A grant cannot be replayed against another state ────────────────────────
console.log('\n5. refusals');
{
  const grant = new URL(callback).searchParams.get('grant') ?? '';
  const swapped = new URL(`${MCP}/callback`);
  swapped.searchParams.set('state', 'a-different-state');
  swapped.searchParams.set('grant', grant);
  const replayed = await fetch(swapped, { redirect: 'manual' });
  [400, 403].includes(replayed.status)
    ? ok('a grant bound to another state is refused', String(replayed.status))
    : fail('a grant bound to another state is refused', String(replayed.status));
}

// 6. /callback, then exchange the code IMMEDIATELY ───────────────────────────
console.log('\n6. callback and token exchange');
// Without the flow cookie this is exactly the attacker's position: a valid
// state, a valid grant, and a browser that never started the flow.
{
  const unbound = await fetch(callback, { redirect: 'manual' });
  check('a browser that did not start the flow is refused', 403, unbound.status);
}

// That refusal burns the state, so the run needs a fresh authorization to
// finish against. The server is right and the harness has to keep up - the same
// trap ~/Documents/mcp documents about negative probes stealing the real one.
const second = await fetch(authorizeUrl, { redirect: 'manual' });
const secondFlow = (second.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
const secondBridge = second.headers.get('location') ?? '';
const secondAsked = await fetch(secondBridge, { headers: { cookie: `ee_session=${SESSION}` } });
const secondPage = await secondAsked.text();
const secondAction = (secondPage.match(/action="([^"]*\/confirm[^"]*)"/)?.[1] ?? '').replace(/&amp;/g, '&');
const secondConfirm = await fetch(new URL(secondAction, APP), {
  method: 'POST',
  redirect: 'manual',
  headers: { cookie: `ee_session=${SESSION}` },
});
const secondCallback = secondConfirm.headers.get('location') ?? '';

const completed = await fetch(secondCallback, {
  redirect: 'manual',
  headers: { cookie: secondFlow },
});
check('GET /callback', 302, completed.status);
const back = completed.headers.get('location') ?? '';
const code = back ? new URL(back).searchParams.get('code') : null;
code ? ok('authorization code issued') : fail('authorization code issued', back.slice(0, 120));

const token = await fetch(`${MCP}/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: code ?? '',
    redirect_uri: REDIRECT,
    client_id: client.client_id,
    code_verifier: verifier,
  }),
});
const tokens = await token.json().catch(() => ({}));
check('POST /token', 200, token.status);
const access = tokens.access_token;
access ? ok('access token issued') : fail('access token issued', JSON.stringify(tokens).slice(0, 160));

if (!access) {
  console.log('\nFAILED before any tool could be called');
  process.exit(1);
}

// 7. Real tool calls ─────────────────────────────────────────────────────────
console.log('\n7. tools, for real');
let rpcId = 0;
async function rpc(method, params) {
  const response = await fetch(`${MCP}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Origin: 'https://claude.ai',
      Authorization: `Bearer ${access}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: (rpcId += 1), method, params }),
  });
  const text = await response.text();
  const line = text.split('\n').find((l) => l.startsWith('data:')) ?? text;
  try {
    return JSON.parse(line.replace(/^data:\s*/, ''));
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'verify-oauth-live', version: '1' },
});

const who = await rpc('tools/call', { name: 'whoami', arguments: {} });
const whoText = who?.result?.content?.[0]?.text ?? JSON.stringify(who).slice(0, 160);
whoText.includes('@')
  ? ok('whoami answers with the account', whoText)
  : fail('whoami answers with the account', whoText);

// The assertion the whole chain exists for: an identity carried from a cookie,
// through a signed grant, through a token, into a tool call.
const structured = who?.result?.structuredContent;
structured?.email ? ok('whoami returns structuredContent', structured.email) : fail('whoami returns structuredContent', JSON.stringify(structured));

// 7a. OPT-IN, because it spends: one real text scan through MCP, and which
// budget it came out of. Without an on-behalf identity the app saw only this
// Worker's address, so an admin was charged to the shared budget and every
// assistant shared one per-person cap. EE_EXPECT_TIER says which ledger this
// account should spend from: 'admin' for an unlimited account, else 'owner'.
if (process.env.EE_VERIFY_SCAN) {
  console.log('\n7a. a scan spends from the caller\'s own budget');
  const usage = async (cookie) => {
    const response = await fetch(`${APP}/api/usage`, cookie ? { headers: { cookie } } : {});
    const body = await response.json().catch(() => ({}));
    // Reserved as well as spent: settlement may land after the tool answers.
    return (body.spentNanodollars ?? 0) + (body.reservedNanodollars ?? 0);
  };
  const mineBefore = await usage(`ee_session=${SESSION}`);
  const sharedBefore = await usage(null);
  const scanned = await rpc('tools/call', {
    name: 'read_text_into_events',
    arguments: { text: `Verification tea ${Date.now()}, Friday 3pm to 4pm, at the library.` },
  });
  const scanText = scanned?.result?.content?.[0]?.text ?? JSON.stringify(scanned).slice(0, 200);
  scanned?.result && !scanned.result.isError
    ? ok('read_text_into_events succeeds', scanText.slice(0, 60))
    : fail('read_text_into_events succeeds', scanText.slice(0, 200));
  const mineAfter = await usage(`ee_session=${SESSION}`);
  const sharedAfter = await usage(null);
  mineAfter > mineBefore
    ? ok('the caller\'s own ledger was charged', `${mineBefore} -> ${mineAfter}`)
    : fail('the caller\'s own ledger was charged', `${mineBefore} -> ${mineAfter}`);
  if (process.env.EE_EXPECT_TIER === 'admin') {
    // The shared ledger can move under other people's traffic, so the proof
    // is that the two ledgers are different objects, not that one stood still.
    mineBefore !== sharedBefore
      ? ok('an admin spends from a ledger that is not the shared one', `${mineAfter} vs ${sharedAfter}`)
      : fail('an admin spends from a ledger that is not the shared one', `${mineBefore} vs ${sharedBefore}`);
  }
}

const marker = `verify-live-${Date.now()}`;
const added = await rpc('tools/call', {
  name: 'add_events',
  arguments: {
    events: [{ title: marker, start: '2027-03-04T19:00:00Z', location: 'A test that ran' }],
  },
});
const addedEvent = added?.result?.structuredContent?.events?.[0];
addedEvent?.id ? ok('add_events saved one', addedEvent.title) : fail('add_events saved one', JSON.stringify(added).slice(0, 200));

const found = await rpc('tools/call', { name: 'list_events', arguments: { query: marker } });
const foundEvents = found?.result?.structuredContent?.events ?? [];
foundEvents.some((e) => e.title === marker)
  ? ok('list_events finds it by text search', `${foundEvents.length} match`)
  : fail('list_events finds it by text search', JSON.stringify(found?.result?.structuredContent ?? found).slice(0, 200));

const noFilter = await rpc('tools/call', { name: 'list_events', arguments: {} });
noFilter?.result?.isError
  ? ok('list_events refuses a read with no filter')
  : fail('list_events refuses a read with no filter', JSON.stringify(noFilter?.result ?? noFilter).slice(0, 160));

if (addedEvent?.id) {
  const ics = await rpc('tools/call', {
    name: 'get_event',
    arguments: { id: addedEvent.id, asCalendarFile: true },
  });
  const resource = (ics?.result?.content ?? []).find((c) => c.type === 'resource');
  resource?.resource?.text?.startsWith('BEGIN:VCALENDAR')
    ? ok('get_event returns a real .ics attachment')
    : fail('get_event returns a real .ics attachment', JSON.stringify(ics?.result ?? ics).slice(0, 200));

  const removed = await rpc('tools/call', { name: 'remove_event', arguments: { id: addedEvent.id } });
  removed?.result?.structuredContent?.deleted === addedEvent.id
    ? ok('remove_event cleans up after itself')
    : fail('remove_event cleans up after itself', JSON.stringify(removed?.result ?? removed).slice(0, 200));
}

// 7b. The upload handoff ─────────────────────────────────────────────────────
console.log('\n7b. the photo handoff');
{
  const minted = await rpc('tools/call', { name: 'request_photo_upload', arguments: {} });
  const link = minted?.result?.structuredContent;
  link?.url?.includes('/upload?t=')
    ? ok('request_photo_upload mints a link', `${Math.round(link.expiresInSeconds / 60)} min`)
    : fail('request_photo_upload mints a link', JSON.stringify(minted?.result ?? minted).slice(0, 200));

  if (link?.url) {
    // The link is a capability. It must not also be an actor token: presenting
    // it as a bearer credential has to get nowhere.
    const token = new URL(link.url).searchParams.get('t');
    const asBearer = await fetch(`${APP}/api/mcp/events?from=2026-01-01`, {
      headers: { authorization: `Bearer ${token}` },
    });
    check('the upload link is not a bearer token', 401, asBearer.status);

    // A 1x1 PNG, redeemed the way the phone does it.
    const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const redeemed = await fetch(`${APP}/api/mcp/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'redeem', token, imageBase64: PIXEL, mimeType: 'image/png' }),
    });
    // A 1x1 pixel has no events in it, so anything but a 5xx is the transport
    // working: the token verified, the image validated, the scanner answered.
    redeemed.status < 500
      ? ok('a redeem with a real link is accepted', String(redeemed.status))
      : fail('a redeem with a real link is accepted', String(redeemed.status));

    // The link is spent. A second redeem must lose, or a link sitting in a
    // chat transcript can be replayed until the day's budget is gone.
    const replayed = await fetch(`${APP}/api/mcp/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'redeem', token, imageBase64: PIXEL, mimeType: 'image/png' }),
    });
    check('the same link cannot be redeemed twice', 403, replayed.status);

    const forged = await fetch(`${APP}/api/mcp/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'redeem', token: 'forged.token', imageBase64: PIXEL, mimeType: 'image/png' }),
    });
    check('a forged upload token is refused', 403, forged.status);
  }
}

// 7c. Disconnecting ─────────────────────────────────────────────────────────
console.log('\n7c. disconnecting');
{
  // The token works right now - that was proved above. After disconnecting it
  // must stop, which is the whole claim the /mcp page makes.
  const before = await rpc('tools/call', { name: 'whoami', arguments: {} });
  before?.result?.structuredContent?.email
    ? ok('the connection works before disconnecting')
    : fail('the connection works before disconnecting', JSON.stringify(before).slice(0, 160));

  const disconnected = await fetch(`${APP}/api/mcp/disconnect`, {
    method: 'POST',
    headers: { cookie: `ee_session=${SESSION}` },
  });
  check('POST /api/mcp/disconnect', 200, disconnected.status);
  const { revoked } = await disconnected.json().catch(() => ({ revoked: 0 }));
  revoked > 0 ? ok('it revoked something', String(revoked)) : fail('it revoked something', String(revoked));

  const after = await fetch(`${MCP}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Origin: 'https://claude.ai',
      Authorization: `Bearer ${access}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 500, method: 'tools/list' }),
  });
  check('THE TOKEN STOPS WORKING', 401, after.status);

  const signedOut = await fetch(`${APP}/api/mcp/disconnect`, { method: 'POST' });
  check('a stranger cannot disconnect somebody', 401, signedOut.status);
}

// 8. A token from nowhere ────────────────────────────────────────────────────
console.log('\n8. an invented token');
{
  const response = await fetch(`${MCP}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Origin: 'https://claude.ai',
      Authorization: 'Bearer not-a-real-token',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list' }),
  });
  check('an invented bearer token is refused', 401, response.status);
}

console.log(failures ? `\nFAILED (${failures})` : '\nFULL CHAIN PASSED');
process.exit(failures ? 1 : 0);
