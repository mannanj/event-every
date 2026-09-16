import type { OpenRouterTransport } from '@event-every/scanner/openrouter';
import type { ProviderInvocation } from '@/platform/provider/transport';
import { buildScanContextMessage, type ScanContext } from '@/server/scanner/scanContext';

/**
 * The Scanner builds `[system, user]`. The host context goes between them: after
 * the extraction contract, so it cannot be mistaken for it, and before the
 * source, so the model reads it as the frame rather than as content to extract.
 */
function withScanContext(
  request: Readonly<{ messages: readonly unknown[] }>,
  context: ScanContext | undefined,
): typeof request {
  if (!context) return request;
  const [system, ...rest] = request.messages;
  if (system === undefined) return request;
  return {
    ...request,
    messages: [system, { role: 'system', content: buildScanContextMessage(context) }, ...rest],
  };
}

/** Adapts the vendored Scanner port to the coordinator's one permitted invocation. */
export function createEventEveryOpenRouterTransport(
  input: Readonly<{ invoke: ProviderInvocation; signal?: AbortSignal; context?: ScanContext }>,
): OpenRouterTransport {
  return {
    async complete(request) {
      let result;
      try {
        result = await input.invoke(withScanContext(request, input.context) as typeof request);
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
