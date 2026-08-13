import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { SourceHandle } from '@event-every/scanner';
import { runCoordinatedScanJob } from '@/server/scanner/job';
import { validateScannerImageDataUrl } from '@/server/scanner/image';
import { ScanRequestSchema } from '@/types/scannerHttp';
import { createBindingCandidates, normalizeRequestUuid } from '@/platform/provider/request-binding';
import { fixedProviderHttp, getPlatformRuntime } from '@/platform/runtime';

type E1SourceHandle = Extract<SourceHandle, { kind: 'text' | 'image' }>;

function fixed(result: Parameters<typeof fixedProviderHttp>[0]): Response {
  const mapped = fixedProviderHttp(result);
  return NextResponse.json(mapped.body, { status: mapped.status });
}

export async function POST(request: NextRequest): Promise<Response> {
  let requestId: string;
  try {
    requestId = normalizeRequestUuid(request.headers.get('x-event-every-request-id') ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid request id.' }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid scan request.' }, { status: 400 });
  }
  const parsed = ScanRequestSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid scan request.' }, { status: 400 });
  const scanRequest = parsed.data;
  if (scanRequest.kind === 'text' && new TextEncoder().encode(scanRequest.text).byteLength > 100_000) {
    return NextResponse.json({ error: 'Invalid scan request.' }, { status: 400 });
  }
  if (scanRequest.kind === 'image') {
    try { validateScannerImageDataUrl(scanRequest.dataUrl); } catch {
      return NextResponse.json({ error: 'Invalid scan request.' }, { status: 400 });
    }
  }

  try {
    const runtime = getPlatformRuntime();
    const variant = scanRequest.kind === 'text' ? 'scan-text' : 'scan-image';
    const bindingCandidates = await createBindingCandidates({
      route: 'scan', variant, canonicalJson: JSON.stringify(scanRequest), ...runtime.shapeKeys(),
    });
    const source: E1SourceHandle = { sourceId: randomUUID(), kind: scanRequest.kind, contentHandle: randomUUID() };
    const result = await runCoordinatedScanJob({
      requestId,
      request: scanRequest,
      source,
      bindingCandidates,
      signal: request.signal,
      candidateIdFactory: randomUUID,
    }, { runOperation: runtime.runProviderOperation });
    if (result.status !== 'completed') return fixed(result);
    return NextResponse.json(result.value);
  } catch {
    return fixed({ status: 'unavailable' });
  }
}
