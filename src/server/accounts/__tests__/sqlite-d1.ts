import { Database } from 'bun:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { D1AllResult, D1Like, D1Prepared, D1RunResult } from '@/server/accounts/d1';

/**
 * A D1 stand-in backed by real SQLite, for tests.
 *
 * Deliberately not a hand-written fake that returns canned rows. The things
 * worth catching here are SQL: an ON CONFLICT clause that updates the wrong
 * columns, a migration that adds a column the code does not bind, a WHERE that
 * forgets `account_id`. A mock agrees with whatever the code does and catches
 * none of them.
 *
 * It runs the actual files in migrations/accounts, in order, so a schema change
 * that the code has not caught up with fails here rather than in production.
 */

class Prepared implements D1Prepared {
  constructor(
    private readonly database: Database,
    private readonly sql: string,
    private readonly values: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]): D1Prepared {
    return new Prepared(this.database, this.sql, values);
  }

  private args(): unknown[] {
    // SQLite rejects a boolean and undefined; D1 coerces them, so this must too
    // or a test disagrees with production over a value nobody thought about.
    return this.values.map((value) => {
      if (typeof value === 'boolean') return value ? 1 : 0;
      if (value === undefined) return null;
      return value;
    });
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.database.query(this.sql).get(...(this.args() as never[]));
    return (row as T) ?? null;
  }

  async run(): Promise<D1RunResult> {
    const result = this.database.query(this.sql).run(...(this.args() as never[]));
    return { meta: { changes: Number(result.changes ?? 0) } };
  }

  async all<T = Record<string, unknown>>(): Promise<D1AllResult<T>> {
    return { results: this.database.query(this.sql).all(...(this.args() as never[])) as T[] };
  }
}

export interface TestDatabase extends D1Like {
  raw: Database;
}

export function migratedDatabase(root = 'migrations/accounts'): TestDatabase {
  const database = new Database(':memory:');
  database.exec('PRAGMA foreign_keys = ON');

  for (const name of readdirSync(root).sort()) {
    if (!name.endsWith('.sql')) continue;
    database.exec(readFileSync(join(root, name), 'utf8'));
  }

  return {
    raw: database,
    prepare: (sql: string) => new Prepared(database, sql),
    async batch(statements) {
      // D1 runs a batch in one implicit transaction. Doing the same means a
      // test sees all of a batch or none of it, as production does.
      database.exec('BEGIN');
      try {
        for (const statement of statements) await statement.run();
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
      return [];
    },
  };
}

/** An in-memory R2, narrowed to the bucket surface attachments.ts uses. */
export function memoryBucket() {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async put(key: string, value: ArrayBuffer | Uint8Array) {
      objects.set(key, value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value));
      return undefined;
    },
    async get(key: string) {
      const bytes = objects.get(key);
      if (!bytes) return null;
      return {
        async arrayBuffer() {
          return bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
        },
      };
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
    },
  };
}

export function kekBase64(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of raw) binary += String.fromCharCode(byte);
  return btoa(binary);
}
