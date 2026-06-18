// Shared in-memory fake for the Upstash Redis client, injected into budget.ts and
// ratelimit.ts through __setRedisClientForTests (see src/lib/redisClient.ts).
//
// This deliberately does NOT use mock.module(): a global module mock is applied via
// bun's separate mock registry and is sensitive to test load order, which differs
// Linux (CI) vs macOS (local) and produced CI-only failures. Explicit dependency
// injection of this plain object has no such fragility — it is the same object on
// every platform, configured per-test below.
import { mock } from 'bun:test';

// Defaults re-applied by resetRedisMock(). Union of every method the tested code
// touches: budget.ts uses get/incrbyfloat/expire; ratelimit.ts uses get/incr/expire.
// Signatures mirror the real call sites so `.mock.calls[i]` stays a typed tuple.
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
