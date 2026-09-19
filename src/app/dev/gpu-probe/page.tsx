'use client';

import { useCallback, useEffect, useState } from 'react';
import { createGpuTracker, formatBytes, type GpuSnapshot, type ProbeGpu } from '@/services/localModel/gpuProbe';

// Before a 1.4GB run is allowed to rest on these counters, the counters get
// checked against a device that allocates a known number of known-sized buffers
// in the browser the measurement will run in. Unit tests prove the arithmetic;
// this proves the wrapping survives a real WebGPU implementation.
const BUFFER_BYTES = 64 * 1024 * 1024;
const BUFFER_COUNT = 4;

// GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, spelled out because the
// project carries no WebGPU type package.
const STORAGE_USAGE = 0x0080 | 0x0008;

interface Check {
  readonly label: string;
  readonly expected: string;
  readonly actual: string;
  readonly ok: boolean;
}

interface Report {
  readonly supported: boolean;
  readonly message?: string;
  readonly afterAllocate?: GpuSnapshot;
  readonly afterDestroyBuffers?: GpuSnapshot;
  readonly afterDestroyDevice?: GpuSnapshot;
  readonly checks: readonly Check[];
}

interface MinimalBuffer {
  destroy?: () => void;
}

interface MinimalDevice {
  createBuffer(descriptor: { size: number; usage: number }): MinimalBuffer;
  destroy?: () => void;
}

function check(label: string, expected: number | string, actual: number | string): Check {
  return {
    label,
    expected: String(expected),
    actual: String(actual),
    ok: String(expected) === String(actual),
  };
}

async function runSelfTest(): Promise<Report> {
  const gpu = (navigator as unknown as { gpu?: ProbeGpu }).gpu;
  if (!gpu) {
    return { supported: false, message: 'navigator.gpu is undefined in this browser.', checks: [] };
  }

  const tracker = createGpuTracker();
  tracker.wrapGpu(gpu);

  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    return { supported: false, message: 'requestAdapter() returned null.', checks: [] };
  }
  const device = (await adapter.requestDevice()) as unknown as MinimalDevice;

  const buffers: MinimalBuffer[] = [];
  for (let index = 0; index < BUFFER_COUNT; index += 1) {
    buffers.push(device.createBuffer({ size: BUFFER_BYTES, usage: STORAGE_USAGE }));
  }
  const afterAllocate = tracker.snapshot();

  // Half are released explicitly. The rest stay live so the device-destroy path
  // is exercised on buffers that were never individually destroyed, which is
  // what teardown actually looks like.
  for (const buffer of buffers.slice(0, BUFFER_COUNT / 2)) buffer.destroy?.();
  const afterDestroyBuffers = tracker.snapshot();

  device.destroy?.();
  const afterDestroyDevice = tracker.snapshot();

  const expectedTotal = BUFFER_BYTES * BUFFER_COUNT;
  const checks: Check[] = [
    check('devices requested', 1, afterAllocate.devicesRequested),
    check('buffers counted on allocate', BUFFER_COUNT, afterAllocate.buffersCreated),
    check('bytes counted on allocate', formatBytes(expectedTotal), formatBytes(afterAllocate.liveBytes)),
    check('peak recorded', formatBytes(expectedTotal), formatBytes(afterAllocate.peakLiveBytes)),
    check('live buffers after explicit destroy', BUFFER_COUNT / 2, afterDestroyBuffers.liveBuffers),
    check(
      'live bytes after explicit destroy',
      formatBytes(expectedTotal / 2),
      formatBytes(afterDestroyBuffers.liveBytes),
    ),
    check('live buffers after device destroy', 0, afterDestroyDevice.liveBuffers),
    check('live bytes after device destroy', '0B', formatBytes(afterDestroyDevice.liveBytes)),
    check('devices destroyed', 1, afterDestroyDevice.devicesDestroyed),
    check('peak survives teardown', formatBytes(expectedTotal), formatBytes(afterDestroyDevice.peakLiveBytes)),
    check('no device lost', 'none', afterDestroyDevice.deviceLost ?? 'none'),
  ];

  return { supported: true, afterAllocate, afterDestroyBuffers, afterDestroyDevice, checks };
}

export default function GpuProbeSelfTestPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(() => {
    setRunning(true);
    void runSelfTest()
      .then(setReport)
      .catch((error: unknown) =>
        setReport({
          supported: false,
          message: error instanceof Error ? error.message : 'Self-test failed.',
          checks: [],
        }),
      )
      .finally(() => setRunning(false));
  }, []);

  const [collectUrl, setCollectUrl] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCollectUrl(params.get('collect'));
    if (params.get('auto') === '1') run();
  }, [run]);

  useEffect(() => {
    if (!report || !collectUrl) return;
    void fetch(collectUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ probeSelfTest: report, userAgent: navigator.userAgent }),
    });
  }, [report, collectUrl]);

  const failed = report?.checks.filter((entry) => !entry.ok) ?? [];

  return (
    <main className="min-h-screen bg-white p-8 text-black">
      <h1 className="text-xl font-bold">GPU probe self-test</h1>
      <p className="mt-1 text-sm text-gray-500">
        Checks the buffer accounting against a real WebGPU device. Allocates{' '}
        {formatBytes(BUFFER_BYTES * BUFFER_COUNT)} and frees all of it. No model is loaded.
      </p>

      <button
        type="button"
        className="mt-4 border border-black px-4 py-2 disabled:border-gray-300 disabled:text-gray-500"
        onClick={run}
        disabled={running}
      >
        {running ? 'Running' : 'Run self-test'}
      </button>

      {report && !report.supported && (
        <p className="mt-6 border border-black p-4 text-sm" role="alert">
          {report.message}
        </p>
      )}

      {report?.supported && (
        <section className="mt-6 border border-black p-4">
          <h2 className="font-bold" aria-live="polite">
            {failed.length === 0 ? `All ${report.checks.length} checks passed` : `${failed.length} checks failed`}
          </h2>
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1">Check</th>
                <th>Expected</th>
                <th>Actual</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {report.checks.map((entry) => (
                <tr key={entry.label} className="border-b border-gray-300">
                  <td className="py-1">{entry.label}</td>
                  <td>{entry.expected}</td>
                  <td>{entry.actual}</td>
                  <td>{entry.ok ? 'pass' : 'FAIL'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <pre className="mt-4 whitespace-pre-wrap border border-gray-300 p-2 text-xs">
            {JSON.stringify(
              {
                afterAllocate: report.afterAllocate,
                afterDestroyBuffers: report.afterDestroyBuffers,
                afterDestroyDevice: report.afterDestroyDevice,
              },
              null,
              2,
            )}
          </pre>
        </section>
      )}
    </main>
  );
}
