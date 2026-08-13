import { z } from 'zod';
import { ScanRequestSchema, ScanResponseSchema, type ScanRequest, type ScanResponse } from '@/types/scannerHttp';
import {
  parseProviderOperation,
  resumeProviderOperation,
  type ProviderOperationRecord,
} from '@/services/providerOperation';

const ScanErrorResponseSchema = z.object({
  error: z.string().optional(),
  code: z.string().optional(),
  resetAt: z.string().optional(),
}).passthrough();

export class ScanClientError extends Error {
  readonly name = 'ScanClientError';

  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly resetAt: string | null,
  ) {
    super(message);
  }
}

export async function scan(
  request: ScanRequest,
  providerOperation: ProviderOperationRecord,
  signal?: AbortSignal,
): Promise<ScanResponse> {
  const admittedRequest = ScanRequestSchema.parse(request);
  const operation = parseProviderOperation(providerOperation);
  const expectedConsumer = admittedRequest.kind === 'text' ? 'scan_text' : 'scan_image';
  if (operation.route !== '/api/scan' || operation.consumerKind !== expectedConsumer) {
    throw new Error('Provider operation does not match scan request.');
  }

  let response: Response;
  try {
    response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Event-Every-Request-Id': operation.requestId },
      body: JSON.stringify(admittedRequest),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    return resumeProviderOperation(operation, (replay) => ScanResponseSchema.parse(replay), signal);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const error = ScanErrorResponseSchema.safeParse(body);
    const detail = error.success ? error.data : {};
    if (response.status === 409 && detail.code === 'provider_request_pending') {
      return resumeProviderOperation(operation, (replay) => ScanResponseSchema.parse(replay), signal);
    }
    throw new ScanClientError(
      detail.error ?? 'Unable to scan this source.',
      response.status,
      detail.code ?? null,
      detail.resetAt ?? null,
    );
  }

  return ScanResponseSchema.parse(body);
}
