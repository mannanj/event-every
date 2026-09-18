import { describe, expect, test } from 'bun:test';
import { processingQueue } from '../processingQueue';

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('processing queue', () => {
  test('runs one item at a time: the second waits for the first to finish', async () => {
    let releaseFirst!: () => void;
    const firstDone = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const order: string[] = [];

    processingQueue.add('text', 'first', async () => { order.push('first:start'); await firstDone; order.push('first:end'); return []; });
    processingQueue.add('text', 'second', async () => { order.push('second:start'); return []; });
    await settle();
    expect(order).toEqual(['first:start']);

    releaseFirst();
    await settle();
    await settle();
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });
});
