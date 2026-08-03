import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { SourceHandle } from '@event-every/scanner';
import { scanSource } from '@/server/scanner/scan';
import { createScanJob } from '@/server/scanner/job';
import { validateScannerImageDataUrl } from '@/server/scanner/image';
import { ScanRequestSchema, ScanResponseSchema } from '@/types/scannerHttp';
import {
  bindLegacyProviderRequest,
  legacyCommunityLimitResponse,
  legacyIpLimitResponse,
} from '@/platform/legacy';
import { deferPlatformWork } from '@/platform/cloudflare-context';
import { settleLegacyDispatch } from '@/platform/legacy/dispatch';
import { getProviderPort } from '@/platform/runtime';

type E1SourceHandle = Extract<SourceHandle, { kind: 'text' | 'image' }>;

const STRICT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest): Promise<Response> {
  const providerPort = getProviderPort();
  if ('status' in providerPort) {
    return NextResponse.json({ error: 'State is not ready.', code: 'c1_state_not_ready' }, { status: 503 });
  }

  const requestId = request.headers.get('x-event-every-request-id');
  if (!requestId || !STRICT_UUID.test(requestId)) {
    return NextResponse.json({ error: 'Invalid request id.' }, { status: 400 });
  }

  const legacy = bindLegacyProviderRequest(request);
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

    if (scanRequest.kind === 'text' && new TextEncoder().encode(scanRequest.text).byteLength > 100_000) {
      return NextResponse.json({ error: 'Invalid scan request.' }, { status: 400 });
    }

    if (scanRequest.kind === 'image') {
      try {
        validateScannerImageDataUrl(scanRequest.dataUrl);
      } catch {
        return NextResponse.json({ error: 'Invalid scan request.' }, { status: 400 });
      }
    }

    const limits = await legacy.evaluateLimits();
    if (!limits.allowed) {
      return limits.reason === 'community-budget'
        ? legacyCommunityLimitResponse(limits.resetAt)
        : legacyIpLimitResponse(limits.resetAt);
    }

    const source: E1SourceHandle = {
      sourceId: randomUUID(),
      kind: scanRequest.kind,
      contentHandle: randomUUID(),
    };
    const auth = legacy.auth();
    const dispatch = providerPort.dispatch({
      route: 'scan',
      requestId,
      identity: { kind: 'unknown', keyVersion: '', hmac: '' },
      signal: request.signal,
      charge: legacy.charge,
      provider: (signal) => legacy.run(() => scanSource(
        createScanJob(scanRequest, source, auth, signal),
        { candidateIdFactory: randomUUID },
      )),
    });

    if (dispatch.status === 'aborted-before-dispatch') {
      return NextResponse.json({ error: 'Unable to scan this source.' }, { status: 408 });
    }

    const dispatched = await settleLegacyDispatch(
      dispatch,
      request.signal,
      deferPlatformWork,
    );
    if (dispatched.status !== 'success') {
      if (dispatched.code === 'outcome_unknown') {
        return NextResponse.json(
          { error: 'The scan outcome is unknown.', code: 'outcome_unknown' },
          { status: 502 },
        );
      }
      if (dispatched.code === 'upstream_timeout') {
        return NextResponse.json(
          { error: 'The provider timed out.', code: 'upstream_timeout' },
          { status: 504 },
        );
      }
      const failure = legacy.failure();
      if (failure?.kind === 'community-limit') return legacyCommunityLimitResponse(failure.resetAt);
      if (failure?.kind === 'privacy-endpoint-unavailable') {
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

    const response = ScanResponseSchema.parse({ source, ...dispatched.value });
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: 'Unable to scan this source.' }, { status: 500 });
  }
}
