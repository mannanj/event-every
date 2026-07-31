import {
  createOpenRouterTextLinkProvider,
  createOpenRouterVisionProvider,
  ProviderAdapterError,
  type OpenRouterTransport,
} from '@event-every/scanner/openrouter';
import type { SourceHandle } from '@event-every/scanner';
import type { LlmCallAuth } from '@/lib/llm';
import { createEventEveryOpenRouterTransport } from '@/server/scanner/transport';
import type { HostScanJob } from '@/server/scanner/scan';
import type { ScanRequest } from '@/types/scannerHttp';

type E1SourceHandle = Extract<SourceHandle, { kind: 'text' | 'image' }>;

function isMatchingHandle(actual: SourceHandle, expected: E1SourceHandle): boolean {
  return actual.sourceId === expected.sourceId
    && actual.kind === expected.kind
    && actual.contentHandle === expected.contentHandle;
}

/** Builds the only resolver allowed to see raw request material. */
export function createScanJob(
  request: ScanRequest,
  source: E1SourceHandle,
  auth: LlmCallAuth,
  transport: OpenRouterTransport = createEventEveryOpenRouterTransport(auth),
): HostScanJob {
  if (request.kind === 'text') {
    return {
      kind: 'text',
      handle: source as Extract<SourceHandle, { kind: 'text' }>,
      provider: createOpenRouterTextLinkProvider({
        transport,
        resolve: async (handle) => {
          if (!isMatchingHandle(handle, source)) {
            throw new ProviderAdapterError({ code: 'source_identity_mismatch', retryable: false });
          }
          return { sourceId: source.sourceId, kind: 'text', text: request.text };
        },
      }),
    };
  }

  return {
    kind: 'image',
    handle: source as Extract<SourceHandle, { kind: 'image' }>,
    provider: createOpenRouterVisionProvider({
      transport,
      resolve: async (handle) => {
        if (!isMatchingHandle(handle, source)) {
          throw new ProviderAdapterError({ code: 'source_identity_mismatch', retryable: false });
        }
        return { sourceId: source.sourceId, kind: 'image', dataUrl: request.dataUrl };
      },
    }),
  };
}
