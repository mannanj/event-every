// Characterization + correctness tests for the per-identifier rate limiter.
// plans/005 fixed the window/atomicity bugs the original quirk tests pinned; these
// now assert the corrected behavior. Fail-open is intentional and tested as spec.
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const redisMock = {
  get: mock((_key: string) => Promise.resolve<number | null>(0)),
  incr: mock((_key: string) => Promise.resolve<number>(1)),
  expire: mock((_key: string, _ttl: number) => Promise.resolve(1)),
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

const KEY_TTL_S = 26 * 60 * 60;
const DATE_SLICE = new Date().toISOString().slice(0, 10);

// The window now resets at a fixed daily boundary, so reset === next UTC midnight
// (epoch ms), computed here the same way the limiter does. Equal except across the
// sub-millisecond midnight rollover, which no tolerance could meaningfully cover.
function expectedReset(): number {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1);
}

beforeEach(() => {
  redisMock.get.mockReset();
  redisMock.incr.mockReset();
  redisMock.expire.mockReset();
  redisMock.get.mockImplementation(() => Promise.resolve(0));
  redisMock.incr.mockImplementation(() => Promise.resolve(1));
  redisMock.expire.mockImplementation(() => Promise.resolve(1));
  process.env.KV_REST_API_URL = 'https://test.invalid';
  process.env.KV_REST_API_TOKEN = 'test-token';
});

describe('checkRateLimit', () => {
  test('under the limit → success with the remaining count', async () => {
    redisMock.get.mockImplementation(() => Promise.resolve(5));
    const r = await checkRateLimit('ip-1');
    expect(r.success).toBe(true);
    expect(r.remaining).toBe(DAILY_LIMIT - 5);
    expect(r.reset).toBe(expectedReset());
    expect(r.reset).toBeGreaterThan(Date.now());
  });

  test('reads the UTC-date-scoped key', async () => {
    redisMock.get.mockImplementation(() => Promise.resolve(5));
    await checkRateLimit('ip-key');
    expect(redisMock.get).toHaveBeenCalledTimes(1);
    expect(redisMock.get.mock.calls[0][0]).toBe(`ratelimit:events:ip-key:${DATE_SLICE}`);
  });

  test('at the limit → failure, reset is the next UTC midnight (never a past TTL)', async () => {
    redisMock.get.mockImplementation(() => Promise.resolve(DAILY_LIMIT));
    const r = await checkRateLimit('ip-2');
    // plans/005: the window IS the UTC day, so reset is always the fixed future
    // boundary. The old TTL(-1/-2) → now+ttl*1000 → past-timestamp bug is gone.
    expect(r.success).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.error).toBe('Daily limit exceeded');
    expect(r.reset).toBe(expectedReset());
    expect(r.reset).toBeGreaterThan(Date.now());
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
  test('first increment of the day creates the key and sets a ~26h TTL', async () => {
    redisMock.incr.mockImplementation(() => Promise.resolve(1));
    const r = await incrementRateLimit('ip-6');
    expect(r.success).toBe(true);
    expect(r.remaining).toBe(DAILY_LIMIT - 1);
    expect(r.reset).toBe(expectedReset());
    expect(redisMock.incr).toHaveBeenCalledTimes(1);
    expect(redisMock.incr.mock.calls[0][0]).toBe(`ratelimit:events:ip-6:${DATE_SLICE}`);
    expect(redisMock.expire).toHaveBeenCalledTimes(1);
    expect(redisMock.expire.mock.calls[0]).toEqual([`ratelimit:events:ip-6:${DATE_SLICE}`, KEY_TTL_S]);
  });

  test('later increments do NOT reset the TTL (fixed window, not sliding)', async () => {
    // plans/005 fix (previously a pinned window bug): TTL is set once, on key
    // creation. An atomic incr returning anything but 1 means the key already
    // exists — so no expire call, and the window can no longer be pushed forward
    // on every request the way the old get→set(ex) idiom did.
    let n = 10;
    redisMock.incr.mockImplementation(() => Promise.resolve(++n)); // 11, 12, ...
    await incrementRateLimit('ip-7');
    await incrementRateLimit('ip-7');
    expect(redisMock.incr).toHaveBeenCalledTimes(2);
    expect(redisMock.expire).not.toHaveBeenCalled();
  });

  test('success holds through the limit and flips only once it is exceeded', async () => {
    // Preserves the `newCount <= DAILY_LIMIT` rule: the 1000th increment still
    // succeeds (remaining 0); only the 1001st is rejected.
    redisMock.incr.mockImplementation(() => Promise.resolve(DAILY_LIMIT));
    const atLimit = await incrementRateLimit('ip-9');
    expect(atLimit.success).toBe(true);
    expect(atLimit.remaining).toBe(0);

    redisMock.incr.mockImplementation(() => Promise.resolve(DAILY_LIMIT + 1));
    const over = await incrementRateLimit('ip-9');
    expect(over.success).toBe(false);
    expect(over.remaining).toBe(0);
  });

  test('fails open on a Redis error', async () => {
    redisMock.incr.mockImplementation(() => Promise.reject(new Error('boom')));
    const r = await incrementRateLimit('ip-8');
    expect(r.success).toBe(true);
  });
});
