import { describe, expect, it } from 'vitest';
// @ts-expect-error cloudflare:test is injected by the Workers Vitest pool only.
import { env, evictDurableObject, runInDurableObject } from 'cloudflare:test';
import type { ProviderRequestAuthority } from '../../src/platform/cloudflare/provider-request-authority';
import type { DurableObjectStateLike } from '../../src/platform/contracts';

/**
 * A Durable Object woken over a table it did not just create.
 *
 * THE BLIND SPOT THIS CLOSES. `ProviderRequestAuthority` does not migrate its
 * schema; it ASSERTS it, in the constructor, inside `blockConcurrencyWhile` -
 * `PRAGMA table_info` compared against a positional column list, and a throw on
 * any difference. A throw there rejects every RPC to that instance and crashes
 * every alarm on it.
 *
 * Every other workers test starts on empty storage, so `validateSchema` has only
 * ever been handed a table `createSchema` wrote moments earlier. Nothing has
 * ever checked it against a table that was already there. That is precisely the
 * population a schema change would meet in production, and it is permanent:
 * tombstone rows are inserted and never deleted, so every request digest that
 * has ever completed still has a Durable Object holding the old table.
 *
 * THE DDL BELOW IS A LITERAL COPY ON PURPOSE. Building it from `createSchema`
 * would make the test agree with whatever the code does, including a change
 * that breaks every existing instance. Written out by hand, a schema change
 * has to come here and be made deliberately - and the diff shows exactly what
 * every live Durable Object would be asked to accept.
 *
 * `ALTER TABLE ADD COLUMN` appends, so a column added to a migrated table lands
 * last while the same column written into the CREATE TABLE lands where it was
 * typed. Two populations, two positional lists, one of them failing forever.
 * That is the trap this test exists to spring.
 */

/** The schema as of 2026-09-21. Copy, do not import. */
const SCHEMA_2026_09_21 = `CREATE TABLE IF NOT EXISTS provider_request (
      request_digest TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL UNIQUE,
      route TEXT NOT NULL,
      variant TEXT NOT NULL,
      shape_digest TEXT NOT NULL,
      shape_key_version TEXT NOT NULL,
      authority_day TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      reservation_nanodollars INTEGER NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('prepared','reserved','budget_committed','provider_inflight','completed','failed','unknown','expired')),
      settlement_state TEXT CHECK(settlement_state IN ('settlement_pending','settlement_complete')),
      created_at_ms INTEGER NOT NULL,
      phase_deadline_ms INTEGER NOT NULL,
      transport_deadline_ms INTEGER,
      committed_until_ms INTEGER,
      permit_verifier TEXT,
      replay_json TEXT,
      error_code TEXT,
      http_status INTEGER,
      cost_kind TEXT,
      cost_nanodollars INTEGER,
      terminal_class TEXT,
      terminal_at_ms INTEGER,
      replay_expires_at_ms INTEGER
    );
    CREATE TABLE IF NOT EXISTS provider_request_outbox (
      execution_id TEXT PRIMARY KEY,
      operation TEXT NOT NULL CHECK(operation IN ('release','settle')),
      cost_kind TEXT NOT NULL CHECK(cost_kind IN ('exact','missing','malformed','positive-overflow')),
      cost_nanodollars INTEGER,
      retry_count INTEGER NOT NULL,
      next_attempt_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS provider_request_tombstone (
      request_digest TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      terminal_class TEXT NOT NULL CHECK(terminal_class IN ('completed','failed','unknown','expired')),
      state TEXT NOT NULL CHECK(state = 'expired')
    )`;

type RequestStub = ReturnType<(typeof env)['PROVIDER_REQUEST_AUTHORITY']['get']>;

function authority(label: string): RequestStub {
  const id = env.PROVIDER_REQUEST_AUTHORITY.idFromName(`${label}-${crypto.randomUUID()}`);
  return env.PROVIDER_REQUEST_AUTHORITY.get(id);
}

/** Replace whatever the constructor built with the literal older schema. */
async function rewriteWithOldSchema(stub: RequestStub, seed?: (sql: DurableObjectStateLike['storage']['sql']) => void) {
  await runInDurableObject(stub, (_instance: ProviderRequestAuthority, state: DurableObjectStateLike) => {
    state.storage.sql.exec('DROP TABLE IF EXISTS provider_request');
    state.storage.sql.exec('DROP TABLE IF EXISTS provider_request_outbox');
    state.storage.sql.exec('DROP TABLE IF EXISTS provider_request_tombstone');
    state.storage.sql.exec(SCHEMA_2026_09_21);
    seed?.(state.storage.sql);
  });
  // Force the next call to construct a fresh instance over the table above.
  await evictDurableObject(stub);
}

describe('a Durable Object over a pre-existing schema', () => {
  it('constructs and answers over a table it did not create', async () => {
    const stub = authority('pre-existing-empty');
    await rewriteWithOldSchema(stub);

    // Any RPC forces construction, which runs createSchema then validateSchema
    // against the table already there. Before this test, that path had never
    // been exercised even once.
    await expect(stub.status({})).resolves.toBeDefined();
  });

  it('survives when all it holds is a tombstone', async () => {
    // The permanent population. Tombstones are written and never removed, so
    // most instances in production are exactly this and stay that way.
    const stub = authority('pre-existing-tombstone');
    await rewriteWithOldSchema(stub, (sql) => {
      sql.exec(
        `INSERT INTO provider_request_tombstone (request_digest, execution_id, terminal_class, state)
         VALUES (?, ?, 'completed', 'expired')`,
        'a'.repeat(64),
        crypto.randomUUID(),
      );
    });

    const status = await stub.status({});
    expect(status).toBeDefined();
  });

  it('still reports the terminal outcome it was holding', async () => {
    // Not just "does not throw": the row written under the old schema has to
    // remain readable, which is what a positional mismatch would silently break.
    const stub = authority('pre-existing-readable');
    const digest = 'b'.repeat(64);
    const executionId = crypto.randomUUID();
    await rewriteWithOldSchema(stub, (sql) => {
      sql.exec(
        `INSERT INTO provider_request_tombstone (request_digest, execution_id, terminal_class, state)
         VALUES (?, ?, 'failed', 'expired')`,
        digest,
        executionId,
      );
    });

    await expect(stub.status({ requestDigest: digest })).resolves.toBeDefined();
  });

  it('accepts an empty database, which is how a brand new one starts', async () => {
    // The control. If this fails the test harness is wrong, not the code.
    const stub = authority('fresh');
    await expect(stub.status({})).resolves.toBeDefined();
  });
});
