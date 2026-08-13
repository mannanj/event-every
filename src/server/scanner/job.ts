import {
  createOpenRouterTextLinkProvider,
  createOpenRouterVisionProvider,
  ProviderAdapterError,
  type OpenRouterTransport,
} from '@event-every/scanner/openrouter';
import type { CandidateIdFactory, SourceHandle } from '@event-every/scanner';
import type { ProviderBindingCandidate } from '@/platform/contracts';
import {
  runProviderOperation,
  type ProviderOperationDependencies,
  type ProviderOperationInput,
  type ProviderOperationResult,
} from '@/platform/cloudflare/provider-operation';
import { materializeScanReplay, toDurableScanReplay } from '@/platform/provider/replay';
import { createEventEveryOpenRouterTransport } from '@/server/scanner/transport';
import { scanSource, type HostScanJob } from '@/server/scanner/scan';
import { ScanResponseSchema, type ScanRequest, type ScanResponse } from '@/types/scannerHttp';

type E1SourceHandle = Readonly<{
  sourceId: string;
  kind: 'text' | 'image';
  contentHandle: string;
}>;

function isMatchingHandle(actual: SourceHandle, expected: E1SourceHandle): boolean {
  return actual.sourceId === expected.sourceId
    && actual.kind === expected.kind
    && actual.contentHandle === expected.contentHandle;
}

function scanJobWithTransport(
  request: ScanRequest,
  source: E1SourceHandle,
  transport: OpenRouterTransport,
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

export type CoordinatedScanResult =
  | Exclude<ProviderOperationResult, { status: 'completed' }>
  | Readonly<{
    status: 'completed';
    value: ScanResponse;
    settlement: 'settlement_pending' | 'settlement_complete';
  }>;

type CoordinatedScanInput = Readonly<{
  requestId: string;
  request: ScanRequest;
  source: E1SourceHandle;
  bindingCandidates: readonly ProviderBindingCandidate[];
  signal: AbortSignal;
  candidateIdFactory: CandidateIdFactory;
}>;

type CoordinatedScanDependencies = Readonly<{
  runOperation?: typeof runProviderOperation;
  operationDependencies?: Partial<ProviderOperationDependencies>;
}>;

export async function runCoordinatedScanJob(
  input: CoordinatedScanInput,
  dependencies: CoordinatedScanDependencies = {},
): Promise<CoordinatedScanResult> {
  const operation: ProviderOperationInput = {
    requestId: input.requestId,
    variant: input.request.kind === 'text' ? 'scan-text' : 'scan-image',
    bindingCandidates: input.bindingCandidates,
    signal: input.signal,
    execute: async (invoke) => {
      const result = await scanSource(
        scanJobWithTransport(input.request, input.source, createEventEveryOpenRouterTransport({ invoke })),
        { candidateIdFactory: input.candidateIdFactory },
      );
      return toDurableScanReplay({ source: input.source, ...result });
    },
  };
  const outcome = await (dependencies.runOperation ?? runProviderOperation)(
    operation,
    dependencies.operationDependencies,
  );
  if (outcome.status !== 'completed') return outcome;

  let materialized;
  try {
    materialized = ScanResponseSchema.parse(materializeScanReplay(
      outcome.replay as Parameters<typeof materializeScanReplay>[0],
    ));
  } catch {
    return { status: 'unavailable' };
  }
  if (materialized.source.kind !== input.source.kind) return { status: 'unavailable' };
  return {
    status: 'completed',
    value: materialized,
    settlement: outcome.settlement,
  };
}
