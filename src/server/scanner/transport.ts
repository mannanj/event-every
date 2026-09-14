import type { OpenRouterTransport } from '@event-every/scanner/openrouter';
import type { ProviderInvocation } from '@/platform/provider/transport';

/** Adapts the vendored Scanner port to the coordinator's one permitted invocation. */
export function createEventEveryOpenRouterTransport(
  input: Readonly<{ invoke: ProviderInvocation; signal?: AbortSignal }>,
): OpenRouterTransport {
  return {
    async complete(request) {
      let result;
      try {
        result = await input.invoke(request);
      } catch {
        return { ok: false, failure: 'network', status: null, retryable: false };
      }
      if (result.status === 'success') return { ok: true, body: result.value };
      if (result.status === 'unknown') {
        return { ok: false, failure: 'network', status: null, retryable: false };
      }
      const status = result.providerStatus ?? null;
      return {
        ok: false,
        failure: 'http',
        status,
        retryable: status === 408 || status === 429 || (status !== null && status >= 500),
      };
    },
  };
}
