import { z } from 'zod';
import { ScanRequestSchema, ScanResponseSchema, type ScanRequest, type ScanResponse } from '@/types/scannerHttp';
import { createProviderRequestId } from '@/services/requestId';

const ScanErrorResponseSchema = z.object({
  error: z.string().optional(),
  code: z.string().optional(),
  resetAt: z.string().optional(),
  reset: z.string().optional(),
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

export async function scan(request: ScanRequest, signal?: AbortSignal, options?: { requestId?: string }): Promise<ScanResponse> {
  const admittedRequest = ScanRequestSchema.parse(request);
  const requestId = options?.requestId ?? createProviderRequestId();
  const response = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Event-Every-Request-Id': requestId },
    body: JSON.stringify(admittedRequest),
    signal,
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const error = ScanErrorResponseSchema.safeParse(body);
    const detail = error.success ? error.data : {};
    throw new ScanClientError(
      detail.error ?? 'Unable to scan this source.',
      response.status,
      detail.code ?? null,
      detail.resetAt ?? detail.reset ?? null,
    );
  }

  return ScanResponseSchema.parse(body);
}
