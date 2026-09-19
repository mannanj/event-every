/// <reference lib="webworker" />
import {
  AutoModelForImageTextToText,
  AutoProcessor,
  RawImage,
  TextStreamer,
  env,
  type Tensor,
} from '@huggingface/transformers';
import { findLocalModel } from '@/services/localModel/registry';
import { gpuSnapshot, installGpuProbe } from '@/services/localModel/gpuProbe';
import {
  READ_PROMPT,
  buildShapePrompt,
  parseShapedOutput,
  type ExtractionContext,
} from '@/services/localModel/extraction';
import type {
  MemorySnapshot,
  PassTimings,
  ResourceReport,
  WorkerRequest,
  WorkerResponse,
} from '@/services/localModel/protocol';

// Must run before onnxruntime requests its adapter, which it does lazily on the
// first session. Importing this module is the only chance to get in front of it.
installGpuProbe();

// A phone photo is ~12MP, and this repo's preprocessor_config.json caps at
// 16.7MP, so a full-size photo becomes ~11,900 visual tokens. Capping at 1MP
// costs nothing on poster-sized input and avoids that cliff.
const MAX_PIXELS = 1_000_000;

type Processor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
type Model = Awaited<ReturnType<typeof AutoModelForImageTextToText.from_pretrained>>;

let processor: Processor | null = null;
let model: Model | null = null;

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

async function memorySnapshot(): Promise<MemorySnapshot> {
  const withMemory = performance as unknown as { memory?: { usedJSHeapSize?: number } };
  let storageUsageBytes: number | null = null;
  let storageQuotaBytes: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    storageUsageBytes = estimate?.usage ?? null;
    storageQuotaBytes = estimate?.quota ?? null;
  } catch {
    // Storage estimation is optional; its absence must not fail a scan.
  }
  return {
    jsHeapBytes: withMemory.memory?.usedJSHeapSize ?? null,
    storageUsageBytes,
    storageQuotaBytes,
  };
}

async function resourceReport(): Promise<ResourceReport> {
  return { gpu: gpuSnapshot(), memory: await memorySnapshot(), modelLoaded: model !== null };
}

// Releases every ONNX session the model holds. Without it the sessions and their
// GPU buffers outlive the model reference, and nothing in the page can reach them
// to free them afterwards.
async function disposeModel(): Promise<void> {
  const current = model;
  model = null;
  processor = null;
  if (current) await current.dispose();
}

async function load(modelId: string, modelHost?: string, wasmThreads?: number): Promise<void> {
  const spec = findLocalModel(modelId);
  if (!spec) throw new Error(`Unknown model: ${modelId}`);

  // A local mirror keeps the measurement harness from re-fetching 1.4GB on every
  // run. Weights are identical either way; only the origin changes.
  if (modelHost) {
    env.remoteHost = modelHost.endsWith('/') ? modelHost : `${modelHost}/`;
    env.remotePathTemplate = '{model}/';
  }

  // Diagnostic lever: if forcing single-threaded WASM changes timings, the CPU
  // execution provider is doing work we believe is on the GPU.
  if (wasmThreads && env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.numThreads = wasmThreads;
  }

  const progress_callback = (report: Record<string, unknown>): void => {
    if (report.status !== 'progress') return;
    post({
      kind: 'progress',
      file: String(report.file ?? ''),
      loaded: Number(report.loaded ?? 0),
      total: Number(report.total ?? 0),
    });
  };

  // WebGPU is the only backend fast enough to ship (5-15s vs 30-90s on CPU),
  // but falling back keeps the harness measurable in browsers without it.
  const device = 'gpu' in navigator ? 'webgpu' : 'wasm';

  // Reloading without disposing strands the previous 1.4GB of sessions. Reachable
  // from the UI: any error re-enables the Load button.
  await disposeModel();

  processor = await AutoProcessor.from_pretrained(spec.repo, { progress_callback });
  const imageProcessor = (processor as unknown as { image_processor?: { max_pixels?: number } })
    .image_processor;
  if (imageProcessor) imageProcessor.max_pixels = MAX_PIXELS;

  model = await AutoModelForImageTextToText.from_pretrained(spec.repo, {
    dtype: spec.dtype,
    device,
    progress_callback,
  });
  post({ kind: 'ready', modelId, device, resources: await resourceReport() });
}

interface ChatPart {
  type: 'image' | 'text';
  text?: string;
}

interface Disposable {
  dispose?: () => void;
}

// transformers.js disposes the KV cache and its own GPU outputs at the end of
// generate, but nothing owns the tensors we hand in or get back. On CPU tensors
// dispose only drops the backing array; on GPU-located ones it frees the buffer.
function release(...items: (Disposable | Record<string, unknown> | null | undefined)[]): void {
  for (const item of items) {
    if (!item) continue;
    const single = item as Disposable;
    if (typeof single.dispose === 'function') {
      try {
        single.dispose();
      } catch {
        // A tensor mid-download refuses disposal; it is freed with the session.
      }
      continue;
    }
    for (const value of Object.values(item as Record<string, unknown>)) {
      release(value as Disposable);
    }
  }
}

// Qwen-VL derives its rotary position embeddings from the image grid, so a
// text-only turn against this model produces degenerate output ("{{{{{"). Both
// passes therefore keep the image in context, even though pass 2 only reasons
// over pass 1's prose.
async function generate(
  parts: ChatPart[],
  image: RawImage,
  maxNewTokens: number,
): Promise<{ text: string; timings: PassTimings; promptTokens: number }> {
  if (!processor || !model) throw new Error('Model is not loaded.');

  const templated = processor.apply_chat_template([{ role: 'user', content: parts }], {
    add_generation_prompt: true,
  });
  const inputs = await processor(templated, image);
  const promptTokens = inputs.input_ids.dims.at(-1) as number;

  // Time to the first token is prefill (vision encode + prompt). Everything
  // after it is decode. Without this split there is no way to tell whether the
  // cost is the image or the token budget.
  const started = performance.now();
  let firstTokenAt: number | null = null;
  let tokens = 0;
  const streamer = new TextStreamer(processor.tokenizer!, {
    skip_prompt: true,
    // Without an explicit sink TextStreamer falls back to process.stdout, which
    // does not exist in a worker.
    callback_function: () => undefined,
    token_callback_function: () => {
      if (firstTokenAt === null) firstTokenAt = performance.now();
      tokens += 1;
    },
  });

  let output: Tensor | null = null;
  let trimmed: Tensor | null = null;
  try {
    output = (await model.generate({
      ...inputs,
      max_new_tokens: maxNewTokens,
      do_sample: false,
      streamer,
    })) as Tensor;

    const finished = performance.now();
    const prefillMs = (firstTokenAt ?? finished) - started;
    const decodeMs = finished - (firstTokenAt ?? finished);
    trimmed = output.slice(null, [promptTokens, output.dims.at(-1) as number]);
    const [decoded] = processor.batch_decode(trimmed, { skip_special_tokens: true });

    return {
      text: decoded.trim(),
      promptTokens,
      timings: {
        totalMs: finished - started,
        prefillMs,
        decodeMs,
        tokens,
        tokensPerSecond: decodeMs > 0 ? (tokens / decodeMs) * 1000 : 0,
      },
    };
  } finally {
    release(inputs, output, trimmed);
  }
}

async function scan(dataUrl: string, context: ExtractionContext): Promise<void> {
  const image = await RawImage.fromURL(dataUrl);

  const read = await generate([{ type: 'image' }, { type: 'text', text: READ_PROMPT }], image, 192);
  const shape = await generate(
    [{ type: 'image' }, { type: 'text', text: buildShapePrompt(read.text, context) }],
    image,
    160,
  );

  const result = parseShapedOutput(shape.text, context);
  post({
    kind: 'result',
    description: read.text,
    raw: shape.text,
    event: result.ok ? result.event : null,
    reason: result.ok ? null : result.reason,
    timings: {
      readMs: read.timings.totalMs,
      shapeMs: shape.timings.totalMs,
      totalMs: read.timings.totalMs + shape.timings.totalMs,
      read: read.timings,
      shape: shape.timings,
      visualTokens: read.promptTokens,
    },
    resources: await resourceReport(),
  });
}

async function handle(request: WorkerRequest): Promise<void> {
  if (request.kind === 'load') await load(request.modelId, request.modelHost, request.wasmThreads);
  if (request.kind === 'scan') await scan(request.dataUrl, request.context);
  if (request.kind === 'stats') post({ kind: 'stats', resources: await resourceReport() });
  if (request.kind === 'dispose') {
    await disposeModel();
    post({ kind: 'disposed', resources: await resourceReport() });
  }
}

// Requests run one at a time. Two concurrent generations double peak GPU memory
// on a budget that is already the binding constraint, and a dispose racing a
// scan would release sessions mid-inference.
let queue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  queue = queue.then(async () => {
    try {
      await handle(event.data);
    } catch (error) {
      post({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unknown worker error.',
      });
    }
  });
};
