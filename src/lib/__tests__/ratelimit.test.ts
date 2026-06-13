// Characterization tests for the per-identifier rate limiter. Two assertions pin the window
// bugs that plans/005 will fix (tagged KNOWN QUIRK). Fail-open is intentional and tested as spec.
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const redisMock = {
  get: mock((_key: string) => Promise.resolve<number | null>(0)),
  ttl: mock((_key: string) => Promise.resolve(3600)),
  set: mock((_key: string, _value: number, _opts?: { ex: number }) => Promise.resolve('OK')),
};

mock.module('@upstash/redis', () => ({
  Redis: class {
    constructor() {
      return redisMock;
    }
  },
}));

process.env.KV_REST_API_URL = 'https://test.invalid';
process.env.KV_REST_API_TOKEN = 'test-token';

const { checkRateLimit, incrementRateLimit, DAILY_LIMIT } = await import('@/lib/ratelimit');

const WINDOW_MS = 24 * 60 * 60 * 1000;
const WINDOW_S = 24 * 60 * 60;

beforeEach(() => {
  redisMock.get.mockReset();
  redisMock.ttl.mockReset();
  redisMock.set.mockReset();
  redisMock.get.mockImplementation(() => Promise.resolve(0));
  redisMock.ttl.mockImplementation(() => Promise.resolve(3600));
  redisMock.set.mockImplementation(() => Promise.resolve('OK'));
  process.env.KV_REST_API_URL = 'https://test.invalid';
  process.env.KV_REST_API_TOKEN = 'test-token';
});

describe('checkRateLimit', () => {
  test('under the limit → success with the remaining count', async () => {
    redisMock.get.mockImplementation(() => Promise.resolve(5));
    const before = Date.now();
    const r = await checkRateLimit('ip-1');
    expect(r.success).toBe(true);
    expect(r.remaining).toBe(DAILY_LIMIT - 5);
    expect(r.reset).toBeGreaterThanOrEqual(before + WINDOW_MS - 2000);
    expect(r.reset).toBeLessThanOrEqual(Date.now() + WINDOW_MS + 2000);
  });

  test('at the limit → failure, reset derived from the key TTL', async () => {
    redisMock.get.mockImplementation(() => Promise.resolve(DAILY_LIMIT));
    redisMock.ttl.mockImplementation(() => Promise.resolve(3600));
    const before = Date.now();
    const r = await checkRateLimit('ip-2');
    expect(r.success).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.error).toBe('Daily limit exceeded');
    expect(r.reset).toBeGreaterThanOrEqual(before + 3600 * 1000 - 2000);
    expect(r.reset).toBeLessThanOrEqual(Date.now() + 3600 * 1000 + 2000);
  });

  test('a negative TTL produces a reset timestamp in the PAST', async () => {
    redisMock.get.mockImplementation(() => Promise.resolve(DAILY_LIMIT));
    redisMock.ttl.mockImplementation(() => Promise.resolve(-1));
    const r = await checkRateLimit('ip-3');
    // KNOWN QUIRK (plans/005): when the key has no TTL (-1) or is missing (-2), reset is
    // computed as now + ttl*1000 → a timestamp in the past. plans/005 fixes this with a
    // fixed UTC-day window.
    expect(r.reset).toBeLessThan(Date.now());
  });

  test('fails open (success) when Redis throws — by design', async () => {
    redisMock.get.mockImplementation(() => Promise.reject(new Error('redis down')));
    const r = await checkRateLimit('ip-4');
    expect(r.success).toBe(true);
    expect(r.remaining).toBe(DAILY_LIMIT);
  });

  test('fails open and skips Redis when unconfigured', async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    const r = await checkRateLimit('ip-5');
    expect(r.success).toBe(true);
    expect(r.remaining).toBe(DAILY_LIMIT);
    expect(redisMock.get).not.toHaveBeenCalled();
  });
});

describe('incrementRateLimit', () => {
  test('increments the counter and writes it with a TTL', async () => {
    redisMock.get.mockImplementation(() => Promise.resolve(5));
    const r = await incrementRateLimit('ip-6');
    expect(r.success).toBe(true);
    expect(r.remaining).toBe(DAILY_LIMIT - 6);
    expect(redisMock.set).toHaveBeenCalledTimes(1);
    const [key, value, opts] = redisMock.set.mock.calls[0];
    expect(key).toBe('ratelimit:events:ip-6');
    expect(value).toBe(6);
    expect(opts).toEqual({ ex: WINDOW_S });
  });

  test('resets the TTL on EVERY increment (a sliding window that never resets)', async () => {
    redisMock.get.mockImplementation(() => Promise.resolve(10));
    await incrementRateLimit('ip-7');
    await incrementRateLimit('ip-7');
    // KNOWN QUIRK (plans/005): each increment does get → set(key, n, { ex: 86400 }), so the 24h
    // TTL is pushed forward on every call — under steady use the window never expires.
    expect(redisMock.set).toHaveBeenCalledTimes(2);
    expect(redisMock.set.mock.calls[0][2]).toEqual({ ex: WINDOW_S });
    expect(redisMock.set.mock.calls[1][2]).toEqual({ ex: WINDOW_S });
  });

  test('fails open on a Redis error', async () => {
    redisMock.get.mockImplementation(() => Promise.reject(new Error('boom')));
    const r = await incrementRateLimit('ip-8');
    expect(r.success).toBe(true);
  });
});
