// Shared, order-independent mock for @upstash/redis.
//
// Why this exists: `mock.module` in bun is GLOBAL for the whole test run, so two
// test files that each register their own `@upstash/redis` stub COLLIDE — whichever
// loads last wins, and load order differs across platforms (this caused CI-only
// failures on Linux where budget.test.ts saw ratelimit's stub). Registering one
// shared stub here, loaded via bunfig `[test].preload`, runs BEFORE any test or
// source module imports `@upstash/redis`, so every `new Redis()` returns this same
// object regardless of file order.
//
// This file is intentionally NOT a test (no test()/describe()): it is a preload.
import { mock } from 'bun:test';

// Default impls, re-applied by resetRedisMock(). The union of every method any
// test or source path touches: budget.ts uses get/incrbyfloat/expire;
// ratelimit.ts uses get/incr/expire. Param signatures mirror the real call sites
// so `.mock.calls[i]` stays a typed tuple (e.g. expire → [string, number]) for
// the assertions in ratelimit.test.ts.
const defaults = {
  get: (_key: string) => Promise.resolve<number | string | null>(0),
  incr: (_key: string) => Promise.resolve<number>(1),
  incrbyfloat: (_key: string, _amount: number) => Promise.resolve(1),
  expire: (_key: string, _seconds: number) => Promise.resolve(1),
};

export const redisMock = {
  get: mock(defaults.get),
  incr: mock(defaults.incr),
  incrbyfloat: mock(defaults.incrbyfloat),
  expire: mock(defaults.expire),
};

mock.module('@upstash/redis', () => ({
  Redis: class {
    constructor() {
      return redisMock;
    }
  },
}));

// Resets call history AND restores default impls, so each test starts clean.
export function resetRedisMock() {
  redisMock.get.mockReset();
  redisMock.incr.mockReset();
  redisMock.incrbyfloat.mockReset();
  redisMock.expire.mockReset();
  redisMock.get.mockImplementation(defaults.get);
  redisMock.incr.mockImplementation(defaults.incr);
  redisMock.incrbyfloat.mockImplementation(defaults.incrbyfloat);
  redisMock.expire.mockImplementation(defaults.expire);
}
