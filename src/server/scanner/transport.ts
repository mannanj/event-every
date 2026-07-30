import type { OpenRouterTransport } from '@event-every/scanner/openrouter';
import {
  CommunityLimitError,
  OpenRouterUpstreamError,
  openRouterChat,
  type LlmCallAuth,
} from '@/lib/llm';

export function createEventEveryOpenRouterTransport(
  auth: LlmCallAuth,
  call: typeof openRouterChat = openRouterChat,
): OpenRouterTransport {
  return {
    async complete(request) {
      try {
        const body = await call(request, auth);
        return { ok: true, body };
      } catch (error) {
        if (error instanceof CommunityLimitError) {
          return { ok: false, failure: 'http', status: 402, retryable: false };
        }
        if (error instanceof OpenRouterUpstreamError) {
          return {
            ok: false,
            failure: 'http',
            status: error.status,
            retryable: error.retryable,
          };
        }
        return { ok: false, failure: 'network', status: null, retryable: false };
      }
    },
  };
}
