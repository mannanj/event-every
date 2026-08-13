import { z } from 'zod';
import {
  parseProviderOperation,
  resumeProviderOperation,
  type ProviderOperationRecord,
} from '@/services/providerOperation';

const SummarizeResultSchema = z.object({ summary: z.string() }).strict();

// Best-effort 2-3 word label for a saved input. Never throws and never rejects —
// a failed/slow summary must never disrupt event extraction, so the caller simply
// gets an empty string and leaves the Recent card without a label.
export async function summarizeInput(params: {
  text?: string;
  eventTitles?: string[];
}, providerOperation: ProviderOperationRecord, signal?: AbortSignal): Promise<string> {
  try {
    const operation = parseProviderOperation(providerOperation);
    if (operation.route !== '/api/summarize' || operation.consumerKind !== 'summarize') return '';
    let response: Response;
    try {
      response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Event-Every-Request-Id': operation.requestId },
        body: JSON.stringify({
          text: params.text ?? '',
          eventTitles: params.eventTitles ?? [],
        }),
        signal,
      });
    } catch {
      if (signal?.aborted) return '';
      const replay = await resumeProviderOperation(operation, (value) => SummarizeResultSchema.parse(value), signal);
      return replay.summary;
    }
    if (!response.ok) {
      const body = await response.clone().json().catch(() => undefined) as { code?: unknown } | undefined;
      if (response.status === 409 && body?.code === 'provider_request_pending') {
        const replay = await resumeProviderOperation(operation, (value) => SummarizeResultSchema.parse(value), signal);
        return replay.summary;
      }
      return '';
    }
    return SummarizeResultSchema.parse(await response.json()).summary;
  } catch {
    return '';
  }
}
