import { describe, expect, test } from 'bun:test';
import { mapWithConcurrency } from '../concurrency';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe('mapWithConcurrency', () => {
  test('preserves order and never exceeds the limit', async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await tick();
      active -= 1;
      return n * 10;
    });
    expect(result).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(peak).toBe(3);
  });

  test('runs everything in parallel when the limit exceeds the item count', async () => {
    let peak = 0;
    let active = 0;
    await mapWithConcurrency(['a', 'b'], 8, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await tick();
      active -= 1;
    });
    expect(peak).toBe(2);
  });

  test('stops scheduling after a failure and rethrows the first error', async () => {
    const started: number[] = [];
    await expect(mapWithConcurrency([1, 2, 3, 4], 1, async (n) => {
      started.push(n);
      if (n === 2) throw new Error('boom');
      return n;
    })).rejects.toThrow('boom');
    expect(started).toEqual([1, 2]);
  });

  test('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });
});
