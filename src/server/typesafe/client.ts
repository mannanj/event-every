import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Server-only TypeSafe (System One) client. The key lives in the Worker's
 * secrets, or in process.env for `next dev` and tests, and never reaches a
 * browser. Absence of the key is a normal state: every caller treats
 * `null` from `askTypeSafe` as "behave exactly as without TypeSafe".
 */

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';

export type TypeSafeQuestion =
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> }
  | { type: 'score'; instructions: string; criteria: string[] };

export type TypeSafeAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'score'; score: number; legend: Record<string, string>; probabilities: Record<string, number>; confidence: number };

export interface TypeSafeResult {
  answers: Record<string, TypeSafeAnswer>;
  usage: { input_tokens: number; output_tokens: number };
  ms: number;
}

let keyForTests: string | null | undefined;
export function setTypeSafeKeyForTests(value: string | null | undefined): void {
  keyForTests = value;
}

export function typeSafeKey(): string | null {
  if (keyForTests !== undefined) return keyForTests;
  let fromWorker: string | undefined;
  try {
    fromWorker = (getCloudflareContext().env as { TYPESAFE_API_KEY?: string }).TYPESAFE_API_KEY;
  } catch {
    fromWorker = undefined;
  }
  const value = (fromWorker ?? process.env.TYPESAFE_API_KEY ?? '').trim();
  return value.length > 0 ? value : null;
}

export const typeSafeAvailable = (): boolean => typeSafeKey() !== null;

/**
 * One evaluation call. Returns null on any failure: missing key, timeout,
 * non-2xx, malformed body. Callers never see an exception from here.
 */
export async function askTypeSafe(
  state: unknown,
  questions: Record<string, TypeSafeQuestion>,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<TypeSafeResult | null> {
  const key = typeSafeKey();
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const onOuterAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onOuterAbort, { once: true });
  const startedAt = Date.now();
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, state, questions }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<TypeSafeResult>;
    if (!body || typeof body !== 'object' || !body.answers || typeof body.answers !== 'object') return null;
    return {
      answers: body.answers,
      usage: body.usage ?? { input_tokens: 0, output_tokens: 0 },
      ms: Date.now() - startedAt,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onOuterAbort);
  }
}

export const noulOf = (answer: TypeSafeAnswer | undefined): number | null =>
  answer?.type === 'noul' && Number.isFinite(answer.noul) ? answer.noul : null;
