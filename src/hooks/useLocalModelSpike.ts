'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParsedEvent } from '@/types/event';
import type { ResourceReport, ScanTimings, WorkerResponse } from '@/services/localModel/protocol';

export type SpikeStage = 'idle' | 'loading' | 'ready' | 'scanning' | 'unloading' | 'failed';

export interface SpikeScan {
  readonly description: string;
  readonly raw: string;
  readonly event: ParsedEvent | null;
  readonly reason: string | null;
  readonly timings: ScanTimings;
  readonly resources: ResourceReport;
}

export interface SpikeState {
  readonly stage: SpikeStage;
  readonly loadedBytes: number;
  readonly totalBytes: number;
  readonly error: string | null;
  readonly scan: SpikeScan | null;
  readonly device: 'webgpu' | 'wasm' | null;
  readonly resources: ResourceReport | null;
  readonly loadModel: (modelId: string, modelHost?: string, wasmThreads?: number) => void;
  readonly runScan: (dataUrl: string, timeZone: string) => void;
  readonly unloadModel: () => void;
  readonly refreshStats: () => void;
}

// Terminating a worker mid-session leaves onnxruntime's sessions unreleased and
// the GPU device to be reclaimed by teardown, which is the browser's business
// and not observable from here. Asking the worker to dispose first makes the
// release explicit and, because it answers with its counters, checkable.
const DISPOSE_GRACE_MS = 2000;

function disposeThenTerminate(worker: Worker): void {
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    worker.terminate();
  };
  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    if (event.data?.kind === 'disposed') finish();
  });
  try {
    worker.postMessage({ kind: 'dispose' });
  } catch {
    finish();
    return;
  }
  setTimeout(finish, DISPOSE_GRACE_MS);
}

export function useLocalModelSpike(): SpikeState {
  const workerRef = useRef<Worker | null>(null);
  const [stage, setStage] = useState<SpikeStage>('idle');
  const [files, setFiles] = useState<Record<string, { loaded: number; total: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<SpikeScan | null>(null);
  const [device, setDevice] = useState<'webgpu' | 'wasm' | null>(null);
  const [resources, setResources] = useState<ResourceReport | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../services/localModel/scanWorker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.kind === 'progress') {
        setFiles((previous) => ({
          ...previous,
          [message.file]: { loaded: message.loaded, total: message.total },
        }));
      }
      if (message.kind === 'ready') {
        setDevice(message.device);
        setResources(message.resources);
        setStage('ready');
      }
      if (message.kind === 'result') {
        setScan(message);
        setResources(message.resources);
        setStage('ready');
      }
      if (message.kind === 'stats') {
        setResources(message.resources);
      }
      if (message.kind === 'disposed') {
        setResources(message.resources);
        setDevice(null);
        setStage('idle');
      }
      if (message.kind === 'error') {
        setError(message.message);
        setStage('failed');
      }
    };
    // Without this an OOM-killed worker leaves the UI on 'scanning' forever.
    worker.onerror = (event) => {
      setError(event.message || 'The model worker stopped unexpectedly.');
      setStage('failed');
    };
    workerRef.current = worker;

    // A reload or tab close gets the same explicit release as an unmount. This
    // matters most to the measurement runner, which reopens the page per run.
    const onPageHide = () => {
      try {
        worker.postMessage({ kind: 'dispose' });
      } catch {
        // The worker is already gone; nothing left to release.
      }
    };
    self.addEventListener('pagehide', onPageHide);

    return () => {
      self.removeEventListener('pagehide', onPageHide);
      workerRef.current = null;
      disposeThenTerminate(worker);
    };
  }, []);

  const loadModel = useCallback((modelId: string, modelHost?: string, wasmThreads?: number) => {
    setError(null);
    setFiles({});
    setStage('loading');
    workerRef.current?.postMessage({ kind: 'load', modelId, modelHost, wasmThreads });
  }, []);

  const runScan = useCallback((dataUrl: string, timeZone: string) => {
    setError(null);
    setScan(null);
    setStage('scanning');
    workerRef.current?.postMessage({
      kind: 'scan',
      dataUrl,
      context: { nowISO: new Date().toISOString(), timeZone },
    });
  }, []);

  const unloadModel = useCallback(() => {
    setStage('unloading');
    workerRef.current?.postMessage({ kind: 'dispose' });
  }, []);

  const refreshStats = useCallback(() => {
    workerRef.current?.postMessage({ kind: 'stats' });
  }, []);

  const totals = Object.values(files);
  return {
    stage,
    loadedBytes: totals.reduce((sum, file) => sum + file.loaded, 0),
    totalBytes: totals.reduce((sum, file) => sum + file.total, 0),
    error,
    scan,
    device,
    resources,
    loadModel,
    runScan,
    unloadModel,
    refreshStats,
  };
}
