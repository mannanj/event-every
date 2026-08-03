import { describe, expect, it, vi } from 'vitest';

describe('C1-A Worker egress guard', () => {
  it('blocks a non-loopback fetch before the runtime fetch is called', async () => {
    await expect(fetch('https://example.invalid/c1-a-canary')).rejects.toThrow('C1_A_WORKER_EGRESS_BLOCKED');
    expect((globalThis as typeof globalThis & { __c1AWorkerRuntimeFetch: ReturnType<typeof vi.fn> }).__c1AWorkerRuntimeFetch).not.toHaveBeenCalled();
  });

  it('delegates an exact loopback target to the captured runtime fetch', async () => {
    const runtimeFetch = (globalThis as typeof globalThis & { __c1AWorkerRuntimeFetch: ReturnType<typeof vi.fn> }).__c1AWorkerRuntimeFetch;
    runtimeFetch.mockResolvedValueOnce(new Response('loopback'));
    await expect(fetch('http://127.0.0.1:8788/c1-a-loopback')).resolves.toMatchObject({ status: 200 });
    expect(runtimeFetch).toHaveBeenCalledWith('http://127.0.0.1:8788/c1-a-loopback', undefined);
  });
});
