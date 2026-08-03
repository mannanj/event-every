import { vi } from 'vitest';

const runtimeFetch = globalThis.fetch;
const runtimeFetchSpy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => runtimeFetch(input, init));
(globalThis as typeof globalThis & { __c1AWorkerRuntimeFetch: typeof runtimeFetchSpy }).__c1AWorkerRuntimeFetch = runtimeFetchSpy;

vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
  const requestUrl = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input);
  const hostname = new URL(requestUrl).hostname;
  if (!['127.0.0.1', '::1', '[::1]', 'localhost'].includes(hostname)) throw new Error('C1_A_WORKER_EGRESS_BLOCKED');
  return runtimeFetchSpy(input, init);
});
