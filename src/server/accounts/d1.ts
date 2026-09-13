/**
 * The slice of D1 this code actually uses, declared structurally.
 *
 * `worker-configuration.d.ts` is excluded from the main tsc pass, so the global
 * `D1Database` is deliberately not in scope here — the same reason
 * `@/platform/cloudflare-context` describes Durable Objects with its own
 * `DurableNamespaceLike` rather than importing Workers types. Declaring only
 * what is called keeps the type check independent of a generated file, and
 * makes these modules trivially testable against a fake.
 */

export interface D1Meta {
  changes?: number;
}

export interface D1RunResult {
  meta: D1Meta;
}

export interface D1AllResult<T> {
  results?: T[];
}

export interface D1Prepared {
  bind(...values: readonly unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1RunResult>;
  all<T = Record<string, unknown>>(): Promise<D1AllResult<T>>;
}

export interface D1Like {
  prepare(sql: string): D1Prepared;
  batch(statements: readonly D1Prepared[]): Promise<unknown>;
}
