import { Redis } from '@upstash/redis';

// The subset of the Upstash Redis client this app actually calls. Centralizing
// construction behind one injectable seam is what makes budget.ts and ratelimit.ts
// testable WITHOUT globally mocking the '@upstash/redis' module. A global module
// mock (mock.module) lives in bun's separate mock registry and is sensitive to test
// load order, which differs Linux (CI) vs macOS (local) — that caused CI-only test
// failures. Plain module state injected through a normal import has no such fragility.
export interface RedisLike {
  get<T>(key: string): Promise<T | null>;
  incr(key: string): Promise<number>;
  incrbyfloat(key: string, amount: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

let testClient: RedisLike | null = null;

/** Test-only seam: inject a fake client, or pass null to restore real construction. */
export function __setRedisClientForTests(client: RedisLike | null): void {
  testClient = client;
}

export function getRedis(): RedisLike {
  if (testClient) return testClient;
  return new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  }) as unknown as RedisLike;
}
