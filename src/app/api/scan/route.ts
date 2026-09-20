import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { SourceHandle } from '@event-every/scanner';
import { runCoordinatedScanJob } from '@/server/scanner/job';
import { validateScannerImageDataUrl } from '@/server/scanner/image';
import { ScanRequestSchema } from '@/types/scannerHttp';
import { createBindingCandidates, normalizeRequestUuid } from '@/platform/provider/request-binding';
import { fixedProviderHttp, getPlatformRuntime } from '@/platform/runtime';
import { resolveScanTimeZone } from '@/server/scanner/scanContext';
import { OWNER_MODEL_CHAINS } from '@/platform/provider/policy';
import { MAX_EXCERPT_CHARS, verifyCandidates } from '@/server/typesafe/verify';
import { typeSafeAvailable } from '@/server/typesafe/client';

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

  const startedAt = Date.now();
  // One structured line per scan, no source content. Workers Logs keeps these
  // (observability is enabled in wrangler.jsonc), so a wrong card reported from
  // production can be traced to what the model actually returned: how many
  // candidates, and whether each start carried a time, a date only, or nothing.
  const log = (fields: Record<string, unknown>) => {
    console.log(JSON.stringify({ event: 'scan', requestId, kind: scanRequest.kind, ms: Date.now() - startedAt, ...fields }));
  };
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
      // Only hold the model's quoted text when something is going to read it.
      evidenceMaxChars: typeSafeAvailable() ? MAX_EXCERPT_CHARS : 0,
      // Without a reference date the model cannot legally return a time whose
      // year the source omits, and drops the whole temporal. The reader's zone
      // rides as a header rather than in the body, whose canonical JSON is bound
      // into the request hash; Cloudflare's geo hint is the fallback.
      context: {
        nowMs: Date.now(),
        timeZone: resolveScanTimeZone(
          request.headers.get('x-event-every-time-zone')
            ?? (request as unknown as { cf?: { timezone?: string } }).cf?.timezone,
        ),
      },
    }, { runOperation: runtime.runProviderOperation });
    if (result.status !== 'completed') {
      log({ models: OWNER_MODEL_CHAINS[variant], status: result.status, code: 'code' in result ? result.code : null });
      return fixed(result);
    }
    log({
      models: OWNER_MODEL_CHAINS[variant],
      status: 'completed',
      candidates: result.value.candidates.length,
      starts: result.value.candidates.map((candidate) => candidate.temporal.value?.start?.kind ?? null),
      issues: result.value.candidates.flatMap((candidate) => candidate.issues.map((issue) => issue.code)),
    });
    // A second opinion, read from the text the scanner itself reported, so an
    // image needs no OCR pass. Every failure is an empty array, and an empty
    // array is a response identical to the one this route returned before.
    const verifyStartedAt = Date.now();
    let verification: Awaited<ReturnType<typeof verifyCandidates>> = [];
    try {
      verification = await verifyCandidates(result.value.candidates, {
        requestText: scanRequest.kind === 'text' ? scanRequest.text : null,
        evidence: result.evidence,
        nowMs: Date.now(),
        signal: request.signal,
      });
    } catch {
      verification = [];
    }
    if (verification.length > 0) {
      // The probabilities themselves, so the thresholds in INTEGRATION.md can be
      // tuned against real traffic before anything else starts acting on them.
      console.log(JSON.stringify({
        event: 'typesafe', requestId, kind: scanRequest.kind, ms: Date.now() - verifyStartedAt,
        verified: verification.length, of: result.value.candidates.length,
        fields: verification.map((one) => one.fields),
        timed: verification.map((one) => one.timed),
        titlePicked: verification.filter((one) => one.title !== null).length,
        durations: verification.map((one) => one.durationMinutes),
      }));
    }
    return NextResponse.json(verification.length > 0 ? { ...result.value, verification } : result.value);
  } catch (error) {
    log({ status: 'threw', error: error instanceof Error ? error.name : 'unknown' });
    return fixed({ status: 'unavailable' });
  }
}
