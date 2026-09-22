import { describe, expect, test } from 'bun:test';

import { signActor, signMcpGrant, verifyActor } from '@/server/mcp/grant';
import { HANDOFF_TTL_SECONDS, signHandoff, verifyHandoff } from '@/server/mcp/handoff';

const SECRET = 'test-grant-secret-not-used-anywhere-real';
const OTHER = 'a-different-secret-entirely';
const WHO = { sub: 'acct_1', email: 'ada@example.com' };

/**
 * The upload link is a capability that travels through a chat window.
 *
 * It ends up in somebody's message history, possibly on a shared screen, and
 * quite likely in a log. So the questions that matter are what it is NOT good
 * for, and how quickly it stops being good for anything.
 */

describe('the upload link', () => {
  test('names the account it was minted for', async () => {
    const token = await signHandoff(WHO, SECRET);
    const who = await verifyHandoff(token, SECRET);
    expect(who).toEqual({ sub: 'acct_1', email: 'ada@example.com' });
  });

  test('is not an actor token', async () => {
    // The one that matters most. An actor token reads and writes the account's
    // events; this permits one upload. A link pasted into a chat must not be
    // presentable as the other thing.
    const handoff = await signHandoff(WHO, SECRET);
    expect(await verifyActor(handoff, SECRET)).toBeNull();
  });

  test('an actor token is not an upload link', async () => {
    const actor = await signActor(WHO, SECRET);
    expect(await verifyHandoff(actor, SECRET)).toBeNull();
  });

  test('an identity grant is neither', async () => {
    const grant = await signMcpGrant({ ...WHO, state: 's' }, SECRET);
    expect(await verifyHandoff(grant, SECRET)).toBeNull();
  });

  test('is refused when signed by anything else', async () => {
    const forged = await signHandoff(WHO, OTHER);
    expect(await verifyHandoff(forged, SECRET)).toBeNull();
  });

  test('lasts fifteen minutes and not a second longer', async () => {
    const token = await signHandoff(WHO, SECRET);
    expect(HANDOFF_TTL_SECONDS).toBe(15 * 60);

    // Verified through the actor verifier, which is what handoff delegates to,
    // so the clock can be moved.
    const expired = await verifyActor(token, SECRET, {
      purpose: 'ee.mcp.handoff.v1',
      nowSeconds: Math.floor(Date.now() / 1000) + HANDOFF_TTL_SECONDS,
    });
    expect(expired).toBeNull();
  });

  test('two links for the same person differ', async () => {
    // So one is never a stable secret that can be reused later.
    expect(await signHandoff(WHO, SECRET)).not.toBe(await signHandoff(WHO, SECRET));
  });

  test('junk is nobody rather than a throw', async () => {
    for (const junk of ['', '.', 'nodot', 'a.', '.b']) {
      expect(await verifyHandoff(junk, SECRET)).toBeNull();
    }
  });

  test('the payload cannot be edited to name another account', async () => {
    const token = await signHandoff(WHO, SECRET);
    const signature = token.slice(token.lastIndexOf('.'));
    const forged =
      btoa(JSON.stringify({ sub: 'acct_2', email: 'bo@example.com', exp: 9_999_999_999, nonce: 'n', aud: 'ee.mcp.handoff.v1' }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '') + signature;
    expect(await verifyHandoff(forged, SECRET)).toBeNull();
  });
});
