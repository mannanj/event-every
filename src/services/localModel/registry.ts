export type LocalModelDtype = 'q4f16' | 'q4' | 'fp16';

export interface LocalModelSpec {
  readonly id: string;
  readonly label: string;
  readonly repo: string;
  readonly dtype: LocalModelDtype;
  readonly downloadBytes: number;
  readonly license: string;
  readonly role: 'primary' | 'control';
}

// Sizes are the summed ONNX shards transformers.js fetches at the listed dtype,
// measured against the Hugging Face API on 2026-09-14. Widely-cited figures for
// several of these are wrong by more than 2x, so do not replace them with
// estimates. See plans/016 for the measurement and the repos ruled out.
export const LOCAL_MODELS: readonly LocalModelSpec[] = [
  {
    id: 'qwen3-vl-2b',
    label: 'Qwen3-VL 2B',
    repo: 'onnx-community/Qwen3-VL-2B-Instruct-ONNX',
    dtype: 'q4f16',
    downloadBytes: 1_371_900_000,
    license: 'Apache-2.0',
    role: 'primary',
  },
  {
    id: 'webbrain-vl2-450m',
    label: 'WebBrain VL 2 450M',
    repo: 'webbrain-one/webbrain-vl-2-450M-onnx',
    dtype: 'q4',
    downloadBytes: 481_200_000,
    license: 'lfm1.0',
    role: 'control',
  },
];

export const DEFAULT_LOCAL_MODEL_ID = 'qwen3-vl-2b';

export function findLocalModel(id: string): LocalModelSpec | undefined {
  return LOCAL_MODELS.find((model) => model.id === id);
}

export function defaultLocalModel(): LocalModelSpec {
  const model = findLocalModel(DEFAULT_LOCAL_MODEL_ID);
  if (!model) throw new Error('Default local model is missing from the registry.');
  return model;
}

export function formatModelSize(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(1)}GB`;
  return `${Math.round(bytes / 1_000_000)}MB`;
}

export function describeDownloadedModel(model: LocalModelSpec): string {
  return `${model.label} ${formatModelSize(model.downloadBytes)} downloaded and saved in the browser`;
}
