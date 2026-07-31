import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ProviderAdapterError } from '@event-every/scanner/openrouter';
import type { SourceHandle } from '@event-every/scanner';
import { DAILY_LIMIT } from '@/lib/ratelimit';
import { nextResetISO } from '@/lib/budget';
import { evaluateLimits, chargeIpRate } from '@/lib/limits';
import {
  CommunityLimitError,
  communityLimitResponse,
  getLlmKey,
  getLlmMode,
  type LlmCallAuth,
} from '@/lib/llm';
import { scanSource } from '@/server/scanner/scan';
import { createScanJob } from '@/server/scanner/job';
import { validateScannerImageDataUrl } from '@/server/scanner/image';
import { ScanRequestSchema, ScanResponseSchema } from '@/types/scannerHttp';

type E1SourceHandle = Extract<SourceHandle, { kind: 'text' | 'image' }>;

function ipLimitResponse(resetAt: string): NextResponse {
  const resetMs = Date.parse(resetAt);
  return NextResponse.json(
    { error: 'Daily request limit reached', reset: resetAt },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': DAILY_LIMIT.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': resetMs.toString(),
      },
    },
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  let mode: ReturnType<typeof getLlmMode> | undefined;
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid scan request.' }, { status: 400 });
    }

    const parsed = ScanRequestSchema.safeParse(rawBody);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid scan request.' }, { status: 400 });
    const scanRequest = parsed.data;

    if (scanRequest.kind === 'image') {
      try {
        validateScannerImageDataUrl(scanRequest.dataUrl);
      } catch {
        return NextResponse.json({ error: 'Invalid scan request.' }, { status: 400 });
      }
    }

    const limits = await evaluateLimits(request);
    if (!limits.allowed) {
      if (limits.reason === 'community-budget') {
        return communityLimitResponse(new CommunityLimitError(limits.resetAt));
      }
      return ipLimitResponse(limits.resetAt);
    }

    mode = getLlmMode(request);
    const auth: LlmCallAuth = { key: getLlmKey(mode), mode };
    const source: E1SourceHandle = {
      sourceId: randomUUID(),
      kind: scanRequest.kind,
      contentHandle: randomUUID(),
    };

    await chargeIpRate(request);

    const result = await scanSource(
      createScanJob(scanRequest, source, auth),
      { candidateIdFactory: randomUUID },
    );
    const response = ScanResponseSchema.parse({ source, ...result });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ProviderAdapterError) {
      if (mode === 'community' && error.status === 402) {
        return communityLimitResponse(new CommunityLimitError(nextResetISO()));
      }
      if (error.code === 'privacy_endpoint_unavailable') {
        return NextResponse.json(
          { error: 'No privacy-compatible model endpoint is available.', code: 'privacy_endpoint_unavailable' },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: 'The provider could not scan this source.', code: 'scan_provider_failed' },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: 'Unable to scan this source.' }, { status: 500 });
  }
}
