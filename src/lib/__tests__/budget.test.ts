// Characterization tests for the community USD budget. The Redis SDK is mocked at the module
// boundary (the class constructor returns a shared stub). Fail-open behavior is INTENTIONAL
// (see budget.ts) and is tested as the spec, not a bug.
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const redisMock = {
  get: mock((_key: string) => Promise.resolve<number | string | null>(0)),
  incrbyfloat: mock((_key: string, _amount: number) => Promise.resolve(1)),
  expire: mock((_key: string, _seconds: number) => Promise.resolve(1)),
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
process.env.DAILY_BUDGET_USD = '5';

const { getBudgetStatus, recordCommunitySpend, DAILY_BUDGET_USD } = await import('@/lib/budget');

beforeEach(() => {
  redisMock.get.mockReset();
  redisMock.incrbyfloat.mockReset();
  redisMock.expire.mockReset();
  redisMock.get.mockImplementation(() => Promise.resolve(0));
  redisMock.incrbyfloat.mockImplementation(() => Promise.resolve(1));
  redisMock.expire.mockImplementation(() => Promise.resolve(1));
  process.env.KV_REST_API_URL = 'https://test.invalid';
  process.env.KV_REST_API_TOKEN = 'test-token';
});

describe('DAILY_BUDGET_USD', () => {
  test('is read from env at module load', () => {
    expect(DAILY_BUDGET_USD).toBe(5);
  });
});

describe('getBudgetStatus', () => {
  test('reports remaining when spend is below the limit', async () => {
    redisMock.get.mockImplementation(() => Promise.resolve(2));
    const s = await getBudgetStatus();
    expect(s.spentUsd).toBe(2);
    expect(s.remainingUsd).toBe(3);
    expect(s.exhausted).toBe(false);
    expect(s.limitUsd).toBe(5);
    expect(typeof s.resetAt).toBe('string');
  });

  test('parses a numeric string returned by Redis', async () => {
    redisMock.get.mockImplementation(() => Promise.resolve('2.5'));
    const s = await getBudgetStatus();
    expect(s.spentUsd).toBe(2.5);
    expect(s.remainingUsd).toBe(2.5);
  });

  test('marks exhausted at/above the limit and clamps remaining to 0', async () => {
    redisMock.get.mockImplementation(() => Promise.resolve(6));
    const s = await getBudgetStatus();
    expect(s.exhausted).toBe(true);
    expect(s.remainingUsd).toBe(0);
  });

  test('fails open (not exhausted) when Redis throws — by design', async () => {
    redisMock.get.mockImplementation(() => Promise.reject(new Error('redis down')));
    const s = await getBudgetStatus();
    expect(s.exhausted).toBe(false);
    expect(s.spentUsd).toBe(0);
    expect(s.remainingUsd).toBe(5);
  });

  test('fails open and skips Redis entirely when unconfigured', async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    const s = await getBudgetStatus();
    expect(s.exhausted).toBe(false);
    expect(redisMock.get).not.toHaveBeenCalled();
  });
});

describe('recordCommunitySpend', () => {
  test("increments today's UTC-day key by the cost and sets a TTL", async () => {
    await recordCommunitySpend(0.5);
    expect(redisMock.incrbyfloat).toHaveBeenCalledTimes(1);
    const [key, amount] = redisMock.incrbyfloat.mock.calls[0];
    expect(key).toMatch(/^budget:community:\d{4}-\d{2}-\d{2}$/);
    expect(amount).toBe(0.5);
    expect(redisMock.expire).toHaveBeenCalledTimes(1);
  });

  test('ignores non-positive or non-finite costs (no Redis calls)', async () => {
    await recordCommunitySpend(0);
    await recordCommunitySpend(-1);
    await recordCommunitySpend(NaN);
    expect(redisMock.incrbyfloat).not.toHaveBeenCalled();
    expect(redisMock.expire).not.toHaveBeenCalled();
  });
});
