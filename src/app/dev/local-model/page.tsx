'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocalModelSpike, type SpikeScan } from '@/hooks/useLocalModelSpike';
import { formatBytes } from '@/services/localModel/gpuProbe';
import { LOCAL_MODELS, DEFAULT_LOCAL_MODEL_ID, formatModelSize } from '@/services/localModel/registry';

const AUTO_ATTEMPT_KEY = 'local-model-spike:auto-attempts';

export default function LocalModelSpikePage() {
  const [modelId, setModelId] = useState(DEFAULT_LOCAL_MODEL_ID);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const {
    stage,
    loadedBytes,
    totalBytes,
    error,
    scan,
    device,
    resources,
    loadModel,
    runScan,
    unloadModel,
    refreshStats,
  } = useLocalModelSpike();

  // Read on the client only, after mount. Deriving these during render from
  // window makes the first client render disagree with the server one.
  const [params, setParams] = useState<URLSearchParams | null>(null);
  useEffect(() => setParams(new URLSearchParams(window.location.search)), []);
  const modelHost = params?.get('host') ?? undefined;
  const autoPoster = params?.get('poster') ?? undefined;
  const collectUrl = params?.get('collect') ?? undefined;
  const autoRun = params?.get('auto') === '1';
  const wasmThreads = params?.get('threads') ? Number(params.get('threads')) : undefined;
  // Repeating an identical scan is the only way to tell a leak from a peak: a
  // one-off high-water mark is fine, a figure that climbs run over run is not.
  const soak = Math.max(1, Number(params?.get('soak') ?? 1) || 1);
  const percent = totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Auto mode drives the whole run from query params so the harness can be
  // measured in a browser that cannot be remote-controlled. Refs guard against
  // React strict mode firing each effect twice in development.
  const loadStarted = useRef(false);
  const posterStarted = useRef(false);
  const startedRuns = useRef(0);
  const unloadStarted = useRef(false);
  const reported = useRef(false);
  const lastScan = useRef<SpikeScan | null>(null);
  const [runs, setRuns] = useState<SpikeScan[]>([]);

  // Safari reloads a tab whose WebContent process was killed, and an auto-run
  // page then loads 1.4GB of weights again, is killed again, and takes the
  // machine down with it. Observed: three loads in three minutes, system free
  // memory at zero. A run gets one attempt per tab.
  const [halted, setHalted] = useState(false);
  useEffect(() => {
    if (!autoRun || loadStarted.current) return;
    loadStarted.current = true;
    let attempts = 0;
    try {
      attempts = Number(sessionStorage.getItem(AUTO_ATTEMPT_KEY) ?? '0');
      sessionStorage.setItem(AUTO_ATTEMPT_KEY, String(attempts + 1));
    } catch {
      // Private browsing denies sessionStorage; one attempt is then the norm.
    }
    if (attempts > 0) {
      setHalted(true);
      return;
    }
    loadModel(modelId, modelHost, wasmThreads);
  }, [autoRun, loadModel, modelId, modelHost, wasmThreads]);

  useEffect(() => {
    if (!autoRun || halted || !autoPoster || posterStarted.current) return;
    posterStarted.current = true;
    void (async () => {
      const response = await fetch(autoPoster);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onload = () => setDataUrl(String(reader.result));
      reader.readAsDataURL(blob);
    })();
  }, [autoRun, halted, autoPoster]);

  useEffect(() => {
    if (!scan || scan === lastScan.current) return;
    lastScan.current = scan;
    setRuns((previous) => [...previous, scan]);
  }, [scan]);

  useEffect(() => {
    if (!autoRun || !dataUrl || stage !== 'ready') return;
    if (startedRuns.current >= soak) return;
    // Between posting a scan and the stage turning to 'scanning' this effect can
    // re-run; the count of finished runs is what says a slot is free.
    if (startedRuns.current !== runs.length) return;
    startedRuns.current += 1;
    runScan(dataUrl, timeZone);
  }, [autoRun, dataUrl, stage, runs.length, soak, runScan, timeZone]);

  // The measurement is not over when the last scan lands. Unloading and taking
  // one more reading is the part that says whether the weights were released.
  useEffect(() => {
    if (!autoRun || runs.length < soak || unloadStarted.current) return;
    unloadStarted.current = true;
    unloadModel();
  }, [autoRun, runs.length, soak, unloadModel]);

  useEffect(() => {
    if (!collectUrl || reported.current) return;
    const finished = autoRun ? runs.length >= soak && stage === 'idle' : Boolean(scan);
    if (!finished && !error) return;
    reported.current = true;
    void fetch(collectUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId,
        device,
        soak,
        runs: runs.map((run) => ({
          timings: run.timings,
          event: run.event,
          reason: run.reason,
          description: run.description,
          raw: run.raw,
          resources: run.resources,
        })),
        afterDispose: resources,
        error,
        userAgent: navigator.userAgent,
        timeZone,
      }),
    });
  }, [collectUrl, autoRun, runs, soak, stage, scan, error, modelId, device, resources, timeZone]);

  function onPick(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  const gpu = resources?.gpu;

  return (
    <main className="min-h-screen bg-white p-8 text-black">
      <h1 className="text-xl font-bold">Local model spike</h1>
      <p className="mt-1 text-sm text-gray-500">
        Stage 1 measurement harness for plans/016. Not user-facing.
      </p>

      <section className="mt-6 border border-black p-4">
        <label className="block text-sm font-bold" htmlFor="model">
          Model
        </label>
        <select
          id="model"
          className="mt-2 w-full border border-black bg-white p-2"
          value={modelId}
          onChange={(event) => setModelId(event.target.value)}
        >
          {LOCAL_MODELS.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label} ({formatModelSize(model.downloadBytes)}, {model.license}, {model.role})
            </option>
          ))}
        </select>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="border border-black px-4 py-2 disabled:border-gray-300 disabled:text-gray-500"
            onClick={() => loadModel(modelId, modelHost, wasmThreads)}
            disabled={stage === 'loading' || stage === 'scanning' || stage === 'unloading'}
          >
            {stage === 'loading' ? `Downloading ${percent}%` : 'Load model'}
          </button>
          <button
            type="button"
            className="border border-black px-4 py-2 disabled:border-gray-300 disabled:text-gray-500"
            onClick={unloadModel}
            disabled={!resources?.modelLoaded || stage === 'scanning' || stage === 'unloading'}
          >
            {stage === 'unloading' ? 'Unloading' : 'Unload model'}
          </button>
          <button
            type="button"
            className="border border-black px-4 py-2"
            onClick={refreshStats}
          >
            Refresh stats
          </button>
        </div>
        {stage === 'loading' && (
          <div className="mt-3 h-2 w-full border border-black" role="progressbar" aria-valuenow={percent}>
            <div className="h-full bg-black" style={{ width: `${percent}%` }} />
          </div>
        )}
        <p className="mt-2 text-sm" aria-live="polite">
          Stage: {stage}
          {device ? ` on ${device}` : ''}
          {modelHost ? ` (mirror: ${modelHost})` : ''}
          {soak > 1 ? ` (soak x${soak}, ${runs.length} done)` : ''}
          {stage === 'loading' && totalBytes > 0
            ? ` (${formatModelSize(loadedBytes)} of ${formatModelSize(totalBytes)})`
            : ''}
        </p>
      </section>

      <section className="mt-6 border border-black p-4">
        <h2 className="font-bold">Resources</h2>
        {!gpu?.instrumented && (
          <p className="mt-2 text-sm text-gray-500">
            No WebGPU device has been instrumented yet. Counters appear once the model loads.
          </p>
        )}
        {gpu?.instrumented && (
          <>
            <table className="mt-2 w-full border-collapse text-xs">
              <tbody>
                <tr className="border-b border-gray-300">
                  <td className="py-1">GPU buffers live / created / destroyed</td>
                  <td className="text-right">
                    {gpu.liveBuffers} / {gpu.buffersCreated} / {gpu.buffersDestroyed}
                  </td>
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="py-1">GPU bytes live</td>
                  <td className="text-right">{formatBytes(gpu.liveBytes)}</td>
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="py-1">GPU bytes peak</td>
                  <td className="text-right">{formatBytes(gpu.peakLiveBytes)}</td>
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="py-1">GPU bytes allocated in total</td>
                  <td className="text-right">{formatBytes(gpu.totalBytesAllocated)}</td>
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="py-1">Devices requested / destroyed</td>
                  <td className="text-right">
                    {gpu.devicesRequested} / {gpu.devicesDestroyed}
                  </td>
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="py-1">Model loaded</td>
                  <td className="text-right">{resources?.modelLoaded ? 'yes' : 'no'}</td>
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="py-1">Cache storage used</td>
                  <td className="text-right">
                    {resources?.memory.storageUsageBytes === null
                      ? 'not reported'
                      : formatBytes(resources?.memory.storageUsageBytes ?? 0)}
                  </td>
                </tr>
                {resources?.memory.jsHeapBytes !== null && (
                  <tr className="border-b border-gray-300">
                    <td className="py-1">JS heap</td>
                    <td className="text-right">{formatBytes(resources?.memory.jsHeapBytes ?? 0)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {gpu.deviceLost && (
              <p className="mt-2 text-sm" role="alert">
                GPU device lost: {gpu.deviceLost}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              A buffer is counted live until it is explicitly destroyed. WebGPU also frees
              buffers on garbage collection, so a residual figure is not by itself a leak;
              a figure that rises across identical scans is.
            </p>
          </>
        )}
      </section>

      <section className="mt-6 border border-black p-4">
        <label className="block text-sm font-bold" htmlFor="poster">
          Poster image
        </label>
        <input
          id="poster"
          type="file"
          accept="image/*"
          className="mt-2 block w-full text-sm"
          onChange={(event) => onPick(event.target.files?.[0])}
        />
        {dataUrl && (
          <img src={dataUrl} alt="Selected poster" className="mt-3 max-h-64 border border-black" />
        )}
        <button
          type="button"
          className="mt-3 border border-black px-4 py-2 disabled:border-gray-300 disabled:text-gray-500"
          onClick={() => dataUrl && runScan(dataUrl, timeZone)}
          disabled={!dataUrl || stage !== 'ready'}
        >
          {stage === 'scanning' ? 'Scanning' : 'Scan'}
        </button>
      </section>

      {halted && (
        <p className="mt-6 border border-black p-4 text-sm" role="alert">
          Auto-run halted. This tab has already started a run, so the reload was
          almost certainly a killed WebContent process. Open a fresh tab to try again.
        </p>
      )}

      {error && (
        <p className="mt-6 border border-black p-4 text-sm" role="alert">
          {error}
        </p>
      )}

      {runs.length > 0 && (
        <section className="mt-6 border border-black p-4">
          <h2 className="font-bold">Runs</h2>
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1">Run</th>
                <th>Read</th>
                <th>Shape</th>
                <th>Total</th>
                <th>GPU live after</th>
                <th>GPU peak</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run, index) => (
                <tr key={index} className="border-b border-gray-300">
                  <td className="py-1">{index + 1}</td>
                  <td>{(run.timings.readMs / 1000).toFixed(1)}s</td>
                  <td>{(run.timings.shapeMs / 1000).toFixed(1)}s</td>
                  <td>{(run.timings.totalMs / 1000).toFixed(1)}s</td>
                  <td>{formatBytes(run.resources.gpu.liveBytes)}</td>
                  <td>{formatBytes(run.resources.gpu.peakLiveBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {scan && (
        <section className="mt-6 border border-black p-4">
          <h2 className="font-bold">Last result</h2>
          <p className="mt-2 text-sm">
            Total <strong>{(scan.timings.totalMs / 1000).toFixed(1)}s</strong> over{' '}
            {scan.timings.visualTokens} prompt tokens
          </p>
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1">Pass</th>
                <th>Prefill</th>
                <th>Decode</th>
                <th>Tokens</th>
                <th>tok/s</th>
              </tr>
            </thead>
            <tbody>
              {([['read', scan.timings.read], ['shape', scan.timings.shape]] as const).map(
                ([name, pass]) => (
                  <tr key={name} className="border-b border-gray-300">
                    <td className="py-1">{name}</td>
                    <td>{(pass.prefillMs / 1000).toFixed(1)}s</td>
                    <td>{(pass.decodeMs / 1000).toFixed(1)}s</td>
                    <td>{pass.tokens}</td>
                    <td>{pass.tokensPerSecond.toFixed(1)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          <h3 className="mt-4 text-sm font-bold">Pass 1: free reading</h3>
          <pre className="mt-1 whitespace-pre-wrap border border-gray-300 p-2 text-xs">{scan.description}</pre>
          <h3 className="mt-4 text-sm font-bold">Pass 2: raw output</h3>
          <pre className="mt-1 whitespace-pre-wrap border border-gray-300 p-2 text-xs">{scan.raw}</pre>
          <h3 className="mt-4 text-sm font-bold">Parsed event</h3>
          <pre className="mt-1 whitespace-pre-wrap border border-gray-300 p-2 text-xs">
            {scan.event ? JSON.stringify(scan.event, null, 2) : `rejected: ${scan.reason}`}
          </pre>
        </section>
      )}
    </main>
  );
}
