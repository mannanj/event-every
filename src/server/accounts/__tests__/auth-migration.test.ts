import { describe, expect, test } from 'bun:test';

import { consumeLoginToken, createLoginToken } from '@/server/accounts/auth';

import { migratedDatabase } from './sqlite-d1';

/**
 * Signing in must survive a Worker that is newer than its database.
 *
 * Code and schema deploy separately. There is a window - however short, however
 * carefully the deploy is sequenced - where this Worker knows about
 * `login_token.mcp_state` and the production database has never heard of it.
 * Without a fallback, that window is a TOTAL SIGN-IN OUTAGE for every user,
 * caused by a column that only matters to a feature most people never touch.
 *
 * These tests run against a database migrated only as far as 0001, which is
 * exactly that state.
 */

/** The accounts schema before `mcp_state` existed. */
function preMigrationDatabase() {
  const db = migratedDatabase();
  db.raw.query('ALTER TABLE login_token DROP COLUMN mcp_state').run();
  return db;
}

describe('a Worker newer than its database', () => {
  test('an ordinary sign-in still works without the column', async () => {
    const db = preMigrationDatabase();
    const token = await createLoginToken(db, 'ada@example.com');
    expect(token).toBeTruthy();

    const spent = await consumeLoginToken(db, token);
    expect(spent?.email).toBe('ada@example.com');
    // No column, so nothing was remembered. That is the documented cost.
    expect(spent?.mcpState).toBeNull();
  });

  test('a link already in an inbox can still be spent', async () => {
    // The half that matters most: somebody who requested a link before the
    // deploy must not be stranded by it.
    const db = preMigrationDatabase();
    const token = await createLoginToken(db, 'bo@example.com');
    const spent = await consumeLoginToken(db, token);
    expect(spent?.email).toBe('bo@example.com');
  });

  test('a link is still single use without the column', async () => {
    const db = preMigrationDatabase();
    const token = await createLoginToken(db, 'ada@example.com');
    expect(await consumeLoginToken(db, token)).not.toBeNull();
    expect(await consumeLoginToken(db, token)).toBeNull();
  });

  test('an MCP sign-in fails loudly rather than silently losing the state', async () => {
    // The one case that must NOT degrade quietly. Somebody arriving from an
    // assistant's connect button would otherwise sign in and land on the home
    // page with the client still waiting, and nothing anywhere would say why.
    const db = preMigrationDatabase();
    await expect(createLoginToken(db, 'ada@example.com', 'state-1')).rejects.toThrow();
  });
});

describe('a Worker and database in step', () => {
  test('the state survives the round trip through the mailbox', async () => {
    const db = migratedDatabase();
    const token = await createLoginToken(db, 'ada@example.com', 'state-1');
    const spent = await consumeLoginToken(db, token);
    expect(spent?.mcpState).toBe('state-1');
  });

  test('an ordinary sign-in carries no state', async () => {
    const db = migratedDatabase();
    const token = await createLoginToken(db, 'ada@example.com');
    expect((await consumeLoginToken(db, token))?.mcpState).toBeNull();
  });
});
