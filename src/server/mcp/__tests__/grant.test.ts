import { describe, expect, test } from 'bun:test';

import {
  ACTOR_TTL_SECONDS,
  MCP_GRANT_TTL_SECONDS,
  signActor,
  signMcpGrant,
  signScanOnBehalf,
  verifyActor,
  verifyMcpGrant,
  verifyScanOnBehalf,
} from '@/server/mcp/grant';

const SECRET = 'test-grant-secret-not-used-anywhere-real';
const OTHER = 'a-different-secret-entirely';
const WHO = { sub: 'acct_1', email: 'ada@example.com' };

describe('the identity grant', () => {
  test('a freshly signed grant verifies against the state it was bound to', async () => {
    const grant = await signMcpGrant({ ...WHO, state: 'state-1' }, SECRET);
    const result = await verifyMcpGrant(grant, SECRET, { expectedState: 'state-1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe('acct_1');
      expect(result.payload.email).toBe('ada@example.com');
    }
  });

  test('a grant minted for one authorization cannot be replayed into another', async () => {
    const grant = await signMcpGrant({ ...WHO, state: 'state-1' }, SECRET);
    const result = await verifyMcpGrant(grant, SECRET, { expectedState: 'state-2' });
    expect(result).toEqual({ ok: false, reason: 'state_mismatch' });
  });

  test('a grant signed by anything else is refused', async () => {
    const grant = await signMcpGrant({ ...WHO, state: 'state-1' }, OTHER);
    const result = await verifyMcpGrant(grant, SECRET, { expectedState: 'state-1' });
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  test('the payload cannot be edited without breaking the signature', async () => {
    const grant = await signMcpGrant({ ...WHO, state: 'state-1' }, SECRET);
    const signature = grant.slice(grant.lastIndexOf('.'));
    const forged =
      btoa(JSON.stringify({ ...WHO, sub: 'acct_2', state: 'state-1', exp: 9_999_999_999, nonce: 'n' }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '') + signature;
    const result = await verifyMcpGrant(forged, SECRET, { expectedState: 'state-1' });
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  test('a grant is dead two minutes after it was minted', async () => {
    const grant = await signMcpGrant({ ...WHO, state: 'state-1' }, SECRET);
    const past = await verifyMcpGrant(grant, SECRET, {
      expectedState: 'state-1',
      nowSeconds: Math.floor(Date.now() / 1000) + MCP_GRANT_TTL_SECONDS,
    });
    expect(past).toEqual({ ok: false, reason: 'expired' });
  });

  test('nonsense is malformed rather than thrown', async () => {
    for (const junk of ['', '.', 'nodot', 'a.', '.b']) {
      const result = await verifyMcpGrant(junk, SECRET, { expectedState: 'state-1' });
      expect(result.ok).toBe(false);
    }
  });

  test('two grants for the same identity differ, so neither is a stable secret', async () => {
    const first = await signMcpGrant({ ...WHO, state: 'state-1' }, SECRET);
    const second = await signMcpGrant({ ...WHO, state: 'state-1' }, SECRET);
    expect(first).not.toBe(second);
  });
});

describe('the actor token', () => {
  test('carries the account a single call is for', async () => {
    const token = await signActor(WHO, SECRET);
    const payload = await verifyActor(token, SECRET);
    expect(payload?.sub).toBe('acct_1');
    expect(payload?.email).toBe('ada@example.com');
  });

  test('a token from an unknown signer is nobody', async () => {
    const token = await signActor(WHO, OTHER);
    expect(await verifyActor(token, SECRET)).toBeNull();
  });

  test('a token is dead a minute after it was minted', async () => {
    const token = await signActor(WHO, SECRET);
    const expired = await verifyActor(token, SECRET, {
      nowSeconds: Math.floor(Date.now() / 1000) + ACTOR_TTL_SECONDS,
    });
    expect(expired).toBeNull();
  });

  test('an identity grant is not an actor token, and vice versa', async () => {
    // The one that matters. Both are signed with the same secret, and a grant
    // travels as a query parameter - browser history, Referer, the Worker's
    // request log. If it also worked as a bearer token, scraping one out of a
    // URL would read the account's events for the rest of its two minutes.
    const grant = await signMcpGrant({ ...WHO, state: 'state-1' }, SECRET);
    expect(await verifyActor(grant, SECRET)).toBeNull();

    const actor = await signActor(WHO, SECRET);
    const asGrant = await verifyMcpGrant(actor, SECRET, { expectedState: 'state-1' });
    expect(asGrant).toEqual({ ok: false, reason: 'bad_signature' });
  });

  test('junk is nobody rather than a throw', async () => {
    for (const junk of ['', '.', 'nodot', 'a.', '.b']) {
      expect(await verifyActor(junk, SECRET)).toBeNull();
    }
  });
});

describe('the on-behalf scan token', () => {
  test('names the account it was signed for', async () => {
    const token = await signScanOnBehalf(WHO, SECRET);
    expect((await verifyScanOnBehalf(token, SECRET))?.sub).toBe('acct_1');
  });

  test('is refused under another secret', async () => {
    const token = await signScanOnBehalf(WHO, SECRET);
    expect(await verifyScanOnBehalf(token, OTHER)).toBeNull();
  });

  // Domain separation, both ways. An actor token the Worker hands a tool call
  // must not become a way to spend as someone at /api/scan, and this token
  // must not be usable as an actor on the MCP routes.
  test('an actor token is not an on-behalf token', async () => {
    const actor = await signActor(WHO, SECRET);
    expect(await verifyScanOnBehalf(actor, SECRET)).toBeNull();
  });

  test('an on-behalf token is not an actor token', async () => {
    const token = await signScanOnBehalf(WHO, SECRET);
    expect(await verifyActor(token, SECRET)).toBeNull();
  });
});
