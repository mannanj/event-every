import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { randomUUID } from 'node:crypto';

import { upsertAccount } from '@/server/accounts/auth';
import { migratedDatabase, type TestDatabase } from '@/server/accounts/__tests__/sqlite-d1';
import { linkedApps, linkedSecret, type LinkedCtx } from '../service';

/**
 * Event Every signed in to Calendar, through the service, against a REAL
 * migrated database and a stubbed fetch standing in for Calendar's OAuth server.
 */
const CAL = 'https://calendar-mcp.mannanteam.workers.dev';
const SECRET = 'test-secret';

const fake = { revoked: [] as string[], registered: [] as string[], issued: 0 };

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  if (url.pathname === '/.well-known/oauth-authorization-server') {
    return Response.json({
      issuer: CAL,
      authorization_endpoint: `${CAL}/authorize`,
      token_endpoint: `${CAL}/token`,
      registration_endpoint: `${CAL}/register`,
      revocation_endpoint: `${CAL}/token`,
    });
  }
  if (url.pathname === '/register') {
    fake.registered.push(JSON.parse(String(init?.body)).client_name);
    return Response.json({ client_id: `client-${randomUUID()}` }, { status: 201 });
  }
  if (url.pathname === '/token') {
    const body = new URLSearchParams(String(init?.body));
    if (body.get('token')) {
      fake.revoked.push(body.get('token')!);
      return new Response(null, { status: 200 });
    }
    fake.issued++;
    return Response.json({ access_token: `at-${fake.issued}`, refresh_token: `rt-${fake.issued}`, expires_in: 3600 });
  }
  return new Response('not found', { status: 404 });
}

let db: TestDatabase;
let me: LinkedCtx;
let other: LinkedCtx;
let fetchSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
  db = migratedDatabase();
  const a = await upsertAccount(db, 'a@example.com');
  const b = await upsertAccount(db, 'b@example.com');
  me = { db, accountId: a.id, secret: SECRET };
  other = { db, accountId: b.id, secret: SECRET };
  Object.assign(fake, { revoked: [], registered: [], issued: 0 });
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(fakeFetch as typeof fetch);
});
afterEach(() => fetchSpy.mockRestore());

async function begin(ctx = me) {
  const { location, cookie } = await linkedApps.start(ctx, 'calendar', {
    redirectUri: 'https://eventevery.com/api/linked-apps/callback',
    returnTo: '/linked-apps/done',
  });
  const state = new URL(location).searchParams.get('state')!;
  return {
    cookie,
    state,
    finish: (query: string, as = ctx) =>
      linkedApps.finish(as, { cookie, query: new URLSearchParams(query) }),
  };
}

const sealed = () => db.raw.query('SELECT tokens_sealed FROM linked_app').get() as { tokens_sealed: string | null } | null;

describe('signing in', () => {
  test('registers as "Event Every", lands the tokens sealed, and reports the link', async () => {
    const flow = await begin();
    expect(fake.registered).toEqual(['Event Every']);
    expect(await flow.finish(`code=c1&state=${flow.state}`)).toEqual({ ok: true, appId: 'calendar', returnTo: '/linked-apps/done' });
    const status = await linkedApps.status(me);
    expect(status).toHaveLength(1);
    expect(status[0]!.appId).toBe('calendar');
    // Sealed: the raw token is nowhere in the row.
    expect(sealed()!.tokens_sealed).not.toContain('at-1');
    // Scoped: nobody else is signed in.
    expect(await linkedApps.status(other)).toEqual([]);
  });

  test('refuses a forged state, and a callback for another person', async () => {
    const flow = await begin();
    expect(await flow.finish('code=c1&state=forged')).toMatchObject({ ok: false, reason: 'state' });
    expect(await flow.finish(`code=c1&state=${flow.state}`, other)).toMatchObject({ ok: false, reason: 'owner' });
    expect(await linkedApps.status(me)).toEqual([]);
    expect(await linkedApps.status(other)).toEqual([]);
  });

  test('a tampered flow cookie is no flow at all', async () => {
    const flow = await begin();
    const r = await linkedApps.finish(me, {
      cookie: flow.cookie.slice(0, -4) + 'AAAA',
      query: new URLSearchParams(`code=c1&state=${flow.state}`),
    });
    expect(r).toMatchObject({ ok: false, reason: 'state' });
  });

  test('a cancelled consent signs nobody in', async () => {
    const flow = await begin();
    expect(await flow.finish(`error=access_denied&state=${flow.state}`)).toMatchObject({ ok: false, reason: 'denied' });
    expect(await linkedApps.status(me)).toEqual([]);
  });
});

describe('signing out', () => {
  test('forgets here, revokes there, and signs in again on the same row', async () => {
    const flow = await begin();
    await flow.finish(`code=c&state=${flow.state}`);
    await linkedApps.signOut(me, 'calendar');
    expect(await linkedApps.status(me)).toEqual([]);
    expect(sealed()!.tokens_sealed).toBeNull();
    expect(fake.revoked).toEqual(['rt-1', 'at-1']);

    const again = await begin();
    await again.finish(`code=c&state=${again.state}`);
    expect(await linkedApps.status(me)).toHaveLength(1);
    expect(db.raw.query('SELECT COUNT(*) AS n FROM linked_app').get()).toEqual({ n: 1 });
  });

  test("signing out one person leaves another's sign-in alone", async () => {
    const a = await begin(me);
    await a.finish(`code=c&state=${a.state}`);
    const b = await begin(other);
    await b.finish(`code=c&state=${b.state}`);
    await linkedApps.signOut(me, 'calendar');
    expect(await linkedApps.status(other)).toHaveLength(1);
  });
});

describe('the sealing secret', () => {
  test('fails closed in production, and is a fixed key elsewhere', () => {
    expect(linkedSecret({}, 'production')).toBeNull();
    expect(linkedSecret({ LINKED_APPS_SECRET: 'real' }, 'production')).toBe('real');
    expect(linkedSecret({}, 'development')).toBe('dev-only-linked-apps-secret');
  });

  test('without a secret, signing in refuses to start', async () => {
    await expect(
      linkedApps.start({ ...me, secret: null }, 'calendar', { redirectUri: 'https://x/cb', returnTo: '/' }),
    ).rejects.toThrow(/LINKED_APPS_SECRET/);
  });
});
