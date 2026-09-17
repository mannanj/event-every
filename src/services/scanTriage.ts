import { z } from 'zod';

/**
 * Client half of pre-scan triage. Resolves to null on any failure or after
 * the deadline, and every caller treats null as "scan as before".
 */

export const TRIAGE_CLIENT_DEADLINE_MS = 1_500;

const DecisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('skip'), reason: z.literal('no_event') }),
  z.object({ kind: z.literal('split'), chunks: z.array(z.string().min(1)).min(2).max(6) }),
  z.object({ kind: z.literal('single') }),
]);

const TriageResponseSchema = z.union([
  z.object({ available: z.literal(false) }),
  z.object({
    available: z.literal(true),
    decision: DecisionSchema,
    shape: z.string(),
    hasEvent: z.number(),
    complete: z.number().nullable(),
  }),
]);

export type TriageDecision = z.infer<typeof DecisionSchema>;
export type TriageOutcome = Extract<z.infer<typeof TriageResponseSchema>, { available: true }>;

export async function requestTriage(
  text: string,
  source: 'paste' | 'typed' | 'url-page',
  signal?: AbortSignal,
  deadlineMs: number = TRIAGE_CLIENT_DEADLINE_MS,
): Promise<TriageOutcome | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort, { once: true });
  try {
    const response = await fetch('/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const parsed = TriageResponseSchema.safeParse(await response.json());
    if (!parsed.success || !parsed.data.available) return null;
    return parsed.data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}
