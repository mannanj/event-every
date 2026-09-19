import type { ParsedEvent } from '@/types/event';
import type { ExtractionContext } from '@/services/localModel/extraction';
import type { GpuSnapshot } from '@/services/localModel/gpuProbe';

export type WorkerRequest =
  | { readonly kind: 'load'; readonly modelId: string; readonly modelHost?: string; readonly wasmThreads?: number }
  | { readonly kind: 'scan'; readonly dataUrl: string; readonly context: ExtractionContext }
  | { readonly kind: 'stats' }
  | { readonly kind: 'dispose' };

export interface PassTimings {
  readonly totalMs: number;
  readonly prefillMs: number;
  readonly decodeMs: number;
  readonly tokens: number;
  readonly tokensPerSecond: number;
}

export interface ScanTimings {
  readonly readMs: number;
  readonly shapeMs: number;
  readonly totalMs: number;
  readonly read: PassTimings;
  readonly shape: PassTimings;
  readonly visualTokens: number;
}

// jsHeapBytes is Chrome-only; Safari reports null and the GPU counters carry the
// measurement there. Storage figures verify the download landed at the size the
// registry claims instead of taking the registry's word for it.
export interface MemorySnapshot {
  readonly jsHeapBytes: number | null;
  readonly storageUsageBytes: number | null;
  readonly storageQuotaBytes: number | null;
}

export interface ResourceReport {
  readonly gpu: GpuSnapshot;
  readonly memory: MemorySnapshot;
  readonly modelLoaded: boolean;
}

export type WorkerResponse =
  | { readonly kind: 'progress'; readonly file: string; readonly loaded: number; readonly total: number }
  | {
      readonly kind: 'ready';
      readonly modelId: string;
      readonly device: 'webgpu' | 'wasm';
      readonly resources: ResourceReport;
    }
  | {
      readonly kind: 'result';
      readonly description: string;
      readonly raw: string;
      readonly event: ParsedEvent | null;
      readonly reason: string | null;
      readonly timings: ScanTimings;
      readonly resources: ResourceReport;
    }
  | { readonly kind: 'stats'; readonly resources: ResourceReport }
  | { readonly kind: 'disposed'; readonly resources: ResourceReport }
  | { readonly kind: 'error'; readonly message: string };
