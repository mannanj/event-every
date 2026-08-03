import { describe, expect, it, vi } from 'vitest';

const { delegated } = vi.hoisted(() => ({ delegated: vi.fn() }));
vi.mock('../../.open-next/worker.js', () => ({
  default: { fetch: delegated },
}));

import worker from '../../cloudflare/app-worker';

describe('C1-A app Worker scaffold', () => {
  it('exposes only fetch and delegates the original request, environment, context, and exact response', async () => {
    const request = new Request('https://event-every.test/c1-a-delegation', { headers: { 'x-c1-a': 'request' } });
    const env = { C1_DEPLOYMENT_DISABLED: '1' };
    const ctx = { waitUntil: vi.fn() };
    const response = new Response('delegated exactly', { status: 209, headers: { 'x-c1-a': 'response' } });
    delegated.mockResolvedValueOnce(response);

    expect(Object.keys(worker)).toEqual(['fetch']);
    await expect(worker.fetch(request, env, ctx)).resolves.toBe(response);
    expect(delegated).toHaveBeenCalledTimes(1);
    expect(delegated).toHaveBeenCalledWith(request, env, ctx);
  });
});
